/** An Error carrying the HTTP status (and optional machine code) for errorHandler. */
export const httpError = (statusCode: number, message: string, code?: string) =>
    Object.assign(new Error(message), { statusCode, code });
