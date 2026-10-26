import { env, mayaBaseUrl } from '../config.js';

/**
 * Thin client for the Maya Checkout / Payments REST API.
 * Docs: https://developers.maya.ph/reference/createv1checkout
 *
 * - Create Checkout authenticates with the PUBLIC key.
 * - Retrieving payments / registering webhooks use the SECRET key.
 * Both are HTTP Basic auth: base64("<key>:"). Keys live only in server env.
 */

const TIMEOUT_MS = 15_000;

export class MayaError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
        public readonly body?: unknown
    ) {
        super(message);
        this.name = 'MayaError';
    }
}

const basic = (key: string) =>
    `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

async function mayaFetch(
    path: string,
    init: { method: 'GET' | 'POST' | 'PUT'; key: string; body?: unknown }
) {
    if (!env.MAYA_PUBLIC_KEY || !env.MAYA_SECRET_KEY)
        throw new MayaError('Maya is not configured', 503);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(`${mayaBaseUrl}${path}`, {
            method: init.method,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: basic(init.key)
            },
            body:
                init.body === undefined
                    ? undefined
                    : JSON.stringify(init.body),
            signal: ctrl.signal
        });

        const text = await res.text();
        let json: unknown = undefined;
        try {
            json = text ? JSON.parse(text) : undefined;
        } catch {
            json = text;
        }

        return { status: res.status, ok: res.ok, json };
    } catch (e: any) {
        if (e?.name === 'AbortError')
            throw new MayaError('Maya request timed out');
        throw new MayaError(`Maya request failed: ${e?.message ?? e}`);
    } finally {
        clearTimeout(timer);
    }
}

/* ------------------------------------------------------------------ */
/* Create Checkout                                                     */
/* ------------------------------------------------------------------ */

export type CheckoutInput = {
    requestReferenceNumber: string;
    total: number;
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    items: { name: string; code: string; quantity: number; unitPrice: number; lineTotal: number }[];
    buyer: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        address: { line1: string; city: string; state: string; zipCode: string };
    };
    redirectUrl: { success: string; failure: string; cancel: string };
    metadata: Record<string, string>;
};

const money = (n: number) => Number(n.toFixed(2));

export function splitName(fullName: string) {
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts.shift() || fullName.trim() || 'Customer';
    return { firstName, lastName: parts.join(' ') || firstName };
}

export function buildCheckoutBody(i: CheckoutInput) {
    return {
        totalAmount: {
            value: money(i.total),
            currency: 'PHP',
            details: {
                discount: money(i.discount),
                serviceCharge: 0,
                shippingFee: money(i.shipping),
                tax: money(i.tax),
                subtotal: money(i.subtotal)
            }
        },
        buyer: {
            firstName: i.buyer.firstName,
            lastName: i.buyer.lastName,
            contact: { phone: i.buyer.phone, email: i.buyer.email },
            shippingAddress: {
                firstName: i.buyer.firstName,
                lastName: i.buyer.lastName,
                phone: i.buyer.phone,
                email: i.buyer.email,
                line1: i.buyer.address.line1,
                city: i.buyer.address.city,
                state: i.buyer.address.state,
                zipCode: i.buyer.address.zipCode,
                countryCode: 'PH'
            }
        },
        items: i.items.map((x) => ({
            name: x.name.slice(0, 255),
            quantity: String(x.quantity),
            code: x.code,
            amount: { value: money(x.unitPrice) },
            totalAmount: { value: money(x.lineTotal) }
        })),
        redirectUrl: i.redirectUrl,
        requestReferenceNumber: i.requestReferenceNumber,
        metadata: i.metadata
    };
}

export async function createCheckout(
    input: CheckoutInput
): Promise<{ checkoutId: string; redirectUrl: string }> {
    const res = await mayaFetch('/checkout/v1/checkouts', {
        method: 'POST',
        key: env.MAYA_PUBLIC_KEY!,
        body: buildCheckoutBody(input)
    });

    const j = res.json as
        | { checkoutId?: string; redirectUrl?: string }
        | undefined;

    if (!res.ok || !j?.checkoutId || !j?.redirectUrl)
        throw new MayaError(
            `Maya could not create the checkout (HTTP ${res.status})`,
            res.status,
            res.json
        );

    return { checkoutId: j.checkoutId, redirectUrl: j.redirectUrl };
}

/* ------------------------------------------------------------------ */
/* Retrieve payments by request reference number (SECRET key)          */
/* ------------------------------------------------------------------ */

export type MayaPayment = Record<string, any>;

/**
 * Returns every payment Maya has for our reference number. An empty array
 * means the customer has not started paying yet (HTTP 404 or empty body).
 */
export async function getPaymentsByReference(
    rrn: string
): Promise<MayaPayment[]> {
    const res = await mayaFetch(
        `/payments/v1/payment-rrns/${encodeURIComponent(rrn)}`,
        { method: 'GET', key: env.MAYA_SECRET_KEY! }
    );

    if (res.status === 404) return [];

    if (!res.ok)
        throw new MayaError(
            `Maya payment lookup failed (HTTP ${res.status})`,
            res.status,
            res.json
        );

    if (Array.isArray(res.json)) return res.json as MayaPayment[];
    if (res.json && typeof res.json === 'object')
        return [res.json as MayaPayment];
    return [];
}

/* ------------------------------------------------------------------ */
/* Webhook registration (SECRET key)                                   */
/* ------------------------------------------------------------------ */

export const listWebhooks = async () => {
    const res = await mayaFetch('/payments/v1/webhooks', {
        method: 'GET',
        key: env.MAYA_SECRET_KEY!
    });
    if (!res.ok)
        throw new MayaError('Could not list webhooks', res.status, res.json);
    return (Array.isArray(res.json) ? res.json : []) as {
        id: string;
        name: string;
        callbackUrl: string;
    }[];
};

export const createWebhook = async (name: string, callbackUrl: string) => {
    const res = await mayaFetch('/payments/v1/webhooks', {
        method: 'POST',
        key: env.MAYA_SECRET_KEY!,
        body: { name, callbackUrl }
    });
    if (!res.ok)
        throw new MayaError('Could not create webhook', res.status, res.json);
    return res.json;
};

export const updateWebhook = async (
    id: string,
    name: string,
    callbackUrl: string
) => {
    const res = await mayaFetch(`/payments/v1/webhooks/${encodeURIComponent(id)}`, {
        method: 'PUT',
        key: env.MAYA_SECRET_KEY!,
        body: { name, callbackUrl }
    });
    if (!res.ok)
        throw new MayaError('Could not update webhook', res.status, res.json);
    return res.json;
};

/* ------------------------------------------------------------------ */
/* Verification: decide what Maya's records say about an order         */
/* ------------------------------------------------------------------ */

export type Verdict =
    | 'PAID'
    | 'PENDING'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'MISMATCH' // Maya says paid but reference/amount/currency do not match
    | 'UNVERIFIABLE'; // Maya says paid but the amount could not be read

export type Evaluation = {
    verdict: Verdict;
    payment?: MayaPayment;
    reason?: string;
};

const statusOf = (p: MayaPayment) =>
    String(p.paymentStatus ?? p.status ?? '').toUpperCase();

function amountOf(p: MayaPayment): number | undefined {
    const candidates = [
        p.amount,
        p.totalAmount?.value,
        p.totalAmount?.amount,
        p.totalAmount
    ];
    for (const c of candidates) {
        if (c === undefined || c === null || typeof c === 'object') continue;
        const n = Number(c);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

const currencyOf = (p: MayaPayment): string | undefined => {
    const c = p.currency ?? p.totalAmount?.currency;
    return typeof c === 'string' ? c.toUpperCase() : undefined;
};

const PENDING = new Set([
    'PENDING_TOKEN',
    'PENDING_PAYMENT',
    'FOR_AUTHENTICATION',
    'AUTHENTICATING',
    'AUTH_SUCCESS',
    'PAYMENT_PROCESSING',
    'AUTHORIZED'
]);

const when = (p: MayaPayment) =>
    Date.parse(String(p.updatedAt ?? p.createdAt ?? '')) || 0;

/**
 * Pure function: given the order and what Maya returned for its reference
 * number, decide the outcome. FAIL-CLOSED: an order is only PAID when Maya
 * reports PAYMENT_SUCCESS for THIS reference number, in PHP, for exactly the
 * stored total.
 */
export function evaluatePayments(
    order: { orderNumber: string; requestReferenceNumber?: string; total: number; currency: string },
    payments: MayaPayment[]
): Evaluation {
    const referenceNumber = order.requestReferenceNumber || order.orderNumber;
    const mine = payments.filter(
        (p) => p && p.requestReferenceNumber === referenceNumber
    );

    if (!mine.length) return { verdict: 'PENDING' };

    const success = mine.find(
        (p) => statusOf(p) === 'PAYMENT_SUCCESS' && p.isPaid !== false
    );

    if (success) {
        const amount = amountOf(success);
        const currency = currencyOf(success);

        if (amount === undefined)
            return {
                verdict: 'UNVERIFIABLE',
                payment: success,
                reason: 'Maya reported success but no readable amount'
            };

        if (Math.abs(amount - order.total) > 0.005)
            return {
                verdict: 'MISMATCH',
                payment: success,
                reason: `Amount mismatch: Maya ${amount} vs order ${order.total}`
            };

        if (currency && currency !== order.currency.toUpperCase())
            return {
                verdict: 'MISMATCH',
                payment: success,
                reason: `Currency mismatch: Maya ${currency} vs order ${order.currency}`
            };

        return { verdict: 'PAID', payment: success };
    }

    if (mine.some((p) => PENDING.has(statusOf(p))))
        return { verdict: 'PENDING' };

    const latest = [...mine].sort((a, b) => when(b) - when(a))[0];
    const s = statusOf(latest);

    if (s === 'PAYMENT_FAILED' || s === 'AUTH_FAILED')
        return { verdict: 'FAILED', payment: latest };
    if (s === 'PAYMENT_EXPIRED' || s === 'CAPTURE_HOLD_EXPIRED')
        return { verdict: 'EXPIRED', payment: latest };
    if (s === 'PAYMENT_CANCELLED' || s === 'VOIDED')
        return { verdict: 'CANCELLED', payment: latest };

    return {
        verdict: 'PENDING',
        payment: latest,
        reason: `Unrecognised Maya status "${s}"`
    };
}
