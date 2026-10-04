import './helpers.js';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { computePricing } from '../src/utils/order.js';
import { FakeDb } from './fakeDb.js';
import { createMayaCheckoutForOrder, reconcileMayaOrder } from '../src/services/orderPayments.js';
import { sendOrderConfirmation } from '../src/services/orderEmail.js';

// MOCKED: Prisma is replaced by an in-memory fake, Maya & EmailJS HTTP calls
// by a fake fetch. These tests prove the application's idempotency/security
// logic; they do NOT prove Postgres, Maya or EmailJS themselves work.

let db: FakeDb;
const calls = { mayaCreate: [] as any[], email: [] as any[] };
let mayaPayments: any[] = [];
let emailMode: 'ok' | 'fail' = 'ok';

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (url.includes('/checkout/v1/checkouts')) {
        calls.mayaCreate.push(JSON.parse(init.body));
        const n = calls.mayaCreate.length;
        return json(200, { checkoutId: `co-${n}`, redirectUrl: `https://pg-sandbox.paymaya.com/checkout?id=co-${n}` });
    }
    if (url.includes('/payments/v1/payment-rrns/')) return mayaPayments.length ? json(200, mayaPayments) : json(404, {});
    if (url.includes('api.emailjs.com')) {
        calls.email.push(JSON.parse(init.body));
        return emailMode === 'ok' ? new Response('OK', { status: 200 }) : new Response('The Public Key is invalid', { status: 403 });
    }
    throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

const RRN = 'BOT-20261003-ABC123';
const price = computePricing(1000);

function seed(over: Record<string, any> = {}) {
    db.users.push({ id: 'u1', email: 'ana@example.com', fullName: 'Ana Cruz' });
    db.products.push({ id: 'p1', name: 'Monstera', price: 500, stock: 8, status: 'ACTIVE' });
    db.orders.push({
        id: 'o1', orderNumber: RRN, userId: 'u1', status: 'PENDING', paymentMethod: 'MAYA', paymentStatus: 'PENDING',
        ...price, currency: 'PHP', createdAt: new Date(),
        customerJson: { fullName: 'Ana Cruz', email: 'ana@example.com', phone: '09171234567', address: '1 Rizal St', city: 'Manila', province: 'NCR', zip: '1000' },
        deliveryJson: {}, paymentIntentId: null, mayaRedirectUrl: null, mayaCheckoutCreatedAt: null,
        confirmationEmailStatus: null, confirmationEmailAttemptedAt: null, paidAt: null, ...over
    });
    db.items.push({ id: 'i1', orderId: 'o1', productId: 'p1', productName: 'Monstera', quantity: 2, unitPrice: 500, lineTotal: 1000 });
}

const started = (over: Record<string, any> = {}) =>
    seed({ paymentIntentId: 'co-1', mayaRedirectUrl: 'https://pg-sandbox.paymaya.com/checkout?id=co-1', mayaCheckoutCreatedAt: new Date(), ...over });

const success = (over: Record<string, any> = {}) => ({
    id: 'pay-1', requestReferenceNumber: RRN, paymentStatus: 'PAYMENT_SUCCESS', isPaid: true, amount: price.total, currency: 'PHP', ...over
});

const order = () => db.orders[0];
const statusOf = (s: string) => ({ id: 'pay-1', requestReferenceNumber: RRN, paymentStatus: s, isPaid: false, amount: price.total, currency: 'PHP' });
const rejects = async (p: Promise<unknown>, code: string) => {
    await assert.rejects(p, (e: any) => e.code === code || e.statusCode === Number(code));
};

beforeEach(() => {
    db = new FakeDb();
    for (const k of ['order', 'paymentEvent', 'product', 'notification', 'auditLog', 'user', '$transaction'])
        Object.defineProperty(prisma, k, { value: (db as any)[k], configurable: true, writable: true });
    calls.mayaCreate = [];
    calls.email = [];
    mayaPayments = [];
    emailMode = 'ok';
});

/* ----------------------------- checkout creation ----------------------------- */

test('checkout: someone else\'s order is 404 and Maya is never called', async () => {
    seed();
    await rejects(createMayaCheckoutForOrder('o1', 'attacker'), '404');
    assert.equal(calls.mayaCreate.length, 0);
});

test('checkout: tampered stored total fails server-side price validation (409), Maya never called', async () => {
    seed({ total: 1 });
    await rejects(createMayaCheckoutForOrder('o1', 'u1'), 'PRICE_VALIDATION_FAILED');
    assert.equal(calls.mayaCreate.length, 0);
    assert.ok(db.audits.some((a) => a.action === 'PAYMENT_VALIDATION_FAILED'));
});

