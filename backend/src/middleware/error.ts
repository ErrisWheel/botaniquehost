import type { NextFunction, Request, Response } from 'express';

/** Prisma error codes that mean "conflict" / "missing", not "server bug". */
export function mapDatabaseError(
    err: any
): { status: number; message: string; code: string } | null {
    switch (err?.code) {
        case 'P2002':
            return {
                status: 409,
                message: 'A record with these details already exists.',
                code: 'ALREADY_EXISTS'
            };
        case 'P2003':
            return {
                status: 409,
                message:
                    'This record is still used by other data and cannot be changed this way.',
                code: 'IN_USE'
            };
        case 'P2025':
            return {
                status: 404,
                message: 'Record not found.',
                code: 'NOT_FOUND'
            };
        case 'P2034':
            return {
                status: 409,
                message:
                    'That change conflicted with another one made at the same moment. Please try again.',
                code: 'CONCURRENT_CHANGE'
            };
        default:
            return null;
    }
}

export function errorHandler(
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    // Validation errors are the client's fault, not a server error.
    if (err?.name === 'ZodError') {
        const first = err.issues?.[0];
        return res.status(400).json({
            message: first
                ? `${first.path?.join('.') || 'request'}: ${first.message}`
                : 'Invalid request',
            code: 'VALIDATION_ERROR'
        });
    }

    // Known database conditions are the caller's situation, not a crash.
    const db = mapDatabaseError(err);
    if (db) return res.status(db.status).json({ message: db.message, code: db.code });

    const status = err.statusCode || 500;
    console.error(err);

    res.status(status).json({
        message:
            status >= 500 && process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : err.message || 'Internal server error',
        ...(err.code && typeof err.code === 'string' && status < 500
            ? { code: err.code }
            : {})
    });
}
