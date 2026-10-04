import {
    cert,
    getApps,
    initializeApp,
    type App
} from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { env, firebaseConfigured } from '../config.js';

let app: App | undefined;

function getApp(): App {
    if (!firebaseConfigured)
        throw Object.assign(
            new Error(
                'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.'
            ),
            { statusCode: 503 }
        );

    if (app) return app;

    app =
        getApps()[0] ??
        initializeApp({
            credential: cert({
                projectId: env.FIREBASE_PROJECT_ID!,
                clientEmail: env.FIREBASE_CLIENT_EMAIL!,
                // .env / hosting dashboards store the key on one line with
                // literal \n sequences.
                privateKey: env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
            })
        });

    return app;
}

export const firebaseAuth = () => getAuth(getApp());

/**
 * Verifies a Firebase ID token's signature, expiry, audience and issuer with
 * the Firebase Admin SDK. `checkRevoked = true` additionally asks Firebase
 * whether the user still exists and is enabled and whether their sessions
 * were revoked, so a deleted/disabled account's still-unexpired token (up to
 * 1 hour) is rejected immediately. Throws if the token is invalid.
 */
export async function verifyFirebaseIdToken(
    idToken: string
): Promise<DecodedIdToken> {
    return firebaseAuth().verifyIdToken(idToken, true);
}
