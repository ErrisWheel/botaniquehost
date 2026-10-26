import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import {
    firebaseAuth,
    setFirebaseAccountDisabled
} from '../services/firebase.js';
import { audit } from '../utils/audit.js';
import { notify } from '../services/notifications.js';
import { httpError } from '../utils/httpError.js';
import {
    ORDER_STATUSES,
    PAYMENT_METHODS,
    PAYMENT_STATUSES,
    allowedNextStatuses,
    isRefundDue
} from '../services/orderStatus.js';
import {
    applyAdminStatusChange,
    markRefunded
} from '../services/adminOrders.js';
import {
    ELIGIBLE_REVENUE_WHERE,
    getDashboardStats
} from '../services/adminStats.js';
import { stockState } from '../services/inventory.js';
import {
    assertAccountChangeAllowed,
    deleteAccountRow,
    updateAccount
} from '../services/accounts.js';

const r = Router();

// EVERY route below needs a verified Firebase ID token AND an ADMIN role read
// from the database on this request (never from the client or the token).
r.use(auth, admin);

/** The shop trades in Philippine time; date filters are whole local days. */
const SHOP_TZ = '+08:00';

const dateStr = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00${SHOP_TZ}`).getTime()), {
        message: 'Invalid date'
    });

const startOfDay = (d: string) => new Date(`${d}T00:00:00.000${SHOP_TZ}`);
const startOfNextDay = (d: string) =>
    new Date(startOfDay(d).getTime() + 24 * 60 * 60 * 1000);

const paging = {
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
};

const likeText = z.string().trim().max(100).optional();

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

r.get('/dashboard', async (_req, res, next) => {
    try {
        res.json(await getDashboardStats(prisma));
    } catch (e) {
        next(e);
    }
});

/* ------------------------------------------------------------------ */
/* Orders                                                             */
/* ------------------------------------------------------------------ */

const ordersQuery = z.object({
    q: likeText,
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    from: dateStr.optional(),
    to: dateStr.optional(),
    ...paging
});

const withOrderFlags = <T extends { status: string; paymentStatus: string; paymentMethod?: string }>(
    o: T
) => ({
    ...o,
    allowedStatuses: allowedNextStatuses(o as any),
    refundDue: isRefundDue(o)
});

r.get('/orders', async (req, res, next) => {
    try {
        const f = ordersQuery.parse(req.query);

        const where: any = {};
        if (f.status) where.status = f.status;
        if (f.paymentStatus) where.paymentStatus = f.paymentStatus;
        if (f.paymentMethod) where.paymentMethod = f.paymentMethod;

        if (f.from || f.to)
            where.createdAt = {
                ...(f.from ? { gte: startOfDay(f.from) } : {}),
                ...(f.to ? { lt: startOfNextDay(f.to) } : {})
            };

        if (f.q)
            where.OR = [
                { orderNumber: { contains: f.q, mode: 'insensitive' } },
                { user: { fullName: { contains: f.q, mode: 'insensitive' } } },
                { user: { email: { contains: f.q, mode: 'insensitive' } } }
            ];

        const [items, total] = await Promise.all([
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (f.page - 1) * f.limit,
                take: f.limit,
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    paymentMethod: true,
                    paymentStatus: true,
                    total: true,
                    createdAt: true,
                    customerJson: true,
                    user: { select: { id: true, fullName: true, email: true } },
                    _count: { select: { items: true } }
                }
            }),
            prisma.order.count({ where })
        ]);

        res.json({
            items: items.map(withOrderFlags),
            total,
            page: f.page,
            limit: f.limit
        });
    } catch (e) {
        next(e);
    }
});

r.get('/orders/:id', async (req, res, next) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: {
                items: true,
                returns: true,
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        phone: true
                    }
                },
                // Only status/time: the raw payload is the provider's data.
                paymentEvents: {
                    select: {
                        id: true,
                        provider: true,
                        status: true,
                        createdAt: true
                    },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        if (!order) throw httpError(404, 'Order not found', 'NOT_FOUND');

        const activity = await prisma.auditLog.findMany({
            where: { entity: 'Order', entityId: order.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
                id: true,
                action: true,
                metadata: true,
                createdAt: true,
                user: { select: { fullName: true, email: true } }
            }
        });

        res.json({ ...withOrderFlags(order), activity });
    } catch (e) {
        next(e);
    }
});

r.patch('/orders/:id/status', async (req: any, res, next) => {
    try {
        const b = z.object({ status: z.enum(ORDER_STATUSES) }).strict().parse(req.body);

        res.json(
            await applyAdminStatusChange(
                prisma,
                req.user.id,
                String(req.params.id),
                b.status
            )
        );
    } catch (e) {
        next(e);
    }
});

/** Administrator confirms the refund of a cancelled, paid order was sent. */
r.post('/orders/:id/refunded', async (req: any, res, next) => {
    try {
        const out = await markRefunded(prisma, req.user.id, String(req.params.id));

        if (!out.ok) {
            if (out.reason === 'NOT_FOUND')
                throw httpError(404, 'Order not found', 'NOT_FOUND');
            throw httpError(
                409,
                'Only a cancelled order that was paid can be marked as refunded.',
                'NOT_REFUNDABLE'
            );
        }

        const order = await prisma.order.findUnique({
            where: { id: String(req.params.id) },
            select: {
                userId: true,
                orderNumber: true,
                total: true
            }
        });

        if (order?.userId) {
            await notify(
                order.userId,
                'Refund confirmed',
                `The refund of ₱${order.total.toLocaleString('en-PH')} for order ${order.orderNumber} has been marked as processed by Botanique. Your payment provider may take additional time to reflect the funds.`,
                'PAYMENT'
            ).catch((e) => console.error('[notify] refund notification failed:', e));
        }

        res.json({ message: 'Order marked as refunded' });
    } catch (e) {
        next(e);
    }
});

/* ------------------------------------------------------------------ */
/* Products / inventory                                               */
/* ------------------------------------------------------------------ */

const productsQuery = z.object({
    q: likeText,
    stock: z.enum(['all', 'in', 'low', 'out', 'inactive']).default('all'),
    category: z.string().trim().max(80).optional(),
    sort: z.enum(['name', 'stock_asc', 'stock_desc', 'price_asc', 'price_desc', 'newest']).default('name'),
    ...paging
});

/** Lean admin list incl. INACTIVE products (the public API hides those). */
r.get('/products', async (req, res, next) => {
    try {
        const f = productsQuery.parse(req.query);

        const where: any = {};
        if (f.q)
            where.OR = [
                { name: { contains: f.q, mode: 'insensitive' } },
                { slug: { contains: f.q, mode: 'insensitive' } },
                { scientific: { contains: f.q, mode: 'insensitive' } }
            ];
        if (f.category) where.category = { slug: f.category };

        const rows = await prisma.product.findMany({
            where,
            take: 5000,
            select: {
                id: true,
                slug: true,
                name: true,
                scientific: true,
                subcategory: true,
                categoryId: true,
                price: true,
                image: true,
                status: true,
                stock: true,
                lowStockThreshold: true,
                description: true,
                updatedAt: true,
                createdAt: true,
                category: { select: { id: true, name: true, slug: true } },
                _count: { select: { orderItems: true } }
            }
        });

        const classified = rows.map((p: any) => ({
            ...p,
            stockState: p.status === 'INACTIVE' ? 'INACTIVE' : stockState(p),
            orderLines: p._count.orderItems,
            _count: undefined
        }));

        const wanted: Record<string, string | null> = {
            all: null,
            in: 'IN_STOCK',
            low: 'LOW_STOCK',
            out: 'OUT_OF_STOCK',
            inactive: 'INACTIVE'
        };
        const filtered = wanted[f.stock]
            ? classified.filter((p: any) => p.stockState === wanted[f.stock])
            : classified;

        const sorters: Record<string, (a: any, b: any) => number> = {
            name: (a, b) => a.name.localeCompare(b.name),
            stock_asc: (a, b) => a.stock - b.stock,
            stock_desc: (a, b) => b.stock - a.stock,
            price_asc: (a, b) => a.price - b.price,
            price_desc: (a, b) => b.price - a.price,
            newest: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
        };
        filtered.sort(sorters[f.sort]);

        res.json({
            items: filtered.slice((f.page - 1) * f.limit, f.page * f.limit),
            total: filtered.length,
            page: f.page,
            limit: f.limit
        });
    } catch (e) {
        next(e);
    }
});

r.get('/categories', async (_req, res, next) => {
    try {
        res.json(
            await prisma.category.findMany({
                select: { id: true, name: true, slug: true },
                orderBy: { name: 'asc' }
            })
        );
    } catch (e) {
        next(e);
    }
});

/* ------------------------------------------------------------------ */
/* Accounts                                                           */
/* ------------------------------------------------------------------ */

const ACCOUNT_SELECT = {
    id: true,
    email: true,
    fullName: true,
    phone: true,
    role: true,
    isSuspended: true,
    createdAt: true,
    _count: { select: { orders: true } }
} as const;

const usersQuery = z.object({
    q: likeText,
    role: z.enum(['CUSTOMER', 'ADMIN']).optional(),
    suspended: z.enum(['true', 'false']).optional(),
    ...paging,
    limit: z.coerce.number().int().min(1).max(100).default(25)
});

r.get('/users', async (req, res, next) => {
    try {
        const f = usersQuery.parse(req.query);

        const where: any = {};
        if (f.role) where.role = f.role;
        if (f.suspended) where.isSuspended = f.suspended === 'true';
        if (f.q)
            where.OR = [
                { fullName: { contains: f.q, mode: 'insensitive' } },
                { email: { contains: f.q, mode: 'insensitive' } }
            ];

        const [rows, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: ACCOUNT_SELECT,
                orderBy: { createdAt: 'desc' },
                skip: (f.page - 1) * f.limit,
                take: f.limit
            }),
            prisma.user.count({ where })
        ]);

        res.json({
            items: rows.map(({ _count, ...u }: any) => ({
                ...u,
                orderCount: _count.orders
            })),
            total,
            page: f.page,
            limit: f.limit
        });
    } catch (e) {
        next(e);
    }
});

const accountPatch = z
    .object({
        fullName: z.string().trim().min(2).max(120).optional(),
        phone: z.string().trim().max(40).optional(),
        isSuspended: z.boolean().optional(),
        role: z.enum(['CUSTOMER', 'ADMIN']).optional()
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

r.patch('/users/:id', async (req: any, res, next) => {
    try {
        const b = accountPatch.parse(req.body);

        // Every rule (no self role-change/suspend, last active admin kept) is
        // enforced inside one Serializable transaction.
        const { before, after } = await updateAccount(
            prisma,
            req.user.id,
            String(req.params.id),
            b
        );

        let firebase: 'ok' | 'skipped' | 'failed' | undefined;
        if (b.isSuspended !== undefined && b.isSuspended !== before.isSuspended)
            firebase = await setFirebaseAccountDisabled(
                after.firebaseUid,
                b.isSuspended
            );

        await audit(req.user.id, 'UPDATE', 'User', after.id, {
            ...b,
            previousRole: before.role,
            previousSuspended: before.isSuspended,
            firebase
        });

        const { firebaseUid: _uid, ...safe } = after;
        res.json(safe);
    } catch (e) {
        next(e);
    }
});

const accountCreate = z
    .object({
        email: z.string().trim().toLowerCase().email().max(254),
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(40).optional(),
        role: z.enum(['CUSTOMER', 'ADMIN']).default('CUSTOMER')
    })
    .strict();

/**
 * Creates a Firebase login with a random password nobody ever sees plus the
 * matching database row. The new user sets their own password through
 * "Forgot password" on the login page (a reset e-mail is the invitation).
 * Passwords are never accepted, stored, logged or returned here.
 */
async function createAccount(req: any, res: any, next: any, forceRole?: 'ADMIN') {
    try {
        const b = accountCreate.parse(req.body);
        const role = forceRole ?? b.role;

        if (await prisma.user.findUnique({ where: { email: b.email } }))
            throw httpError(409, 'Email already registered', 'ALREADY_EXISTS');

        const fb = firebaseAuth();
        let fbUser;
        try {
            fbUser = await fb.createUser({
                email: b.email,
                password: randomBytes(24).toString('base64url'),
                displayName: b.fullName,
                emailVerified: false
            });
        } catch (err: any) {
            if (err?.code === 'auth/email-already-exists')
                fbUser = await fb.getUserByEmail(b.email);
            else throw err;
        }

        const u = await prisma.user.create({
            data: {
                email: b.email,
                firebaseUid: fbUser.uid,
                passwordHash: null,
                fullName: b.fullName,
                phone: b.phone,
                role
            },
            select: { id: true, email: true, fullName: true, role: true }
        });

        await audit(req.user.id, 'CREATE', 'User', u.id, { role });

        res.status(201).json({
            ...u,
            needsPasswordSetup: true,
            message:
                'Account created. Ask them to use "Forgot password" on the login page to set their own password.'
        });
    } catch (e) {
        next(e);
    }
}

r.post('/users', (req, res, next) => createAccount(req, res, next));
// Kept for older clients; always creates an ADMIN, never accepts a password.
r.post('/admins', (req, res, next) => createAccount(req, res, next, 'ADMIN'));

r.delete('/users/:id', async (req: any, res, next) => {
    try {
        const id = String(req.params.id);

        // 1) Rules first (self-delete, last admin) so a refused request never
        //    touches Firebase.
        const target = await assertAccountChangeAllowed(prisma, req.user.id, id, {
            delete: true
        });

        // 2) Firebase login. If this fails we stop and nothing is orphaned; a
        //    login that is already gone counts as success.
        if (target.firebaseUid) {
            try {
                await firebaseAuth().deleteUser(target.firebaseUid);
            } catch (err: any) {
                if (err?.code !== 'auth/user-not-found') throw err;
            }
        }

        // 3) Database row (rules re-checked in a Serializable transaction).
        //    Orders keep existing: their user link becomes NULL and the
        //    customer/delivery snapshot stays on the order.
        await deleteAccountRow(prisma, req.user.id, id);

        await audit(req.user.id, 'DELETE', 'User', id);

        res.json({ message: 'User deleted' });
    } catch (e) {
        next(e);
    }
});

/* ------------------------------------------------------------------ */
/* Analytics / activity                                               */
/* ------------------------------------------------------------------ */

const salesQuery = z.object({
    from: dateStr.optional(),
    to: dateStr.optional()
});

r.get('/analytics/sales', async (req, res, next) => {
    try {
        const f = salesQuery.parse(req.query);

        // Default window: last 30 days, never more than a year.
        const end = f.to ? startOfNextDay(f.to) : new Date(Date.now() + 1);
        const start = f.from
            ? startOfDay(f.from)
            : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000)
            throw httpError(400, 'Choose a range of at most one year.', 'RANGE_TOO_LARGE');

        const orders = await prisma.order.findMany({
            where: {
                ...ELIGIBLE_REVENUE_WHERE,
                createdAt: { gte: start, lt: end }
            },
            select: {
                createdAt: true,
                total: true,
                items: {
                    select: { productName: true, lineTotal: true }
                }
            }
        });

        const byDay: Record<string, number> = {};
        const products: Record<string, number> = {};

        for (const o of orders) {
            const d = o.createdAt.toISOString().slice(0, 10);
            byDay[d] = (byDay[d] || 0) + o.total;
            for (const i of o.items)
                products[i.productName] = (products[i.productName] || 0) + i.lineTotal;
        }

        res.json({
            from: start.toISOString(),
            to: end.toISOString(),
            byDay,
            products,
            orderCount: orders.length
        });
    } catch (e) {
        next(e);
    }
});

r.get('/activity', async (req, res, next) => {
    try {
        const q = z
            .object({
                entity: z.string().trim().max(40).optional(),
                entityId: z.string().trim().max(80).optional(),
                ...paging,
                limit: z.coerce.number().int().min(1).max(100).default(30)
            })
            .parse(req.query);

        const where: any = {};
        if (q.entity) where.entity = q.entity;
        if (q.entityId) where.entityId = q.entityId;

        const [items, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (q.page - 1) * q.limit,
                take: q.limit,
                select: {
                    id: true,
                    action: true,
                    entity: true,
                    entityId: true,
                    metadata: true,
                    createdAt: true,
                    user: { select: { email: true, fullName: true } }
                }
            }),
            prisma.auditLog.count({ where })
        ]);

        res.json({ items, total, page: q.page, limit: q.limit });
    } catch (e) {
        next(e);
    }
});

// Original endpoint (newest 500 entries) kept for compatibility.
r.get('/audit', async (_req, res, next) => {
    try {
        res.json(
            await prisma.auditLog.findMany({
                include: {
                    user: { select: { email: true, fullName: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: 500
            })
        );
    } catch (e) {
        next(e);
    }
});

export default r;
