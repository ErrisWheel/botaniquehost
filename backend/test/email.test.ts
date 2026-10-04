import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderEmailParams, escapeHtml, paymentStatusText } from '../src/services/orderEmailParams.js';

const base: any = {
    id: 'o1', orderNumber: 'BOT-20261003-ABC123', userId: 'u1', status: 'PROCESSING',
    paymentMethod: 'MAYA', paymentStatus: 'PAID', subtotal: 1000, discount: 0, shipping: 150,
    tax: 138, total: 1288, currency: 'PHP', createdAt: new Date('2026-10-03T04:00:00Z'),
    customerJson: { fullName: 'Ana Cruz', email: 'order@example.com', address: '1 Rizal St, Manila' },
    deliveryJson: { date: '2026-10-10', instructions: 'Leave with guard' },
    items: [{ productName: 'Monstera <b>x</b>', quantity: 2, unitPrice: 500, lineTotal: 1000 }],
    user: { email: 'acct@example.com', fullName: 'Ana Cruz' }
};

test('all documented template variables are present', () => {
    const p = buildOrderEmailParams(base);
    for (const k of ['customer_name','customer_email','order_id','order_date','order_items','order_items_html',
        'order_subtotal','order_discount','order_shipping','order_tax','order_total','payment_method',
        'payment_status','delivery_address','delivery_date','delivery_instructions','support_email'])
        assert.ok(k in p, `missing ${k}`);
});

test('recipient is the authenticated account e-mail; id/total/status are correct', () => {
    const p = buildOrderEmailParams(base);
    assert.equal(p.customer_email, 'acct@example.com');
    assert.equal(p.order_id, 'BOT-20261003-ABC123');
    assert.equal(p.order_total, '₱1,288.00');
    assert.equal(p.payment_status, 'Paid via Maya');
    assert.equal(p.delivery_address, '1 Rizal St, Manila');
});

test('HTML in product names is escaped in the html rows', () => {
    const p = buildOrderEmailParams(base);
    assert.doesNotMatch(p.order_items_html, /<b>/);
    assert.match(p.order_items_html, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('falls back to the order e-mail when there is no linked user', () => {
    const p = buildOrderEmailParams({ ...base, user: null });
    assert.equal(p.customer_email, 'order@example.com');
});

test('payment status wording', () => {
    assert.equal(paymentStatusText({ paymentMethod: 'COD', paymentStatus: 'PENDING' }), 'Cash on Delivery - please pay when your order arrives');
    assert.equal(paymentStatusText({ paymentMethod: 'MAYA', paymentStatus: 'PENDING' }), 'Awaiting payment');
});

test('escapeHtml', () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