test('checkout: tampered line item price is also caught', async () => {
    seed();
    db.items[0].unitPrice = 1; db.items[0].lineTotal = 2;
    await rejects(createMayaCheckoutForOrder('o1', 'u1'), 'PRICE_VALIDATION_FAILED');
    assert.equal(calls.mayaCreate.length, 0);
});

test('checkout: sends the server total + reference to Maya, stores checkout id, reuses it on repeat', async () => {
    seed();
    const a = await createMayaCheckoutForOrder('o1', 'u1');
    assert.equal(a.reused, false);
    assert.match(a.redirectUrl, /^https:\/\/pg-sandbox\.paymaya\.com\//);
    const body = calls.mayaCreate[0];
    assert.equal(body.totalAmount.value, price.total);
    assert.equal(body.requestReferenceNumber, RRN);
    assert.equal(body.metadata.orderId, 'o1');
    assert.equal(order().paymentIntentId, 'co-1');

    const b = await createMayaCheckoutForOrder('o1', 'u1');
    assert.equal(b.reused, true);
    assert.equal(b.redirectUrl, a.redirectUrl);
    assert.equal(calls.mayaCreate.length, 1);
});

test('checkout: concurrent double-click creates exactly ONE Maya checkout', async () => {
    seed();
    const r = await Promise.allSettled([createMayaCheckoutForOrder('o1', 'u1'), createMayaCheckoutForOrder('o1', 'u1')]);
    assert.equal(calls.mayaCreate.length, 1);
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
});

test('checkout: already-paid order cannot start another payment', async () => {
    seed({ paymentStatus: 'PAID' });
    await rejects(createMayaCheckoutForOrder('o1', 'u1'), 'ALREADY_PAID');
});

/* ----------------------------- payment verification ----------------------------- */

test('a verified success marks PAID, moves to PROCESSING, e-mails ONCE', async () => {
    started(); mayaPayments = [success()];
    const r = await reconcileMayaOrder('o1');
    assert.equal(r.paymentStatus, 'PAID');
    assert.equal(order().status, 'PROCESSING');
    assert.ok(order().paidAt);
    assert.equal(order().confirmationEmailStatus, 'SENT');
    assert.equal(calls.email.length, 1);
    const p = calls.email[0].template_params;
    assert.equal(p.order_id, RRN);
    assert.equal(p.customer_email, 'ana@example.com');
    assert.equal(p.payment_status, 'Paid via Maya');
    assert.equal(calls.email[0].accessToken, process.env.EMAILJS_PRIVATE_KEY);
});

test('REPEATED / CONCURRENT webhooks: one payment event, one notification, ONE e-mail', async () => {
    started(); mayaPayments = [success()];
    await Promise.all(Array.from({ length: 6 }, () => reconcileMayaOrder('o1')));
    for (let i = 0; i < 3; i++) await reconcileMayaOrder('o1');
    assert.equal(order().paymentStatus, 'PAID');
    assert.equal(db.events.filter((e) => e.status === 'PAYMENT_SUCCESS').length, 1);
    assert.equal(db.notifications.filter((n) => n.type === 'PAYMENT').length, 1);
    assert.equal(calls.email.length, 1);
});

test('no Maya record yet => stays unpaid (a success-page visit proves nothing)', async () => {
    started(); mayaPayments = [];
    const r = await reconcileMayaOrder('o1');
    assert.equal(r.paymentStatus, 'PENDING');
    assert.equal(calls.email.length, 0);
});

test('amount mismatch is NOT paid, no e-mail, recorded for review', async () => {
    started(); mayaPayments = [success({ amount: 1 })];
    const r = await reconcileMayaOrder('o1');
    assert.equal(r.paymentStatus, 'PENDING');
    assert.equal(r.verdict, 'MISMATCH');
    assert.equal(calls.email.length, 0);
    assert.ok(db.events.some((e) => e.status === 'MISMATCH'));
    await reconcileMayaOrder('o1');
    assert.equal(db.events.filter((e) => e.status === 'MISMATCH').length, 1);
});

test('a payment for another reference number cannot pay this order', async () => {
    started(); mayaPayments = [success({ requestReferenceNumber: 'BOT-SOMEONE-ELSE' })];
    assert.equal((await reconcileMayaOrder('o1')).paymentStatus, 'PENDING');
});

test('a PAID order is never downgraded by later failed/cancelled callbacks', async () => {
    started(); mayaPayments = [success()];
    await reconcileMayaOrder('o1');
    mayaPayments = [statusOf('PAYMENT_CANCELLED')];
    await reconcileMayaOrder('o1');
    assert.equal(order().paymentStatus, 'PAID');
    assert.notEqual(order().status, 'CANCELLED');
});

/* ----------------------------- failed / cancelled / expired ----------------------------- */

test('failed payment: FAILED status, order stays open for retry, no e-mail, stock kept reserved', async () => {
    started(); mayaPayments = [statusOf('PAYMENT_FAILED')];
    await reconcileMayaOrder('o1'); await reconcileMayaOrder('o1');
    assert.equal(order().paymentStatus, 'FAILED');
    assert.equal(order().status, 'PENDING');
    assert.equal(calls.email.length, 0);
    assert.equal(db.products[0].stock, 8);
    assert.equal(db.notifications.filter((n) => n.title === 'Payment failed').length, 1);
});

test('cancelled payment: order cancelled and stock returned EXACTLY once', async () => {
    started(); mayaPayments = [statusOf('PAYMENT_CANCELLED')];
    await Promise.all([reconcileMayaOrder('o1'), reconcileMayaOrder('o1'), reconcileMayaOrder('o1')]);
    await reconcileMayaOrder('o1');
    assert.equal(order().status, 'CANCELLED');
    assert.equal(order().paymentStatus, 'CANCELLED');
    assert.equal(db.products[0].stock, 10);
    assert.equal(calls.email.length, 0);
});

test('expired payment cancels the order and returns stock once', async () => {
    started(); mayaPayments = [statusOf('PAYMENT_EXPIRED')];
    await reconcileMayaOrder('o1'); await reconcileMayaOrder('o1');
    assert.equal(order().paymentStatus, 'EXPIRED');
    assert.equal(db.products[0].stock, 10);
});

test('abandoned checkout older than the give-up window expires with stock returned', async () => {
    started({ mayaCheckoutCreatedAt: new Date(Date.now() - 80 * 60_000) }); mayaPayments = [];
    await reconcileMayaOrder('o1');
    assert.equal(order().status, 'CANCELLED');
    assert.equal(db.products[0].stock, 10);
});

test('money arriving AFTER cancellation is flagged, not silently resurrected, no e-mail', async () => {
    started({ status: 'CANCELLED', paymentStatus: 'EXPIRED' }); mayaPayments = [success()];
    await reconcileMayaOrder('o1');
    assert.equal(order().paymentStatus, 'PAID');
    assert.equal(order().status, 'CANCELLED');
    assert.ok(db.audits.some((a) => a.action === 'PAID_AFTER_CANCEL'));
    assert.equal(calls.email.length, 0);
});

/* ----------------------------- e-mail behaviour ----------------------------- */

test('EmailJS failure never un-pays the order; failure is recorded; no spam retry', async () => {
    started(); mayaPayments = [success()]; emailMode = 'fail';
    await reconcileMayaOrder('o1');
    assert.equal(order().paymentStatus, 'PAID');
    assert.equal(order().confirmationEmailStatus, 'FAILED');
    assert.match(order().confirmationEmailError, /403/);
    await reconcileMayaOrder('o1'); await reconcileMayaOrder('o1');
    assert.equal(calls.email.length, 1, 'must not hammer EmailJS inside the 2 minute window');
});

test('failed e-mail is retried by a later callback, then never sent again', async () => {
    started(); mayaPayments = [success()]; emailMode = 'fail';
    await reconcileMayaOrder('o1');
    order().confirmationEmailAttemptedAt = new Date(Date.now() - 3 * 60_000);
    emailMode = 'ok';
    await reconcileMayaOrder('o1');
    assert.equal(order().confirmationEmailStatus, 'SENT');
    assert.equal(calls.email.length, 2);
    await reconcileMayaOrder('o1'); await reconcileMayaOrder('o1');
    assert.equal(calls.email.length, 2);
});

test('COD confirmation is sent once even if triggered repeatedly / concurrently', async () => {
    seed({ paymentMethod: 'COD' });
    await Promise.all([sendOrderConfirmation('o1'), sendOrderConfirmation('o1'), sendOrderConfirmation('o1')]);
    await sendOrderConfirmation('o1');
    assert.equal(calls.email.length, 1);
    assert.equal(calls.email[0].template_params.payment_status, 'Cash on Delivery - please pay when your order arrives');
});

test('an unpaid Maya order is never confirmed by e-mail through reconcile', async () => {
    started(); mayaPayments = [];
    await reconcileMayaOrder('o1');
    assert.equal(calls.email.length, 0);
    assert.equal(order().confirmationEmailStatus, null);
});
