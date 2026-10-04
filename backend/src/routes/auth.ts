import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, firebaseToken } from '../middleware/auth.js';
import { resolveUser } from '../services/users.js';
import { firebaseAuth } from '../services/firebase.js';
import type { AuthRequest } from '../types.js';

/**
 * Authentication is handled by Firebase Authentication on the client
 * (register / login / logout / password reset / persistence). This API never
 * sees a password. It only:
 *   - verifies Firebase ID tokens (middleware/auth.ts), and
 *   - maps the verified Firebase identity to a Botanique `User` row.
 */
const r = Router();

const publicUser = (u: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: string;
}) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role
});

/**
 * Called by the app right after a successful Firebase sign-in / sign-up.
 * Creates the Botanique profile on first use (or links a pre-existing row
 * with the same VERIFIED e-mail) and returns it. Idempotent.
 */
r.post('/session', firebaseToken, async (req: AuthRequest, res, next) => {
    try {
        const profile = z
            .object({
                fullName: z.string().trim().min(2).max(120).optional(),
                phone: z.string().trim().max(30).optional()
            })
            .parse(req.body ?? {});

        const user = await resolveUser(req.firebase!, {
            createIfMissing: true,
            profile
        });

        if (!user)
            return res
                .status(500)
                .json({ message: 'Unable to load your profile.' });

        if (user.isSuspended)
            return res
                .status(403)
                .json({ message: 'This account is suspended.' });

        res.json({ user: publicUser(user) });
    } catch (e) {
        next(e);
    }
});

r.get('/me', auth, async (req: any, res) => {
    const u = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            role: true,
            isSuspended: true,
            addresses: true
        }
    });

    res.json(u);
});

r.patch('/me', auth, async (req: any, res, next) => {
    try {
        const data = z
            .object({
                fullName: z.string().min(2).optional(),
                email: z
                    .string()
                    .email()
                    .transform((value) => value.toLowerCase())
                    .optional(),
                phone: z.string().optional()
            })
            .parse(req.body);

        // The e-mail address is the Firebase login identity. Changing it only
        // here would silently break sign-in, so it is not editable.
        if (data.email && data.email !== req.user.email)
            return res.status(400).json({
                message:
                    'Your e-mail address is tied to your login and cannot be changed here. Please contact support.',
                code: 'EMAIL_MANAGED_BY_LOGIN'
            });

        const { email: _ignored, ...editable } = data;

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data: editable,
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                role: true
            }
        });

        res.json(updated);
    } catch (e) {
        next(e);
    }
});

/**
 * Permanently deletes the caller's own account: Firebase login first, then
 * the database profile. Orders are kept (detached from the user) for the
 * shop's records. Safe to retry: a missing Firebase user counts as deleted.
 * Admin accounts cannot self-delete (prevents locking everybody out).
 */
r.delete('/me', auth, async (req: any, res, next) => {
    try {
        if (req.user.role === 'ADMIN')
            return res.status(403).json({
                message:
                    'Administrator accounts must be removed by another administrator.'
            });

        const u = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { firebaseUid: true }
        });

        if (u?.firebaseUid) {
            try {
                await firebaseAuth().deleteUser(u.firebaseUid);
            } catch (e: any) {
                if (e?.code !== 'auth/user-not-found') throw e;
            }
        }

        await prisma.user.delete({ where: { id: req.user.id } });

        res.json({ message: 'Account deleted' });
    } catch (e) {
        next(e);
    }
});

export default r;
