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
import { httpError } from '../utils/httpError.js';
import { ORDER_STATUSES } from '../services/orderStatus.js';
import { applyAdminStatusChange } from '../services/adminOrders.js';

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

/** Exported for tests; the HTTP route below is the only production caller. */
export async function createOrder(userId: string, b: any) {
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
        // 1. Claim EXACTLY the cart rows that were priced above. Two checkouts
        //    for the same cart (double click, two tabs, a retry) race on this
        //    DELETE: the loser finds the rows already gone, matches fewer rows
        //    than expected and aborts, so one cart can only ever become one
        //    order. If this transaction later rolls back, the cart is restored.
        const claimed = await tx.cartItem.deleteMany({
            where: {
                cartId: cart.id,
                OR: cart.items.map((i) => ({
                    id: i.id,
                    quantity: i.quantity
                }))
            }
        });

        if (claimed.count !== cart.items.length)
            throw httpError(
                409,
                'Your cart changed or this order was already placed. Please review your cart and try again.',
                'CART_CHANGED'
            );

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

        // 2. Reserve stock atomically. The WHERE clause only matches while
        //    enough stock remains AND the price is still the one the customer
        //    was charged, so simultaneous checkouts can never oversell the last
        //    unit and an admin price change mid-checkout cannot slip through.
        for (const i of cart.items) {
            const dec = await tx.product.updateMany({
                where: {
                    id: i.productId,
                    status: 'ACTIVE',
                    price: i.product.price,
                    stock: { gte: i.quantity }
                },
                data: { stock: { decrement: i.quantity } }
            });

            if (dec.count === 0) {
                const now = await tx.product.findUnique({
                    where: { id: i.productId },
                    select: { price: true }
                });

                if (now && now.price !== i.product.price)
                    throw httpError(
                        409,
                        `The price of ${i.product.name} just changed. Please review your cart and try again.`,
                        'PRICE_CHANGED'
                    );

                throw httpError(
                    400,
                    `Insufficient stock for ${i.product.name}`,
                    'INSUFFICIENT_STOCK'
                );
            }

            await tx.product.updateMany({
                where: { id: i.productId, stock: 0, status: 'ACTIVE' },
                data: { status: 'OUT_OF_STOCK' }
            });
        }

        return o;
    });

    // The order is already committed: a notification problem must never turn
    // a successful checkout into an error (the customer would retry).
    await notify(
        userId,
        b.paymentMethod === 'MAYA' ? 'Order received' : 'Order confirmed',
        b.paymentMethod === 'MAYA'
            ? `Your order ${order.orderNumber} has been received and is waiting for payment.`
            : `Your order ${order.orderNumber} has been received.`,
        'ORDER'
    ).catch((e) => console.error('[notify] order notification failed:', e));

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

/** Customer confirms receipt only for their own ON_DELIVERY order. */
r.post('/:id/received', auth, async (req: any, res, next) => {
    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const order = await tx.order.findFirst({
                where: { id: String(req.params.id), userId: req.user.id },
                include: { items: { include: { product: orderItemProduct } } }
            });
            if (!order) throw httpError(404, 'Order not found');
            if (order.status === 'DELIVERED') return { order, changed: false };
            if (order.status !== 'ON_DELIVERY') {
                throw httpError(409, 'You can confirm receipt only when your order is marked On delivery.', 'ORDER_NOT_ON_DELIVERY');
            }
            const data: Record<string, unknown> = { status: 'DELIVERED' };
            if (order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING') {
                data.paymentStatus = 'PAID';
                data.paidAt = new Date();
            }
            const updated = await tx.order.updateMany({
                where: { id: order.id, userId: req.user.id, status: 'ON_DELIVERY' }, data
            });
            if (updated.count !== 1) {
                const current = await tx.order.findFirst({
                    where: { id: order.id, userId: req.user.id },
                    include: { items: { include: { product: orderItemProduct } } }
                });
                if (current?.status === 'DELIVERED') return { order: current, changed: false };
                throw httpError(409, 'The order status changed. Refresh and try again.', 'CONCURRENT_CHANGE');
            }
            const fresh = await tx.order.findUniqueOrThrow({
                where: { id: order.id }, include: { items: { include: { product: orderItemProduct } } }
            });
            return { order: fresh, changed: true };
        });
        if (result.changed) {
            await notify(req.user.id, 'Order received', `You confirmed that order ${result.order.orderNumber} has been received.`, 'ORDER')
                .catch((e) => console.error('[notify] receipt confirmation notification failed:', e));
        }
        res.set('Cache-Control', 'no-store');
        res.json(result);
    } catch (e) { next(e); }
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

