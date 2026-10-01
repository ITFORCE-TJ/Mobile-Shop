-- Admin notifications carry the facts of the business event behind them (action, store,
-- employee, money, document) and a dedupe key, so a retried request never notifies twice.
-- All new columns are nullable: existing notifications stay as they are.
ALTER TABLE "notifications"
  ADD COLUMN "actionType" TEXT,
  ADD COLUMN "storeId" TEXT,
  ADD COLUMN "storeName" TEXT,
  ADD COLUMN "actorUserId" TEXT,
  ADD COLUMN "actorName" TEXT,
  ADD COLUMN "amountTjs" DECIMAL(14,2),
  ADD COLUMN "amountUsd" DECIMAL(14,2),
  ADD COLUMN "documentRef" TEXT,
  ADD COLUMN "details" JSONB,
  ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
CREATE INDEX "notifications_actionType_createdAt_idx" ON "notifications"("actionType", "createdAt");
CREATE INDEX "notifications_storeId_createdAt_idx" ON "notifications"("storeId", "createdAt");

-- A store's receipt of phones delivered from the main warehouse (scanned by IMEI). Completing
-- it moves the devices at once; the admin's acknowledgement is a separate review mark.
CREATE TABLE "store_receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromStoreId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "acknowledgedByName" TEXT,

    CONSTRAINT "store_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_receipts_receiptNumber_key" ON "store_receipts"("receiptNumber");
CREATE INDEX "store_receipts_storeId_createdAt_idx" ON "store_receipts"("storeId", "createdAt");
CREATE INDEX "store_receipts_createdAt_idx" ON "store_receipts"("createdAt");

ALTER TABLE "store_receipts" ADD CONSTRAINT "store_receipts_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_receipts" ADD CONSTRAINT "store_receipts_fromStoreId_fkey"
  FOREIGN KEY ("fromStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "store_receipt_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ram" TEXT,
    "storage" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "store_receipt_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_receipt_items_receiptId_deviceId_key" ON "store_receipt_items"("receiptId", "deviceId");
CREATE INDEX "store_receipt_items_deviceId_idx" ON "store_receipt_items"("deviceId");

ALTER TABLE "store_receipt_items" ADD CONSTRAINT "store_receipt_items_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "store_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_receipt_items" ADD CONSTRAINT "store_receipt_items_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
