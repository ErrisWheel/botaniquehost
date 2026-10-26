import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './fakeDb.js';
import {
    TEAM_MEMBERS,
    TEST_IDENTITIES,
    isTestAddress,
    maskEmail,
    provisionAdmin,
    provisionTeam,
    verifyAdminLogin,
    type FirebaseAdminPort
} from '../src/services/adminProvisioning.js';

// MOCKED: FakeDb + a fake Firebase. These prove the script's decisions
// (idempotency, no overwrites, no password exposure). They do NOT prove that a
// real Firebase project accepts the calls; that needs real credentials.

const SECRET_PASSWORD = 'GENERATED-PASSWORD-MUST-NEVER-LEAK';
const apply = { apply: true, promoteExisting: false, printResetLinks: false };
const [MARZOL, DEL_ROSARIO] = TEAM_MEMBERS;

function setup() {
    const db = new FakeDb();
    const fbUsers = new Map<string, { uid: string; password?: string; emailVerified?: boolean }>();
    const calls = { create: 0, reset: 0 };
    const fb: FirebaseAdminPort = {
        getUserByEmail: async (email) => {
            const u = fbUsers.get(email);
            if (!u) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
            return { uid: u.uid };
        },
        createUser: async (p) => {
            calls.create++;
            const uid = `fb-${fbUsers.size + 1}`;
            fbUsers.set(p.email, { uid, password: p.password, emailVerified: p.emailVerified });
            return { uid };
        },
        generatePasswordResetLink: async (email) => {
            calls.reset++;
            return `https://example.test/reset?for=${encodeURIComponent(email)}`;
        }
    };
    const deps = { db, fb, randomPassword: () => SECRET_PASSWORD };
    return { db, fb, fbUsers, calls, deps };
}

test('the five team members are the five requested surnames', () => {
    assert.deepEqual(TEAM_MEMBERS.map((m) => m.label), ['Marzol', 'Del Rosario', 'De Vera', 'Roxas', 'Destor']);
    assert.deepEqual(TEAM_MEMBERS.map((m) => m.emailEnv), [
        'TEAM_ADMIN_EMAIL_MARZOL', 'TEAM_ADMIN_EMAIL_DEL_ROSARIO', 'TEAM_ADMIN_EMAIL_DE_VERA',
        'TEAM_ADMIN_EMAIL_ROXAS', 'TEAM_ADMIN_EMAIL_DESTOR'
    ]);
});

test('no e-mail given: skipped, nothing is created or invented', async () => {
    const { db, calls, deps } = setup();
    const r = await provisionAdmin(deps, { member: MARZOL }, apply);
    assert.equal(r.action, 'skipped');
    assert.equal(db.users.length, 0);
    assert.equal(calls.create, 0);
});

test('creates a Firebase login + ADMIN row; the password is random, unverified-mailbox, and never returned', async () => {
    const { db, fbUsers, deps } = setup();
    const r = await provisionAdmin(deps, { member: MARZOL, email: ' Marzol@Example.TEST ' }, apply);

    assert.equal(r.action, 'created');
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].email, 'marzol@example.test');
    assert.equal(db.users[0].role, 'ADMIN');
    assert.equal(db.users[0].passwordHash, null, 'no password hash stored in the database');
    assert.equal(db.users[0].firebaseUid, fbUsers.get('marzol@example.test')!.uid);
    assert.equal(fbUsers.get('marzol@example.test')!.emailVerified, false);

    const everything = JSON.stringify([r, db.users, db.audits]);
    assert.ok(!everything.includes(SECRET_PASSWORD), 'the generated password is not in the result, database or audit log');
});

test('idempotent: running it again changes nothing and creates no duplicates', async () => {
    const { db, calls, deps } = setup();
    await provisionAdmin(deps, { member: MARZOL, email: 'marzol@example.test' }, apply);
    const again = await provisionAdmin(deps, { member: MARZOL, email: 'marzol@example.test' }, apply);

    assert.equal(again.action, 'unchanged');
    assert.equal(db.users.length, 1);
    assert.equal(calls.create, 1);
});

test('dry run (default CLI mode) changes nothing and never calls Firebase createUser', async () => {
    const { db, calls, deps } = setup();
    const r = await provisionAdmin(deps, { member: MARZOL, email: 'marzol@example.test' }, { ...apply, apply: false });
    assert.equal(r.action, 'would-create');
    assert.equal(db.users.length, 0);
    assert.equal(calls.create, 0);
});

