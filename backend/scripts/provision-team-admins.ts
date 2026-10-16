/**
 * Provision the five team administrators (Marzol, Del Rosario, De Vera,
 * Roxas, Destor) in Firebase Authentication + the Botanique database.
 *
 *   npm run admins:provision                    # DRY RUN: shows what would happen
 *   npm run admins:provision -- --apply         # really create / link
 *   npm run admins:provision -- --apply --print-reset-links
 *
 * Input (real addresses are NOT stored in the repository):
 *   TEAM_ADMIN_EMAIL_MARZOL, TEAM_ADMIN_EMAIL_DEL_ROSARIO,
 *   TEAM_ADMIN_EMAIL_DE_VERA, TEAM_ADMIN_EMAIL_ROXAS, TEAM_ADMIN_EMAIL_DESTOR
 *   (optional display names: TEAM_ADMIN_NAME_<SAME KEY>)
 * Missing ones are asked for interactively when run in a terminal, otherwise
 * skipped.
 *
 * Needs the same backend .env as the API: DATABASE_URL and the FIREBASE_*
 * service-account variables. It never resets or overwrites anything:
 *   - safe to run repeatedly (existing administrators are left unchanged);
 *   - an existing customer is only promoted with --promote-existing;
 *   - passwords are never read, stored, logged or printed.
 *
 * TEST / STAGING ONLY (accounts you can log into straight away, no inbox needed):
 *
 *   ALLOW_TEST_ADMIN_ACCOUNTS=yes npm run admins:provision -- --apply \
 *       --test-identities --credentials-file=../../Botanique-Admin-Test-Credentials.txt
 *
 *   --test-identities       use the proposed test addresses (*.admin@botanique.test)
 *                           for anyone without a TEAM_ADMIN_EMAIL_* value
 *   --credentials-file=PATH write a unique, strong, generated password for every
 *                           account THIS run creates into PATH (created with
 *                           owner-only permissions, refuses to overwrite, refuses
 *                           a path inside this project). Passwords are never
 *                           printed. Existing accounts keep their password.
 *   --verify-login          afterwards sign each new account in through Firebase and
 *                           ask the API who it is (needs FIREBASE_WEB_API_KEY and
 *                           BOTANIQUE_API_URL, e.g. http://localhost:4000/api)
 *
 * Test mode is refused when NODE_ENV=production, when ALLOW_TEST_ADMIN_ACCOUNTS is
 * not "yes", and for any address that is not a reserved test address.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import {
    TEAM_MEMBERS,
    TEST_IDENTITIES,
    maskEmail,
    provisionTeam,
    verifyAdminLogin,
    type TeamMember,
    type ProvisionResult
} from '../src/services/adminProvisioning.js';

const argv = process.argv.slice(2);
const args = new Set(argv);
const apply = args.has('--apply');
const promoteExisting = args.has('--promote-existing');
const printResetLinks = args.has('--print-reset-links');
const useTestIdentities = args.has('--test-identities');
const verifyLogin = args.has('--verify-login');
const credentialsArg = argv.find((a) => a.startsWith('--credentials-file='))?.slice('--credentials-file='.length);
const testMode = useTestIdentities || !!credentialsArg;

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 24 random bytes of entropy + a fixed tail so common password policies pass. */
const strongPassword = () => `${randomBytes(18).toString('base64url')}!Aa1`;

async function ask(question: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await rl.question(question)).trim();
    } finally {
        rl.close();
    }
}

function refuse(message: string): void {
    console.error(`${message}\nNothing was changed.`);
    process.exitCode = 1;
}

