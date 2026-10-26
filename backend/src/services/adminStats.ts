import { stockState, type StockState } from './inventory.js';

/**
 * Revenue definition used EVERYWHERE (dashboard + sales analytics):
 *   eligible order  = money received (paymentStatus PAID) AND not cancelled.
 * Unpaid (PENDING), FAILED, EXPIRED, CANCELLED and refund orders
 * (REFUND_PENDING / REFUNDED) therefore never count. Partial refunds that were
 * recorded on return requests (status REFUNDED + refundAmount) are subtracted.
 */
export const ELIGIBLE_REVENUE_WHERE = {
    paymentStatus: 'PAID',
    status: { not: 'CANCELLED' }
} as const;

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;

export async function eligibleRevenue(db: any, extraWhere: Record<string, unknown> = {}) {
    const [gross, refunded] = await Promise.all([
        db.order.aggregate({
            where: { ...ELIGIBLE_REVENUE_WHERE, ...extraWhere },
            _sum: { total: true },
            _count: { _all: true }
        }),
        db.returnRequest.aggregate({
            where: {
                status: 'REFUNDED',
                order: { ...ELIGIBLE_REVENUE_WHERE, ...extraWhere }
            },
            _sum: { refundAmount: true }
        })
    ]);

    const grossTotal = gross._sum?.total ?? 0;
    const refundedTotal = refunded._sum?.refundAmount ?? 0;

    return {
        gross: grossTotal,
        refunded: refundedTotal,
        net: Math.max(0, grossTotal - refundedTotal),
        orders: gross._count?._all ?? 0
    };
}

const countBy = (rows: Array<{ _count: any; [k: string]: any }>, key: string) =>
    Object.fromEntries(
        rows.map((r) => [
            r[key],
            typeof r._count === 'number' ? r._count : (r._count?._all ?? 0)
        ])
    ) as Record<string, number>;

/** Everything the existing admin dashboard shows, straight from the database. */
export async function getDashboardStats(db: any) {
    const [
        totalOrders,
        customers,
        admins,
        statusRows,
        paymentRows,
        revenue,
        refundsDue,
        products,
        recentOrders,
        recentActivity
    ] = await Promise.all([
        db.order.count(),
        db.user.count({ where: { role: 'CUSTOMER' } }),
        db.user.count({ where: { role: 'ADMIN', isSuspended: false } }),
        db.order.groupBy({ by: ['status'], _count: { _all: true } }),
        db.order.groupBy({ by: ['paymentStatus'], _count: { _all: true } }),
        eligibleRevenue(db),
        db.order.aggregate({
            where: {
                status: 'CANCELLED',
                paymentStatus: { in: ['PAID', 'REFUND_PENDING'] }
            },
            _sum: { total: true },
            _count: { _all: true }
        }),
        // Lean projection: "low stock" compares two columns, which Prisma cannot
        // express in a filter, so the (small) catalogue is classified here.
        db.product.findMany({
            select: {
                id: true,
                slug: true,
                name: true,
                stock: true,
                lowStockThreshold: true,
                status: true
            }
        }),
        db.order.findMany({
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
                id: true,
                orderNumber: true,
                status: true,
                paymentStatus: true,
                paymentMethod: true,
                total: true,
                createdAt: true,
                user: { select: { fullName: true, email: true } }
            }
        }),
        db.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                action: true,
                entity: true,
                entityId: true,
                createdAt: true,
                user: { select: { fullName: true, email: true } }
            }
        })
    ]);

    const inventory = { inStock: 0, lowStock: 0, outOfStock: 0, inactive: 0 };
    const attention: Array<{
        id: string;
        slug: string;
        name: string;
        stock: number;
        lowStockThreshold: number;
        state: StockState;
    }> = [];

    for (const p of products as any[]) {
        if (p.status === 'INACTIVE') {
            inventory.inactive++;
            continue;
        }
        const state = stockState(p);
        if (state === 'OUT_OF_STOCK') inventory.outOfStock++;
        else if (state === 'LOW_STOCK') inventory.lowStock++;
        else inventory.inStock++;

        if (state !== 'IN_STOCK')
            attention.push({
                id: p.id,
                slug: p.slug,
                name: p.name,
                stock: p.stock,
                lowStockThreshold: p.lowStockThreshold,
                state
            });
    }

    attention.sort((a, b) => a.stock - b.stock);

    const ordersByStatus = countBy(statusRows, 'status');
    const paymentsByStatus = countBy(paymentRows, 'paymentStatus');

    return {
        totals: {
            orders: totalOrders,
            customers,
            activeAdmins: admins,
            products: products.length,
            revenue: revenue.net,
            revenueGross: revenue.gross,
            revenueRefunded: revenue.refunded,
            revenueOrders: revenue.orders
        },
        ordersByStatus,
        paymentsByStatus,
        pendingRefunds: {
            count: refundsDue._count?._all ?? 0,
            amount: refundsDue._sum?.total ?? 0
        },
        inventory,
        lowStockProducts: attention.slice(0, 10),
        recentOrders,
        recentActivity,

        // Legacy fields kept so older clients keep working.
        orders: totalOrders,
        revenue: revenue.net,
        customers,
        products: products.length,
        lowStock: inventory.lowStock + inventory.outOfStock
    };
}
