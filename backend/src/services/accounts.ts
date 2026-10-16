import { httpError } from '../utils/httpError.js';

export type AccountRole = 'CUSTOMER' | 'ADMIN';

/** What an administrator is trying to do to an account. */
export type AccountChange = {
    role?: AccountRole;
    isSuspended?: boolean;
    delete?: boolean;
};

type AccountRow = {
    id: string;
    role: string;
    isSuspended: boolean;
    firebaseUid?: string | null;
};

const isActiveAdmin = (u: AccountRow) => u.role === 'ADMIN' && !u.isSuspended;

/**
 * Throws unless `actorId` may apply `change` to `targetId`:
 *  - an administrator cannot change their own role, suspend or delete
 *    themselves (accidental lock-out);
 *  - the LAST ACTIVE administrator can never be demoted, suspended or deleted,
 *    by anyone (otherwise nobody could manage the shop again).
 * Run it inside the same transaction as the write (see updateAccount /
 * deleteAccountRow) so two administrators cannot demote each other at the same
 * moment and both pass the check.
 */
export async function assertAccountChangeAllowed(
    db: any,
    actorId: string,
    targetId: string,
    change: AccountChange
): Promise<AccountRow> {
    const target: AccountRow | null = await db.user.findUnique({
        where: { id: targetId }
    });

    if (!target) throw httpError(404, 'Account not found', 'NOT_FOUND');

    if (actorId === targetId) {
        if (change.role !== undefined && change.role !== target.role)
            throw httpError(
                400,
                'You cannot change your own role.',
                'SELF_ROLE_CHANGE'
            );
        if (change.isSuspended === true)
            throw httpError(
                400,
                'You cannot suspend your own account.',
                'SELF_SUSPEND'
            );
        if (change.delete)
            throw httpError(
                400,
                'You cannot delete your own account here.',
                'SELF_DELETE'
            );
    }

    const stopsBeingActiveAdmin =
        isActiveAdmin(target) &&
        ((change.role !== undefined && change.role !== 'ADMIN') ||
            change.isSuspended === true ||
            change.delete === true);

    if (stopsBeingActiveAdmin) {
        const others = await db.user.count({
            where: {
                role: 'ADMIN',
                isSuspended: false,
                id: { not: target.id }
            }
        });

        if (others < 1)
            throw httpError(
                409,
                'This is the last active administrator. Promote or reactivate another administrator first.',
                'LAST_ADMIN'
            );
    }

    return target;
}

export type AccountUpdate = {
    fullName?: string;
    phone?: string;
    role?: AccountRole;
    isSuspended?: boolean;
};

const SAFE_SELECT = {
    id: true,
    email: true,
    fullName: true,
    phone: true,
    role: true,
    isSuspended: true,
    firebaseUid: true,
    createdAt: true
} as const;

/** Validated + transactional account update. Returns the row and the previous one. */
export async function updateAccount(
    db: any,
    actorId: string,
    targetId: string,
    data: AccountUpdate
): Promise<{ before: AccountRow; after: any }> {
    return db.$transaction(
        async (tx: any) => {
            const before = await assertAccountChangeAllowed(tx, actorId, targetId, {
                role: data.role,
                isSuspended: data.isSuspended
            });

            const after = await tx.user.update({
                where: { id: targetId },
                data,
                select: SAFE_SELECT
            });

            return { before, after };
        },
        // Serializable: two concurrent "demote the other admin" requests cannot
        // both succeed (one fails with P2034 -> HTTP 409 and can be retried).
        { isolationLevel: 'Serializable' }
    );
}

/**
 * Removes the database row. Orders, support tickets and audit entries keep
 * existing (their user link is set to NULL by the schema), so purchase history
 * and financial records stay intact. The caller deletes the Firebase login.
 */
export async function deleteAccountRow(
    db: any,
    actorId: string,
    targetId: string
): Promise<AccountRow> {
    return db.$transaction(
        async (tx: any) => {
            const target = await assertAccountChangeAllowed(tx, actorId, targetId, {
                delete: true
            });
            await tx.user.delete({ where: { id: targetId } });
            return target;
        },
        { isolationLevel: 'Serializable' }
    );
}
