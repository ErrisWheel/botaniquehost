import crypto from 'node:crypto';

export const orderNumber = () =>
    `BOT-${new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '')}-${crypto
        .randomBytes(4)
        .toString('hex')
        // 8 hex characters (4 billion values per day). The old 6 characters
        // collided too often: orderNumber is UNIQUE, so a collision made a
        // customer's checkout fail.
        .toUpperCase()}`;

/**
 * Single source of truth for order pricing (whole Philippine pesos).
 * Mirrors the rules shown to the customer on the checkout page:
 *   - subtotal strictly ABOVE 15,000  -> 20 % discount and FREE shipping
 *   - otherwise                        -> no discount, 150 flat shipping
 *   - 12 % tax on (subtotal - discount + shipping)
 * The browser never decides any of these numbers.
 */
export const PRICING = {
    freeShippingAbove: 15000,
    discountRate: 0.2,
    flatShipping: 150,
    taxRate: 0.12
} as const;

export type Pricing = {
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    total: number;
};

export function computePricing(subtotal: number): Pricing {
    const qualifies = subtotal > PRICING.freeShippingAbove;
    const discount = qualifies
        ? Math.round(subtotal * PRICING.discountRate)
        : 0;
    const shipping = qualifies ? 0 : PRICING.flatShipping;
    const taxable = subtotal - discount + shipping;
    const tax = Math.round(taxable * PRICING.taxRate);

    return {
        subtotal,
        discount,
        shipping,
        tax,
        total: taxable + tax
    };
}
