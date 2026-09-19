import nodemailer from 'nodemailer';
import { env } from '../config.js';
import { prisma } from '../db.js';

export async function notify(
    userId: string | undefined,
    title: string,
    message: string,
    type = 'SYSTEM'
) {
    if (userId)
        await prisma.notification.create({
            data: {
                userId,
                title,
                message,
                type
            }
        });

    if (
        userId &&
        env.SMTP_HOST &&
        env.SMTP_USER &&
        env.SMTP_PASS
    ) {
        const u = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (u)
            await nodemailer
                .createTransport({
                    host: env.SMTP_HOST,
                    port: env.SMTP_PORT,
                    secure: env.SMTP_PORT === 465,
                    auth: {
                        user: env.SMTP_USER,
                        pass: env.SMTP_PASS
                    }
                })
                .sendMail({
                    from: env.SMTP_FROM,
                    to: u.email,
                    subject: title,
                    text: message
                });
    }
}
