import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { httpError } from '../utils/httpError.js';

const r = Router();
const reviewInput = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
    orderId: z.string().min(1)
});

async function findProduct(identifier: string) {
    return prisma.product.findFirst({
        where: { OR: [{ id: identifier }, { slug: identifier }] },
        select: { id: true, slug: true }
    });
}

r.get('/summary', async (_req, res, next) => {
    try {
        const grouped = await prisma.review.groupBy({
            by: ['productId'], where: { isApproved: true },
            _avg: { rating: true }, _count: { _all: true }
        });
        const products = await prisma.product.findMany({
            where: { id: { in: grouped.map((x) => x.productId) } },
            select: { id: true, slug: true }
        });
        const slugById = new Map(products.map((p) => [p.id, p.slug]));
        res.set('Cache-Control', 'no-store');
        res.json(grouped.map((x) => ({
            productId: x.productId,
            productSlug: slugById.get(x.productId) || x.productId,
            average: x._avg.rating,
            count: x._count._all
        })));
    } catch (e) { next(e); }
});

r.get('/store/summary', async (_req, res, next) => {
    try {
        const [aggregate, count] = await Promise.all([
            prisma.storeReview.aggregate({ _avg: { rating: true } }),
            prisma.storeReview.count()
        ]);
        res.set('Cache-Control', 'no-store');
        res.json({ average: aggregate._avg.rating, count });
    } catch (e) { next(e); }
});

/**
 * Return review eligibility for this product only. The client must not decide
 * eligibility from a different product's order or from browser-supplied IDs.
 */
r.get('/product/:productId/eligibility', auth, async (req: any, res, next) => {
    try {
        const product = await findProduct(String(req.params.productId));
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const [eligibleOrders, existingReview] = await Promise.all([
            prisma.order.findMany({
                where: {
                    userId: req.user.id,
                    status: 'DELIVERED',
                    items: { some: { productId: product.id } }
                },
                select: { id: true, orderNumber: true, createdAt: true },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.review.findUnique({
                where: {
                    userId_productId: {
                        userId: req.user.id,
                        productId: product.id
                    }
                },
                select: { id: true, rating: true, comment: true, isApproved: true, createdAt: true }
            })
        ]);

        res.set('Cache-Control', 'no-store');
        res.json({
            productId: product.id,
            productSlug: product.slug,
            eligibleOrders,
            hasReviewed: Boolean(existingReview),
            existingReview: existingReview || null
        });
    } catch (e) { next(e); }
});

r.get('/product/:productId', async (req, res, next) => {
    try {
        const product = await findProduct(String(req.params.productId));
        if (!product) return res.status(404).json({ message: 'Product not found' });
        const reviews = await prisma.review.findMany({
            where: { productId: product.id, isApproved: true },
            select: {
                id: true,
                rating: true,
                comment: true,
                createdAt: true,
                user: { select: { fullName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.set('Cache-Control', 'no-store');
        res.json(reviews);
    } catch (e) { next(e); }
});

r.post('/product/:productId', auth, async (req: any, res, next) => {
    try {
        const body = reviewInput.parse(req.body);
        const product = await findProduct(String(req.params.productId));
        if (!product) return res.status(404).json({ message: 'Product not found' });
        const eligibleOrderItem = await prisma.orderItem.findFirst({
            where: { orderId: body.orderId, productId: product.id, order: { userId: req.user.id, status: 'DELIVERED' } },
            select: { id: true }
        });
        if (!eligibleOrderItem) return res.status(403).json({ message: 'You can review products only from your own delivered orders.' });

        const duplicate = await prisma.review.findUnique({
            where: { userId_productId: { userId: req.user.id, productId: product.id } },
            select: { id: true }
        });
        if (duplicate) throw httpError(409, 'You have already reviewed this product.', 'REVIEW_EXISTS');

        const review = await prisma.review.create({
            data: { userId: req.user.id, productId: product.id, orderId: body.orderId, rating: body.rating, comment: body.comment?.trim() || null },
            include: { user: { select: { fullName: true } } }
        });
        res.status(201).json(review);
    } catch (e) { next(e); }
});

r.post('/store', auth, async (req: any, res, next) => {
    try {
        const body = reviewInput.parse(req.body);
        const order = await prisma.order.findFirst({ where: { id: body.orderId, userId: req.user.id, status: 'DELIVERED' }, select: { id: true } });
        if (!order) return res.status(403).json({ message: 'You can review the store only after your own order has been delivered.' });
        const duplicate = await prisma.storeReview.findUnique({
            where: { userId_orderId: { userId: req.user.id, orderId: body.orderId } },
            select: { id: true }
        });
        if (duplicate) throw httpError(409, 'You have already reviewed the store for this order.', 'STORE_REVIEW_EXISTS');
        const review = await prisma.storeReview.create({
            data: { userId: req.user.id, orderId: body.orderId, rating: body.rating, comment: body.comment?.trim() || null }
        });
        res.status(201).json(review);
    } catch (e) { next(e); }
});

r.patch('/:id', auth, async (req: any, res, next) => {
    try {
        const body = z.object({ rating: z.number().int().min(1).max(5).optional(), comment: z.string().max(2000).optional() }).parse(req.body);
        const result = await prisma.review.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: body });
        if (!result.count) return res.status(404).json({ message: 'Review not found' });
        res.json({ updated: true });
    } catch (e) { next(e); }
});

r.delete('/:id', auth, async (req: any, res, next) => {
    try {
        await prisma.review.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
        res.json({ message: 'Review deleted' });
    } catch (e) { next(e); }
});

r.get('/admin/all', auth, admin, async (_req, res, next) => {
    try {
        res.json(await prisma.review.findMany({ include: { user: { select: { email: true, fullName: true } }, product: true }, orderBy: { createdAt: 'desc' } }));
    } catch (e) { next(e); }
});

r.patch('/admin/:id', auth, admin, async (req, res, next) => {
    try {
        const body = z.object({ isApproved: z.boolean() }).parse(req.body);
        res.json(await prisma.review.update({ where: { id: String(req.params.id) }, data: body }));
    } catch (e) { next(e); }
});

export default r;
