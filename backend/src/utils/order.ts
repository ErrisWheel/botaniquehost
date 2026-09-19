export const orderNumber = () =>
    `BOT-${new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '')}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

export const totals = (
    subtotal: number,
    discount = 0,
    shipping = 0,
    taxRate = 0.12
) => {
    const taxable = Math.max(
        0,
        subtotal - discount
    );

    const tax = Math.round(
        taxable * taxRate
    );

    return {
        subtotal,
        discount,
        shipping,
        tax,
        total: taxable + shipping + tax
    };
};