test('an existing customer is NOT promoted without the explicit flag (typo protection)', async () => {
    const { db, deps } = setup();
    db.users.push({ id: 'c1', email: 'someone@example.test', role: 'CUSTOMER', firebaseUid: 'fb-x', fullName: 'Someone' });

    const r = await provisionAdmin(deps, { member: MARZOL, email: 'someone@example.test' }, apply);
    assert.equal(r.action, 'needs-flag');
    assert.equal(db.users[0].role, 'CUSTOMER');

    const promoted = await provisionAdmin(deps, { member: MARZOL, email: 'someone@example.test' }, { ...apply, promoteExisting: true });
    assert.equal(promoted.action, 'promoted');
    assert.equal(db.users[0].role, 'ADMIN');
    assert.equal(db.users.length, 1, 'promoted in place, not duplicated');
});

test('the existing administrator is never modified, even if its e-mail is listed', async () => {
    const { db, calls, deps } = setup();
    const original = { id: 'a0', email: 'owner@example.test', role: 'ADMIN', firebaseUid: 'fb-owner', fullName: 'Owner', isSuspended: false };
    db.users.push({ ...original });

    const r = await provisionAdmin(deps, { member: MARZOL, email: 'owner@example.test' }, apply);

    assert.equal(r.action, 'unchanged');
    assert.deepEqual(db.users[0], original);
    assert.equal(calls.create, 0);
});

test('an existing Firebase login is linked, never recreated or given a new password', async () => {
    const { db, fbUsers, calls, deps } = setup();
    fbUsers.set('marzol@example.test', { uid: 'fb-existing', password: 'THEIR-OWN-PASSWORD' });

    const r = await provisionAdmin(deps, { member: MARZOL, email: 'marzol@example.test' }, apply);

    assert.equal(r.action, 'linked');
    assert.equal(calls.create, 0);
    assert.equal(fbUsers.get('marzol@example.test')!.password, 'THEIR-OWN-PASSWORD');
    assert.equal(db.users[0].firebaseUid, 'fb-existing');
});

test('a Firebase login that already belongs to a different Botanique account is refused', async () => {
    const { db, fbUsers, deps } = setup();
    fbUsers.set('marzol@example.test', { uid: 'fb-taken' });
    db.users.push({ id: 'other', email: 'other@example.test', role: 'CUSTOMER', firebaseUid: 'fb-taken', fullName: 'Other' });

    const r = await provisionAdmin(deps, { member: MARZOL, email: 'marzol@example.test' }, apply);
    assert.equal(r.action, 'failed');
    assert.equal(db.users.length, 1);
});

test('a Firebase failure leaves no half-created database row', async () => {
    const { db, fb, deps } = setup();
    (fb as any).createUser = async () => { throw Object.assign(new Error('quota'), { code: 'auth/quota-exceeded' }); };

    const r = await provisionAdmin(deps, { member: MARZOL, email: 'marzol@example.test' }, apply);
    assert.equal(r.action, 'failed');
    assert.equal(db.users.length, 0);
});

test('reset links are produced only when asked for, and only for accounts that were provisioned', async () => {
    const { calls, deps } = setup();
    const quiet = await provisionAdmin(deps, { member: MARZOL, email: 'a@example.test' }, apply);
    assert.equal(quiet.resetLink, undefined);
    assert.equal(calls.reset, 0);

    const loud = await provisionAdmin(deps, { member: DEL_ROSARIO, email: 'b@example.test' }, { ...apply, printResetLinks: true });
    assert.match(loud.resetLink!, /^https:\/\/example\.test\/reset/);
});

test('the same e-mail given for two people is rejected for the second', async () => {
    const { db, deps } = setup();
    const out = await provisionTeam(
        deps,
        [{ member: MARZOL, email: 'same@example.test' }, { member: DEL_ROSARIO, email: 'SAME@example.test' }],
        apply
    );
    assert.equal(out[0].action, 'created');
    assert.equal(out[1].action, 'invalid');
    assert.equal(db.users.length, 1);
});

test('invalid e-mail is rejected before anything happens', async () => {
    const { calls, deps } = setup();
    const r = await provisionAdmin(deps, { member: MARZOL, email: 'not-an-email' }, apply);
    assert.equal(r.action, 'invalid');
    assert.equal(calls.create, 0);
});

