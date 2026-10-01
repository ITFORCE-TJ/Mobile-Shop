-- CreateTable
CREATE TABLE "cash_handovers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amountTjs" DECIMAL(14,2) NOT NULL,
    "exchangeRate" DECIMAL(10,4) NOT NULL,
    "amountUsd" DECIMAL(14,2) NOT NULL,
    "businessDate" TEXT NOT NULL,
    "acceptedByUserId" TEXT NOT NULL,
    "acceptedByName" TEXT NOT NULL,
    "financialTransactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_handovers_financialTransactionId_key" ON "cash_handovers"("financialTransactionId");

-- CreateIndex
CREATE INDEX "cash_handovers_storeId_createdAt_idx" ON "cash_handovers"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_handovers_businessDate_idx" ON "cash_handovers"("businessDate");

-- AddForeignKey
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

