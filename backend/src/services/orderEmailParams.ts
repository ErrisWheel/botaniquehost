import type { Order, OrderItem, User } from '@prisma/client';
import { env } from '../config.js';

type OrderWithRelations = Order & {
    items: OrderItem[];
    user: Pick<User, 'email' | 'fullName'> | null;
};

const peso = (n: number) =>
    `₱${Number(n).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;

/** EmailJS renders {{{var}}} unescaped, so everything dynamic is escaped here. */
export const escapeHtml = (v: unknown) =>
    String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function paymentStatusText(o: Pick<Order, 'paymentMethod' | 'paymentStatus'>) {
    if (o.paymentStatus === 'PAID')
        return o.paymentMethod === 'MAYA'
            ? 'Paid via Maya'
            : 'Paid';
    if (o.paymentMethod === 'COD')
        return 'Cash on Delivery - please pay when your order arrives';
    if (o.paymentStatus === 'REFUNDED') return 'Refunded';
    return 'Awaiting payment';
}

/**
 * Builds the EmailJS template variables. Names here must match the
 * {{variables}} in docs/emailjs/order-confirmation.html exactly.
 */
export function buildOrderEmailParams(
    o: OrderWithRelations
): Record<string, string> {
    const customer = (o.customerJson ?? {}) as Record<string, unknown>;
    const delivery = (o.deliveryJson ?? {}) as Record<string, unknown>;

    // For linked orders, the recipient comes only from the authenticated
    // account row. Checkout form data is not allowed to redirect a receipt.
    // Legacy orders without a linked account retain their stored receipt e-mail.
    const email = (o.userId
        ? str(o.user?.email)
        : str(customer.email))
        .trim()
        .toLowerCase();
    const name = o.user?.fullName || str(customer.fullName) || 'Customer';

    const itemsText = o.items
        .map(
            (i) =>
                `${i.quantity} x ${i.productName} - ${peso(i.lineTotal)}`
        )
        .join('\n');

    const itemsHtml = o.items
        .map(
            (i) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #e6efe6;font-size:14px;color:#1f2d1f;">${escapeHtml(i.productName)}</td>
<td style="padding:10px 8px;border-bottom:1px solid #e6efe6;font-size:14px;color:#1f2d1f;text-align:center;">${i.quantity}</td>
<td style="padding:10px 0;border-bottom:1px solid #e6efe6;font-size:14px;color:#1f2d1f;text-align:right;">${escapeHtml(peso(i.lineTotal))}</td>
</tr>`
        )
        .join('\n');

    const deliveryDate = str(delivery.date);
    const instructions = str(delivery.instructions);

    return {
        // Recipient: set the template's "To Email" field to {{customer_email}}
        customer_email: email,
        customer_name: name,
        order_id: o.orderNumber,
        order_date: new Date(o.createdAt).toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'Asia/Manila'
        }),
        order_items: itemsText,
        order_items_html: itemsHtml,
        order_subtotal: peso(o.subtotal),
        order_discount: peso(o.discount),
        order_shipping: peso(o.shipping),
        order_tax: peso(o.tax),
        order_total: peso(o.total),
        payment_method: o.paymentMethod === 'MAYA' ? 'Maya' : 'Cash on Delivery',
        payment_status: paymentStatusText(o),
        delivery_address: str(customer.address) || 'Not provided',
        delivery_date: deliveryDate || 'To be scheduled',
        delivery_instructions: instructions || 'None',
        support_email: env.EMAILJS_SUPPORT_EMAIL ?? ''
    };
}

