import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env, mayaConfigured } from '../config.js';
import { audit } from '../utils/audit.js';
import { computePricing } from '../utils/order.js';
import { notify } from './notifications.js';
import { sendOrderConfirmation } from './orderEmail.js';
import {
    createCheckout,
    evaluatePayments,
    getPaymentsByReference,
    splitName,
    type MayaPayment,
    type Verdict
} from './maya.js';

const httpError = (statusCode: number, message: string, code?: string) =>
    Object.assign(new Error(message), { statusCode, code });

const isUniqueViolation = (e: unknown) =>
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === 'P2002';

/** Maya's hosted page is valid for one hour. */
const CHECKOUT_REUSE_MS = 50 * 60_000;
const CHECKOUT_GIVE_UP_MS = 75 * 60_000;
const NEVER_STARTED_GIVE_UP_MS = 2 * 60 * 60_000;

/** Only store non-sensitive fields from Maya's payload. */
function safePayload(p: MayaPayment): Prisma.InputJsonValue {
    return {
        id: p.id ?? null,
        status: p.paymentStatus ?? p.status ?? null,
        isPaid: p.isPaid ?? null,
        amount: p.amount ?? p.totalAmount?.value ?? null,
        currency: p.currency ?? p.totalAmount?.currency ?? null,
        requestReferenceNumber: p.requestReferenceNumber ?? null,
        receiptNumber: p.receiptNumber ?? null,
        fundSourceType: p.fundSource?.type ?? null,
        createdAt: p.createdAt ?? null,
        updatedAt: p.updatedAt ?? null
    };
}

const mayaPhone = (raw: string) => {
    const digits = raw.replace(/[^\d+]/g, '');
    if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
    return digits;
};

/* ------------------------------------------------------------------ */
/* Create (or reuse) the Maya checkout for an order                    */
/* ------------------------------------------------------------------ */

