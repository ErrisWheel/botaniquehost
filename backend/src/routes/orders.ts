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
import { ORDER_STATUSES, paymentStatusAfterCancel } from '../services/orderStatus.js';
import { restockOrder } from '../services/inventory.js';
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

/** Customer confirms receipt for their own On delivery or Delivered order. */
r.post('/:id/received', auth, async (req: any, res, next) => {
    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const order = await tx.order.findFirst({
                where: { id: String(req.params.id), userId: req.user.id },
                include: { items: { include: { product: orderItemProduct } } }
            });
            if (!order) throw httpError(404, 'Order not found');
            if (order.customerReceivedAt) return { order, changed: false };
            if (!['ON_DELIVERY', 'DELIVERED'].includes(order.status)) {
                throw httpError(409, 'You can confirm receipt only when your order is On delivery or Delivered.', 'ORDER_NOT_ELIGIBLE_FOR_RECEIPT');
            }
            const data: Record<string, unknown> = {
                status: 'DELIVERED',
                customerReceivedAt: new Date()
            };
            if (order.status === 'ON_DELIVERY' && order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING') {
                data.paymentStatus = 'PAID';
                data.paidAt = new Date();
            }
            const updated = await tx.order.updateMany({
                where: {
                    id: order.id,
                    userId: req.user.id,
                    status: { in: ['ON_DELIVERY', 'DELIVERED'] },
                    customerReceivedAt: null
                },
                data
            });
            if (updated.count !== 1) {
                const current = await tx.order.findFirst({
                    where: { id: order.id, userId: req.user.id },
                    include: { items: { include: { product: orderItemProduct } } }
                });
                if (current?.customerReceivedAt) return { order: current, changed: false };
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

r.post('/:id/cancel', auth, async (req: any, res, next) => {
    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const order = await tx.order.findFirst({
                where: { id: String(req.params.id), userId: req.user.id },
                include: { items: true }
            });

            if (!order) throw httpError(404, 'Order not found', 'NOT_FOUND');
            if (order.status !== 'PENDING') {
                throw httpError(409, 'Only pending orders can be cancelled by the customer.', 'ORDER_NOT_CANCELLABLE');
            }

            const updated = await tx.order.updateMany({
                where: {
                    id: order.id,
                    userId: req.user.id,
                    status: 'PENDING',
                    paymentStatus: order.paymentStatus
                },
                data: {
                    status: 'CANCELLED',
                    cancelledAt: new Date(),
                    paymentStatus: paymentStatusAfterCancel(order.paymentStatus)
                }
            });

            if (updated.count !== 1) {
                throw httpError(409, 'This order changed while you were cancelling it. Refresh and try again.', 'CONCURRENT_CHANGE');
            }

            const restocked = await restockOrder(tx, order);
            const cancelledOrder = await tx.order.findUniqueOrThrow({
                where: { id: order.id },
                include: {
                    items: { include: { product: orderItemProduct } },
                    returns: true
                }
            });

            return { order: cancelledOrder, restocked };
        });

        await notify(
            req.user.id,
            'Order cancelled',
            `Your order ${result.order.orderNumber} has been cancelled.${result.order.paymentStatus === 'REFUND_PENDING' ? ' A refund is pending administrator confirmation.' : ''}`,
            'ORDER'
        ).catch((e) => console.error('[notify] cancellation notification failed:', e));

        await audit(req.user.id, 'CUSTOMER_CANCEL_ORDER', 'Order', result.order.id, {
            status: 'CANCELLED',
            paymentStatus: result.order.paymentStatus,
            restocked: result.restocked
        });

        res.set('Cache-Control', 'no-store');
        res.json(result.order);
    } catch (e) {
        next(e);
    }
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
            where: { orderId: o.id, status: { not: 'REJECTED' } }
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
            const b = z.object({
                status: z.enum(['APPROVED', 'REJECTED', 'REFUNDED']),
                refundAmount: z.number().nonnegative().optional()
            }).parse(req.body);

            const result = await prisma.$transaction(async (tx: any) => {
                const ret = await tx.returnRequest.findUnique({
                    where: { id: String(req.params.id) },
                    include: { order: { include: { items: true } } }
                });

                if (!ret) throw httpError(404, 'Return request not found', 'NOT_FOUND');
                if (ret.status === b.status) return { request: ret, orderId: ret.orderId, changed: false };

                const allowed = ret.status === 'REQUESTED'
                    ? ['APPROVED', 'REJECTED']
                    : ret.status === 'APPROVED'
                        ? ['REFUNDED']
                        : [];
                if (!allowed.includes(b.status)) {
                    throw httpError(409, `A return in ${ret.status} status cannot be changed to ${b.status}.`, 'INVALID_RETURN_TRANSITION');
                }

                const total = Number(ret.order.total) || 0;
                const refundAmount = b.status === 'REFUNDED'
                    ? Math.min(Math.round(b.refundAmount ?? ret.refundAmount ?? total), total)
                    : undefined;

                if (b.status === 'APPROVED' && !['PAID', 'REFUND_PENDING'].includes(ret.order.paymentStatus)) {
                    throw httpError(409, 'This order is not recorded as paid, so a refund cannot be approved.', 'ORDER_NOT_PAID');
                }
                if (b.status === 'REFUNDED' && !['PAID', 'REFUND_PENDING'].includes(ret.order.paymentStatus)) {
                    throw httpError(409, 'This order does not have a pending refund.', 'REFUND_NOT_DUE');
                }

                const changed = await tx.returnRequest.updateMany({
                    where: { id: ret.id, status: ret.status },
                    data: {
                        status: b.status,
                        ...(refundAmount === undefined ? {} : { refundAmount })
                    }
                });
                if (changed.count !== 1) {
                    throw httpError(409, 'This return request was updated by another administrator. Refresh and try again.', 'CONCURRENT_CHANGE');
                }

                if (b.status === 'APPROVED' && ret.order.paymentStatus === 'PAID') {
                    const paymentUpdate = await tx.order.updateMany({
                        where: { id: ret.orderId, paymentStatus: 'PAID' },
                        data: { paymentStatus: 'REFUND_PENDING' }
                    });
                    if (paymentUpdate.count !== 1) {
                        throw httpError(409, 'The order payment status changed. Refresh and try again.', 'CONCURRENT_CHANGE');
                    }
                }

                if (b.status === 'REFUNDED') {
                    const orderUpdate = await tx.order.updateMany({
                        where: { id: ret.orderId, paymentStatus: { in: ['PAID', 'REFUND_PENDING'] } },
                        data: { paymentStatus: 'REFUNDED' }
                    });
                    if (orderUpdate.count !== 1) {
                        throw httpError(409, 'The order payment status changed. Refresh and try again.', 'CONCURRENT_CHANGE');
                    }

                    for (const item of ret.order.items) {
                        await tx.product.update({
                            where: { id: item.productId },
                            data: { stock: { increment: item.quantity } }
                        });
                        await tx.product.updateMany({
                            where: { id: item.productId, status: 'OUT_OF_STOCK', stock: { gt: 0 } },
                            data: { status: 'ACTIVE' }
                        });
                    }
                }

                const request = await tx.returnRequest.findUniqueOrThrow({ where: { id: ret.id } });
                return { request, orderId: ret.orderId, changed: true, refundAmount };
            });

            if (result.changed) {
                await audit(req.user.id, 'UPDATE_RETURN', 'ReturnRequest', String(req.params.id), {
                    status: b.status,
                    refundAmount: 'refundAmount' in result ? result.refundAmount : undefined
                });
                const order = await prisma.order.findUnique({
                    where: { id: result.orderId },
                    select: { userId: true, orderNumber: true }
                });
                const refundAmount = 'refundAmount' in result ? result.refundAmount : undefined;
                await notify(
                    order?.userId || undefined,
                    b.status === 'REJECTED' ? 'Return request declined' : b.status === 'APPROVED' ? 'Return request approved' : 'Refund confirmed',
                    b.status === 'REJECTED'
                        ? `Your return request for order ${order?.orderNumber || ''} was declined.`
                        : b.status === 'APPROVED'
                            ? `Your return request for order ${order?.orderNumber || ''} was approved. The refund is awaiting confirmation.`
                            : `The refund${refundAmount === undefined ? '' : ` of ₱${Number(refundAmount).toLocaleString('en-PH')}`} for order ${order?.orderNumber || ''} has been marked as sent by Botanique. Your payment provider may take additional time to reflect the funds.`,
                    b.status === 'REFUNDED' ? 'PAYMENT' : 'ORDER'
                ).catch((e) => console.error('[notify] return notification failed:', e));
            }

            res.json(result.request);
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
