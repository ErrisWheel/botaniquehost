/**
 * One-time migration of EXISTING Botanique users into Firebase Authentication,
 * keeping their current passwords.
 *
 * Old rows hold bcrypt hashes, which Firebase can import natively (BCRYPT), so
 * customers keep logging in with the password they already have. Each user's
 * database id is used as the Firebase uid, which makes this safe to re-run.
 *
 *   npm run users:import-firebase            # dry run (changes nothing)
 *   npm run users:import-firebase -- --apply # actually import + link
 *
 * Users whose e-mail already exists in Firebase under a different uid are
 * reported and left untouched (resolve manually with `npm run accounts:audit`).
 */
import { prisma } from '../src/db.js';
import { firebaseAuth } from '../src/services/firebase.js';

const apply = process.argv.includes('--apply');
const BATCH = 500; // Firebase limit is 1000 per call

async function main() {
    const users = await prisma.user.findMany({
        where: { firebaseUid: null },
        orderBy: { createdAt: 'asc' }
    });

    const withPw = users.filter((u) => u.passwordHash).length;
    console.log(
        `${users.length} user(s) are not linked to Firebase yet (${withPw} with a password hash, ${users.length - withPw} without).`
    );

    if (!apply) {
        console.log('Dry run - nothing changed. Re-run with --apply to import.');
        return;
    }

    const auth = firebaseAuth();
    let linked = 0;
    const problems: string[] = [];

    for (let i = 0; i < users.length; i += BATCH) {
        const chunk = users.slice(i, i + BATCH);

        const result = await auth.importUsers(
            chunk.map((u) => ({
                uid: u.id,
                email: u.email,
                displayName: u.fullName,
                // Not asserting verification: we link by uid below, so the
                // e-mail-verified rule used for self-service linking is moot.
                emailVerified: false,
                passwordHash: u.passwordHash
                    ? Buffer.from(u.passwordHash)
                    : undefined
            })),
            { hash: { algorithm: 'BCRYPT' } }
        );

        const failed = new Set(result.errors.map((e) => e.index));
        result.errors.forEach((e) =>
            problems.push(`${chunk[e.index].email}: ${e.error.message}`)
        );

        for (let j = 0; j < chunk.length; j++) {
            if (failed.has(j)) continue;
            await prisma.user.update({
                where: { id: chunk[j].id },
                data: { firebaseUid: chunk[j].id }
            });
            linked++;
        }
    }

    console.log(`Imported and linked ${linked} user(s).`);
    if (problems.length) {
        console.log(`${problems.length} user(s) need manual attention:`);
        problems.forEach((p) => console.log(`  - ${p}`));
        process.exitCode = 1;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
