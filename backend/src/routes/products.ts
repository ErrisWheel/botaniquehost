import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { httpError } from '../utils/httpError.js';
import { statusForStock } from '../services/inventory.js';
import {
    productCreateSchema,
    productUpdateSchema,
    stockAdjustSchema
} from '../services/productRules.js';

const r = Router();

/** Statuses the PUBLIC storefront API may expose. INACTIVE products stay hidden. */
const PUBLIC_STATUSES = ['ACTIVE', 'OUT_OF_STOCK'];

const intIn = (raw: unknown, def: number, min: number, max: number) => {
    const n = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

r.get('/', async (req, res, next) => {
    try {
        const {
            q,
            category,
            minPrice,
            maxPrice,
            status,
            sort = 'newest'
        } = req.query as any;

        // Never let an anonymous visitor list hidden (INACTIVE) products by
        // passing ?status=INACTIVE. Administrators use GET /api/admin/products.
        const wanted = typeof status === 'string' ? status : 'ACTIVE';
        const where: any = {
            status: PUBLIC_STATUSES.includes(wanted) ? wanted : 'ACTIVE'
        };

        if (typeof q === 'string' && q.trim())
            where.OR = [
                { name: { contains: q.trim(), mode: 'insensitive' } },
                { scientific: { contains: q.trim(), mode: 'insensitive' } },
                { description: { contains: q.trim(), mode: 'insensitive' } }
            ];

        if (typeof category === 'string' && category)
            where.category = {
                slug: category
            };

        const min = Number(minPrice);
        const max = Number(maxPrice);
        if (
            (minPrice && Number.isFinite(min)) ||
            (maxPrice && Number.isFinite(max))
        )
            where.price = {
                ...(minPrice && Number.isFinite(min) ? { gte: min } : {}),
                ...(maxPrice && Number.isFinite(max) ? { lte: max } : {})
            };

        const orderBy: any =
            sort === 'price_asc'
                ? { price: 'asc' }
                : sort === 'price_desc'
                    ? { price: 'desc' }
                    : sort === 'name'
                        ? { name: 'asc' }
                        : { createdAt: 'desc' };

        // Bounded paging: a huge ?limit used to load the whole table.
        const limit = intIn(req.query.limit, 24, 1, 100);
        const page = intIn(req.query.page, 1, 1, 100_000);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.product.findMany({
                where,
                include: {
                    category: true,
                    images: {
                        orderBy: {
                            sortOrder: 'asc'
                        }
                    }
                },
                orderBy,
                skip,
                take: limit
            }),
            prisma.product.count({ where })
        ]);

        res.json({
            items,
            total,
            page,
            limit
        });
    } catch (e) {
        next(e);
    }
});