export async function createMayaCheckoutForOrder(
    orderId: string,
    userId: string
): Promise<{ redirectUrl: string; checkoutId: string; reused: boolean }> {
    if (!mayaConfigured)
        throw httpError(
            503,
            'Maya payments are not configured on the server.',
            'MAYA_NOT_CONFIGURED'
        );

    const order = await prisma.order.findFirst({
        where: { id: orderId, userId },
        include: { items: true }
    });

    if (!order) throw httpError(404, 'Order not found');
    if (order.paymentMethod !== 'MAYA')
        throw httpError(400, 'This order is not a Maya order.');
    if (order.paymentStatus === 'PAID')
        throw httpError(409, 'This order is already paid.', 'ALREADY_PAID');
    if (order.status !== 'PENDING' || order.paymentStatus === 'EXPIRED' || order.paymentStatus === 'CANCELLED')
        throw httpError(
            409,
            'This order can no longer be paid. Please place a new order.',
            'ORDER_NOT_PAYABLE'
        );

    /* ---- Re-validate everything server-side; trust nothing stored loosely ---- */
    if (!order.items.length) throw httpError(409, 'Order has no items.');

    const itemsOk = order.items.every(
        (i) =>
            i.quantity > 0 &&
            i.unitPrice >= 0 &&
            i.lineTotal === i.unitPrice * i.quantity
    );
    const subtotal = order.items.reduce((s, i) => s + i.lineTotal, 0);
    const p = computePricing(subtotal);

    if (
        !itemsOk ||
        order.subtotal !== p.subtotal ||
        order.discount !== p.discount ||
        order.shipping !== p.shipping ||
        order.tax !== p.tax ||
        order.total !== p.total
    ) {
        await audit(userId, 'PAYMENT_VALIDATION_FAILED', 'Order', order.id, {
            stored: {
                subtotal: order.subtotal,
                discount: order.discount,
                shipping: order.shipping,
                tax: order.tax,
                total: order.total
            },
            recomputed: p
        });
        throw httpError(
            409,
            'This order failed price validation. Please contact support.',
            'PRICE_VALIDATION_FAILED'
        );
    }

    /* ---- Idempotent: reuse a still-valid checkout ---- */
    const age = order.mayaCheckoutCreatedAt
        ? Date.now() - order.mayaCheckoutCreatedAt.getTime()
        : undefined;

    if (order.paymentIntentId && order.mayaRedirectUrl) {
        if (age !== undefined && age < CHECKOUT_REUSE_MS)
            return {
                redirectUrl: order.mayaRedirectUrl,
                checkoutId: order.paymentIntentId,
                reused: true
            };

        throw httpError(
            409,
            'The payment session for this order has expired. Please place a new order.',
            'CHECKOUT_EXPIRED'
        );
    }

    /* ---- Atomic claim so a double-click cannot create two checkouts ---- */
    const claim = await prisma.order.updateMany({
        where: { id: order.id, paymentIntentId: null, mayaCheckoutCreatedAt: null },
        data: { mayaCheckoutCreatedAt: new Date() }
    });

    if (claim.count === 0)
        throw httpError(
            409,
            'A payment session is already being created. Please wait a moment and try again.',
            'CHECKOUT_IN_PROGRESS'
        );

    const customer = (order.customerJson ?? {}) as Record<string, string>;
    const { firstName, lastName } = splitName(customer.fullName || 'Customer');
    const front = env.FRONTEND_URL.replace(/\/+$/, '');
    const back = (outcome: string) =>
        `${front}/payment-result?orderId=${encodeURIComponent(order.id)}&outcome=${outcome}`;

    try {
        const { checkoutId, redirectUrl } = await createCheckout({
            requestReferenceNumber: order.orderNumber,
            total: order.total,
            subtotal: order.subtotal,
            discount: order.discount,
            shipping: order.shipping,
            tax: order.tax,
            items: order.items.map((i) => ({
                name: i.productName,
                code: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                lineTotal: i.lineTotal
            })),
            buyer: {
                firstName,
                lastName,
                email: customer.email,
                phone: mayaPhone(customer.phone || ''),
                address: {
                    line1: customer.streetAddress || customer.address || '',
                    city: customer.city || '',
                    state: customer.province || '',
                    zipCode: customer.zip || ''
                }
            },
            redirectUrl: {
                success: back('success'),
                failure: back('failure'),
                cancel: back('cancel')
            },
            metadata: { orderId: order.id, orderNumber: order.orderNumber }
        });

        await prisma.order.update({
            where: { id: order.id },
            data: {
                paymentIntentId: checkoutId,
                mayaRedirectUrl: redirectUrl,
                mayaCheckoutCreatedAt: new Date(),
                mayaPaymentStatus: 'PENDING_TOKEN'
            }
        });

        await audit(userId, 'MAYA_CHECKOUT_CREATED', 'Order', order.id, {
            checkoutId
        });

        return { redirectUrl, checkoutId, reused: false };
    } catch (e) {
        // Release the claim so the customer can try again.
        await prisma.order
            .updateMany({
                where: { id: order.id, paymentIntentId: null },
                data: { mayaCheckoutCreatedAt: null }
            })
            .catch(() => undefined);

        console.error('[maya] create checkout failed:', e);
        throw httpError(
            502,
            'We could not start the Maya payment. Please try again in a moment.',
            'MAYA_CHECKOUT_FAILED'
        );
    }
}

/* ------------------------------------------------------------------ */
/* Reconcile an order with Maya's records (idempotent)                 */
/* ------------------------------------------------------------------ */

export type ReconcileResult = {
    orderId: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    total: number;
    paidAt: Date | null;
    verdict?: Verdict;
};

const snapshot = async (
    orderId: string,
    verdict?: Verdict
): Promise<ReconcileResult> => {
    const o = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            total: true,
            paidAt: true
        }
    });
    return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        total: o.total,
        paidAt: o.paidAt,
        verdict
    };
};

type LoadedOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;

async function ensureConfirmation(order: { id: string; confirmationEmailStatus: string | null; confirmationEmailAttemptedAt: Date | null }) {
    const retryable =
        order.confirmationEmailStatus === null ||
        order.confirmationEmailStatus === 'SENDING' ||
        (order.confirmationEmailStatus === 'FAILED' &&
            (!order.confirmationEmailAttemptedAt ||
                Date.now() - order.confirmationEmailAttemptedAt.getTime() >
                    2 * 60_000));

    if (retryable)
        await sendOrderConfirmation(order.id, { retryFailed: true });
}