test('e-mails are masked in output', () => {
    assert.equal(maskEmail('marzol@example.test'), 'ma****@example.test');
});

// ---------------------------------------------------------------------------
// Test mode (dev/staging only): usable logins with generated passwords.
// MOCKED Firebase: proves decisions and that no password leaks anywhere except
// the one private credentials sink. Does not prove a real project accepts it.
// ---------------------------------------------------------------------------
const testApply = { ...apply, testMode: true };

test('test mode: password goes ONLY to recordCredential; never into results, DB rows or audit log', async () => {
    const { db, fbUsers, deps } = setup();
    const recorded: any[] = [];
    const out = await provisionTeam(
        { ...deps, recordCredential: (c) => recorded.push(c) },
        TEAM_MEMBERS.map((m) => ({ member: m, email: TEST_IDENTITIES[m.key] })),
        testApply
    );

    assert.deepEqual(out.map((r) => r.action), ['created', 'created', 'created', 'created', 'created']);
    assert.equal(recorded.length, 5);
    assert.deepEqual(recorded.map((c) => c.email).sort(), Object.values(TEST_IDENTITIES).sort());
    assert.ok(recorded.every((c) => c.password === SECRET_PASSWORD));
    for (const u of fbUsers.values()) assert.equal(u.emailVerified, true, 'test mailboxes have no inbox, so they are marked verified');
    assert.ok(db.users.every((u: any) => u.role === 'ADMIN' && u.passwordHash === null && u.firebaseUid));

    const everything = JSON.stringify([out, db.users, db.audits]);
    assert.ok(!everything.includes(SECRET_PASSWORD), 'password absent from results, database and audit log');
    assert.ok(out.every((r) => r.resetLink === undefined), 'no reset links in test mode');
});

test('test mode: refuses anything that is not a reserved test address (a real mailbox never gets a generated password)', async () => {
    const { db, calls, deps } = setup();
    const recorded: any[] = [];
    const r = await provisionAdmin(
        { ...deps, recordCredential: (c) => recorded.push(c) },
        { member: MARZOL, email: 'someone@gmail.com' },
        testApply
    );
    assert.equal(r.action, 'invalid');
    assert.equal(calls.create, 0);
    assert.equal(db.users.length, 0);
    assert.equal(recorded.length, 0);
    assert.equal(isTestAddress('a@botanique.test'), true);
    assert.equal(isTestAddress('a@example.com'), true);
    assert.equal(isTestAddress('a@gmail.com'), false);
    assert.equal(isTestAddress('a@evil-example.com'), false);
    assert.equal(isTestAddress('a@test.com'), false);
});

test('test mode is repeatable: second run creates nothing, records no new password, keeps the first password', async () => {
    const { db, fbUsers, calls, deps } = setup();
    const recorded: any[] = [];
    const run = () =>
        provisionTeam(
            { ...deps, recordCredential: (c) => recorded.push(c) },
            [{ member: MARZOL, email: TEST_IDENTITIES.MARZOL }],
            testApply
        );
    await run();
    const second = await run();
    assert.equal(second[0].action, 'unchanged');
    assert.equal(calls.create, 1);
    assert.equal(db.users.length, 1);
    assert.equal(recorded.length, 1, 'only the run that created the account hands out a password');
    assert.equal(fbUsers.get(TEST_IDENTITIES.MARZOL)!.password, SECRET_PASSWORD);
});

test('test mode: an existing Firebase login is linked, its password is never replaced or recorded', async () => {
    const { db, fbUsers, calls, deps } = setup();
    fbUsers.set(TEST_IDENTITIES.ROXAS, { uid: 'fb-existing', password: 'THEIR-OWN-PASSWORD', emailVerified: true });
    const recorded: any[] = [];
    const r = await provisionAdmin(
        { ...deps, recordCredential: (c) => recorded.push(c) },
        { member: TEAM_MEMBERS[3], email: TEST_IDENTITIES.ROXAS },
        testApply
    );
    assert.notEqual(r.action, 'failed');
    assert.equal(calls.create, 0);
    assert.equal(recorded.length, 0);
    assert.equal(fbUsers.get(TEST_IDENTITIES.ROXAS)!.password, 'THEIR-OWN-PASSWORD');
    assert.equal(db.users[0].firebaseUid, 'fb-existing');
});

