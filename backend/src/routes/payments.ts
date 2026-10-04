import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';
import { env, mayaConfigured } from '../config.js';
import {
    createMayaCheckoutForOrder,
    reconcileMayaOrder
} from '../services/orderPayments.js';

const r = Router();

/** Maya's published webhook source addresses. */
const MAYA_IPS = {
    sandbox: ['13.229.160.234', '3.1.199.75'],
    production: ['18.138.50.235', '3.1.207.200']
} as const;

const safeEqual = (a: string, b: string) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/* ---------------------------------------------------------------- */
/* Start a Maya payment for one of the caller's own orders           */
/* ---------------------------------------------------------------- */
r.post('/maya/checkout', auth, async (req: any, res, next) => {
    try {
        const { orderId } = z
            .object({ orderId: z.string().min(1) })
            .parse(req.body);

        const out = await createMayaCheckoutForOrder(orderId, req.user.id);
        res.json({ redirectUrl: out.redirectUrl, reused: out.reused });
    } catch (e) {
        next(e);
    }
});

/* ---------------------------------------------------------------- */
/* Payment result for the customer's own order. Verifies with Maya.  */
/* ---------------------------------------------------------------- */
const lastCheck = new Map<string, number>();

r.get('/maya/status/:orderId', auth, async (req: any, res, next) => {
    try {
        const order = await prisma.order.findFirst({
            where: { id: req.params.orderId, userId: req.user.id },
            select: { id: true }
        });
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Light throttle so a polling page cannot hammer Maya.
        const last = lastCheck.get(order.id) ?? 0;
        if (Date.now() - last < 2000)
            await new Promise((ok) => setTimeout(ok, 2000 - (Date.now() - last)));
        lastCheck.set(order.id, Date.now());
        if (lastCheck.size > 5000) lastCheck.clear();

        let result;
        try {
            result = await reconcileMayaOrder(order.id);
        } catch (e) {
            console.error('[maya] status check failed:', e);
            // Maya unreachable: report what we already know, never "paid".
            const o = await prisma.order.findUniqueOrThrow({
                where: { id: order.id },
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    paymentStatus: true,
                    total: true,
                    paidAt: true
                }
            });
            return res.json({
                orderId: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                paymentStatus: o.paymentStatus,
                total: o.total,
                paidAt: o.paidAt,
                verified: false
            });
        }

        res.json({ ...result, verified: true });
    } catch (e) {
        next(e);
    }
});

/* ---------------------------------------------------------------- */
/* Maya webhook                                                      */
/*                                                                   */
/* Maya does not sign webhooks. Defence in depth:                    */
/*  1. unguessable secret in the URL path,                           */
/*  2. optional source-IP allow-list,                                */
/*  3. MOST IMPORTANT: the body is never trusted. We only read the   */
/*     reference number from it, then ask Maya directly (secret key) */
/*     what really happened. A forged webhook cannot mark an order   */
/*     as paid.                                                      */
/* Duplicates/retries are harmless: see PaymentEvent + atomic        */
/* updates in services/orderPayments.ts.                             */
/* ---------------------------------------------------------------- */
r.post('/maya/webhook/:secret', async (req, res) => {
    if (!mayaConfigured || !env.MAYA_WEBHOOK_SECRET)
        return res.status(503).json({ message: 'Not configured' });

    if (!safeEqual(String(req.params.secret), env.MAYA_WEBHOOK_SECRET))
        return res.status(404).end();

    if (env.MAYA_WEBHOOK_ENFORCE_IP) {
        const ip = (req.ip || '').replace(/^::ffff:/, '');
        if (!(MAYA_IPS[env.MAYA_ENV] as readonly string[]).includes(ip)) {
            console.warn(`[maya] webhook rejected from IP ${ip}`);
            return res.status(403).end();
        }
    }

    const rrn = (req.body as any)?.requestReferenceNumber;
    if (typeof rrn !== 'string' || !rrn || rrn.length > 64)
        return res.status(400).json({ message: 'Missing reference' });

    // Acknowledge immediately (Maya expects a 2xx within 5 seconds), then
    // verify and apply. Failures are recovered by the status endpoint and
    // the background sweeper.
    res.status(200).json({ received: true });

    try {
        const order = await prisma.order.findUnique({
            where: { orderNumber: rrn },
            select: { id: true }
        });

        if (!order) {
            console.warn(`[maya] webhook for unknown reference ${rrn}`);
            return;
        }

        await reconcileMayaOrder(order.id);
    } catch (e) {
        console.error('[maya] webhook processing failed:', e);
    }
});

export default r;
