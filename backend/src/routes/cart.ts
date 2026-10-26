import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();

async function getCart(userId: string) {
    let c = await prisma.cart.findUnique({
        where: { userId },
        include: {
            items: {
                include: { product: true }
            }
        }
    });

    if (!c)
        c = await prisma.cart.create({
            data: { userId },
            include: {
                items: {
                    include: { product: true }
                }
            }
        });

    return c;
}

r.get('/', auth, async (req: any, res) =>
    res.json(await getCart(req.user.id))
);

r.post('/items', auth, async (req: any, res, next) => {
    try {
        const b = z
            .object({
                productId: z.string(),
                quantity: z.number().int().positive().default(1)
            })
            .parse(req.body);

        // The storefront currently stores the catalog slug in localStorage,
        // while the database cart relation uses the product's cuid. Accept
        // either value here so a local cart can always be synced to the
        // backend without producing a false "Product unavailable" error.
        const p = await prisma.product.findFirst({
            where: {
                OR: [
                    { id: b.productId },
                    { slug: b.productId }
                ]
            }
        });

        if (!p || p.status !== 'ACTIVE')
            return res
                .status(400)
                .json({ message: 'Product unavailable' });

        const c = await getCart(req.user.id);
        const existing = await prisma.cartItem.findUnique({
            where: {
                cartId_productId: {
                    cartId: c.id,
                    productId: p.id
                }
            }
        });

        const requestedQuantity =
            (existing?.quantity || 0) + b.quantity;

        if (p.stock < requestedQuantity)
            return res
                .status(400)
                .json({ message: 'Insufficient stock' });

        const item = await prisma.cartItem.upsert({
            where: {
                cartId_productId: {
                    cartId: c.id,
                    productId: p.id
                }
            },
            update: {
                quantity: { increment: b.quantity }
            },
            create: {
                cartId: c.id,
                productId: p.id,
                quantity: b.quantity
            }
        });

        res.status(201).json(await getCart(req.user.id));
    } catch (e) {
        next(e);
    }
});

r.patch('/items/:id', auth, async (req: any, res, next) => {
    try {
        const b = z
            .object({
                quantity: z.number().int().positive()
            })
            .parse(req.body);

        const c = await getCart(req.user.id);

        const item = await prisma.cartItem.findFirst({
            where: {
                id: req.params.id,
                cartId: c.id
            },
            include: { product: true }
        });

        if (!item)
            return res
                .status(404)
                .json({ message: 'Cart item not found' });

        if (item.product.stock < b.quantity)
            return res
                .status(400)
                .json({ message: 'Insufficient stock' });

        await prisma.cartItem.update({
            where: { id: item.id },
            data: { quantity: b.quantity }
        });

        res.json(await getCart(req.user.id));
    } catch (e) {
        next(e);
    }
});

r.delete('/items/:id', auth, async (req: any, res) => {
    const c = await getCart(req.user.id);

    await prisma.cartItem.deleteMany({
        where: {
            id: req.params.id,
            cartId: c.id
        }
    });

    res.json(await getCart(req.user.id));
});

r.delete('/', auth, async (req: any, res) => {
    const c = await getCart(req.user.id);

    await prisma.cartItem.deleteMany({
        where: { cartId: c.id }
    });

    res.json({ message: 'Cart cleared' });
});

export default r;
