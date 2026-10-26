import type { NextFunction, Response } from 'express';
import { verifyFirebaseIdToken } from '../services/firebase.js';
import { resolveUser } from '../services/users.js';
import type { AuthRequest } from '../types.js';

async function verifyBearer(req: AuthRequest) {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return null;

    return verifyFirebaseIdToken(h.slice(7));
}

/**
 * Verifies the Firebase ID token ONLY (no database lookup). Used by
 * POST /auth/session, which creates / links the database profile.
 */
export async function firebaseToken(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const decoded = await verifyBearer(req);
        if (!decoded)
            return res
                .status(401)
                .json({ message: 'Authentication required' });

        req.firebase = decoded;
        next();
    } catch (e: any) {
        if (e?.statusCode === 503) return next(e);
        return res
            .status(401)
            .json({ message: 'Invalid or expired token' });
    }
}

/**
 * Full authentication: verified Firebase identity -> existing Botanique user.
 * `req.user` is built from the DATABASE row, never from client input.
 */
export async function auth(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    try {
        let decoded;
        try {
            decoded = await verifyBearer(req);
        } catch (e: any) {
            if (e?.statusCode === 503) return next(e);
            return res
                .status(401)
                .json({ message: 'Invalid or expired token' });
        }

        if (!decoded)
            return res
                .status(401)
                .json({ message: 'Authentication required' });

        const user = await resolveUser(decoded, {
            createIfMissing: false
        });

        if (!user)
            return res.status(401).json({
                message:
                    'Your account profile is not set up yet. Please sign in again.',
                code: 'PROFILE_REQUIRED'
            });

        if (user.isSuspended)
            return res
                .status(403)
                .json({ message: 'This account is suspended.' });

        req.firebase = decoded;
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role
        };
        next();
    } catch (e) {
        next(e);
    }
}

export function admin(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    if (req.user?.role !== 'ADMIN')
        return res
            .status(403)
            .json({ message: 'Administrator access required' });

    next();
}
