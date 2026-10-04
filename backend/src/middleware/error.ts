import type { NextFunction, Request, Response } from 'express';

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
