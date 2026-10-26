import type { Request } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';

export type AuthUser = {
    id: string;
    email: string;
    role: string;
};

export type AuthRequest = Request & {
    user?: AuthUser;
    firebase?: DecodedIdToken;
};
