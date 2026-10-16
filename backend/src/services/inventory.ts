/**
 * Inventory rules shared by checkout, cancellations and the admin screens.
 * Everything here that touches the database takes the Prisma client (or a
 * transaction client) as a parameter so it can be tested with an in-memory fake.
 */

export type StockState = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/**
 * Single definition used by the dashboard AND the product list:
 *   out of stock : stock <= 0
 *   low stock    : 0 < stock <= lowStockThreshold
 *   in stock     : stock > lowStockThreshold
 */
export function stockState(p: {
    stock: number;
    lowStockThreshold?: number | null;
}): StockState {
    if (p.stock <= 0) return 'OUT_OF_STOCK';
    const threshold = p.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    return p.stock <= threshold ? 'LOW_STOCK' : 'IN_STOCK';
}

/**
 * Product `status` that matches a stock level. An administrator's INACTIVE
 * (hidden) choice is never overridden; otherwise 0 stock means OUT_OF_STOCK and
 * stock again means ACTIVE.
 */
export function statusForStock(status: string, stock: number): string {
    if (status === 'INACTIVE') return 'INACTIVE';
    return stock <= 0 ? 'OUT_OF_STOCK' : 'ACTIVE';
}

type RestockableOrder = {
    id: string;
    items: Array<{ productId: string; quantity: number }>;
};

/**
 * Gives an order's reserved stock back to the shelves EXACTLY ONCE.
 *
 * The first caller atomically claims the order by stamping `stockRestoredAt`
 * (`UPDATE ... WHERE stockRestoredAt IS NULL`); any later caller (a repeated
 * admin click, a Maya webhook retry, the sweeper) matches zero rows and does
 * nothing. Must run inside the same transaction that cancels the order so the
 * status change and the stock change succeed or fail together.
 *
 * @returns true if stock was restored by this call, false if it had already
 *          been restored.
 */
export async function restockOrder(tx: any, order: RestockableOrder): Promise<boolean> {
    const claim = await tx.order.updateMany({
        where: { id: order.id, stockRestoredAt: null },
        data: { stockRestoredAt: new Date() }
    });

    if (claim.count !== 1) return false;

    for (const item of order.items) {
        await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } }
        });

        // Back on the shelf: reopen products that sold out because of this order.
        await tx.product.updateMany({
            where: { id: item.productId, status: 'OUT_OF_STOCK', stock: { gt: 0 } },
            data: { status: 'ACTIVE' }
        });
    }

    return true;
}
