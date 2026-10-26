import { httpError } from '../utils/httpError.js';
import { restockOrder } from './inventory.js';

/**
 * Order lifecycle (fulfilment) status. Payment status is a SEPARATE field
 * (PENDING, PAID, FAILED, EXPIRED, CANCELLED, REFUND_PENDING, REFUNDED) and is
 * never changed by a plain status update except where stated below.
 */
export const ORDER_STATUSES = [
    'PENDING',
    'PROCESSING',
    'PROCESSED',
    'SORTING',
    'ON_DELIVERY',
    'DELIVERED',
    // A terminal exception, not one of the six fulfilment stages above.
    'CANCELLED'
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
    'PENDING',
    'PAID',
    'FAILED',
    'EXPIRED',
    'CANCELLED',
    'REFUND_PENDING',
    'REFUNDED'
] as const;

export const PAYMENT_METHODS = ['COD', 'MAYA'] as const;

export const isOrderStatus = (v: unknown): v is OrderStatus =>
    typeof v === 'string' && (ORDER_STATUSES as readonly string[]).includes(v);

export const orderStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
        PENDING: 'Pending',
        PROCESSING: 'Processing',
        PROCESSED: 'Processed',
        SORTING: 'Order is being sorted',
        ON_DELIVERY: 'On delivery',
        SHIPPED: 'On delivery',
        DELIVERED: 'Delivered',
        CANCELLED: 'Cancelled'
    };
    return labels[status] ?? status;
};

/**
 * Permitted moves. The six normal fulfilment stages move forward only.
 * Cancellation remains available before the order enters sorting/shipping;
 * DELIVERED and CANCELLED are final.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    PENDING: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['PROCESSED', 'CANCELLED'],
    PROCESSED: ['SORTING', 'CANCELLED'],
    SORTING: ['ON_DELIVERY'],
    ON_DELIVERY: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: []
};

export type OrderState = {
    status: string;
    paymentMethod: string;
    paymentStatus: string;
};

export type TransitionCheck =
    | { ok: true }
    | { ok: false; code: string; message: string };

export function checkTransition(order: OrderState, next: OrderStatus): TransitionCheck {
    if (!isOrderStatus(order.status))
        return {
            ok: false,
            code: 'UNKNOWN_STATUS',
            message: `This order has an unrecognised status (${order.status}) and cannot be changed here.`
        };

    if (!ORDER_TRANSITIONS[order.status].includes(next)) {
        const allowed = ORDER_TRANSITIONS[order.status];
        return {
            ok: false,
            code: 'INVALID_TRANSITION',
            message: allowed.length
                ? `An order that is ${order.status} cannot be changed to ${next}. Allowed: ${allowed.join(', ')}.`
                : `An order that is ${order.status} is final and cannot be changed.`
        };
    }

    // Never fulfil a Maya order that has not been verified as paid. (The
    // verified payment itself moves PENDING -> PROCESSING automatically.)
    if (
        next !== 'CANCELLED' &&
        order.paymentMethod === 'MAYA' &&
        order.paymentStatus !== 'PAID'
    )
        return {
            ok: false,
            code: 'PAYMENT_REQUIRED',
            message:
                'A Maya order can only move forward after its payment has been verified as PAID.'
        };

    return { ok: true };
}

/** The statuses the admin UI may offer for this order right now. */
export function allowedNextStatuses(order: OrderState): OrderStatus[] {
    return ORDER_STATUSES.filter((s) => checkTransition(order, s).ok);
}

/**
 * Payment status after an administrator cancels the order:
 *  - money was received  -> REFUND_PENDING (a refund is now owed; it is only
 *                           REFUNDED once an administrator confirms it was sent)
 *  - nothing was paid    -> CANCELLED
 *  - anything else (EXPIRED, already CANCELLED/REFUNDED...) is left alone.
 */
export function paymentStatusAfterCancel(paymentStatus: string): string {
    if (paymentStatus === 'PAID') return 'REFUND_PENDING';
    if (paymentStatus === 'PENDING' || paymentStatus === 'FAILED') return 'CANCELLED';
    return paymentStatus;
}

/** Cancelled orders whose money still has to be returned to the customer. */
export const isRefundDue = (o: { status: string; paymentStatus: string }) =>
    o.status === 'CANCELLED' &&
    (o.paymentStatus === 'PAID' || o.paymentStatus === 'REFUND_PENDING');

export type StatusChangeResult = {
    order: any;
    previousStatus: string;
    changed: boolean;
    restocked: boolean;
};

/**
 * Applies ONE validated status change. Everything happens in a single database
 * transaction:
 *   1. load the order and validate the transition against its CURRENT state,
 *   2. compare-and-set (`WHERE id AND status AND paymentStatus`) so two admins
 *      - or an admin and a Maya webhook - cannot both apply conflicting changes,
 *   3. on cancellation, return the reserved stock exactly once.
 * If any step fails nothing is changed. Repeating the same request is a no-op
 * (`changed: false`) and never restocks twice.
 */
export async function changeOrderStatus(
    db: any,
    input: { orderId: string; next: OrderStatus }
): Promise<StatusChangeResult> {
    return db.$transaction(async (tx: any): Promise<StatusChangeResult> => {
        const order = await tx.order.findUnique({
            where: { id: input.orderId },
            include: { items: true }
        });

        if (!order) throw httpError(404, 'Order not found');

        if (order.status === input.next)
            return {
                order,
                previousStatus: order.status,
                changed: false,
                restocked: false
            };

        const check = checkTransition(order, input.next);
        if (!check.ok) throw httpError(409, check.message, check.code);

        const now = new Date();
        const data: Record<string, unknown> = { status: input.next };

        if (input.next === 'CANCELLED') {
            data.cancelledAt = now;
            data.paymentStatus = paymentStatusAfterCancel(order.paymentStatus);
        }

        // Cash on delivery is collected when the parcel is delivered.
        if (
            input.next === 'DELIVERED' &&
            order.paymentMethod === 'COD' &&
            order.paymentStatus === 'PENDING'
        ) {
            data.paymentStatus = 'PAID';
            data.paidAt = now;
        }

        const upd = await tx.order.updateMany({
            where: {
                id: order.id,
                status: order.status,
                paymentStatus: order.paymentStatus
            },
            data
        });

        if (upd.count !== 1)
            throw httpError(
                409,
                'This order was changed by someone else a moment ago. Refresh and try again.',
                'CONCURRENT_CHANGE'
            );

        const restocked =
            input.next === 'CANCELLED' ? await restockOrder(tx, order) : false;

        const fresh = await tx.order.findUniqueOrThrow({
            where: { id: order.id },
            include: { items: true }
        });

        return {
            order: fresh,
            previousStatus: order.status,
            changed: true,
            restocked
        };
    });
}
