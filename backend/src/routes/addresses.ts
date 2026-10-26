import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();

const a = z.object({
    label: z.string().optional(),
    fullName: z.string(),
    phone: z.string(),
    streetAddress: z.string(),
    city: z.string(),
    province: z.string(),
    zip: z.string(),
    region: z.string(),
    isDefault: z.boolean().default(false)
});

r.get(
    '/',
    auth,
    async (req: any, res) =>
        res.json(
            await prisma.address.findMany({
                where: { userId: req.user.id },
                orderBy: { isDefault: 'desc' }
            })
        )
);

r.post('/', auth, async (req: any, res, next) => {
    try {
        const b = a.parse(req.body);

        if (b.isDefault)
            await prisma.address.updateMany({
                where: { userId: req.user.id },
                data: { isDefault: false }
            });

        res.status(201).json(
            await prisma.address.create({
                data: { ...b, userId: req.user.id }
            })
        );
    } catch (e) {
        next(e);
    }
});

r.patch('/:id', auth, async (req: any, res, next) => {
    try {
        const b = a.partial().parse(req.body);

        if (b.isDefault)
            await prisma.address.updateMany({
                where: { userId: req.user.id },
                data: { isDefault: false }
            });

        res.json(
            await prisma.address.updateMany({
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
    await prisma.address.deleteMany({
        where: {
            id: req.params.id,
            userId: req.user.id
        }
    });

    res.json({ message: 'Address deleted' });
});

export default r;
