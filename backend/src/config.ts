import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.string().default('development'),
    DATABASE_URL: z.string(),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().default('7d'),
    CORS_ORIGIN: z
        .string()
        .default('http://localhost:8100,http://localhost:4200'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z
        .string()
        .default(
            'Botanique <no-reply@botanique.local>'
        ),
    UPLOAD_DIR: z.string().default('uploads')
});

export const env = schema.parse(process.env);
