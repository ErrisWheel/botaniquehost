import { changeOrderStatus, allowedNextStatuses, orderStatusLabel, type OrderStatus } from './orderStatus.js';
import { notify } from './notifications.js';
import { audit } from '../utils/audit.js';

/**
 * One implementation of "an administrator changes an order's status", used by
 * BOTH the legacy route (/orders/admin/:id/status) and the dashboard route
 * (/admin/orders/:id/status), so they can never drift apart.
 */
export async function applyAdminStatusChange(
    db: any,
    actorId: string,
    orderId: string,
    next: OrderStatus
) {
    const result = await changeOrderStatus(db, { orderId, next });

    // Notify and audit only when something really changed, so a repeated
    // request never sends a second e-mail / notification.
    if (result.changed) {
        await notify(
            result.order.userId || undefined,
            'Order status updated',
            `Order ${result.order.orderNumber} is now ${orderStatusLabel(next)}.`,
            'ORDER'
        ).catch((e) => console.error('[notify] status notification failed:', e));

        await audit(actorId, 'UPDATE_STATUS', 'Order', result.order.id, {
            from: result.previousStatus,
            to: next,
            restocked: result.restocked
        });
    }

    return {
        ...result.order,
        changed: result.changed,
        restocked: result.restocked,
        allowedStatuses: allowedNextStatuses(result.order)
    };
}

/**
 * The administrator confirms the refund of a cancelled, paid order was sent
 * (through the Maya dashboard / cash handed back). Only orders that are
 * actually owed a refund can move to REFUNDED, exactly once.
 */
export async function markRefunded(db: any, actorId: string, orderId: string) {
    const upd = await db.order.updateMany({
        where: {
            id: orderId,
            status: 'CANCELLED',
            paymentStatus: { in: ['REFUND_PENDING', 'PAID'] }
        },
        data: { paymentStatus: 'REFUNDED' }
    });

    if (upd.count !== 1) {
        const order = await db.order.findUnique({
            where: { id: orderId },
            select: { id: true, status: true, paymentStatus: true }
        });
        return order
            ? ({ ok: false, reason: 'NOT_REFUNDABLE', order } as const)
            : ({ ok: false, reason: 'NOT_FOUND' } as const);
    }

    await audit(actorId, 'MARK_REFUNDED', 'Order', orderId);
    return { ok: true } as const;
}
