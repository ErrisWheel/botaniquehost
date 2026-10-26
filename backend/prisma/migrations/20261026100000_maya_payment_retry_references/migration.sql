ALTER TABLE "Order" ADD COLUMN "mayaRequestReferenceNumber" TEXT;

CREATE UNIQUE INDEX "Order_mayaRequestReferenceNumber_key" ON "Order"("mayaRequestReferenceNumber");