async function applyPaid(order: LoadedOrder, payment: MayaPayment) {
    const paymentId = String(payment.id ?? '');
    const eventKey = `maya:${paymentId || order.id}:PAYMENT_SUCCESS`;
    let first = false;

    try {
        await prisma.$transaction(async (tx) => {
            await tx.paymentEvent.create({
                data: {
                    eventKey,
                    orderId: order.id,
                    status: 'PAYMENT_SUCCESS',
                    payload: safePayload(payment)
                }
            });

            const upd = await tx.order.updateMany({
                where: { id: order.id, paymentStatus: { not: 'PAID' } },
                data: {
                    paymentStatus: 'PAID',
                    paidAt: new Date(),
                    mayaPaymentId: paymentId || null,
                    mayaPaymentStatus: 'PAYMENT_SUCCESS'
                }
            });

            if (upd.count === 1) {
                first = true;
                await tx.order.updateMany({
                    where: { id: order.id, status: 'PENDING' },
                    data: { status: 'PROCESSING' }
                });
            }
        });
    } catch (e) {
        // Same payment already processed (webhook retry / parallel poll).
        if (!isUniqueViolation(e)) throw e;
    }

    const fresh = await prisma.order.findUniqueOrThrow({
        where: { id: order.id }
    });

    if (first) {
        if (fresh.status === 'CANCELLED') {
            // Money arrived for an order we had already cancelled. Do not
            // silently resurrect it; flag for manual review / refund.
            await audit(undefined, 'PAID_AFTER_CANCEL', 'Order', order.id, {
                paymentId
            });
            console.error(
                `[maya] Order ${order.orderNumber} was PAID after it was cancelled. Manual review/refund required.`
            );
            return;
        }

        await audit(undefined, 'PAYMENT_CONFIRMED', 'Order', order.id, {
            paymentId
        });
        await notify(
            fresh.userId || undefined,
            'Payment received',
            `Payment for ${fresh.orderNumber} was successful.`,
            'PAYMENT'
        ).catch((e) => console.error('[notify] failed:', e));
    }

    if (fresh.status !== 'CANCELLED') await ensureConfirmation(fresh);
}

async function applyFailed(order: LoadedOrder, payment: MayaPayment) {
    const paymentId = String(payment.id ?? '');
    let first = false;

    try {
        await prisma.$transaction(async (tx) => {
            await tx.paymentEvent.create({
                data: {
                    eventKey: `maya:${paymentId || order.id}:PAYMENT_FAILED`,
                    orderId: order.id,
                    status: 'PAYMENT_FAILED',
                    payload: safePayload(payment)
                }
            });

            const upd = await tx.order.updateMany({
                where: { id: order.id, paymentStatus: 'PENDING' },
                data: {
                    paymentStatus: 'FAILED',
                    mayaPaymentId: paymentId || null,
                    mayaPaymentStatus: 'PAYMENT_FAILED'
                }
            });
            first = upd.count === 1;
        });
    } catch (e) {
        if (!isUniqueViolation(e)) throw e;
    }

    if (first)
        await notify(
            order.userId || undefined,
            'Payment failed',
            `Payment for ${order.orderNumber} did not go through. You can try again before the payment session expires.`,
            'PAYMENT'
        ).catch((e) => console.error('[notify] failed:', e));
}

/** CANCELLED / EXPIRED: final. Cancel the order and give the stock back. */
async function applyFinalCancel(
    order: LoadedOrder,
    verdict: 'CANCELLED' | 'EXPIRED',
    payment?: MayaPayment
) {
    const paymentId = payment ? String(payment.id ?? '') : '';
    const mayaStatus =
        verdict === 'EXPIRED' ? 'PAYMENT_EXPIRED' : 'PAYMENT_CANCELLED';
    let first = false;

    try {
        await prisma.$transaction(async (tx) => {
            await tx.paymentEvent.create({
                data: {
                    eventKey: `maya:${paymentId || order.id}:${mayaStatus}`,
                    orderId: order.id,
                    status: mayaStatus,
                    payload: payment ? safePayload(payment) : undefined
                }
            });

            const upd = await tx.order.updateMany({
                where: {
                    id: order.id,
                    paymentStatus: { in: ['PENDING', 'FAILED'] }
                },
                data: {
                    paymentStatus: verdict,
                    status: 'CANCELLED',
                    mayaPaymentId: paymentId || undefined,
                    mayaPaymentStatus: mayaStatus
                }
            });

            if (upd.count === 1) {
                first = true;
                // Return the reserved stock exactly once.
                for (const i of order.items) {
                    await tx.product.update({
                        where: { id: i.productId },
                        data: { stock: { increment: i.quantity } }
                    });
                    await tx.product.updateMany({
                        where: {
                            id: i.productId,
                            status: 'OUT_OF_STOCK',
                            stock: { gt: 0 }
                        },
                        data: { status: 'ACTIVE' }
                    });
                }
            }
        });
    } catch (e) {
        if (!isUniqueViolation(e)) throw e;
    }

    if (first)
        await notify(
            order.userId || undefined,
            verdict === 'EXPIRED' ? 'Payment expired' : 'Payment cancelled',
            `Order ${order.orderNumber} was cancelled because the payment was ${verdict === 'EXPIRED' ? 'not completed in time' : 'cancelled'}.`,
            'PAYMENT'
        ).catch((e) => console.error('[notify] failed:', e));
}

