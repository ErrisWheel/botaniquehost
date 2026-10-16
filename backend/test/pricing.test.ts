import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePricing, orderNumber } from '../src/utils/order.js';

test('below the threshold: 150 shipping, no discount, 12% tax on subtotal+shipping', () => {
    const p = computePricing(1000);
    assert.deepEqual(p, { subtotal: 1000, discount: 0, shipping: 150, tax: 138, total: 1288 });
});

test('exactly 15,000 does NOT qualify (strictly above)', () => {
    const p = computePricing(15000);
    assert.equal(p.discount, 0);
    assert.equal(p.shipping, 150);
});

test('above 15,000: 20% off, free shipping, tax after discount', () => {
    const p = computePricing(20000);
    assert.equal(p.discount, 4000);
    assert.equal(p.shipping, 0);
    assert.equal(p.tax, 1920);
    assert.equal(p.total, 17920);
});

test('totals are whole pesos and consistent', () => {
    for (const s of [1, 390, 790, 1690, 14999, 15001, 99999]) {
        const p = computePricing(s);
        assert.ok(Number.isInteger(p.total));
        assert.equal(p.total, p.subtotal - p.discount + p.shipping + p.tax);
    }
});

test('order numbers are unique and fit Maya\'s 36 char reference limit', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
        const n = orderNumber();
        assert.ok(n.length <= 36, n);
        assert.match(n, /^BOT-\d{8}-[0-9A-F]{8}$/);
        seen.add(n);
    }
    assert.equal(seen.size, 500);
});
