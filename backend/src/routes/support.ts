import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { notify } from '../services/notifications.js';
import { env } from '../config.js';
import { EmailJsError, sendEmailJs } from '../services/emailjs.js';

const r = Router();

r.post('/', (req, res, next) => {
    // Guests can send a message; signed-in submitters must have a valid token.
    if (req.headers.authorization?.startsWith('Bearer ')) return auth(req as any, res, next);
    next();
}, async (req: any, res, next) => {
    try {
        const b = z.object({
            name: z.string().trim().max(120).optional(),
            email: z.string().trim().email().max(254),
            phone: z.string().trim().max(40).optional(),
            subject: z.string().trim().min(3).max(150),
            message: z.string().trim().min(5).max(5000)
        }).parse(req.body);
        const senderName = b.name || 'Guest';
        const formattedMessage = `Name: ${senderName}\nEmail: ${b.email}\nPhone: ${b.phone || 'Not provided'}\n\n${b.message}`;
        const ticket = await prisma.supportTicket.create({
            data: { userId: req.user?.id || null, subject: b.subject, message: formattedMessage }
        });

        const mailReady = Boolean(env.EMAILJS_CONTACT_TEMPLATE_ID && env.EMAILJS_SUPPORT_EMAIL && env.EMAILJS_PUBLIC_KEY && env.EMAILJS_PRIVATE_KEY && env.EMAILJS_SERVICE_ID);
        if (!mailReady) {
            const missing: string[] = [
                { name: 'EMAILJS_CONTACT_TEMPLATE_ID', configured: Boolean(env.EMAILJS_CONTACT_TEMPLATE_ID) },
                { name: 'EMAILJS_SUPPORT_EMAIL', configured: Boolean(env.EMAILJS_SUPPORT_EMAIL) },
                { name: 'EMAILJS_PUBLIC_KEY', configured: Boolean(env.EMAILJS_PUBLIC_KEY) },
                { name: 'EMAILJS_PRIVATE_KEY', configured: Boolean(env.EMAILJS_PRIVATE_KEY) },
                { name: 'EMAILJS_SERVICE_ID', configured: Boolean(env.EMAILJS_SERVICE_ID) }
            ].filter((item) => !item.configured).map((item) => item.name);
            console.warn(`[contact] Ticket ${ticket.id} saved; e-mail notification not sent. Missing configuration: ${missing.join(', ') || 'unknown'}.`);
            return res.status(201).json({ ticket, emailSent: false, emailReason: 'not_configured' });
        }
        try {
            await sendEmailJs(env.EMAILJS_CONTACT_TEMPLATE_ID!, {
                to_email: env.EMAILJS_SUPPORT_EMAIL!, sender_name: senderName, sender_email: b.email,
                sender_phone: b.phone || 'Not provided', message_subject: b.subject, message_body: b.message,
                ticket_id: ticket.id,
                submitted_at: new Date(ticket.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
            });
            return res.status(201).json({ ticket, emailSent: true });
        } catch (error: any) {
            // Never log the sender's address, name, phone or message. Provider
            // messages are sanitized in emailjs.ts and can identify the actual
            // template/authentication failure without exposing customer data.
            const status = Number(error?.status) || 0;
            const diagnostic = error instanceof EmailJsError
                ? error.providerMessage || error.message
                : 'Unexpected e-mail notification error';
            console.error(`[contact] EmailJS delivery failed for ticket ${ticket.id}; status=${status || 'unknown'}; reason=${String(diagnostic).slice(0, 240)}.`);
            return res.status(201).json({ ticket, emailSent: false, emailReason: 'delivery_failed' });
        }
    } catch (e) { next(e); }
});

r.get('/', auth, async (req: any, res) =>
    res.json(await prisma.supportTicket.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } }))
);

r.get('/admin/all', auth, admin, async (_req, res, next) => {
    try {
        res.json(await prisma.supportTicket.findMany({
            include: { user: { select: { email: true, fullName: true } } }, orderBy: { createdAt: 'desc' }
        }));
    } catch (e) { next(e); }
});

r.patch('/admin/:id', auth, admin, async (req: any, res, next) => {
    try {
        const b = z.object({ status: z.string().optional(), priority: z.string().optional(), adminReply: z.string().optional() }).parse(req.body);
        const t = await prisma.supportTicket.update({ where: { id: req.params.id }, data: b });
        await notify(t.userId || undefined, 'Support ticket updated', t.adminReply || `Your ticket is now ${t.status}.`, 'SUPPORT');
        res.json(t);
    } catch (e) { next(e); }
});

export default r;
