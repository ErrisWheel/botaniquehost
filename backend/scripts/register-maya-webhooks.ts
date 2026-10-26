/**
 * Registers (or updates) the Maya webhooks for this backend through Maya's
 * "Create/Update Webhook" API, so you do not have to click through Maya
 * Manager. Requires MAYA_SECRET_KEY, MAYA_WEBHOOK_SECRET and a PUBLIC HTTPS
 * BACKEND_PUBLIC_URL (Maya cannot call localhost - use a deployed URL or a
 * tunnel such as ngrok / cloudflared for local testing).
 *
 *   npm run maya:webhooks
 */
import { env, mayaConfigured } from '../src/config.js';
import { createWebhook, listWebhooks, updateWebhook } from '../src/services/maya.js';

const EVENTS = [
    'PAYMENT_SUCCESS',
    'PAYMENT_FAILED',
    'PAYMENT_EXPIRED',
    'PAYMENT_CANCELLED'
];

async function main() {
    if (!mayaConfigured) throw new Error('Set MAYA_PUBLIC_KEY and MAYA_SECRET_KEY first.');
    if (!env.MAYA_WEBHOOK_SECRET) throw new Error('Set MAYA_WEBHOOK_SECRET first (any long random string).');
    if (!env.BACKEND_PUBLIC_URL?.startsWith('https://'))
        throw new Error('BACKEND_PUBLIC_URL must be a public https:// URL.');

    const callbackUrl = `${env.BACKEND_PUBLIC_URL.replace(/\/+$/, '')}/api/payments/maya/webhook/${env.MAYA_WEBHOOK_SECRET}`;
    const shown = callbackUrl.replace(env.MAYA_WEBHOOK_SECRET, '****');

    const existing = await listWebhooks();

    for (const name of EVENTS) {
        const current = existing.find((w) => w.name === name);
        if (!current) {
            await createWebhook(name, callbackUrl);
            console.log(`created  ${name} -> ${shown}`);
        } else if (current.callbackUrl !== callbackUrl) {
            await updateWebhook(current.id, name, callbackUrl);
            console.log(`updated  ${name} -> ${shown}`);
        } else {
            console.log(`ok       ${name} (already registered)`);
        }
    }
}

main().catch((e) => {
    console.error(e?.message ?? e, e?.body ? JSON.stringify(e.body) : '');
    process.exitCode = 1;
});
