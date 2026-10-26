import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './fakeDb.js';
import { deleteAccountRow, updateAccount } from '../src/services/accounts.js';

// MOCKED: FakeDb serialises transactions (stricter than Postgres). In production
// the same rules run in a Serializable transaction, see services/accounts.ts.

const user = (id: string, role: string, over: Record<string, any> = {}) => ({
    id, email: `${id}@example.test`, fullName: id, role, isSuspended: false, firebaseUid: `fb-${id}`, ...over
});

function setup(...users: any[]) {
    const db = new FakeDb();
    db.users.push(...users);
    return db;
}

const refuses = (p: Promise<unknown>, status: number, code: string) =>
    assert.rejects(p, (e: any) => e.statusCode === status && e.code === code);

test('the only administrator cannot be demoted, suspended or deleted - even by another account', async () => {
    const db = setup(user('admin', 'ADMIN'), user('cust', 'CUSTOMER'));

    // `cust` is not an admin in reality (the route blocks them first); the service
    // must still protect the last admin on its own.
    await refuses(updateAccount(db, 'someone', 'admin', { role: 'CUSTOMER' }), 409, 'LAST_ADMIN');
    await refuses(updateAccount(db, 'someone', 'admin', { isSuspended: true }), 409, 'LAST_ADMIN');
    await refuses(deleteAccountRow(db, 'someone', 'admin'), 409, 'LAST_ADMIN');

    assert.equal(db.users.find((u) => u.id === 'admin')!.role, 'ADMIN');
    assert.equal(db.users.find((u) => u.id === 'admin')!.isSuspended, false);
});

test('an administrator can never change their own role, suspend or delete themselves', async () => {
    const db = setup(user('a1', 'ADMIN'), user('a2', 'ADMIN'));

    await refuses(updateAccount(db, 'a1', 'a1', { role: 'CUSTOMER' }), 400, 'SELF_ROLE_CHANGE');
    await refuses(updateAccount(db, 'a1', 'a1', { isSuspended: true }), 400, 'SELF_SUSPEND');
    await refuses(deleteAccountRow(db, 'a1', 'a1'), 400, 'SELF_DELETE');
});

test('with another active administrator the first can be demoted or suspended - until only one is left', async () => {
    const db = setup(user('a1', 'ADMIN'), user('a2', 'ADMIN'), user('a3', 'ADMIN'));

    assert.equal((await updateAccount(db, 'a1', 'a2', { role: 'CUSTOMER' })).after.role, 'CUSTOMER');
    assert.equal((await updateAccount(db, 'a1', 'a3', { isSuspended: true })).after.isSuspended, true);

    // a1 is now the only active administrator and is protected.
    await refuses(updateAccount(db, 'a3', 'a1', { role: 'CUSTOMER' }), 409, 'LAST_ADMIN');
    await refuses(deleteAccountRow(db, 'a3', 'a1'), 409, 'LAST_ADMIN');
});

test('a SUSPENDED administrator does not count as a remaining administrator', async () => {
    const db = setup(user('a1', 'ADMIN'), user('a2', 'ADMIN', { isSuspended: true }));
    await refuses(updateAccount(db, 'x', 'a1', { role: 'CUSTOMER' }), 409, 'LAST_ADMIN');
});

test('two administrators demoting each other at the same moment: exactly one succeeds', async () => {
    const db = setup(user('a1', 'ADMIN'), user('a2', 'ADMIN'));

    const results = await Promise.allSettled([
        updateAccount(db, 'a1', 'a2', { role: 'CUSTOMER' }),
        updateAccount(db, 'a2', 'a1', { role: 'CUSTOMER' })
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(db.users.filter((u) => u.role === 'ADMIN' && !u.isSuspended).length, 1, 'one admin always remains');
});

test('customers can be suspended, reactivated and edited freely', async () => {
    const db = setup(user('a1', 'ADMIN'), user('c1', 'CUSTOMER'));

    assert.equal((await updateAccount(db, 'a1', 'c1', { isSuspended: true })).after.isSuspended, true);
    assert.equal((await updateAccount(db, 'a1', 'c1', { isSuspended: false })).after.isSuspended, false);
    assert.equal((await updateAccount(db, 'a1', 'c1', { fullName: 'New Name' })).after.fullName, 'New Name');
});

test('a customer can be promoted to administrator by an administrator', async () => {
    const db = setup(user('a1', 'ADMIN'), user('c1', 'CUSTOMER'));
    assert.equal((await updateAccount(db, 'a1', 'c1', { role: 'ADMIN' })).after.role, 'ADMIN');
});

test('unknown account is 404', async () => {
    await refuses(updateAccount(setup(user('a1', 'ADMIN')), 'a1', 'ghost', { fullName: 'x' }), 404, 'NOT_FOUND');
});

test('deleting a customer keeps their orders (user link becomes NULL, snapshot stays)', async () => {
    const db = setup(user('a1', 'ADMIN'), user('c1', 'CUSTOMER'));
    db.orders.push({ id: 'o1', userId: 'c1', status: 'DELIVERED', paymentStatus: 'PAID', total: 900, customerJson: { fullName: 'Cee' } });

    await deleteAccountRow(db, 'a1', 'c1');

    assert.equal(db.users.some((u) => u.id === 'c1'), false);
    assert.equal(db.orders.length, 1, 'order history survives');
    assert.equal(db.orders[0].userId, null);
    assert.deepEqual(db.orders[0].customerJson, { fullName: 'Cee' });
    assert.equal(db.orders[0].total, 900);
});
