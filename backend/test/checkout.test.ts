import './helpers.js';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { createOrder } from '../src/routes/orders.js';
import { FakeDb } from './fakeDb.js';
import { installFakeDb } from './useFakeDb.js';

// MOCKED: in-memory FakeDb. It serialises transactions, so it proves the
// application's claim / compare-and-set logic (what makes the SQL safe under
// concurrency), not Postgres' locking itself.

let db: FakeDb;

const body = { paymentMethod: 'MAYA', customer: { fullName: 'Ana', phone: '0917', email: 'ana@example.test', address: '1 Rizal', city: 'Manila', province: 'NCR', zip: '1000' }, delivery: {} };

function cartFor(userId: string, productId: string, qty: number, cartId = `cart-${userId}`) {
    db.users.push({ id: userId, email: `${userId}@example.test`, fullName: userId, role: 'CUSTOMER' });
    db.carts.push({ id: cartId, userId });
    db.cartItems.push({ id: `ci-${userId}`, cartId, productId, quantity: qty });
}

const failsWith = (p: Promise<unknown>, status: number, code: string) =>
    assert.rejects(p, (e: any) => e.statusCode === status && e.code === code);

beforeEach(() => {
    db = installFakeDb();
    db.products.push({ id: 'p1', name: 'Monstera', price: 500, stock: 5, status: 'ACTIVE' });
});

test('checkout: order created from DATABASE prices, stock reserved, cart emptied', async () => {
    cartFor('u1', 'p1', 2);

    const o: any = await createOrder('u1', body);

    assert.equal(db.orders.length, 1);
    assert.equal(db.orders[0].subtotal, 1000);
    assert.equal(db.items[0].unitPrice, 500);
    assert.equal(db.products[0].stock, 3);
    assert.equal(db.cartItems.length, 0);
    assert.ok(o.items.length === 1);
});

test('double submit of the SAME cart (double click / two tabs) creates exactly ONE order', async () => {
    cartFor('u1', 'p1', 2);

    const results = await Promise.allSettled([createOrder('u1', body), createOrder('u1', body)]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal((loser.reason as any).code, 'CART_CHANGED');
    assert.equal((loser.reason as any).statusCode, 409);

    assert.equal(db.orders.length, 1, 'one order');
    assert.equal(db.products[0].stock, 3, 'stock reserved once, not twice');
});

test('the last unit cannot be sold twice (no overselling)', async () => {
    db.products[0].stock = 1;
    cartFor('u1', 'p1', 1);
    cartFor('u2', 'p1', 1);

    const results = await Promise.allSettled([createOrder('u1', body), createOrder('u2', body)]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal((loser.reason as any).code, 'INSUFFICIENT_STOCK');

    assert.equal(db.orders.length, 1);
    assert.equal(db.products[0].stock, 0, 'never negative');
    assert.equal(db.products[0].status, 'OUT_OF_STOCK', 'sold-out product leaves the shop');
});

test('two buyers wanting more than is left: stock never goes negative even while the product stays ACTIVE', async () => {
    db.products[0].stock = 3;
    cartFor('u1', 'p1', 2);
    cartFor('u2', 'p1', 2);

    const results = await Promise.allSettled([createOrder('u1', body), createOrder('u2', body)]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(db.products[0].stock, 1, '3 - 2 = 1, the second buyer was refused');
    assert.equal(db.products[0].status, 'ACTIVE');
    assert.equal(db.orders.length, 1);
});

test('the losing checkout is rolled back completely: no order, no stock change, cart restored', async () => {
    db.products[0].stock = 1;
    cartFor('u1', 'p1', 1);
    cartFor('u2', 'p1', 1);

    await Promise.allSettled([createOrder('u1', body), createOrder('u2', body)]);

    const buyers = new Set(db.orders.map((o) => o.userId));
    assert.equal(buyers.size, 1);
    const loserCart = db.cartItems.filter((c) => !buyers.has(c.id.replace('ci-', '')));
    assert.equal(loserCart.length, 1, "the loser's cart item is still there so they can try again");
});

test('asking for more than the stock is refused', async () => {
    cartFor('u1', 'p1', 9);
    await assert.rejects(createOrder('u1', body), (e: any) => e.statusCode === 400 && /Insufficient stock/.test(e.message));
    assert.equal(db.orders.length, 0);
    assert.equal(db.products[0].stock, 5);
});

test('a product deactivated by an administrator cannot be bought', async () => {
    db.products[0].status = 'INACTIVE';
    cartFor('u1', 'p1', 1);
    await assert.rejects(createOrder('u1', body), (e: any) => e.statusCode === 400);
    assert.equal(db.orders.length, 0);
});

test('a price change between pricing and payment is caught (409 PRICE_CHANGED), nothing is charged or reserved', async () => {
    cartFor('u1', 'p1', 1);

    // The administrator edits the price right after checkout read the cart.
    const realFind = (prisma as any).cart.findUnique;
    (prisma as any).cart.findUnique = async (a: any) => {
        const cart = await realFind(a);
        db.products[0].price = 650;
        return cart;
    };

    await failsWith(createOrder('u1', body), 409, 'PRICE_CHANGED');
    assert.equal(db.orders.length, 0);
    assert.equal(db.products[0].stock, 5);
    assert.equal(db.cartItems.length, 1, 'cart restored after rollback');
});

test('an empty cart is refused', async () => {
    db.users.push({ id: 'u1', email: 'u1@example.test', fullName: 'u1' });
    db.carts.push({ id: 'c1', userId: 'u1' });
    await assert.rejects(createOrder('u1', body), (e: any) => e.statusCode === 400);
});
