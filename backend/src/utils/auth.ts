import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config.js';

export const hashPassword = (p: string) =>
    bcrypt.hash(p, 12);

export const verifyPassword = (p: string, h: string) =>
    bcrypt.compare(p, h);

export const signToken = (
    u: {
        id: string;
        email: string;
        role: string;
    }
) =>
    jwt.sign(
        u,
        env.JWT_SECRET,
        {
            expiresIn: env.JWT_EXPIRES_IN as any
        }
    );
