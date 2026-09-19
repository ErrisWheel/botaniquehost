import PDFDocument from 'pdfkit';
import type { Response } from 'express';

export function invoice(res: Response, order: any) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `inline; filename=${order.orderNumber}.pdf`
    );

    const d = new PDFDocument({ margin: 50 });

    d.pipe(res);

    d.fontSize(22).text('BOTANIQUE', {
        align: 'center'
    });

    d.moveDown()
        .fontSize(14)
        .text(`Invoice: ${order.orderNumber}`);

    d.text(
        `Date: ${new Date(order.createdAt).toLocaleString()}`
    );

    d.text(`Status: ${order.status}`);

    d.moveDown();

    d.text(
        `Customer: ${order.customerJson?.fullName || 'Customer'}`
    );

    d.text(
        `Email: ${order.customerJson?.email || ''}`
    );

    d.text(
        `Address: ${order.customerJson?.address || ''}`
    );

    d.moveDown();

    for (const i of order.items) {
        d.text(
            `${i.productName} x ${i.quantity} — PHP ${i.lineTotal.toFixed(2)}`
        );
    }

    d.moveDown()
        .text(
            `Subtotal: PHP ${order.subtotal.toFixed(2)}`
        );

    d.text(
        `Shipping: PHP ${order.shipping.toFixed(2)}`
    );

    d.text(`Tax: PHP ${order.tax.toFixed(2)}`);

    d.text(`Total: PHP ${order.total.toFixed(2)}`);

    d.end();
}
