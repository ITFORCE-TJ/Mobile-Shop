-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BonusPoolStatus" AS ENUM ('PENDING', 'DISTRIBUTED', 'ANNULLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "isBonus" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "bonus_pool_entries" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "saleId" TEXT,
    "saleItemId" TEXT,
    "imei" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "salePriceUsd" DECIMAL(14,2) NOT NULL,
    "salePriceTjs" DECIMAL(14,2) NOT NULL,
    "profitUsd" DECIMAL(14,2) NOT NULL,
    "profitTjs" DECIMAL(14,2) NOT NULL,
    "status" "BonusPoolStatus" NOT NULL DEFAULT 'PENDING',
    "distributionId" TEXT,
    "distributedAt" TIMESTAMP(3),
    "distributedBy" TEXT,
    "distributionNote" TEXT,
    "annulledAt" TIMESTAMP(3),
    "annulledBy" TEXT,
    "annulledNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonus_pool_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bonus_distribution_logs" (
    "id" TEXT NOT NULL,
    "periodName" TEXT NOT NULL,
    "totalAmountUsd" DECIMAL(14,2) NOT NULL,
    "totalAmountTjs" DECIMAL(14,2),
    "type" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "note" TEXT,
    "performedByUserId" TEXT NOT NULL,
    "performedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonus_distribution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bonus_pool_entries_status_idx" ON "bonus_pool_entries"("status");
CREATE INDEX IF NOT EXISTS "bonus_pool_entries_createdAt_idx" ON "bonus_pool_entries"("createdAt");
CREATE INDEX IF NOT EXISTS "bonus_distribution_logs_createdAt_idx" ON "bonus_distribution_logs"("createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bonus_pool_entries_saleId_fkey') THEN
    ALTER TABLE "bonus_pool_entries" ADD CONSTRAINT "bonus_pool_entries_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bonus_pool_entries_deviceId_fkey') THEN
    ALTER TABLE "bonus_pool_entries" ADD CONSTRAINT "bonus_pool_entries_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
