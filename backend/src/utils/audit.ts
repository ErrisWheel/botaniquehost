import { prisma } from '../db.js';

export const audit = (
    userId: string | undefined,
    action: string,
    entity: string,
    entityId?: string,
    metadata?: any
) =>
    prisma.auditLog
        .create({
            data: {
                userId,
                action,
                entity,
                entityId,
                metadata
            }
        })
        .catch(() => undefined);
