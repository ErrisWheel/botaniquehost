import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { orderNumber, totals } from '../utils/order.js';
import { notify } from '../services/notifications.js';
import { invoice } from '../services/invoice.js';
import { audit } from '../utils/audit.js';

const r = Router();

const checkout = z.object({
    addressId: z.string().optional(),
    customer: z.object({
        fullName: z.string(),
        phone: z.string(),
        email: z.string().email(),
        address: z.string(),
        streetAddress: z.string().optional(),
        city: z.string(),
        province: z.string(),
        zip: z.string(),
        region: z.string()
    }),
    delivery: z
        .object({
            date: z.string().optional(),
            time: z.string().optional(),
            instructions: z.string().optional()
        })
        .optional(),
    paymentMethod: z.enum(['COD', 'MAYA']).default('COD'),
    discount: z.number().nonnegative().default(0)
});

async function createOrder(userId: string, b: any) {
    const cart = await prisma.cart.findUnique({
        where: { userId },
        include: {
            items: {
                include: {
                    product: true
                }
            }
        }
    });

    if (!cart || !cart.items.length)
        throw Object.assign(new Error('Cart is empty'), {
            statusCode: 400
        });

    for (const i of cart.items)
        if (
            i.product.status !== 'ACTIVE' ||
            i.product.stock < i.quantity
        )
            throw Object.assign(
                new Error(
                    `Insufficient stock for ${i.product.name}`
                ),
                { statusCode: 400 }
            );

    const subtotal = cart.items.reduce(
        (sum, i) => sum + i.product.price * i.quantity,
        0
    );

    const t = totals(subtotal, b.discount, 0, 0.12);

    const order = await prisma.$transaction(async (tx) => {
        const o = await tx.order.create({
            data: {
                orderNumber: orderNumber(),
                userId,
                status: 'PENDING',
                paymentMethod: b.paymentMethod,
                paymentStatus: 'PENDING',
                subtotal: t.subtotal,
                discount: t.discount,
                shipping: t.shipping,
                tax: t.tax,
                total: t.total,
                customerJson: b.customer,
                deliveryJson: b.delivery || {},
                items: {
                    create: cart.items.map((i) => ({
                        productId: i.productId,
                        productName: i.product.name,
                        quantity: i.quantity,
                        unitPrice: i.product.price,
                        lineTotal:
                            i.product.price * i.quantity
                    }))
                }
            }
        });

        for (const i of cart.items) {
            const left = i.product.stock - i.quantity;

            await tx.product.update({
                where: { id: i.productId },
                data: {
                    stock: left,
                    status:
                        left === 0
                            ? 'OUT_OF_STOCK'
                            : i.product.status
                }
            });
        }

        await tx.cartItem.deleteMany({
            where: { cartId: cart.id }
        });

        return o;
    });

    await notify(
        userId,
        'Order confirmed',
        `Your order ${order.orderNumber} has been received.`,
        'ORDER'
    );

    return prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: { include: { product: true } } }
    });
}

r.post('/', auth, async (req: any, res, next) => {
    try {
        res.status(201).json(
            await createOrder(
                req.user.id,
                checkout.parse(req.body)
            )
        );
    } catch (e) {
        next(e);
    }
});

r.get(
    '/admin/all',
    auth,
    admin,
    async (req: any, res) =>
        res.json(
            await prisma.order.findMany({
                include: {
                    items: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            fullName: true,
                            phone: true
                        }
                    },
                    returns: true
                },
                orderBy: { createdAt: 'desc' }
            })
        )
);

r.get('/', auth, async (req: any, res) => {
    const orders = await prisma.order.findMany({
        where: { userId: req.user.id },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' }
    });

    res.json(orders);
});

r.get('/:id', auth, async (req: any, res) => {
    const o = await prisma.order.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id
        },
        include: {
            items: { include: { product: true } },
            returns: true
        }
    });

    if (!o)
        return res
            .status(404)
            .json({ message: 'Order not found' });

    res.json(o);
});

r.get('/:id/invoice', auth, async (req: any, res) => {
    const o = await prisma.order.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id
        },
        include: { items: true }
    });

    if (!o)
        return res
            .status(404)
            .json({ message: 'Order not found' });

    invoice(res, o);
});

r.post('/:id/return', auth, async (req: any, res, next) => {
    try {
        const b = z
            .object({
                reason: z.string().min(5)
            })
            .parse(req.body);

        const o = await prisma.order.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!o)
            return res
                .status(404)
                .json({ message: 'Order not found' });

        res.status(201).json(
            await prisma.returnRequest.create({
                data: {
                    orderId: o.id,
                    reason: b.reason
                }
            })
        );
    } catch (e) {
        next(e);
    }
});

r.patch(
    '/admin/:id/status',
    auth,
    admin,
    async (req: any, res, next) => {
        try {
            const b = z
                .object({
                    status: z.enum([
                        'PENDING',
                        'PROCESSING',
                        'SHIPPED',
                        'DELIVERED',
                        'CANCELLED'
                    ])
                })
                .parse(req.body);

            const o = await prisma.order.update({
                where: { id: req.params.id },
                data: {
                    status: b.status,
                    paymentStatus:
                        b.status === 'CANCELLED'
                            ? 'REFUNDED'
                            : undefined
                },
                include: { items: true }
            });

            await notify(
                o.userId || undefined,
                'Order status updated',
                `Order ${o.orderNumber} is now ${b.status}.`,
                'ORDER'
            );

            await audit(
                req.user.id,
                'UPDATE_STATUS',
                'Order',
                o.id,
                { status: b.status }
            );

            res.json(o);
        } catch (e) {
            next(e);
        }
    }
);

r.get(
    '/admin/:id/invoice',
    auth,
    admin,
    async (req: any, res) => {
        const o = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { items: true }
        });

        if (!o)
            return res
                .status(404)
                .json({ message: 'Order not found' });

        invoice(res, o);
    }
);

r.post(
    '/admin/:id/return',
    auth,
    admin,
    async (req: any, res, next) => {
        try {
            const b = z
                .object({
                    status: z.enum([
                        'APPROVED',
                        'REJECTED',
                        'REFUNDED'
                    ]),
                    refundAmount: z.number().nonnegative().optional()
                })
                .parse(req.body);

            const x = await prisma.returnRequest.updateMany({
                where: { id: req.params.id },
                data: b
            });

            res.json(x);
        } catch (e) {
            next(e);
        }
    }
);

export default r;
