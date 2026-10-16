import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './fakeDb.js';
import {
    ORDER_STATUSES,
    ORDER_TRANSITIONS,
    allowedNextStatuses,
    changeOrderStatus,
    checkTransition,
    paymentStatusAfterCancel,
    orderStatusLabel
} from '../src/services/orderStatus.js';

// MOCKED: in-memory FakeDb, not Postgres. Proves the application's rules and
// its transaction/compare-and-set control flow.

const order = (over: Record<string, any> = {}) => ({
    id: 'o1', orderNumber: 'BOT-1', userId: 'u1', status: 'PENDING', paymentMethod: 'COD', paymentStatus: 'PENDING',
    total: 1000, createdAt: new Date(), ...over
});

function setup(over: Record<string, any> = {}, stock = { p1: 3, p2: 0 }) {
    const db = new FakeDb();
    db.products.push(
        { id: 'p1', stock: stock.p1, status: 'ACTIVE' },
        { id: 'p2', stock: stock.p2, status: stock.p2 === 0 ? 'OUT_OF_STOCK' : 'ACTIVE' }
    );
    db.orders.push(order(over));
    db.items.push(
        { id: 'i1', orderId: 'o1', productId: 'p1', productName: 'A', quantity: 2, unitPrice: 500, lineTotal: 1000 },
        { id: 'i2', orderId: 'o1', productId: 'p2', productName: 'B', quantity: 1, unitPrice: 500, lineTotal: 500 }
    );
    return db;
}

const stock = (db: FakeDb, id: string) => db.products.find((p) => p.id === id)!.stock;
const rejectsWith = (p: Promise<unknown>, status: number, code: string) =>
    assert.rejects(p, (e: any) => e.statusCode === status && e.code === code);

/* ------------------------------ transition rules ------------------------------ */

test('order status labels are human-readable', () => {
    assert.equal(orderStatusLabel('PENDING'), 'Pending');
    assert.equal(orderStatusLabel('PROCESSED'), 'Processed');
    assert.equal(orderStatusLabel('SORTING'), 'Order is being sorted');
    assert.equal(orderStatusLabel('ON_DELIVERY'), 'On delivery');
    assert.equal(orderStatusLabel('SHIPPED'), 'On delivery');
});

test('transition table: six forward fulfilment stages; cancellation remains a separate terminal outcome', () => {
    assert.deepEqual(ORDER_STATUSES, ['PENDING', 'PROCESSING', 'PROCESSED', 'SORTING', 'ON_DELIVERY', 'DELIVERED', 'CANCELLED']);
    assert.deepEqual(ORDER_TRANSITIONS.PENDING, ['PROCESSING', 'CANCELLED']);
    assert.deepEqual(ORDER_TRANSITIONS.PROCESSING, ['PROCESSED', 'CANCELLED']);
    assert.deepEqual(ORDER_TRANSITIONS.PROCESSED, ['SORTING', 'CANCELLED']);
    assert.deepEqual(ORDER_TRANSITIONS.SORTING, ['ON_DELIVERY']);
    assert.deepEqual(ORDER_TRANSITIONS.ON_DELIVERY, ['DELIVERED']);
    assert.deepEqual(ORDER_TRANSITIONS.DELIVERED, []);
    assert.deepEqual(ORDER_TRANSITIONS.CANCELLED, []);
});

test('every invalid transition is refused with INVALID_TRANSITION', () => {
    const allowed = (from: string, to: string) => (ORDER_TRANSITIONS as any)[from].includes(to);
    for (const from of ORDER_STATUSES)
        for (const to of ORDER_STATUSES) {
            if (from === to || allowed(from, to)) continue;
            const r = checkTransition(order({ status: from, paymentStatus: 'PAID' }) as any, to);
            assert.equal(r.ok, false, `${from} -> ${to} must be refused`);
            assert.equal((r as any).code, 'INVALID_TRANSITION');
        }
});

test('an unpaid Maya order cannot move into fulfilment; a paid one can', () => {
    const unpaid = order({ paymentMethod: 'MAYA', paymentStatus: 'PENDING' }) as any;
    const r = checkTransition(unpaid, 'PROCESSING');
    assert.equal(r.ok, false);
    assert.equal((r as any).code, 'PAYMENT_REQUIRED');
    assert.equal(checkTransition({ ...unpaid, paymentStatus: 'PAID' }, 'PROCESSING').ok, true);
    // ...but an unpaid Maya order CAN be cancelled.
    assert.equal(checkTransition(unpaid, 'CANCELLED').ok, true);
    assert.deepEqual(allowedNextStatuses(unpaid), ['CANCELLED']);
});

test('payment status after cancel: paid -> REFUND_PENDING, unpaid -> CANCELLED, others untouched', () => {
    assert.equal(paymentStatusAfterCancel('PAID'), 'REFUND_PENDING');
    assert.equal(paymentStatusAfterCancel('PENDING'), 'CANCELLED');
    assert.equal(paymentStatusAfterCancel('FAILED'), 'CANCELLED');
    assert.equal(paymentStatusAfterCancel('EXPIRED'), 'EXPIRED');
    assert.equal(paymentStatusAfterCancel('REFUNDED'), 'REFUNDED');
});

/* --------------------------------- the service -------------------------------- */

test('a valid move updates the status and leaves stock alone', async () => {
    const db = setup();
    const r = await changeOrderStatus(db, { orderId: 'o1', next: 'PROCESSING' });
    assert.equal(r.changed, true);
    assert.equal(db.orders[0].status, 'PROCESSING');
    assert.equal(stock(db, 'p1'), 3);
});

