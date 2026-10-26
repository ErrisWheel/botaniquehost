import { env, mayaBaseUrl } from '../src/config.js';
import { getPaymentsByReference, MayaError } from '../src/services/maya.js';

const rrn = process.argv[2]?.trim();

if (!rrn) {
    console.error('Usage: npx tsx scripts/check-maya-rrn.ts <merchant-reference-number>');
    process.exit(1);
}

const value = (obj: Record<string, any> | undefined, ...keys: string[]) => {
    for (const key of keys) {
        const result = obj?.[key];
        if (result !== undefined && result !== null && result !== '') return result;
    }
    return undefined;
};

try {
    if (!env.MAYA_SECRET_KEY) {
        throw new Error('MAYA_SECRET_KEY is missing from backend/.env');
    }

    console.log(JSON.stringify({
        environment: env.MAYA_ENV,
        apiBaseUrl: mayaBaseUrl,
        requestReferenceNumber: rrn,
        action: 'Retrieving Maya payment by request reference number'
    }, null, 2));

    const payments = await getPaymentsByReference(rrn);

    if (payments.length === 0) {
        console.log(JSON.stringify({
            result: 'NO_PAYMENT_FOUND',
            message: 'Maya returned no payment for this reference. Confirm the reference is exact before creating a new payment attempt.'
        }, null, 2));
        process.exit(0);
    }

    const safePayments = payments.map((payment) => {
        const p = payment as Record<string, any>;
        const amount = p.totalAmount && typeof p.totalAmount === 'object'
            ? p.totalAmount.value ?? p.totalAmount.amount
            : p.totalAmount;
        const error = p.error && typeof p.error === 'object' ? p.error : undefined;

        return {
            paymentId: value(p, 'paymentId', 'id'),
            requestReferenceNumber: value(p, 'requestReferenceNumber', 'referenceNumber', 'rrn'),
            paymentStatus: value(p, 'paymentStatus', 'status'),
            errorCode: value(p, 'errorCode', 'code') ?? value(error, 'code', 'errorCode'),
            errorMessage: value(p, 'errorMessage', 'failureReason', 'message') ?? value(error, 'message', 'description'),
            amount,
            currency: value(p, 'currency') ?? (p.totalAmount && typeof p.totalAmount === 'object' ? p.totalAmount.currency : undefined),
            createdAt: value(p, 'createdAt', 'createdDate', 'transactionDate'),
            updatedAt: value(p, 'updatedAt', 'updatedDate')
        };
    });

    console.log(JSON.stringify({ result: 'PAYMENT_RECORDS_FOUND', payments: safePayments }, null, 2));
} catch (error) {
    if (error instanceof MayaError) {
        const body = error.body && typeof error.body === 'object'
            ? error.body as Record<string, any>
            : undefined;
        const nested = body?.error && typeof body.error === 'object'
            ? body.error as Record<string, any>
            : undefined;

        console.error(JSON.stringify({
            result: 'MAYA_LOOKUP_FAILED',
            httpStatus: error.status,
            message: error.message,
            mayaErrorCode: value(body, 'code', 'errorCode') ?? value(nested, 'code', 'errorCode'),
            mayaErrorMessage: value(body, 'message', 'description') ?? value(nested, 'message', 'description')
        }, null, 2));
    } else {
        console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
}
