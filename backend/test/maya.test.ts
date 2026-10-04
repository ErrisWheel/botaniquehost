import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckoutBody, evaluatePayments, splitName } from '../src/services/maya.js';

const order = { orderNumber: 'BOT-20261003-ABC123', total: 1288, currency: 'PHP' };
const paid = (over: Record<string, unknown> = {}) => ({
    id: 'pay-1',
    requestReferenceNumber: order.orderNumber,
    paymentStatus: 'PAYMENT_SUCCESS',
    isPaid: true,
    amount: 1288,
    currency: 'PHP',
    ...over
});

test('PAYMENT_SUCCESS with matching reference/amount/currency => PAID', () => {
    assert.equal(evaluatePayments(order, [paid()]).verdict, 'PAID');
});

test('no payment record yet => PENDING (never paid)', () => {
    assert.equal(evaluatePayments(order, []).verdict, 'PENDING');
});

test('a payment for a DIFFERENT reference number is ignored', () => {
    const r = evaluatePayments(order, [paid({ requestReferenceNumber: 'BOT-OTHER' })]);
    assert.equal(r.verdict, 'PENDING');
});

test('amount mismatch => MISMATCH, not PAID', () => {
    assert.equal(evaluatePayments(order, [paid({ amount: 1 })]).verdict, 'MISMATCH');
    assert.equal(evaluatePayments(order, [paid({ amount: 1288.5 })]).verdict, 'MISMATCH');
});

test('currency mismatch => MISMATCH', () => {
    assert.equal(evaluatePayments(order, [paid({ currency: 'USD' })]).verdict, 'MISMATCH');
});

test('success without a readable amount fails closed', () => {
    assert.equal(evaluatePayments(order, [paid({ amount: undefined })]).verdict, 'UNVERIFIABLE');
});

test('amount nested in totalAmount.value is understood', () => {
    const p = paid({ amount: undefined, totalAmount: { value: 1288, currency: 'PHP' } });
    assert.equal(evaluatePayments(order, [p]).verdict, 'PAID');
});

test('isPaid === false never counts as paid', () => {
    assert.notEqual(evaluatePayments(order, [paid({ isPaid: false })]).verdict, 'PAID');
});

test('status-name spoofing in other fields is not trusted', () => {
    const r = evaluatePayments(order, [paid({ paymentStatus: 'PAYMENT_PROCESSING', status: 'PAYMENT_SUCCESS' })]);
    assert.notEqual(r.verdict, 'PAID');
});

test('failed / cancelled / expired map correctly', () => {
    const mk = (s: string) => [paid({ paymentStatus: s, isPaid: false })];
    assert.equal(evaluatePayments(order, mk('PAYMENT_FAILED')).verdict, 'FAILED');
    assert.equal(evaluatePayments(order, mk('PAYMENT_CANCELLED')).verdict, 'CANCELLED');
    assert.equal(evaluatePayments(order, mk('PAYMENT_EXPIRED')).verdict, 'EXPIRED');
});

test('in-flight statuses stay PENDING', () => {
    for (const s of ['PENDING_PAYMENT', 'FOR_AUTHENTICATION', 'PAYMENT_PROCESSING', 'AUTHORIZED'])
        assert.equal(evaluatePayments(order, [paid({ paymentStatus: s, isPaid: false })]).verdict, 'PENDING', s);
});

test('a retry after a failure that then succeeds => PAID', () => {
    const failed = paid({ id: 'p0', paymentStatus: 'PAYMENT_FAILED', isPaid: false });
    assert.equal(evaluatePayments(order, [failed, paid()]).verdict, 'PAID');
});

test('unknown status is PENDING, never PAID', () => {
    assert.equal(evaluatePayments(order, [paid({ paymentStatus: 'SOMETHING_NEW', isPaid: false })]).verdict, 'PENDING');
});

test('checkout body: amounts, reference, redirect URLs and no card data', () => {
    const body = buildCheckoutBody({
        requestReferenceNumber: order.orderNumber,
        total: 1288, subtotal: 1000, discount: 0, shipping: 150, tax: 138,
        items: [{ name: 'Monstera', code: 'abc', quantity: 2, unitPrice: 500, lineTotal: 1000 }],
        buyer: { firstName: 'Ana', lastName: 'Cruz', email: 'a@b.co', phone: '+639171234567',
            address: { line1: '1 St', city: 'Manila', state: 'NCR', zipCode: '1000' } },
        redirectUrl: { success: 'https://x/s', failure: 'https://x/f', cancel: 'https://x/c' },
        metadata: { orderId: 'o1' }
    });
    assert.equal(body.totalAmount.value, 1288);
    assert.equal(body.totalAmount.currency, 'PHP');
    assert.equal(body.totalAmount.details.shippingFee, 150);
    assert.equal(body.requestReferenceNumber, order.orderNumber);
    assert.equal(body.items[0].quantity, '2');
    assert.equal(body.items[0].totalAmount.value, 1000);
    assert.equal(body.redirectUrl.cancel, 'https://x/c');
    assert.doesNotMatch(JSON.stringify(body), /card|cvv|cvc/i);
});

test('splitName handles single and multi-word names', () => {
    assert.deepEqual(splitName('Ana'), { firstName: 'Ana', lastName: 'Ana' });
    assert.deepEqual(splitName('Ana Maria Cruz'), { firstName: 'Ana', lastName: 'Maria Cruz' });
});