export async function reconcileMayaOrder(
    orderId: string
): Promise<ReconcileResult> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true }
    });
    if (!order) throw httpError(404, 'Order not found');
    if (order.paymentMethod !== 'MAYA') return snapshot(order.id);

    if (order.paymentStatus === 'PAID') {
        if (order.status !== 'CANCELLED') await ensureConfirmation(order);
        return snapshot(order.id);
    }

    if (!mayaConfigured) return snapshot(order.id);

    // Checkout was never created: nothing to verify with Maya.
    if (!order.paymentIntentId) {
        if (
            order.status === 'PENDING' &&
            Date.now() - order.createdAt.getTime() > NEVER_STARTED_GIVE_UP_MS &&
            !order.mayaCheckoutCreatedAt
        )
            await applyFinalCancel(order, 'EXPIRED');
        return snapshot(order.id);
    }

    // The ONLY source of truth is Maya's own record, fetched with our secret
    // key. Nothing in a webhook body or redirect URL is believed.
    const payments = await getPaymentsByReference(order.orderNumber);
    let ev = evaluatePayments(order, payments);

    if (
        ev.verdict === 'PENDING' &&
        order.status === 'PENDING' &&
        order.mayaCheckoutCreatedAt &&
        Date.now() - order.mayaCheckoutCreatedAt.getTime() > CHECKOUT_GIVE_UP_MS
    )
        ev = { verdict: 'EXPIRED', payment: ev.payment };

    switch (ev.verdict) {
        case 'PAID':
            await applyPaid(order, ev.payment!);
            break;
        case 'FAILED':
            await applyFailed(order, ev.payment!);
            break;
        case 'CANCELLED':
        case 'EXPIRED':
            await applyFinalCancel(order, ev.verdict, ev.payment);
            break;
        case 'MISMATCH':
        case 'UNVERIFIABLE': {
            const key = `maya:${String(ev.payment?.id ?? order.id)}:${ev.verdict}`;
            try {
                await prisma.paymentEvent.create({
                    data: {
                        eventKey: key,
                        orderId: order.id,
                        status: ev.verdict,
                        payload: ev.payment ? safePayload(ev.payment) : undefined
                    }
                });
                await audit(undefined, `PAYMENT_${ev.verdict}`, 'Order', order.id, {
                    reason: ev.reason
                });
                console.error(
                    `[maya] ${ev.verdict} for ${order.orderNumber}: ${ev.reason}`
                );
            } catch (e) {
                if (!isUniqueViolation(e)) throw e;
            }
            break;
        }
        case 'PENDING':
        default:
            break;
    }

    return snapshot(order.id, ev.verdict);
}

/* ------------------------------------------------------------------ */
/* Background sweeper: resolves abandoned / missed-webhook checkouts   */
/* ------------------------------------------------------------------ */

export async function sweepPendingMayaOrders(limit = 25) {
    const now = Date.now();
    const orders = await prisma.order.findMany({
        where: {
            paymentMethod: 'MAYA',
            status: 'PENDING',
            paymentStatus: { in: ['PENDING', 'FAILED'] },
            OR: [
                {
                    paymentIntentId: { not: null },
                    mayaCheckoutCreatedAt: {
                        lt: new Date(now - 5 * 60_000)
                    }
                },
                {
                    paymentIntentId: null,
                    createdAt: {
                        lt: new Date(now - NEVER_STARTED_GIVE_UP_MS)
                    }
                }
            ]
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true }
    });

    for (const o of orders) {
        try {
            await reconcileMayaOrder(o.id);
        } catch (e) {
            console.error(`[maya] sweep failed for ${o.id}:`, e);
        }
    }
    return orders.length;
}

export function startPaymentSweeper() {
    if (!mayaConfigured) return;

    const run = () =>
        sweepPendingMayaOrders().catch((e) =>
            console.error('[maya] sweeper error:', e)
        );

    setTimeout(run, 60_000).unref();
    setInterval(run, 10 * 60_000).unref();
}
