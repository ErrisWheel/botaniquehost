/**
 * Read-only audit that finds orphaned / mismatched accounts between the
 * Botanique database and Firebase Authentication. Changes nothing.
 *
 *   npm run accounts:audit
 */
import { prisma } from '../src/db.js';
import { firebaseAuth } from '../src/services/firebase.js';

async function main() {
    const auth = firebaseAuth();

    const dbUsers = await prisma.user.findMany({
        select: { id: true, email: true, firebaseUid: true, role: true }
    });

    // Firebase users
    const fbUsers: { uid: string; email?: string }[] = [];
    let pageToken: string | undefined;
    do {
        const page = await auth.listUsers(1000, pageToken);
        page.users.forEach((u) => fbUsers.push({ uid: u.uid, email: u.email }));
        pageToken = page.pageToken;
    } while (pageToken);

    const fbByUid = new Map(fbUsers.map((u) => [u.uid, u]));
    const dbUids = new Set(
        dbUsers.map((u) => u.firebaseUid).filter(Boolean) as string[]
    );

    const unlinked = dbUsers.filter((u) => !u.firebaseUid);
    const danglingDb = dbUsers.filter(
        (u) => u.firebaseUid && !fbByUid.has(u.firebaseUid)
    );
    const orphanFirebase = fbUsers.filter((u) => !dbUids.has(u.uid));
    const emailMismatch = dbUsers.filter((u) => {
        const fb = u.firebaseUid ? fbByUid.get(u.firebaseUid) : undefined;
        return fb && fb.email && fb.email.toLowerCase() !== u.email.toLowerCase();
    });

    const section = (title: string, rows: string[], hint: string) => {
        console.log(`\n${title}: ${rows.length}`);
        rows.slice(0, 50).forEach((r) => console.log(`  - ${r}`));
        if (rows.length > 50) console.log(`  ... and ${rows.length - 50} more`);
        if (rows.length) console.log(`  -> ${hint}`);
    };

    console.log(
        `Database users: ${dbUsers.length}   Firebase users: ${fbUsers.length}`
    );

    section(
        'DB users NOT linked to Firebase (cannot log in yet)',
        unlinked.map((u) => `${u.email} (${u.role})`),
        'Run: npm run users:import-firebase -- --apply'
    );
    section(
        'DB users whose Firebase login no longer exists (orphaned DB rows)',
        danglingDb.map((u) => `${u.email} (${u.role}) uid=${u.firebaseUid}`),
        'Delete the row from the admin panel, or re-create the Firebase user with that uid.'
    );
    section(
        'Firebase users with NO database profile (orphaned logins)',
        orphanFirebase.map((u) => `${u.email ?? '(no email)'} uid=${u.uid}`),
        'Harmless: the profile is auto-created at their next login. Delete in the Firebase console if unwanted.'
    );
    section(
        'E-mail differs between database and Firebase',
        emailMismatch.map((u) => `${u.email} (db) vs ${fbByUid.get(u.firebaseUid!)?.email} (firebase)`),
        'Fix manually - the two must match.'
    );

    const bad =
        unlinked.length + danglingDb.length + emailMismatch.length;
    console.log(bad ? '\nResult: action needed.' : '\nResult: no problems found.');
    if (bad) process.exitCode = 1;
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