// Only what the storefront renders for each item (the full product row carries
// large JSON columns the order screens never use).
const orderItemProduct = {
    select: { id: true, slug: true, name: true, image: true }
} as const;

r.get('/', auth, async (req: any, res) => {
    // Served by the (userId, createdAt) index. Always the caller's own orders.
    const orders = await prisma.order.findMany({
        where: { userId: req.user.id },
        include: { items: { include: { product: orderItemProduct } } },
        orderBy: { createdAt: 'desc' },
        take: 100
    });

    // Account data must never be served from a browser/proxy cache.
    res.set('Cache-Control', 'no-store');

    res.json(orders.map(toCustomerOrder));
});

r.get('/:id', auth, async (req: any, res) => {
    const o = await prisma.order.findFirst({
        where: {
            id: req.params.id,
            userId: req.user.id
        },
        include: {
            items: { include: { product: orderItemProduct } },
            returns: true
        }
    });

    if (!o)
        return res
            .status(404)
            .json({ message: 'Order not found' });

    res.set('Cache-Control', 'no-store');
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

    res.set('Cache-Control', 'no-store');
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

        // Returns only make sense for goods that were actually delivered, and
        // one open request per order is enough.
        if (o.status !== 'DELIVERED')
            return res.status(409).json({
                message: 'A return can only be requested for a delivered order.',
                code: 'ORDER_NOT_DELIVERED'
            });

        const open = await prisma.returnRequest.findFirst({
            where: { orderId: o.id, status: 'REQUESTED' }
        });

        if (open)
            return res.status(409).json({
                message: 'A return request for this order is already open.',
                code: 'RETURN_ALREADY_REQUESTED'
            });

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

/**
 * Administrator status change. All rules (allowed transitions, Maya payment
 * requirement, atomic compare-and-set, exactly-once restock on cancellation)
 * live in services/orderStatus.ts and are shared with the admin dashboard
 * endpoint, so both entry points behave identically.
 */
r.patch(
    '/admin/:id/status',
    auth,
    admin,
    async (req: any, res, next) => {
        try {
            const b = z
                .object({ status: z.enum(ORDER_STATUSES) })
                .parse(req.body);

            res.json(
                await applyAdminStatusChange(
                    prisma,
                    req.user.id,
                    String(req.params.id),
                    b.status
                )
            );
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

            const ret = await prisma.returnRequest.findUnique({
                where: { id: req.params.id },
                include: { order: { select: { total: true } } }
            });

            if (!ret)
                return res
                    .status(404)
                    .json({ message: 'Return request not found' });

            // A refund can never exceed what the customer paid, and a REFUNDED
            // return always records an amount (full order total by default) so
            // the dashboard's revenue can subtract it.
            const refundAmount =
                b.status === 'REFUNDED'
                    ? Math.min(b.refundAmount ?? ret.order.total, ret.order.total)
                    : b.refundAmount;

            const x = await prisma.returnRequest.updateMany({
                where: { id: req.params.id },
                data: { ...b, refundAmount: refundAmount === undefined ? undefined : Math.round(refundAmount) }
            });

            await audit(req.user.id, 'UPDATE_RETURN', 'ReturnRequest', req.params.id, {
                status: b.status,
                refundAmount
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
