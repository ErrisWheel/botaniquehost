import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';
import { env } from '../config.js';
import { notify } from '../services/notifications.js';

const r = Router();

const stripe = env.STRIPE_SECRET_KEY
    ? new Stripe(env.STRIPE_SECRET_KEY)
    : null;

r.post('/create-intent', auth, async (req: any, res, next) => {
    try {
        if (!stripe)
            return res.status(503).json({
                message:
                    'Stripe is not configured. Use COD or configure STRIPE_SECRET_KEY.'
            });

        const b = z
            .object({
                orderId: z.string()
            })
            .parse(req.body);

        const o = await prisma.order.findFirst({
            where: {
                id: b.orderId,
                userId: req.user.id
            }
        });

        if (!o)
            return res
                .status(404)
                .json({ message: 'Order not found' });

        const intent = await stripe.paymentIntents.create({
            amount: o.total * 100,
            currency: o.currency.toLowerCase(),
            metadata: {
                orderId: o.id,
                orderNumber: o.orderNumber
            }
        });

        await prisma.order.update({
            where: { id: o.id },
            data: {
                paymentIntentId: intent.id
            }
        });

        res.json({
            clientSecret: intent.client_secret,
            paymentIntentId: intent.id
        });
    } catch (e) {
        next(e);
    }
});

r.post('/webhook', async (req: any, res) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET)
        return res
            .status(503)
            .send('Stripe webhook not configured');

    try {
        const sig = req.headers['stripe-signature'];

        const event = stripe.webhooks.constructEvent(
            req.body,
            sig as string,
            env.STRIPE_WEBHOOK_SECRET
        );

        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object as Stripe.PaymentIntent;
            const id = pi.metadata.orderId;

            if (id) {
                const o = await prisma.order.update({
                    where: { id },
                    data: {
                        paymentStatus: 'PAID',
                        status: 'PROCESSING'
                    }
                });

                await notify(
                    o.userId || undefined,
                    'Payment received',
                    `Payment for ${o.orderNumber} was successful.`,
                    'PAYMENT'
                );
            }
        }

        if (event.type === 'payment_intent.payment_failed') {
            const pi = event.data.object as Stripe.PaymentIntent;

            if (pi.metadata.orderId)
                await prisma.order.update({
                    where: {
                        id: pi.metadata.orderId
                    },
                    data: {
                        paymentStatus: 'FAILED'
                    }
                });
        }

        res.json({ received: true });
    } catch (e) {
        console.error(e);
        res.status(400).send('Invalid webhook');
    }
});

export default r;
