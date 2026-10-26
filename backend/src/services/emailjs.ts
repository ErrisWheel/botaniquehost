import { env, emailJsConfigured } from '../config.js';

const SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const TIMEOUT_MS = 10_000;

export class EmailJsError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
        public readonly providerMessage?: string
    ) {
        super(message);
        this.name = 'EmailJsError';
    }
}

/** Keep useful provider diagnostics while stripping addresses and key-like values. */
function sanitizeProviderMessage(value: string): string {
    return value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/(accessToken|private key|public key|user_id|service_id|template_id)\s*[:=]\s*[^,\s"']+/gi, '$1=[redacted]')
        .replace(/\b[A-Za-z0-9_-]{36,}\b/g, '[redacted]')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 220);
}

/**
 * Sends one e-mail through EmailJS' REST API from the SERVER, so the private
 * key (accessToken) never reaches a browser.
 *
 * Requires "Allow EmailJS API for non-browser applications" to be enabled in
 * the EmailJS dashboard (Account -> Security).
 * Docs: https://www.emailjs.com/docs/rest-api/send/  (limit: 1 request/second)
 */
export async function sendEmailJs(
    templateId: string,
    templateParams: Record<string, string>
): Promise<void> {
    if (!env.EMAILJS_PUBLIC_KEY || !env.EMAILJS_PRIVATE_KEY || !env.EMAILJS_SERVICE_ID)
        throw new EmailJsError('EmailJS is not configured');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(SEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: env.EMAILJS_SERVICE_ID,
                template_id: templateId,
                user_id: env.EMAILJS_PUBLIC_KEY,
                accessToken: env.EMAILJS_PRIVATE_KEY,
                template_params: templateParams
            }),
            signal: ctrl.signal
        });

        if (!res.ok) {
            const text = sanitizeProviderMessage(await res.text().catch(() => ''));
            throw new EmailJsError(
                `EmailJS rejected the request (HTTP ${res.status})`,
                res.status,
                text || undefined
            );
        }
    } catch (e: any) {
        if (e instanceof EmailJsError) throw e;
        if (e?.name === 'AbortError')
            throw new EmailJsError('EmailJS request timed out');
        throw new EmailJsError(
            `EmailJS request failed: ${e?.message ?? e}`
        );
    } finally {
        clearTimeout(timer);
    }
}

export { emailJsConfigured };
