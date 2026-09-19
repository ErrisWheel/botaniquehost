import { Router } from 'express';
import crypto from 'node:crypto';
import { notify } from '../services/notifications.js';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
    hashPassword,
    verifyPassword,
    signToken
} from '../utils/auth.js';
import { auth } from '../middleware/auth.js';

const r = Router();

const credentials = z.object({
    email: z.string().email(),
    password: z.string().min(8)
});

r.post('/register', async (req, res, next) => {
    try {
        const b = credentials
            .extend({
                fullName: z.string().min(2),
                phone: z.string().optional()
            })
            .parse(req.body);

        if (
            await prisma.user.findUnique({
                where: { email: b.email.toLowerCase() }
            })
        )
            return res
                .status(409)
                .json({ message: 'Email already registered' });

        const u = await prisma.user.create({
            data: {
                email: b.email.toLowerCase(),
                passwordHash: await hashPassword(b.password),
                fullName: b.fullName,
                phone: b.phone
            }
        });

        res.status(201).json({
            user: {
                id: u.id,
                email: u.email,
                fullName: u.fullName,
                phone: u.phone,
                role: u.role
            },
            token: signToken({
                id: u.id,
                email: u.email,
                role: u.role
            })
        });
    } catch (e) {
        next(e);
    }
});

r.post('/login', async (req, res, next) => {
    try {
        const b = credentials.parse(req.body);

        const u = await prisma.user.findUnique({
            where: { email: b.email.toLowerCase() }
        });

        if (
            !u ||
            !(await verifyPassword(b.password, u.passwordHash)) ||
            u.isSuspended
        )
            return res.status(401).json({ message: 'Invalid credentials' });

        res.json({
            user: {
                id: u.id,
                email: u.email,
                fullName: u.fullName,
                phone: u.phone,
                role: u.role
            },
            token: signToken({
                id: u.id,
                email: u.email,
                role: u.role
            })
        });
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
                email: z.string().email().transform((value) => value.toLowerCase()).optional(),
                phone: z.string().optional()
            })
            .parse(req.body);

        if (data.email) {
            const existing = await prisma.user.findFirst({
                where: {
                    email: data.email,
                    NOT: { id: req.user.id }
                },
                select: { id: true }
            });

            if (existing)
                return res
                    .status(409)
                    .json({ message: 'Email already registered' });
        }

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data,
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

r.post('/change-password', auth, async (req: any, res, next) => {
    try {
        const b = z
            .object({
                currentPassword: z.string(),
                newPassword: z.string().min(8)
            })
            .parse(req.body);

        const u = await prisma.user.findUniqueOrThrow({
            where: { id: req.user.id }
        });

        if (!(await verifyPassword(b.currentPassword, u.passwordHash)))
            return res
                .status(400)
                .json({ message: 'Current password is incorrect' });

        await prisma.user.update({
            where: { id: u.id },
            data: {
                passwordHash: await hashPassword(b.newPassword)
            }
        });

        res.json({ message: 'Password changed' });
    } catch (e) {
        next(e);
    }
});

r.post('/forgot-password', async (req, res, next) => {
    try {
        const { email } = z
            .object({
                email: z.string().email()
            })
            .parse(req.body);

        const u = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (u) {
            const raw = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto
                .createHash('sha256')
                .update(raw)
                .digest('hex');

            await prisma.passwordResetToken.create({
                data: {
                    userId: u.id,
                    tokenHash,
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
                }
            });

            await notify(
                u.id,
                'Botanique password reset',
                `Reset token (send this through your configured email flow): ${raw}`,
                'SECURITY'
            );
        }

        res.json({
            message:
                'If that email exists, a reset instruction has been issued.'
        });
    } catch (e) {
        next(e);
    }
});

r.post('/reset-password', async (req, res, next) => {
    try {
        const b = z
            .object({
                token: z.string().min(20),
                newPassword: z.string().min(8)
            })
            .parse(req.body);

        const h = crypto
            .createHash('sha256')
            .update(b.token)
            .digest('hex');

        const t = await prisma.passwordResetToken.findUnique({
            where: { tokenHash: h }
        });

        if (
            !t ||
            t.usedAt ||
            t.expiresAt < new Date()
        )
            return res
                .status(400)
                .json({ message: 'Invalid or expired reset token' });

        await prisma.$transaction([
            prisma.user.update({
                where: { id: t.userId },
                data: {
                    passwordHash: await hashPassword(b.newPassword)
                }
            }),
            prisma.passwordResetToken.update({
                where: { id: t.id },
                data: { usedAt: new Date() }
            })
        ]);

        res.json({ message: 'Password reset successfully' });
    } catch (e) {
        next(e);
    }
});

export default r;
