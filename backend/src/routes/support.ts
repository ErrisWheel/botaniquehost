import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';

const r = Router();

r.post('/', async (req: any, res, next) => {
    try {
        const b = z
            .object({
                name: z.string().optional(),
                email: z.string().email(),
                subject: z.string(),
                message: z.string().min(5)
            })
            .parse(req.body);

        let user = await prisma.user.findUnique({
            where: {
                email: b.email.toLowerCase()
            }
        });

        const t = await prisma.supportTicket.create({
            data: {
                userId: user?.id,
                subject: b.subject,
                message: `${b.name || 'Guest'} <${b.email}>\n\n${b.message}`
            }
        });

        res.status(201).json(t);
    } catch (e) {
        next(e);
    }
});

r.get('/', auth, async (req: any, res) =>
    res.json(
        await prisma.supportTicket.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        })
    )
);

r.get('/admin/all', auth, admin, async (req, res) =>
    res.json(
        await prisma.supportTicket.findMany({
            include: {
                user: {
                    select: {
                        email: true,
                        fullName: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        })
    )
);

r.patch(
    '/admin/:id',
    auth,
    admin,
    async (req: any, res, next) => {
        try {
            const b = z
                .object({
                    status: z.string().optional(),
                    priority: z.string().optional(),
                    adminReply: z.string().optional()
                })
                .parse(req.body);

            const t = await prisma.supportTicket.update({
                where: { id: req.params.id },
                data: b
            });

            await notify(
                t.userId || undefined,
                'Support ticket updated',
                t.adminReply || `Your ticket is now ${t.status}.`,
                'SUPPORT'
            );

            res.json(t);
        } catch (e) {
            next(e);
        }
    }
);

export default r;
