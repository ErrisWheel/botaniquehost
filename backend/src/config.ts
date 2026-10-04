import 'dotenv/config';
import { z } from 'zod';

const optionalString = z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.string().default('development'),
    DATABASE_URL: z.string(),
    CORS_ORIGIN: z
        .string()
        .default('http://localhost:8100,http://localhost:4200'),
    UPLOAD_DIR: z.string().default('uploads'),

    /* ---------- Firebase Admin (verifies Firebase ID tokens) ---------- */
    FIREBASE_PROJECT_ID: optionalString,
    FIREBASE_CLIENT_EMAIL: optionalString,
    // Paste the service-account private key. Literal "\n" sequences are
    // converted to real newlines in services/firebase.ts.
    FIREBASE_PRIVATE_KEY: optionalString,

    /* ---------- Maya Checkout ---------- */
    MAYA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    MAYA_PUBLIC_KEY: optionalString,
    MAYA_SECRET_KEY: optionalString,
    // Optional override; defaults are derived from MAYA_ENV.
    MAYA_BASE_URL: optionalString,
    // Random string embedded in the webhook URL you register with Maya.
    // Maya does not sign webhooks, so this keeps strangers from spamming the
    // endpoint. (Payment status is ALWAYS re-verified with Maya regardless.)
    MAYA_WEBHOOK_SECRET: optionalString,
    // Set to "true" to also reject webhook calls that do not come from Maya's
    // published IP addresses (needs a correct TRUST_PROXY value).
    MAYA_WEBHOOK_ENFORCE_IP: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
    // Public base URL of THIS backend, e.g. https://api.example.com
    BACKEND_PUBLIC_URL: optionalString,
    // Public base URL of the Angular app, e.g. http://localhost:8100
    FRONTEND_URL: z.string().default('http://localhost:8100'),
    // Number of reverse proxies in front of the API (Render = 1).
    TRUST_PROXY: z.coerce.number().default(0),

    /* ---------- EmailJS (server-side REST API) ---------- */
    EMAILJS_PUBLIC_KEY: optionalString,
    EMAILJS_PRIVATE_KEY: optionalString,
    EMAILJS_SERVICE_ID: optionalString,
    EMAILJS_ORDER_TEMPLATE_ID: optionalString,
    // Optional generic template used for in-app notification e-mails.
    EMAILJS_NOTIFICATION_TEMPLATE_ID: optionalString,
    // Shown in the e-mail footer (optional).
    EMAILJS_SUPPORT_EMAIL: optionalString
});

export const env = schema.parse(process.env);

export const mayaBaseUrl =
    env.MAYA_BASE_URL ??
    (env.MAYA_ENV === 'production'
        ? 'https://pg.maya.ph'
        : 'https://pg-sandbox.paymaya.com');

export const firebaseConfigured = Boolean(
    env.FIREBASE_PROJECT_ID &&
        env.FIREBASE_CLIENT_EMAIL &&
        env.FIREBASE_PRIVATE_KEY
);

export const mayaConfigured = Boolean(
    env.MAYA_PUBLIC_KEY && env.MAYA_SECRET_KEY
);

export const emailJsConfigured = Boolean(
    env.EMAILJS_PUBLIC_KEY &&
        env.EMAILJS_PRIVATE_KEY &&
        env.EMAILJS_SERVICE_ID &&
        env.EMAILJS_ORDER_TEMPLATE_ID
);
