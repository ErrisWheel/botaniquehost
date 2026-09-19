import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { hashPassword } from '../utils/auth.js';
import { audit } from '../utils/audit.js';

const r = Router();

r.use(auth, admin);

r.get('/dashboard', async (req, res) => {
    const [orders, revenue, customers, products, lowStock] =
        await Promise.all([
            prisma.order.count(),
            prisma.order.aggregate({
                where: { paymentStatus: 'PAID' },
                _sum: { total: true }
            }),
            prisma.user.count({
                where: { role: 'CUSTOMER' }
            }),
            prisma.product.count(),
            prisma.product.count({
                where: { stock: { lte: 5 } }
            })
        ]);

    res.json({
        orders,
        revenue: revenue._sum.total || 0,
        customers,
        products,
        lowStock
    });
});

r.get('/users', async (req, res) =>
    res.json(
        await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                role: true,
                isSuspended: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        })
    )
);

r.patch('/users/:id', async (req, res, next) => {
    try {
        const b = z
            .object({
                fullName: z.string().optional(),
                phone: z.string().optional(),
                isSuspended: z.boolean().optional(),
                role: z.enum(['CUSTOMER', 'ADMIN']).optional()
            })
            .parse(req.body);

        const u = await prisma.user.update({
            where: { id: req.params.id },
            data: b,
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                role: true,
                isSuspended: true
            }
        });

        await audit(
            (req as any).user.id,
            'UPDATE',
            'User',
            u.id,
            b
        );

        res.json(u);
    } catch (e) {
        next(e);
    }
});

r.delete('/users/:id', async (req, res) => {
    await prisma.user.delete({
        where: { id: req.params.id }
    });

    res.json({ message: 'User deleted' });
});

r.post('/admins', async (req, res, next) => {
    try {
        const b = z
            .object({
                email: z.string().email(),
                password: z.string().min(8),
                fullName: z.string().min(2),
                phone: z.string().optional()
            })
            .parse(req.body);

        const u = await prisma.user.create({
            data: {
                email: b.email.toLowerCase(),
                passwordHash: await hashPassword(b.password),
                fullName: b.fullName,
                phone: b.phone,
                role: 'ADMIN'
            }
        });

        res.status(201).json({
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            role: u.role
        });
    } catch (e) {
        next(e);
    }
});

r.get('/analytics/sales', async (req, res) => {
    const orders = await prisma.order.findMany({
        where: { paymentStatus: 'PAID' },
        select: {
            createdAt: true,
            total: true,
            items: {
                select: {
                    productId: true,
                    productName: true,
                    quantity: true,
                    lineTotal: true
                }
            }
        }
    });

    const byDay: any = {};
    const products: any = {};

    for (const o of orders) {
        const d = o.createdAt.toISOString().slice(0, 10);

        byDay[d] = (byDay[d] || 0) + o.total;

        for (const i of o.items) {
            products[i.productName] =
                (products[i.productName] || 0) + i.lineTotal;
        }
    }

    res.json({
        byDay,
        products,
        orderCount: orders.length
    });
});

r.get('/audit', async (req, res) =>
    res.json(
        await prisma.auditLog.findMany({
            include: {
                user: {
                    select: {
                        email: true,
                        fullName: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 500
        })
    )
);

export default r;