async function main() {
    // ---- guards for test mode, before anything is touched -----------------
    if (testMode) {
        if (process.env.NODE_ENV === 'production')
            return refuse('Test mode is refused while NODE_ENV=production.');
        if (process.env.ALLOW_TEST_ADMIN_ACCOUNTS !== 'yes')
            return refuse(
                'Test mode creates accounts with script-generated passwords. Use it only on a dedicated development/staging ' +
                    'Firebase project and database, then confirm with ALLOW_TEST_ADMIN_ACCOUNTS=yes.'
            );
    }
    if (credentialsArg !== undefined && !credentialsArg)
        return refuse('--credentials-file needs a path.');
    if (credentialsArg && !apply)
        return refuse('--credentials-file only makes sense together with --apply.');
    if (credentialsArg) {
        const target = resolve(credentialsArg);
        const rel = relative(PROJECT_ROOT, target);
        if (!rel.startsWith('..') && !isAbsolute(rel))
            return refuse('Choose a credentials file path OUTSIDE the project folder so it cannot be committed or zipped.');
        if (existsSync(target))
            return refuse('That credentials file already exists. It is never overwritten; choose another path.');
    }
    if (verifyLogin && (!process.env.FIREBASE_WEB_API_KEY || !process.env.BOTANIQUE_API_URL))
        return refuse('--verify-login needs FIREBASE_WEB_API_KEY (public web key) and BOTANIQUE_API_URL (e.g. http://localhost:4000/api).');

    const { firebaseConfigured } = await import('../src/config.js');
    const { prisma } = await import('../src/db.js');
    const { firebaseAuth } = await import('../src/services/firebase.js');

    if (apply && !firebaseConfigured)
        return refuse(
            'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and ' +
                'FIREBASE_PRIVATE_KEY in backend/.env, then run again.'
        );

    const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;

    const inputs: Array<{ member: TeamMember; email?: string; fullName?: string }> = [];
    for (const m of TEAM_MEMBERS) {
        let email = process.env[m.emailEnv]?.trim();
        if (!email && useTestIdentities) email = TEST_IDENTITIES[m.key];
        if (!email && interactive) email = await ask(`E-mail for ${m.label} (leave empty to skip): `);
        inputs.push({ member: m, email, fullName: process.env[m.nameEnv]?.trim() });
    }

    const fb = firebaseConfigured
        ? {
              getUserByEmail: (e: string) => firebaseAuth().getUserByEmail(e),
              createUser: (p: any) => firebaseAuth().createUser(p),
              generatePasswordResetLink: (e: string) => firebaseAuth().generatePasswordResetLink(e)
          }
        : undefined;

    const credentials: Array<{ key: string; label: string; email: string; password: string }> = [];

    const results = await provisionTeam(
        {
            db: prisma,
            fb,
            // Used once at account creation. Outside test mode it is never shown.
            randomPassword: testMode ? strongPassword : () => randomBytes(24).toString('base64url'),
            recordCredential: (c) => credentials.push(c)
        },
        inputs,
        { apply, promoteExisting, printResetLinks, testMode }
    );

    console.log(apply ? '\nProvisioning result:\n' : '\nDRY RUN (nothing changed). Add --apply to execute.\n');
    for (const r of results)
        console.log(
            `  ${r.label.padEnd(12)} ${(r.email ? maskEmail(r.email) : '-').padEnd(32)} ${r.action}` +
                (r.note ? `  - ${r.note}` : '')
        );

    // ---- test-mode credentials file (passwords are written here and nowhere else)
    if (apply && testMode && credentialsArg && credentials.length) {
        const target = resolve(credentialsArg);
        const lines = [
            'BOTANIQUE ADMIN TEST CREDENTIALS',
            '=================================',
            'TEST / STAGING ONLY. Keep this file private. Do not commit it, zip it into the project or share it.',
            '',
            `Firebase project : ${process.env.FIREBASE_PROJECT_ID ?? '(see backend/.env)'}`,
            `API              : ${process.env.BOTANIQUE_API_URL ?? '(your backend URL)'}`,
            `Generated        : ${new Date().toISOString()}`,
            '',
            ...credentials.flatMap((c) => [`${c.label}`, `  Login e-mail : ${c.email}`, `  Password     : ${c.password}`, '']),
            'How to log in',
            '  1. Open the Botanique login page and sign in with one account.',
            '  2. Administrators are sent to /admin. The role is decided by the backend database, not the browser.',
            '  3. Change the password under Profile > Change password if you keep these accounts.',
            '',
            'Accounts that already existed are not listed: their passwords were not touched.'
        ];
        try {
            writeFileSync(target, lines.join('\n'), { mode: 0o600, flag: 'wx' });
            console.log(`\nCredentials for ${credentials.length} new account(s) written to ${target} (owner-only). Passwords were not printed.`);
        } catch {
            console.error('\nCould not write the credentials file; the accounts WERE created but their passwords are lost. Delete them in Firebase and run again.');
            process.exitCode = 1;
        }
    }

    if (apply && verifyLogin && credentials.length) {
        console.log('\nLogin verification (Firebase sign-in + backend role):');
        for (const c of credentials) {
            const check = await verifyAdminLogin({
                fetchImpl: fetch,
                webApiKey: process.env.FIREBASE_WEB_API_KEY!,
                apiUrl: process.env.BOTANIQUE_API_URL!,
                email: c.email,
                password: c.password
            });
            console.log(`  ${c.label.padEnd(12)} ${check.ok ? 'OK' : 'FAILED'}  - ${check.note}`);
            if (!check.ok) process.exitCode = 1;
        }
    }

    const links = results.filter((r): r is ProvisionResult & { resetLink: string } => !!r.resetLink);
    if (links.length) {
        console.log(
            '\nPassword-setup links (each one lets its holder set that administrator\'s password.\n' +
                'Send each ONLY to the matching person, do not paste them into chat or commit them):\n'
        );
        for (const r of links) console.log(`  ${r.label}: ${r.resetLink}`);
    } else if (apply && !testMode) {
        console.log('\nEach new administrator sets their own password with "Forgot password" on the login page.');
    }

    if (results.some((r) => r.action === 'failed')) process.exitCode = 1;
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error('Provisioning stopped:', e?.code ?? e?.message ?? e);
    process.exitCode = 1;
});
