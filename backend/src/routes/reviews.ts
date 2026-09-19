import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';

const r = Router();

r.get('/product/:productId', async (req, res) =>
    res.json(
        await prisma.review.findMany({
            where: {
                productId: req.params.productId,
                isApproved: true
            },
            include: {
                user: {
                    select: {
                        fullName: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
    )
);

r.post('/product/:productId', auth, async (req: any, res, next) => {
    try {
        const b = z
            .object({
                rating: z.number().int().min(1).max(5),
                comment: z.string().max(2000).optional(),
                orderId: z.string().optional()
            })
            .parse(req.body);

        if (b.orderId) {
            const ok = await prisma.orderItem.findFirst({
                where: {
                    orderId: b.orderId,
                    productId: req.params.productId,
                    order: {
                        userId: req.user.id,
                        status: 'DELIVERED'
                    }
                }
            });

            if (!ok)
                return res.status(403).json({
                    message:
                        'You can review products only from delivered orders'
                });
        }

        const review = await prisma.review
            .upsert({
                where: { id: 'never' },
                create: {
                    ...b,
                    userId: req.user.id,
                    productId: req.params.productId
                },
                update: {}
            })
            .catch(async () =>
                prisma.review.create({
                    data: {
                        ...b,
                        userId: req.user.id,
                        productId: req.params.productId
                    }
                })
            );

        res.status(201).json(review);
    } catch (e) {
        next(e);
    }
});

r.patch('/:id', auth, async (req: any, res, next) => {
    try {
        const b = z
            .object({
                rating: z.number().int().min(1).max(5).optional(),
                comment: z.string().max(2000).optional()
            })
            .parse(req.body);

        res.json(
            await prisma.review.updateMany({
                where: {
                    id: req.params.id,
                    userId: req.user.id
                },
                data: b
            })
        );
    } catch (e) {
        next(e);
    }
});

r.delete('/:id', auth, async (req: any, res) => {
    await prisma.review.deleteMany({
        where: {
            id: req.params.id,
            userId: req.user.id
        }
    });

    res.json({ message: 'Review deleted' });
});

r.get('/admin/all', auth, admin, async (req, res) =>
    res.json(
        await prisma.review.findMany({
            include: {
                user: {
                    select: {
                        email: true,
                        fullName: true
                    }
                },
                product: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
    )
);

r.patch('/admin/:id', auth, admin, async (req, res, next) => {
    try {
        const b = z
            .object({
                isApproved: z.boolean()
            })
            .parse(req.body);

        res.json(
            await prisma.review.update({
                where: {
                    id: String(req.params.id)
                },
                data: b
            })
        );
    } catch (e) {
        next(e);
    }
});

export default r;
