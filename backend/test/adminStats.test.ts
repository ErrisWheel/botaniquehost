import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './fakeDb.js';
import { eligibleRevenue, getDashboardStats } from '../src/services/adminStats.js';
import { stockState, statusForStock } from '../src/services/inventory.js';

// MOCKED: FakeDb. Verifies the dashboard's DEFINITIONS (what counts as revenue,
// what is "low stock"), not Postgres aggregation.

const at = (n: number) => new Date(Date.UTC(2026, 9, n));

function setup() {
    const db = new FakeDb();
    db.users.push(
        { id: 'a1', role: 'ADMIN', isSuspended: false },
        { id: 'a2', role: 'ADMIN', isSuspended: true },
        { id: 'c1', role: 'CUSTOMER', isSuspended: false },
        { id: 'c2', role: 'CUSTOMER', isSuspended: false }
    );
    db.orders.push(
        { id: 'o1', orderNumber: 'BOT-1', status: 'DELIVERED', paymentStatus: 'PAID', paymentMethod: 'COD', total: 1000, createdAt: at(1) },
        { id: 'o2', orderNumber: 'BOT-2', status: 'PROCESSING', paymentStatus: 'PAID', paymentMethod: 'MAYA', total: 500, createdAt: at(2) },
        { id: 'o3', orderNumber: 'BOT-3', status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'MAYA', total: 700, createdAt: at(3) },
        { id: 'o4', orderNumber: 'BOT-4', status: 'CANCELLED', paymentStatus: 'REFUND_PENDING', paymentMethod: 'MAYA', total: 300, createdAt: at(4) },
        { id: 'o5', orderNumber: 'BOT-5', status: 'CANCELLED', paymentStatus: 'REFUNDED', paymentMethod: 'MAYA', total: 200, createdAt: at(5) },
        { id: 'o6', orderNumber: 'BOT-6', status: 'CANCELLED', paymentStatus: 'CANCELLED', paymentMethod: 'COD', total: 111, createdAt: at(6) },
        { id: 'o7', orderNumber: 'BOT-7', status: 'PENDING', paymentStatus: 'FAILED', paymentMethod: 'MAYA', total: 222, createdAt: at(7) },
        // paid, then cancelled by the Maya callback path: status CANCELLED but paymentStatus stays PAID
        { id: 'o8', orderNumber: 'BOT-8', status: 'CANCELLED', paymentStatus: 'PAID', paymentMethod: 'MAYA', total: 400, createdAt: at(8) }
    );
    db.products.push(
        { id: 'p1', slug: 'a', name: 'In stock', stock: 40, lowStockThreshold: 5, status: 'ACTIVE' },
        { id: 'p2', slug: 'b', name: 'Low', stock: 3, lowStockThreshold: 5, status: 'ACTIVE' },
        { id: 'p3', slug: 'c', name: 'Edge low', stock: 5, lowStockThreshold: 5, status: 'ACTIVE' },
        { id: 'p4', slug: 'd', name: 'Out', stock: 0, lowStockThreshold: 5, status: 'OUT_OF_STOCK' },
        { id: 'p5', slug: 'e', name: 'Hidden', stock: 0, lowStockThreshold: 5, status: 'INACTIVE' }
    );
    return db;
}

test('revenue counts only PAID and not cancelled orders', async () => {
    const r = await eligibleRevenue(setup());
    // o1 (1000) + o2 (500). Not: pending, refund pending/refunded, cancelled, failed, paid-then-cancelled.
    assert.equal(r.gross, 1500);
    assert.equal(r.net, 1500);
    assert.equal(r.orders, 2);
});

test('refunds recorded on returns are subtracted from revenue', async () => {
    const db = setup();
    db.returns.push({ id: 'r1', orderId: 'o1', status: 'REFUNDED', refundAmount: 250 });
    db.returns.push({ id: 'r2', orderId: 'o2', status: 'REQUESTED', refundAmount: 500 }); // not refunded yet
    db.returns.push({ id: 'r3', orderId: 'o4', status: 'REFUNDED', refundAmount: 300 }); // order already excluded

    const r = await eligibleRevenue(db);
    assert.equal(r.refunded, 250);
    assert.equal(r.net, 1250);
});

test('dashboard totals, status breakdown, refunds due and recent orders come from the records', async () => {
    const s = await getDashboardStats(setup());

    assert.equal(s.totals.orders, 8);
    assert.equal(s.totals.customers, 2);
    assert.equal(s.totals.activeAdmins, 1, 'suspended admin is not active');
    assert.equal(s.totals.products, 5);
    assert.equal(s.totals.revenue, 1500);

    assert.deepEqual(s.ordersByStatus, { DELIVERED: 1, PROCESSING: 1, PENDING: 2, CANCELLED: 4 });
    assert.equal(s.paymentsByStatus['PAID'], 3);
    assert.equal(s.paymentsByStatus['REFUND_PENDING'], 1);

    // cancelled orders whose money still has to go back: o4 (REFUND_PENDING) and o8 (PAID, cancelled)
    assert.deepEqual(s.pendingRefunds, { count: 2, amount: 700 });

    assert.equal(s.recentOrders.length, 8);
    assert.equal(s.recentOrders[0].orderNumber, 'BOT-8', 'newest first');

    // legacy fields still present for older clients
    assert.equal(s.orders, 8);
    assert.equal(s.revenue, 1500);
});

test('inventory buckets: in / low / out, hidden products are separate, boundaries inclusive', async () => {
    const s = await getDashboardStats(setup());

    assert.deepEqual(s.inventory, { inStock: 1, lowStock: 2, outOfStock: 1, inactive: 1 });
    assert.deepEqual(
        s.lowStockProducts.map((p) => [p.name, p.state]),
        [['Out', 'OUT_OF_STOCK'], ['Low', 'LOW_STOCK'], ['Edge low', 'LOW_STOCK']],
        'lowest stock first; hidden products are never listed'
    );
});

test('stock helpers', () => {
    assert.equal(stockState({ stock: 0 }), 'OUT_OF_STOCK');
    assert.equal(stockState({ stock: -1, lowStockThreshold: 5 }), 'OUT_OF_STOCK');
    assert.equal(stockState({ stock: 5, lowStockThreshold: 5 }), 'LOW_STOCK');
    assert.equal(stockState({ stock: 6, lowStockThreshold: 5 }), 'IN_STOCK');
    assert.equal(stockState({ stock: 2, lowStockThreshold: 1 }), 'IN_STOCK', 'per-product threshold');

    assert.equal(statusForStock('ACTIVE', 0), 'OUT_OF_STOCK');
    assert.equal(statusForStock('OUT_OF_STOCK', 4), 'ACTIVE');
    assert.equal(statusForStock('INACTIVE', 0), 'INACTIVE');
    assert.equal(statusForStock('INACTIVE', 10), 'INACTIVE', 'a hidden product is never re-shown by a stock change');
});
