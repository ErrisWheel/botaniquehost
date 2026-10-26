import './helpers.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import payments from '../src/routes/payments.js';
import { errorHandler } from '../src/middleware/error.js';

// Only the gates that run BEFORE any database or Maya/Firebase call are
// covered here, so no credentials or network are needed.
let server: Server;
let base = '';
const SECRET = process.env.MAYA_WEBHOOK_SECRET as string;

before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/payments', payments);
    app.use(errorHandler);
    await new Promise<void>((ok) => {
        server = app.listen(0, '127.0.0.1', () => ok());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/payments`;
});

after(() => new Promise<void>((ok) => server.close(() => ok())));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });

test('webhook with the wrong secret is rejected (404)', async () => {
    const r = await post('/maya/webhook/not-the-secret', { requestReferenceNumber: 'BOT-1' });
    assert.equal(r.status, 404);
});

test('webhook with the right secret but no reference is rejected (400)', async () => {
    const r = await post(`/maya/webhook/${SECRET}`, {});
    assert.equal(r.status, 400);
});

test('webhook with an oversized reference is rejected (400)', async () => {
    const r = await post(`/maya/webhook/${SECRET}`, { requestReferenceNumber: 'X'.repeat(500) });
    assert.equal(r.status, 400);
});

test('starting a Maya checkout without a token is rejected (401)', async () => {
    const r = await post('/maya/checkout', { orderId: 'whatever' });
    assert.equal(r.status, 401);
});

test('payment status without a token is rejected (401)', async () => {
    const r = await fetch(`${base}/maya/status/whatever`);
    assert.equal(r.status, 401);
});

test('a Bearer header that is not a token never yields 200', async () => {
    const r = await post('/maya/checkout', { orderId: 'x' }, { Authorization: 'Bearer nonsense' });
    assert.ok([401, 503].includes(r.status), `got ${r.status}`);
});
