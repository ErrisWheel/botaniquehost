-- Additive, backward-compatible migration: nothing is dropped, renamed or
-- rewritten except the one back-fill below, which only touches orders that are
-- ALREADY cancelled.

-- AlterTable: cancellation / stock-restore bookkeeping
ALTER TABLE "Order"
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "stockRestoredAt" TIMESTAMP(3);

-- Back-fill: orders that were cancelled before this migration have already had
-- their stock handled (or, for old admin cancellations, deliberately NOT
-- handled - see docs/ADMIN_AND_MIGRATION.md). Marking them as handled
-- guarantees the new restock logic can never add their stock back a second
-- time. This statement changes NO product stock.
UPDATE "Order"
SET "cancelledAt" = "updatedAt",
    "stockRestoredAt" = "updatedAt"
WHERE "status" = 'CANCELLED';

-- CreateIndex
CREATE INDEX "User_role_isSuspended_idx" ON "User"("role", "isSuspended");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
