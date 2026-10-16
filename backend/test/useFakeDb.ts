import { prisma } from '../src/db.js';
import { FakeDb } from './fakeDb.js';

const KEYS = [
    'order', 'orderItem', 'paymentEvent', 'product', 'notification', 'auditLog', 'user',
    'cart', 'cartItem', 'wishlistItem', 'returnRequest', '$transaction'
] as const;

/** Points the application's `prisma` singleton at a fresh in-memory FakeDb. */
export function installFakeDb(): FakeDb {
    const db = new FakeDb();
    for (const k of KEYS)
        Object.defineProperty(prisma, k, { value: (db as any)[k], configurable: true, writable: true });
    return db;
}
