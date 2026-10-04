import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { orderNumber, computePricing } from '../utils/order.js';
import { notify } from '../services/notifications.js';
import { sendOrderConfirmation } from '../services/orderEmail.js';
import { mayaConfigured } from '../config.js';
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
    // Ignored: the discount is always computed on the server.
    discount: z.number().optional()
});

/** Never show internal e-mail diagnostics to customers. */
const toCustomerOrder = <T extends { confirmationEmailError?: unknown }>(
    o: T
) => {
    const { confirmationEmailError: _hidden, ...rest } = o;
    return rest;
};

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

    if (b.paymentMethod === 'MAYA' && !mayaConfigured)
        throw Object.assign(
            new Error('Maya payments are not available right now. Please choose Cash on Delivery.'),
            { statusCode: 503 }
        );

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

    // Prices come from the database, never from the browser.
    const subtotal = cart.items.reduce(
        (sum, i) => sum + i.product.price * i.quantity,
        0
    );

    // Discount, shipping and tax are decided here, never by the browser.
    const t = computePricing(subtotal);

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
            // Atomic: only decrements while enough stock remains, so two
            // simultaneous checkouts cannot oversell the last unit.
            const dec = await tx.product.updateMany({
                where: {
                    id: i.productId,
                    status: 'ACTIVE',
                    stock: { gte: i.quantity }
                },
                data: { stock: { decrement: i.quantity } }
            });

            if (dec.count === 0)
                throw Object.assign(
                    new Error(`Insufficient stock for ${i.product.name}`),
                    { statusCode: 400 }
                );

            await tx.product.updateMany({
                where: { id: i.productId, stock: 0 },
                data: { status: 'OUT_OF_STOCK' }
            });
        }

        await tx.cartItem.deleteMany({
            where: { cartId: cart.id }
        });

        return o;
    });

    await notify(
        userId,
        b.paymentMethod === 'MAYA' ? 'Order received' : 'Order confirmed',
        b.paymentMethod === 'MAYA'
            ? `Your order ${order.orderNumber} has been received and is waiting for payment.`
            : `Your order ${order.orderNumber} has been received.`,
        'ORDER'
    );

    // Cash on delivery is confirmed immediately. Maya orders get their
    // confirmation only after Maya verifies the payment.
    // Fire-and-forget: e-mail problems never fail or delay the order.
    if (b.paymentMethod === 'COD')
        void sendOrderConfirmation(order.id).catch((e) =>
            console.error('[email] COD confirmation error:', e)
        );

    return prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: { include: { product: true } } }
    });
}

r.post('/', auth, async (req: any, res, next) => {
    try {
        res.status(201).json(
            toCustomerOrder(
                await createOrder(
                    req.user.id,
                    checkout.parse(req.body)
                )
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

    res.json(orders.map(toCustomerOrder));
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

    res.json(toCustomerOrder(o));
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

            const before = await prisma.order.findUnique({
                where: { id: req.params.id },
                select: { paymentStatus: true }
            });

            const o = await prisma.order.update({
                where: { id: req.params.id },
                data: {
                    status: b.status,
                    paymentStatus:
                        b.status === 'CANCELLED'
                            ? before?.paymentStatus === 'PAID'
                                ? 'REFUNDED'
                                : 'CANCELLED'
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

r.post(
    '/admin/:id/resend-confirmation',
    auth,
    admin,
    async (req: any, res, next) => {
        try {
            const o = await prisma.order.findUnique({
                where: { id: req.params.id },
                select: { id: true, paymentMethod: true, paymentStatus: true }
            });

            if (!o)
                return res
                    .status(404)
                    .json({ message: 'Order not found' });

            if (o.paymentMethod === 'MAYA' && o.paymentStatus !== 'PAID')
                return res.status(409).json({
                    message:
                        'A Maya order is only confirmed after payment is verified.'
                });

            const force = req.query.force === 'true';
            const out = await sendOrderConfirmation(o.id, {
                retryFailed: true,
                force
            });

            await audit(req.user.id, 'RESEND_CONFIRMATION', 'Order', o.id, {
                result: out.result,
                force
            });

            res.json(out);
        } catch (e) {
            next(e);
        }
    }
);

export default r;