test('test mode: an existing customer account is not promoted or touched without --promote-existing', async () => {
    const { db, deps } = setup();
    db.users.push({ id: 'u-cust', email: TEST_IDENTITIES.DESTOR, role: 'CUSTOMER', firebaseUid: 'fb-c', fullName: 'Customer', isSuspended: false });
    const recorded: any[] = [];
    const r = await provisionAdmin(
        { ...deps, recordCredential: (c) => recorded.push(c) },
        { member: TEAM_MEMBERS[4], email: TEST_IDENTITIES.DESTOR },
        testApply
    );
    assert.equal(r.action, 'needs-flag');
    assert.equal(db.users[0].role, 'CUSTOMER');
    assert.equal(recorded.length, 0);
});

test('without test mode nothing is ever handed to recordCredential and the mailbox stays unverified', async () => {
    const { fbUsers, deps } = setup();
    const recorded: any[] = [];
    await provisionAdmin({ ...deps, recordCredential: (c) => recorded.push(c) }, { member: MARZOL, email: 'm@example.test' }, apply);
    assert.equal(recorded.length, 0);
    assert.equal(fbUsers.get('m@example.test')!.emailVerified, false);
});

test('dry run in test mode creates nothing and records nothing', async () => {
    const { db, calls, deps } = setup();
    const recorded: any[] = [];
    const r = await provisionAdmin(
        { ...deps, recordCredential: (c) => recorded.push(c) },
        { member: MARZOL, email: TEST_IDENTITIES.MARZOL },
        { ...testApply, apply: false }
    );
    assert.match(r.action, /^would-/);
    assert.equal(calls.create, 0);
    assert.equal(db.users.length, 0);
    assert.equal(recorded.length, 0);
});

// ---- verifyAdminLogin with a fake fetch (no network) -------------------------
type FakeReply = { ok: boolean; status?: number; body: any };
const fakeFetch = (opts: { signIn?: FakeReply; me?: FakeReply }) =>
    (async (url: string) => {
        const r = String(url).includes('signInWithPassword') ? opts.signIn : opts.me;
        return {
            ok: !!r?.ok,
            status: r?.status ?? (r?.ok ? 200 : 400),
            json: async () => r?.body ?? {}
        } as any;
    }) as unknown as typeof fetch;
const cfg = (fetchImpl: typeof fetch) => ({
    fetchImpl, webApiKey: 'web-key', apiUrl: 'http://api.local/api/', email: 'a@botanique.test', password: 'pw-SECRET-123'
});

test('verifyAdminLogin: signed in and ADMIN -> ok; result holds no password or token', async () => {
    const r = await verifyAdminLogin(cfg(fakeFetch({
        signIn: { ok: true, body: { idToken: 'TOKEN-SECRET' } },
        me: { ok: true, body: { role: 'ADMIN', isSuspended: false } }
    })));
    assert.equal(r.ok, true);
    assert.ok(!JSON.stringify(r).includes('TOKEN-SECRET') && !JSON.stringify(r).includes('pw-SECRET-123'));
});

test('verifyAdminLogin: wrong password, CUSTOMER role, suspended and API rejection all fail honestly', async () => {
    const bad = await verifyAdminLogin(cfg(fakeFetch({ signIn: { ok: false, body: { error: { message: 'INVALID_PASSWORD' } } } })));
    assert.equal(bad.ok, false);
    assert.match(bad.note, /INVALID_PASSWORD/);

    const signIn = { ok: true, body: { idToken: 'T' } };
    const cust = await verifyAdminLogin(cfg(fakeFetch({ signIn, me: { ok: true, body: { role: 'CUSTOMER', isSuspended: false } } })));
    assert.equal(cust.ok, false);
    assert.equal(cust.role, 'CUSTOMER');

    const susp = await verifyAdminLogin(cfg(fakeFetch({ signIn, me: { ok: true, body: { role: 'ADMIN', isSuspended: true } } })));
    assert.equal(susp.ok, false);

    const rejected = await verifyAdminLogin(cfg(fakeFetch({ signIn, me: { ok: false, status: 401, body: {} } })));
    assert.equal(rejected.ok, false);
    assert.match(rejected.note, /401/);

    const boom = await verifyAdminLogin(cfg((async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }); }) as any));
    assert.equal(boom.ok, false);
});
