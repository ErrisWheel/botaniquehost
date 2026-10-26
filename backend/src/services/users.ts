import type { DecodedIdToken } from 'firebase-admin/auth';
import type { User } from '@prisma/client';
import { prisma } from '../db.js';

const httpError = (
    statusCode: number,
    message: string,
    code?: string
) => Object.assign(new Error(message), { statusCode, code });

export type ProfileInput = {
    fullName?: string;
    phone?: string;
};

const isUniqueViolation = (e: unknown) =>
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === 'P2002';

function fallbackName(token: DecodedIdToken, email: string) {
    const fromToken =
        typeof token.name === 'string' ? token.name.trim() : '';
    return fromToken.length >= 2 ? fromToken : email.split('@')[0];
}

/**
 * Maps a VERIFIED Firebase identity to a Botanique `User` row.
 *
 * 1. Already linked (firebaseUid match)            -> return it.
 * 2. Legacy row with the same e-mail, not yet linked
 *      - only linked when Firebase says the e-mail is verified, otherwise
 *        anyone could claim someone else's account by signing up with their
 *        e-mail address in Firebase.
 * 3. No row at all and `createIfMissing`           -> create one.
 *
 * Roles always come from the database, never from the client or token.
 */
export async function resolveUser(
    token: DecodedIdToken,
    opts: { createIfMissing: boolean; profile?: ProfileInput }
): Promise<User | null> {
    const email = token.email?.toLowerCase();
    if (!email)
        throw httpError(
            400,
            'This Firebase account has no e-mail address.',
            'EMAIL_REQUIRED'
        );

    const linked = await prisma.user.findUnique({
        where: { firebaseUid: token.uid }
    });
    if (linked) return linked;

    const legacy = await prisma.user.findUnique({ where: { email } });

    if (legacy) {
        if (legacy.firebaseUid && legacy.firebaseUid !== token.uid)
            throw httpError(
                409,
                'This e-mail is already linked to a different login.',
                'EMAIL_LINKED_ELSEWHERE'
            );

        if (token.email_verified !== true)
            throw httpError(
                409,
                'An account with this e-mail already exists. Please verify your e-mail address using the link we sent you, then sign in again.',
                'EMAIL_VERIFICATION_REQUIRED'
            );

        // Atomic link: only succeeds while the row is still unlinked.
        const res = await prisma.user.updateMany({
            where: { id: legacy.id, firebaseUid: null },
            data: { firebaseUid: token.uid }
        });
        if (res.count === 0) {
            const again = await prisma.user.findUnique({
                where: { firebaseUid: token.uid }
            });
            if (again) return again;
            throw httpError(
                409,
                'This e-mail is already linked to a different login.',
                'EMAIL_LINKED_ELSEWHERE'
            );
        }
        return prisma.user.findUniqueOrThrow({ where: { id: legacy.id } });
    }

    if (!opts.createIfMissing) return null;

    try {
        return await prisma.user.create({
            data: {
                email,
                firebaseUid: token.uid,
                passwordHash: null,
                fullName:
                    opts.profile?.fullName?.trim() ||
                    fallbackName(token, email),
                phone: opts.profile?.phone?.trim() || undefined
            }
        });
    } catch (e) {
        if (isUniqueViolation(e)) {
            // Lost a race with a parallel request: use the winner.
            return prisma.user.findUnique({
                where: { firebaseUid: token.uid }
            });
        }
        throw e;
    }
}
