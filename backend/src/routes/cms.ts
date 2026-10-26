import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';

const r = Router();

r.get('/pages/:slug', async (req, res) => {
    const x = await prisma.cmsPage.findUnique({
        where: { slug: req.params.slug }
    });

    if (!x || !x.published)
        return res
            .status(404)
            .json({ message: 'Page not found' });

    res.json(x);
});

r.get('/pages', async (req, res) =>
    res.json(
        await prisma.cmsPage.findMany({
            where: { published: true },
            orderBy: { slug: 'asc' }
        })
    )
);

r.get('/promotions', async (req, res) =>
    res.json(
        await prisma.promotion.findMany({
            where: {
                active: true,
                startsAt: { lte: new Date() },
                endsAt: { gte: new Date() }
            },
            orderBy: { startsAt: 'desc' }
        })
    )
);

r.use(auth, admin);

r.post('/pages', async (req, res, next) => {
    try {
        const b = z
            .object({
                slug: z.string(),
                title: z.string(),
                content: z.string(),
                published: z.boolean().default(true)
            })
            .parse(req.body);

        res.status(201).json(
            await prisma.cmsPage.create({
                data: b
            })
        );
    } catch (e) {
        next(e);
    }
});

r.patch('/pages/:id', async (req, res, next) => {
    try {
        const b = z
            .object({
                title: z.string().optional(),
                content: z.string().optional(),
                published: z.boolean().optional()
            })
            .parse(req.body);

        res.json(
            await prisma.cmsPage.update({
                where: { id: req.params.id },
                data: b
            })
        );
    } catch (e) {
        next(e);
    }
});

r.delete('/pages/:id', async (req, res) => {
    await prisma.cmsPage.delete({
        where: { id: req.params.id }
    });

    res.json({ message: 'Deleted' });
});

r.post('/promotions', async (req, res, next) => {
    try {
        const b = z
            .object({
                title: z.string(),
                description: z.string().optional(),
                image: z.string().optional(),
                discountPercent: z
                    .number()
                    .int()
                    .min(0)
                    .max(100)
                    .optional(),
                startsAt: z.coerce.date(),
                endsAt: z.coerce.date(),
                active: z.boolean().default(true)
            })
            .parse(req.body);

        res.status(201).json(
            await prisma.promotion.create({
                data: b
            })
        );
    } catch (e) {
        next(e);
    }
});

r.patch('/promotions/:id', async (req, res, next) => {
    try {
        const b = z
            .object({
                title: z.string().optional(),
                description: z.string().optional(),
                image: z.string().optional(),
                discountPercent: z
                    .number()
                    .int()
                    .min(0)
                    .max(100)
                    .optional(),
                startsAt: z.coerce.date().optional(),
                endsAt: z.coerce.date().optional(),
                active: z.boolean().optional()
            })
            .parse(req.body);

        res.json(
            await prisma.promotion.update({
                where: { id: req.params.id },
                data: b
            })
        );
    } catch (e) {
        next(e);
    }
});

export default r;
