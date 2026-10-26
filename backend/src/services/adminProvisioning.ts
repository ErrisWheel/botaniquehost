/**
 * Provisioning of team administrators (used by scripts/provision-team-admins.ts).
 *
 * Rules enforced here (and covered by test/adminProvisioning.test.ts):
 *  - the e-mail addresses are INPUT; nothing is invented;
 *  - a password is never supplied, stored, logged or printed: new Firebase
 *    logins get a random password nobody sees and the person sets their own
 *    through a password-reset link / "Forgot password";
 *  - idempotent: running it again never creates a second account, never
 *    changes an existing account's password, role or suspension;
 *  - an existing CUSTOMER account is only promoted when the operator passes the
 *    explicit `promoteExisting` flag (guards against typos);
 *  - there is no HTTP route for any of this: it is an operator action that needs
 *    the server's Firebase service-account credentials and database access.
 */

export type TeamMember = {
    key: string;
    /** Surname exactly as given by the team (first names are not invented). */
    label: string;
    emailEnv: string;
    nameEnv: string;
};

const member = (key: string, label: string): TeamMember => ({
    key,
    label,
    emailEnv: `TEAM_ADMIN_EMAIL_${key}`,
    nameEnv: `TEAM_ADMIN_NAME_${key}`
});

export const TEAM_MEMBERS: readonly TeamMember[] = [
    member('MARZOL', 'Marzol'),
    member('DEL_ROSARIO', 'Del Rosario'),
    member('DE_VERA', 'De Vera'),
    member('ROXAS', 'Roxas'),
    member('DESTOR', 'Destor')
];

export type ProvisionAction =
    | 'created' // Firebase login + database row created
    | 'linked' // existing Firebase login / unlinked row connected, row is ADMIN
    | 'promoted' // existing customer promoted (explicit flag)
    | 'unchanged' // already a linked administrator
    | 'would-create'
    | 'would-link'
    | 'would-promote'
    | 'needs-flag' // customer exists; re-run with --promote-existing
    | 'skipped' // no e-mail supplied
    | 'invalid' // e-mail is not valid / duplicated
    | 'failed';

export type ProvisionResult = {
    key: string;
    label: string;
    email?: string;
    action: ProvisionAction;
    note?: string;
    /** One-time password-setup link. Only set when requested; never logged here. */
    resetLink?: string;
};

export type FirebaseAdminPort = {
    getUserByEmail(email: string): Promise<{ uid: string }>;
    createUser(props: {
        email: string;
        password: string;
        displayName: string;
        emailVerified: boolean;
    }): Promise<{ uid: string }>;
    generatePasswordResetLink(email: string): Promise<string>;
};

export type ProvisionOptions = {
    /** false = dry run: report only, change nothing. */
    apply: boolean;
    promoteExisting: boolean;
    printResetLinks: boolean;
    /**
     * TEST ENVIRONMENTS ONLY. New Firebase logins get a generated password that
     * is handed to `deps.recordCredential` (so it can go into a local, private
     * credentials file) and the mailbox is marked verified, because test
     * addresses have no inbox. Only reserved test addresses are accepted (see
     * isTestAddress) and existing accounts are never given a new password.
     */
    testMode?: boolean;
};

export type ProvisionDeps = {
    db: any;
    /** Undefined when Firebase is not configured (dry runs only). */
    fb?: FirebaseAdminPort;
    randomPassword: () => string;
    /**
     * Receives the generated password of an account THIS run created, in test
     * mode only. The provisioning result objects never contain a password.
     */
    recordCredential?: (c: { key: string; label: string; email: string; password: string }) => void;
};

/**
 * Reserved / test-only addresses (RFC 2606 / 6761): `.test`, `.example`,
 * `.invalid`, `.localhost` and example.com/.net/.org. Test mode refuses
 * anything else so that script-generated passwords can never be attached to a
 * real person's mailbox.
 */
export const isTestAddress = (email: string): boolean => {
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    return (
        /\.(test|example|invalid|localhost)$/.test(domain) ||
        ['example.com', 'example.net', 'example.org'].includes(domain)
    );
};

