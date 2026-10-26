-- Firebase Authentication + Maya Checkout + EmailJS
-- Additive only: no existing column is dropped, no existing row is modified.

-- AlterTable: users may now be Firebase-native (no local password hash)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "firebaseUid" TEXT;

-- AlterTable: Maya payment tracking + confirmation e-mail idempotency
ALTER TABLE "Order" ADD COLUMN "mayaRedirectUrl" TEXT,
ADD COLUMN "mayaCheckoutCreatedAt" TIMESTAMP(3),
ADD COLUMN "mayaPaymentId" TEXT,
ADD COLUMN "mayaPaymentStatus" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "confirmationEmailStatus" TEXT,
ADD COLUMN "confirmationEmailAttemptedAt" TIMESTAMP(3),
ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3),
ADD COLUMN "confirmationEmailError" TEXT;

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MAYA',
    "eventKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_eventKey_key" ON "PaymentEvent"("eventKey");

-- CreateIndex
CREATE INDEX "PaymentEvent_orderId_idx" ON "PaymentEvent"("orderId");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
