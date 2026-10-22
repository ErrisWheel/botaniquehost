import { prisma } from '../db.js';
import { env, emailJsConfigured } from '../config.js';
import { buildOrderEmailParams } from './orderEmailParams.js';
import { EmailJsError, sendEmailJs } from './emailjs.js';
import { audit } from '../utils/audit.js';

export type EmailOutcome =
    | { result: 'SENT' }
    | { result: 'SKIPPED'; reason: string }
    | { result: 'NOT_CONFIGURED' }
    | { result: 'FAILED'; error: string };

const STALE_SENDING_MS = 5 * 60_000;

/**
 * Sends the order confirmation at most once per order.
 *
 * Idempotency: the first caller atomically flips confirmationEmailStatus from
 * NULL to SENDING (UPDATE ... WHERE status IS NULL). Concurrent callers and
 * Maya webhook retries get count = 0 and do nothing. FAILED is only retried
 * when `retryFailed` is set. SENDING rows older than 5 minutes (process died
 * mid-send) can be reclaimed.
 *
 * A delivery failure NEVER changes the order or payment status.
 */
export async function sendOrderConfirmation(
    orderId: string,
    opts: { retryFailed?: boolean; force?: boolean } = {}
): Promise<EmailOutcome> {
    if (!emailJsConfigured) {
        console.warn(
            `[email] EmailJS is not configured; confirmation for order ${orderId} not sent.`
        );
        return { result: 'NOT_CONFIGURED' };
    }

    const claim = await prisma.order.updateMany({
        where: {
            id: orderId,
            OR: [
                { confirmationEmailStatus: null },
                ...(opts.retryFailed || opts.force
                    ? [{ confirmationEmailStatus: 'FAILED' }]
                    : []),
                ...(opts.force
                    ? [{ confirmationEmailStatus: 'SENT' }]
                    : []),
                {
                    confirmationEmailStatus: 'SENDING',
                    confirmationEmailAttemptedAt: {
                        lt: new Date(Date.now() - STALE_SENDING_MS)
                    }
                }
            ]
        },
        data: {
            confirmationEmailStatus: 'SENDING',
            confirmationEmailAttemptedAt: new Date()
        }
    });

    if (claim.count === 0)
        return { result: 'SKIPPED', reason: 'already sent or in progress' };

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            items: true,
            user: { select: { email: true, fullName: true } }
        }
    });

    try {
        if (!order) throw new Error('Order not found');

        // A linked customer whose account e-mail is unavailable must fail
        // closed rather than falling back to untrusted checkout JSON.
        if (order.userId && !order.user?.email?.trim())
            throw new Error('Linked customer account has no e-mail address');

        const params = buildOrderEmailParams(order);
        if (!params.customer_email)
            throw new Error('Order has no customer e-mail address');

        await sendEmailJs(env.EMAILJS_ORDER_TEMPLATE_ID!, params);

        await prisma.order.update({
            where: { id: orderId },
            data: {
                confirmationEmailStatus: 'SENT',
                confirmationEmailSentAt: new Date(),
                confirmationEmailError: null
            }
        });
        return { result: 'SENT' };
    } catch (e: any) {
        const rawMessage = String(e?.message ?? e);
        const message = e instanceof EmailJsError && e.status
            ? `EmailJS rejected the request (HTTP ${e.status})`
            : rawMessage.slice(0, 300);
        console.error(
            `[email] Confirmation e-mail failed for order ${orderId}: ${message}`
        );
        await prisma.order
            .update({
                where: { id: orderId },
                data: {
                    confirmationEmailStatus: 'FAILED',
                    confirmationEmailError: message
                }
            })
            .catch(() => undefined);
        await audit(undefined, 'EMAIL_FAILED', 'Order', orderId, {
            error: message
        });
        return { result: 'FAILED', error: message };
    }
}
