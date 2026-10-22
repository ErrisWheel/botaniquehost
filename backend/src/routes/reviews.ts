import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';

const r = Router();

async function findProduct(identifier: string) {
    return prisma.product.findFirst({
        where: {
            OR: [{ id: identifier }, { slug: identifier }]
        },
        select: { id: true }
    });
}

r.get('/summary', async (_req, res, next) => {
    try {
        const products = await prisma.product.findMany({
            where: { status: { in: ['ACTIVE', 'OUT_OF_STOCK'] } },
            select: {
                slug: true,
                reviews: {
                    where: { isApproved: true },
                    select: { rating: true }
                }
            }
        });

        res.json(products.map((product) => ({
            productSlug: product.slug,
            count: product.reviews.length,
            average: product.reviews.length
                ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
                : null
        })));
    } catch (e) {
        next(e);
    }
});

r.get('/product/:productId', async (req, res, next) => {
    try {
        const product = await findProduct(String(req.params.productId));
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const reviews = await prisma.review.findMany({
            where: { productId: product.id, isApproved: true },
            include: { user: { select: { fullName: true } } },
            orderBy: { createdAt: 'desc' }
        });

        res.json(reviews);
    } catch (e) {
        next(e);
    }
});

r.post('/product/:productId', auth, async (req: any, res, next) => {
    try {
        const b = z.object({
            rating: z.number().int().min(1).max(5),
            comment: z.string().trim().min(1).max(2000),
            orderId: z.string().trim().min(1)
        }).parse(req.body);

        const product = await findProduct(String(req.params.productId));
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const eligibleItem = await prisma.orderItem.findFirst({
            where: {
                orderId: b.orderId,
                productId: product.id,
                order: { userId: req.user.id, status: 'DELIVERED' }
            },
            select: { id: true }
        });

        if (!eligibleItem) {
            return res.status(403).json({
                message: 'You can review a product only from one of your delivered orders.'
            });
        }

        const review = await prisma.review.upsert({
            where: {
                userId_productId: {
                    userId: req.user.id,
                    productId: product.id
                }
            },
            create: {
                userId: req.user.id,
                productId: product.id,
                orderId: b.orderId,
                rating: b.rating,
                comment: b.comment
            },
            update: {
                orderId: b.orderId,
                rating: b.rating,
                comment: b.comment
            },
            include: { user: { select: { fullName: true } } }
        });

        res.status(201).json(review);
    } catch (e) {
        next(e);
    }
});

r.patch('/:id', auth, async (req: any, res, next) => {
    try {
        const b = z.object({
            rating: z.number().int().min(1).max(5).optional(),
            comment: z.string().trim().min(1).max(2000).optional()
        }).refine((v) => Object.keys(v).length > 0, 'Provide a rating or comment').parse(req.body);

        const result = await prisma.review.updateMany({
            where: { id: String(req.params.id), userId: req.user.id },
            data: b
        });
        if (!result.count) return res.status(404).json({ message: 'Review not found' });
        res.json({ updated: true });
    } catch (e) {
        next(e);
    }
});

r.delete('/:id', auth, async (req: any, res, next) => {
    try {
        const result = await prisma.review.deleteMany({
            where: { id: String(req.params.id), userId: req.user.id }
        });
        if (!result.count) return res.status(404).json({ message: 'Review not found' });
        res.json({ message: 'Review deleted' });
    } catch (e) {
        next(e);
    }
});

r.get('/admin/all', auth, admin, async (req, res, next) => {
    try {
        res.json(await prisma.review.findMany({
            include: {
                user: { select: { email: true, fullName: true } },
                product: true
            },
            orderBy: { createdAt: 'desc' }
        }));
    } catch (e) {
        next(e);
    }
});

r.patch('/admin/:id', auth, admin, async (req, res, next) => {
    try {
        const b = z.object({ isApproved: z.boolean() }).parse(req.body);
        res.json(await prisma.review.update({
            where: { id: String(req.params.id) },
            data: b
        }));
    } catch (e) {
        next(e);
    }
});

export default r;
