import { env } from '../config.js';
import { prisma } from '../db.js';
import { sendEmailJs } from './emailjs.js';

/**
 * Creates the in-app notification and, when an EmailJS notification template
 * is configured, also e-mails it. E-mail problems are logged and swallowed:
 * a notification failure must never break the request that triggered it.
 *
 * (Order confirmations use services/orderEmail.ts instead.)
 */
export async function notify(
    userId: string | undefined,
    title: string,
    message: string,
    type = 'SYSTEM'
) {
    if (!userId) return;

    await prisma.notification.create({
        data: {
            userId,
            title,
            message,
            type
        }
    });

    const templateId = env.EMAILJS_NOTIFICATION_TEMPLATE_ID;
    if (
        !templateId ||
        !env.EMAILJS_PUBLIC_KEY ||
        !env.EMAILJS_PRIVATE_KEY ||
        !env.EMAILJS_SERVICE_ID
    )
        return;

    try {
        const u = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, fullName: true }
        });

        if (u)
            await sendEmailJs(templateId, {
                customer_email: u.email,
                customer_name: u.fullName,
                notification_title: title,
                notification_message: message
            });
    } catch (e: any) {
        console.error(
            `[email] Notification e-mail failed: ${e?.message ?? e}`
        );
    }
}
