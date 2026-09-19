import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const r = Router();

r.get('/', async (req, res, next) => {
    try {
        const {
            q,
            category,
            minPrice,
            maxPrice,
            status,
            sort = 'newest',
            page = '1',
            limit = '24'
        } = req.query as any;

        const where: any = {
            status: status || 'ACTIVE'
        };

        if (q)
            where.OR = [
                { name: { contains: q } },
                { scientific: { contains: q } },
                { description: { contains: q } }
            ];

        if (category)
            where.category = {
                slug: category
            };

        if (minPrice || maxPrice)
            where.price = {
                ...(minPrice ? { gte: +minPrice } : {}),
                ...(maxPrice ? { lte: +maxPrice } : {})
            };

        const orderBy: any =
            sort === 'price_asc'
                ? { price: 'asc' }
                : sort === 'price_desc'
                    ? { price: 'desc' }
                    : sort === 'name'
                        ? { name: 'asc' }
                        : { createdAt: 'desc' };

        const skip = (+page - 1) * +limit;

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
                take: +limit
            }),
            prisma.product.count({ where })
        ]);

        res.json({
            items,
            total,
            page: +page,
            limit: +limit
        });
    } catch (e) {
        next(e);
    }
});

r.get('/:id', async (req, res, next) => {
    try {
        const p = await prisma.product.findFirst({
            where: {
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
        const b = z
            .object({
                slug: z.string(),
                name: z.string(),
                scientific: z.string().optional(),
                categoryId: z.string(),
                subcategory: z.string().default(''),
                price: z.number().nonnegative(),
                description: z.string(),
                benefits: z.string().optional(),
                image: z.string().optional(),
                stock: z.number().int().nonnegative().default(0),
                lowStockThreshold: z
                    .number()
                    .int()
                    .nonnegative()
                    .default(5),
                care: z.any().optional(),
                details: z.any().optional(),
                lifespan: z.string().optional(),
                where: z.string().optional(),
                origin: z.string().optional(),
                propagation: z.string().optional(),
                hybrid: z.string().optional(),
                status: z
                    .enum([
                        'ACTIVE',
                        'INACTIVE',
                        'OUT_OF_STOCK'
                    ])
                    .default('ACTIVE'),
                images: z.array(z.string()).optional()
            })
            .parse(req.body);

        const { images, ...data } = b;

        const p = await prisma.product.create({
            data: {
                ...data,
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
            p.id
        );

        res.status(201).json(p);
    } catch (e) {
        next(e);
    }
});

r.patch('/:id', auth, admin, async (req: any, res, next) => {
    try {
        const b = z
            .object({
                name: z.string().optional(),
                description: z.string().optional(),
                price: z.number().nonnegative().optional(),
                stock: z.number().int().nonnegative().optional(),
                status: z
                    .enum([
                        'ACTIVE',
                        'INACTIVE',
                        'OUT_OF_STOCK'
                    ])
                    .optional(),
                categoryId: z.string().optional(),
                subcategory: z.string().optional(),
                image: z.string().optional(),
                benefits: z.string().optional(),
                care: z.any().optional(),
                details: z.any().optional(),
                lifespan: z.string().optional(),
                where: z.string().optional(),
                origin: z.string().optional(),
                propagation: z.string().optional(),
                hybrid: z.string().optional()
            })
            .parse(req.body);

        const p = await prisma.product.update({
            where: {
                id: req.params.id
            },
            data: b
        });

        await audit(
            req.user.id,
            'UPDATE',
            'Product',
            p.id
        );

        res.json(p);
    } catch (e) {
        next(e);
    }
});

r.delete('/:id', auth, admin, async (req: any, res, next) => {
    try {
        await prisma.product.delete({
            where: {
                id: req.params.id
            }
        });

        await audit(
            req.user.id,
            'DELETE',
            'Product',
            req.params.id
        );

        res.json({ message: 'Product deleted' });
    } catch (e) {
        next(e);
    }
});

export default r;
