import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();

r.get('/', auth, async (req: any, res) =>
    res.json(
        await prisma.wishlistItem.findMany({
            where: { userId: req.user.id },
            include: { product: true },
            orderBy: { createdAt: 'desc' }
        })
    )
);

r.post(
    '/:productId',
    auth,
    async (req: any, res, next) => {
        try {
            await prisma.wishlistItem.upsert({
                where: {
                    userId_productId: {
                        userId: req.user.id,
                        productId: req.params.productId
                    }
                },
                update: {},
                create: {
                    userId: req.user.id,
                    productId: req.params.productId
                }
            });

            res.status(201).json({
                message: 'Added to wishlist'
            });
        } catch (e) {
            next(e);
        }
    }
);

r.delete(
    '/:productId',
    auth,
    async (req: any, res) => {
        await prisma.wishlistItem.deleteMany({
            where: {
                userId: req.user.id,
                productId: req.params.productId
            }
        });

        res.json({ message: 'Removed' });
    }
);

export default r;