r.get('/:id', async (req, res, next) => {
    try {
        const p = await prisma.product.findFirst({
            where: {
                status: { in: PUBLIC_STATUSES },
                OR: [
                    { id: req.params.id },
                    { slug: req.params.id }
                ]
            },
            include: {
                category: true,
                images: {
                    orderBy: {
                        sortOrder: 'asc'
                    }
                },
                reviews: {
                    where: {
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
                }
            }
        });

        if (!p)
            return res
                .status(404)
                .json({ message: 'Product not found' });

        res.json(p);
    } catch (e) {
        next(e);
    }
});

r.post('/', auth, admin, async (req: any, res, next) => {
    try {
        const b = productCreateSchema.parse(req.body);

        const { images, ...data } = b;

        const category = await prisma.category.findUnique({
            where: { id: data.categoryId },
            select: { id: true }
        });
        if (!category)
            throw httpError(400, 'categoryId: unknown category', 'UNKNOWN_CATEGORY');

        const p = await prisma.product.create({
            data: {
                ...data,
                // 0 stock can never be ACTIVE; an administrator's INACTIVE stays.
                status: statusForStock(data.status, data.stock),
                images: images
                    ? {
                          create: images.map(
                              (url, sortOrder) => ({
                                  url,
                                  sortOrder
                              })
                          )
                      }
                    : undefined
            }
        });

        await audit(
            req.user.id,
            'CREATE',
            'Product',
            p.id,
            { name: p.name, price: p.price, stock: p.stock }
        );

        res.status(201).json(p);
    } catch (e) {
        next(e);
    }
});

r.patch('/:id', auth, admin, async (req: any, res, next) => {
    try {
        const b = productUpdateSchema.parse(req.body);

        const p = await prisma.$transaction(async (tx) => {
            const current = await tx.product.findUnique({
                where: { id: req.params.id }
            });
            if (!current) throw httpError(404, 'Product not found', 'NOT_FOUND');

            if (b.categoryId) {
                const category = await tx.category.findUnique({
                    where: { id: b.categoryId },
                    select: { id: true }
                });
                if (!category)
                    throw httpError(400, 'categoryId: unknown category', 'UNKNOWN_CATEGORY');
            }

            const stock = b.stock ?? current.stock;
            // Keep status consistent with stock; INACTIVE is only changed
            // when the administrator says so explicitly.
            const wantedStatus = b.status ?? current.status;

            return tx.product.update({
                where: { id: current.id },
                data: { ...b, status: statusForStock(wantedStatus, stock) }
            });
        });

        await audit(
            req.user.id,
            'UPDATE',
            'Product',
            p.id,
            b
        );

        res.json(p);
    } catch (e) {
        next(e);
    }
});

/**
 * Atomic stock adjustment (+received / -removed). Unlike sending an absolute
 * `stock` in PATCH, this cannot overwrite a sale that happened a moment ago.
 */
r.post('/:id/stock', auth, admin, async (req: any, res, next) => {
    try {
        const { delta } = stockAdjustSchema.parse(req.body);

        const p = await prisma.$transaction(async (tx) => {
            const moved = await tx.product.updateMany({
                where: {
                    id: req.params.id,
                    // never below zero
                    ...(delta < 0 ? { stock: { gte: -delta } } : {})
                },
                data: { stock: { increment: delta } }
            });

            if (moved.count !== 1) {
                const exists = await tx.product.findUnique({
                    where: { id: req.params.id },
                    select: { stock: true }
                });
                if (!exists) throw httpError(404, 'Product not found', 'NOT_FOUND');
                throw httpError(
                    409,
                    `Only ${exists.stock} in stock; cannot remove ${-delta}.`,
                    'INSUFFICIENT_STOCK'
                );
            }

            const fresh = await tx.product.findUniqueOrThrow({
                where: { id: req.params.id }
            });

            const status = statusForStock(fresh.status, fresh.stock);
            return status === fresh.status
                ? fresh
                : tx.product.update({
                      where: { id: fresh.id },
                      data: { status }
                  });
        });

        await audit(req.user.id, 'ADJUST_STOCK', 'Product', p.id, {
            delta,
            stock: p.stock
        });

        res.json(p);
    } catch (e) {
        next(e);
    }
});

/**
 * Safe removal. A product that appears in any order is NEVER deleted (that
 * would orphan or corrupt order history): it is deactivated instead and
 * disappears from the shop. A product with no order history is removed for
 * real, together with its carts/wishlist entries.
 */
r.delete('/:id', auth, admin, async (req: any, res, next) => {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const p = await tx.product.findUnique({
                where: { id: req.params.id },
                select: { id: true, name: true }
            });
            if (!p) throw httpError(404, 'Product not found', 'NOT_FOUND');

            const sold = await tx.orderItem.count({
                where: { productId: p.id }
            });

            if (sold > 0) {
                await tx.product.update({
                    where: { id: p.id },
                    data: { status: 'INACTIVE' }
                });
                await tx.cartItem.deleteMany({ where: { productId: p.id } });
                return { deactivated: true, orderLines: sold };
            }

            await tx.cartItem.deleteMany({ where: { productId: p.id } });
            await tx.wishlistItem.deleteMany({ where: { productId: p.id } });
            await tx.product.delete({ where: { id: p.id } });
            return { deactivated: false, orderLines: 0 };
        });

        await audit(
            req.user.id,
            result.deactivated ? 'DEACTIVATE' : 'DELETE',
            'Product',
            req.params.id,
            result
        );

        res.json({
            message: result.deactivated
                ? 'Product is part of existing orders, so it was deactivated instead of deleted.'
                : 'Product deleted',
            ...result
        });
    } catch (e) {
        next(e);
    }
});

export default r;
