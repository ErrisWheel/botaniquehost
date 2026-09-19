import jwt from 'jsonwebtoken';
import type { NextFunction, Response } from 'express';
import { env } from '../config.js';
import type { AuthRequest } from '../types.js';

export function auth(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const h = req.headers.authorization;
        if (!h?.startsWith('Bearer '))
            return res.status(401).json({ message: 'Authentication required' });

        req.user = jwt.verify(h.slice(7), env.JWT_SECRET) as any;
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

export function admin(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    if (req.user?.role !== 'ADMIN')
        return res.status(403).json({ message: 'Administrator access required' });

    next();
}
