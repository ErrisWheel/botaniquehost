import './helpers.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import adminRouter from '../src/routes/admin.js';
import productsRouter from '../src/routes/products.js';
import ordersRouter from '../src/routes/orders.js';
import { admin } from '../src/middleware/auth.js';
import { errorHandler, mapDatabaseError } from '../src/middleware/error.js';

// Real Express routers + real auth middleware. No token is ever valid here
// (Firebase is not configured), so these prove the GATE: nothing privileged is
// reachable without a verified Firebase identity. They do not exercise a
// signed-in customer against Firebase itself (that needs a real project); the
// role check is covered by the direct `admin` middleware tests below.

let server: Server;
let base = '';

before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    app.use('/api/products', productsRouter);
    app.use('/api/orders', ordersRouter);
    app.use(errorHandler);
    await new Promise<void>((ok) => {
        server = app.listen(0, '127.0.0.1', () => ok());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(() => new Promise<void>((ok) => server.close(() => ok())));

type RouteDef = { method: string; path: string };

// Explicit tables (not Express internals): if someone adds an endpoint, add it
// here so the gate is proven for it too.
const ADMIN_ROUTES: RouteDef[] = [
    { method: 'GET', path: '/api/admin/dashboard' },
    { method: 'GET', path: '/api/admin/orders' },
    { method: 'GET', path: '/api/admin/orders/:id' },
    { method: 'PATCH', path: '/api/admin/orders/:id/status' },
    { method: 'POST', path: '/api/admin/orders/:id/refunded' },
    { method: 'GET', path: '/api/admin/products' },
    { method: 'GET', path: '/api/admin/categories' },
    { method: 'GET', path: '/api/admin/users' },
    { method: 'POST', path: '/api/admin/users' },
    { method: 'POST', path: '/api/admin/admins' },
    { method: 'PATCH', path: '/api/admin/users/:id' },
    { method: 'DELETE', path: '/api/admin/users/:id' },
    { method: 'GET', path: '/api/admin/analytics/sales' },
    { method: 'GET', path: '/api/admin/activity' },
    { method: 'GET', path: '/api/admin/audit' }
];

const PRODUCT_ADMIN_ROUTES: RouteDef[] = [
    { method: 'POST', path: '/api/products' },
    { method: 'PATCH', path: '/api/products/:id' },
    { method: 'POST', path: '/api/products/:id/stock' },
    { method: 'DELETE', path: '/api/products/:id' }
];

const ORDER_ADMIN_ROUTES: RouteDef[] = [
    { method: 'GET', path: '/api/orders/admin/all' },
    { method: 'PATCH', path: '/api/orders/admin/:id/status' },
    { method: 'GET', path: '/api/orders/admin/:id/invoice' },
    { method: 'POST', path: '/api/orders/admin/:id/return' },
    { method: 'POST', path: '/api/orders/admin/:id/resend-confirmation' }
];

const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, 'x');

const call = (r: RouteDef, headers: Record<string, string> = {}) =>
    fetch(base + concrete(r.path).replace(/^\/api/, ''), {
        method: r.method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method) ? '{}' : undefined
    });

test('EVERY admin route rejects a request without a token (401)', async () => {
    for (const r of ADMIN_ROUTES) {
        const res = await call(r);
        assert.equal(res.status, 401, `${r.method} ${r.path} answered ${res.status}`);
    }
});

test('EVERY admin route rejects a garbage bearer token (never 200)', async () => {
    for (const r of ADMIN_ROUTES) {
        const res = await call(r, { Authorization: 'Bearer not-a-real-token' });
        assert.ok([401, 503].includes(res.status), `${r.method} ${r.path} answered ${res.status}`);
    }
});

test('product management and order administration routes are all protected', async () => {
    for (const r of [...PRODUCT_ADMIN_ROUTES, ...ORDER_ADMIN_ROUTES])
        assert.equal((await call(r)).status, 401, `${r.method} ${r.path}`);
});

test('ordinary customer routes also need a login', async () => {
    for (const r of [{ method: 'GET', path: '/api/orders' }, { method: 'POST', path: '/api/orders' }, { method: 'GET', path: '/api/orders/x' }])
        assert.equal((await call(r)).status, 401, `${r.method} ${r.path}`);
});

/* ----- the role gate itself (what a signed-in customer would hit) ----- */

const run = (user: any) => {
    let status = 0;
    let nextCalled = false;
    const res: any = { status: (s: number) => ((status = s), res), json: () => res };
    admin({ user } as any, res, () => (nextCalled = true));
    return { status, nextCalled };
};

test('admin middleware: a CUSTOMER gets 403, an ADMIN passes, nobody gets 403', () => {
    assert.deepEqual(run({ id: 'u', role: 'CUSTOMER' }), { status: 403, nextCalled: false });
    assert.deepEqual(run({ id: 'u', role: 'admin' }), { status: 403, nextCalled: false }, 'case-sensitive, no loose match');
    assert.deepEqual(run(undefined), { status: 403, nextCalled: false });
    assert.deepEqual(run({ id: 'a', role: 'ADMIN' }), { status: 0, nextCalled: true });
});

test('database errors map to safe client responses', () => {
    assert.equal(mapDatabaseError({ code: 'P2002' })!.status, 409);
    assert.equal(mapDatabaseError({ code: 'P2003' })!.status, 409);
    assert.equal(mapDatabaseError({ code: 'P2025' })!.status, 404);
    assert.equal(mapDatabaseError({ code: 'P2034' })!.code, 'CONCURRENT_CHANGE');
    assert.equal(mapDatabaseError({ code: 'SOMETHING_ELSE' }), null);
    assert.equal(mapDatabaseError(new Error('boom')), null);
});
