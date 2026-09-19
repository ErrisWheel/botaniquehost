import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { z } from 'zod';

const r = Router();

r.get('/', async (req, res) => {
    const xs = await prisma.setting.findMany();

    res.json(
        Object.fromEntries(
            xs.map((x) => [x.key, x.value])
        )
    );
});

r.put('/', auth, admin, async (req, res, next) => {
    try {
        const b = z
            .record(z.string(), z.string())
            .parse(req.body);

        for (const [key, value] of Object.entries(b))
            await prisma.setting.upsert({
                where: { key },
                update: { value },
                create: { key, value }
            });

        res.json(b);
    } catch (e) {
        next(e);
    }
});

export default r;