test('an order can progress through all six fulfilment statuses in order', async () => {
    const db = setup();
    for (const next of ['PROCESSING', 'PROCESSED', 'SORTING', 'ON_DELIVERY', 'DELIVERED'] as const) {
        const result = await changeOrderStatus(db, { orderId: 'o1', next });
        assert.equal(result.changed, true, `move to ${next} should succeed`);
        assert.equal(db.orders[0].status, next);
    }
    assert.equal(db.orders[0].paymentStatus, 'PAID', 'COD is marked paid on delivery');
    assert.deepEqual(allowedNextStatuses(db.orders[0]), []);
});

test('an invalid move is a 409 and changes nothing', async () => {
    const db = setup({ status: 'SORTING' });
    await rejectsWith(changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' }), 409, 'INVALID_TRANSITION');
    assert.equal(db.orders[0].status, 'SORTING');
    assert.equal(stock(db, 'p1'), 3);

    const done = setup({ status: 'DELIVERED', paymentStatus: 'PAID' });
    await rejectsWith(changeOrderStatus(done, { orderId: 'o1', next: 'PENDING' }), 409, 'INVALID_TRANSITION');
});

test('unknown order is 404', async () => {
    await assert.rejects(changeOrderStatus(new FakeDb(), { orderId: 'nope', next: 'PROCESSING' }), (e: any) => e.statusCode === 404);
});

test('cancelling restocks every line, marks it, and reopens OUT_OF_STOCK products', async () => {
    const db = setup();
    const r = await changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' });

    assert.equal(r.restocked, true);
    assert.equal(stock(db, 'p1'), 5);
    assert.equal(stock(db, 'p2'), 1);
    assert.equal(db.products.find((p) => p.id === 'p2')!.status, 'ACTIVE', 'sold-out product is back on sale');
    assert.ok(db.orders[0].stockRestoredAt instanceof Date);
    assert.ok(db.orders[0].cancelledAt instanceof Date);
    assert.equal(db.orders[0].paymentStatus, 'CANCELLED');
});

test('cancelling a PAID order owes a refund (REFUND_PENDING), it is not silently "paid"', async () => {
    const db = setup({ paymentMethod: 'MAYA', paymentStatus: 'PAID', status: 'PROCESSING' });
    await changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' });
    assert.equal(db.orders[0].paymentStatus, 'REFUND_PENDING');
    assert.equal(db.orders[0].status, 'CANCELLED');
});

test('repeating the cancel request restocks exactly once', async () => {
    const db = setup();
    const a = await changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' });
    const b = await changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' });

    assert.equal(a.changed, true);
    assert.equal(b.changed, false, 'second request is a no-op');
    assert.equal(stock(db, 'p1'), 5, 'not 7');
});

test('two simultaneous cancels (double click / two admins) restock exactly once', async () => {
    const db = setup();
    const results = await Promise.all([
        changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' }),
        changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' })
    ]);

    assert.equal(results.filter((r) => r.changed).length, 1);
    assert.equal(stock(db, 'p1'), 5);
});

test('an order whose stock was already returned (e.g. by a payment expiry) is not restocked again', async () => {
    const db = setup({ stockRestoredAt: new Date() });
    const r = await changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' });
    assert.equal(r.changed, true);
    assert.equal(r.restocked, false);
    assert.equal(stock(db, 'p1'), 3);
});

test('cash on delivery becomes PAID when the order is delivered', async () => {
    const db = setup({ status: 'ON_DELIVERY', paymentMethod: 'COD', paymentStatus: 'PENDING' });
    await changeOrderStatus(db, { orderId: 'o1', next: 'DELIVERED' });
    assert.equal(db.orders[0].paymentStatus, 'PAID');
    assert.ok(db.orders[0].paidAt instanceof Date);
});

test('a change made by someone else after we read the order is a 409 and nothing is restocked', async () => {
    const db = setup();
    const racing = {
        $transaction: (fn: any) =>
            db.$transaction((tx: any) =>
                fn({
                    ...tx,
                    order: {
                        ...tx.order,
                        updateMany: async (a: any) => {
                            // a Maya webhook marks the order paid between our read and our write
                            db.orders[0].paymentStatus = 'PAID';
                            return tx.order.updateMany(a);
                        }
                    }
                })
            )
    };

    await rejectsWith(changeOrderStatus(racing, { orderId: 'o1', next: 'CANCELLED' }), 409, 'CONCURRENT_CHANGE');
    assert.equal(db.orders[0].status, 'PENDING');
    assert.equal(stock(db, 'p1'), 3);
});

test('status change and stock change are atomic: a failure while restocking rolls the cancel back', async () => {
    const db = setup();
    const failing = {
        $transaction: (fn: any) =>
            db.$transaction((tx: any) =>
                fn({
                    ...tx,
                    product: {
                        ...tx.product,
                        update: async (a: any) => {
                            if (a.where.id === 'p2') throw new Error('database went away');
                            return tx.product.update(a);
                        }
                    }
                })
            )
    };

    await assert.rejects(changeOrderStatus(failing, { orderId: 'o1', next: 'CANCELLED' }), /database went away/);

    assert.equal(db.orders[0].status, 'PENDING', 'order is NOT left cancelled');
    assert.equal(db.orders[0].stockRestoredAt, undefined, 'restock claim is rolled back too');
    assert.equal(stock(db, 'p1'), 3, 'first line was not half-restocked');

    // ...and a retry afterwards works and restocks exactly once.
    await changeOrderStatus(db, { orderId: 'o1', next: 'CANCELLED' });
    assert.equal(stock(db, 'p1'), 5);
});
