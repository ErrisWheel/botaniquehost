import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { z } from 'zod';
import { notify } from '../services/notifications.js';

const r = Router();

r.get('/', auth, async (req: any, res) =>
    res.json(
        await prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        })
    )
);

r.patch('/:id/read', auth, async (req: any, res) =>
    res.json(
        await prisma.notification.updateMany({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            data: { read: true }
        })
    )
);

r.post(
    '/admin/broadcast',
    auth,
    admin,
    async (req, res, next) => {
        try {
            const b = z
                .object({
                    title: z.string(),
                    message: z.string(),
                    type: z.string().default('PROMOTION')
                })
                .parse(req.body);

            const users = await prisma.user.findMany({
                where: { isSuspended: false },
                select: { id: true }
            });

            await prisma.$transaction(
                users.map((u) =>
                    prisma.notification.create({
                        data: {
                            userId: u.id,
                            title: b.title,
                            message: b.message,
                            type: b.type
                        }
                    })
                )
            );

            res.json({ sent: users.length });
        } catch (e) {
            next(e);
        }
    }
);

export default r;