/** The proposed test-only identities (used only with --test-identities). */
export const TEST_IDENTITIES: Record<string, string> = {
    MARZOL: 'marzol.admin@botanique.test',
    DEL_ROSARIO: 'delrosario.admin@botanique.test',
    DE_VERA: 'devera.admin@botanique.test',
    ROXAS: 'roxas.admin@botanique.test',
    DESTOR: 'destor.admin@botanique.test'
};

export const maskEmail = (email: string) => {
    const [name = '', domain = ''] = email.split('@');
    return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normaliseEmail = (raw: string | undefined | null) => {
    const v = raw?.trim().toLowerCase();
    return v ? v : undefined;
};

const isNotFound = (e: any) => e?.code === 'auth/user-not-found';
const isUnique = (e: any) => e?.code === 'P2002';

/** Provision ONE team administrator. Never throws for expected situations. */
export async function provisionAdmin(
    deps: ProvisionDeps,
    input: { member: TeamMember; email?: string; fullName?: string },
    opts: ProvisionOptions
): Promise<ProvisionResult> {
    const base = { key: input.member.key, label: input.member.label };
    const email = normaliseEmail(input.email);

    if (!email)
        return {
            ...base,
            action: 'skipped',
            note: `No e-mail supplied (set ${input.member.emailEnv}).`
        };

    if (!EMAIL.test(email))
        return { ...base, email, action: 'invalid', note: 'Not a valid e-mail address.' };

    if (opts.testMode && !isTestAddress(email))
        return {
            ...base,
            email,
            action: 'invalid',
            note: 'Test mode only accepts reserved test addresses (.test, .example, .invalid, .localhost, example.com/net/org).'
        };

    const fullName = input.fullName?.trim() || input.member.label;
    const { db, fb } = deps;
    let generatedPassword: string | undefined;

    try {
        const existing = await db.user.findUnique({ where: { email } });

        if (existing && existing.role === 'ADMIN' && existing.firebaseUid)
            return { ...base, email, action: 'unchanged', note: 'Already an administrator.' };

        if (existing && existing.role !== 'ADMIN' && !opts.promoteExisting)
            return {
                ...base,
                email,
                action: 'needs-flag',
                note:
                    'A customer account with this e-mail already exists and was NOT changed. ' +
                    'If the address is correct, re-run with --promote-existing.'
            };

        // Look for an existing Firebase login (read-only).
        let fbUid: string | undefined = existing?.firebaseUid ?? undefined;
        let firebaseExists = !!fbUid;
        if (!fbUid && fb) {
            try {
                fbUid = (await fb.getUserByEmail(email)).uid;
                firebaseExists = true;
            } catch (e) {
                if (!isNotFound(e)) throw e;
            }
        }

        const action: ProvisionAction = existing
            ? existing.role === 'ADMIN'
                ? 'linked'
                : 'promoted'
            : firebaseExists
              ? 'linked'
              : 'created';

        if (!opts.apply)
            return {
                ...base,
                email,
                action: (`would-${action === 'created' ? 'create' : action === 'promoted' ? 'promote' : 'link'}`) as ProvisionAction,
                note: fb ? undefined : 'Firebase not configured: login lookup skipped.'
            };

        if (!fb) throw new Error('Firebase Admin is not configured.');

        if (!fbUid) {
            generatedPassword = deps.randomPassword();
            fbUid = (
                await fb.createUser({
                    email,
                    password: generatedPassword,
                    displayName: fullName,
                    // Real mailboxes are not proven yet: completing the
                    // password-reset link does that. Test addresses have no
                    // inbox, so test mode marks them verified.
                    emailVerified: !!opts.testMode
                })
            ).uid;
        }

        // The Firebase UID must not already belong to another database row.
        const owner = await db.user.findUnique({ where: { firebaseUid: fbUid } });
        if (owner && owner.email !== email)
            return {
                ...base,
                email,
                action: 'failed',
                note: 'That Firebase login is already linked to a different Botanique account. Nothing was changed.'
            };

        if (existing) {
            // Atomic: only while the row is still in the state we looked at.
            const res = await db.user.updateMany({
                where: { id: existing.id, role: existing.role, firebaseUid: existing.firebaseUid ?? null },
                data: { firebaseUid: fbUid, role: 'ADMIN' }
            });
            if (res.count !== 1)
                return {
                    ...base,
                    email,
                    action: 'failed',
                    note: 'The account changed while provisioning. Run the command again.'
                };
        } else {
            try {
                await db.user.create({
                    data: {
                        email,
                        firebaseUid: fbUid,
                        passwordHash: null,
                        fullName,
                        role: 'ADMIN'
                    }
                });
            } catch (e) {
                // A parallel run created it first: that is success.
                if (!isUnique(e)) throw e;
                return { ...base, email, action: 'unchanged', note: 'Already exists (parallel run).' };
            }
        }

        await db.auditLog
            .create({
                data: {
                    action: 'PROVISION_ADMIN',
                    entity: 'User',
                    metadata: { source: 'provision-team-admins', how: action }
                }
            })
            .catch(() => undefined);

        // Hand the password of an account created by THIS run to the caller's
        // private credentials sink (test mode only). Never put it in the result.
        if (opts.testMode && generatedPassword && deps.recordCredential)
            deps.recordCredential({ key: base.key, label: base.label, email, password: generatedPassword });

        let resetLink: string | undefined;
        if (opts.printResetLinks && !opts.testMode)
            resetLink = await fb.generatePasswordResetLink(email);

        return { ...base, email, action, resetLink };
    } catch (e: any) {
        // Codes/messages only; never credentials.
        return {
            ...base,
            email,
            action: 'failed',
            note: String(e?.code ?? e?.message ?? 'unknown error').slice(0, 200)
        };
    }
}

/** Provision the whole team; rejects the same e-mail given for two people. */
export async function provisionTeam(
    deps: ProvisionDeps,
    inputs: Array<{ member: TeamMember; email?: string; fullName?: string }>,
    opts: ProvisionOptions
): Promise<ProvisionResult[]> {
    const seen = new Map<string, string>();
    const out: ProvisionResult[] = [];

    for (const input of inputs) {
        const email = normaliseEmail(input.email);

        if (email && seen.has(email)) {
            out.push({
                key: input.member.key,
                label: input.member.label,
                email,
                action: 'invalid',
                note: `Same e-mail as ${seen.get(email)}; each person needs their own.`
            });
            continue;
        }
        if (email) seen.set(email, input.member.label);

        out.push(await provisionAdmin(deps, input, opts));
    }

    return out;
}


export type LoginCheck = { ok: boolean; role?: string; note: string };

/**
 * End-to-end check that an account really works: signs in through Firebase's
 * public REST endpoint (same as the login page does) and asks the Botanique API
 * who the token belongs to. The password and token stay in memory; the result
 * contains neither.
 */
export async function verifyAdminLogin(
    cfg: {
        fetchImpl: typeof fetch;
        webApiKey: string;
        apiUrl: string;
        email: string;
        password: string;
    }
): Promise<LoginCheck> {
    try {
        const signIn = await cfg.fetchImpl(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(cfg.webApiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: cfg.email, password: cfg.password, returnSecureToken: true })
            }
        );
        const auth: any = await signIn.json().catch(() => ({}));
        if (!signIn.ok || typeof auth?.idToken !== 'string')
            return { ok: false, note: `Firebase sign-in failed (${auth?.error?.message ?? signIn.status}).` };

        const me = await cfg.fetchImpl(`${cfg.apiUrl.replace(/\/$/, '')}/auth/me`, {
            headers: { Authorization: `Bearer ${auth.idToken}` }
        });
        const body: any = await me.json().catch(() => ({}));
        if (!me.ok) return { ok: false, note: `Botanique API rejected the login (HTTP ${me.status}).` };
        if (body?.role !== 'ADMIN' || body?.isSuspended)
            return { ok: false, role: body?.role, note: 'Signed in, but the backend does not treat this account as an active administrator.' };

        return { ok: true, role: 'ADMIN', note: 'Signed in and recognised as ADMIN by the backend.' };
    } catch (e: any) {
        return { ok: false, note: `Could not complete the check (${String(e?.code ?? e?.name ?? 'error').slice(0, 60)}).` };
    }
}
