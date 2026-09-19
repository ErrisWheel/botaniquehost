import type { Request } from 'express';

export type AuthUser = {
    id: string;
    email: string;
    role: string;
};

export type AuthRequest = Request & {
    user?: AuthUser;
};
