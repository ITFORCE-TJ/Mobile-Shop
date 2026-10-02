-- The Bonus Account gets a stable identity instead of a name lookup, so it can be created
-- exactly once even under concurrent first use. Existing rows are not changed here: the
-- application adopts an existing "Бонусный счёт" (oldest, without a store) under a lock.
ALTER TABLE "financial_accounts" ADD COLUMN "systemKey" TEXT;
CREATE UNIQUE INDEX "financial_accounts_systemKey_key" ON "financial_accounts"("systemKey");

-- A collection records its own regular/bonus split and both ledger transfers, and its
-- cancellation. All columns are nullable: collections made before stay as they were.
ALTER TABLE "cash_handovers"
  ADD COLUMN "regularAmountTjs" DECIMAL(14,2),
  ADD COLUMN "regularAmountUsd" DECIMAL(14,2),
  ADD COLUMN "bonusAmountTjs" DECIMAL(14,2),
  ADD COLUMN "bonusAmountUsd" DECIMAL(14,2),
  ADD COLUMN "regularFinancialTransactionId" TEXT,
  ADD COLUMN "bonusFinancialTransactionId" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" TEXT;
CREATE UNIQUE INDEX "cash_handovers_regularFinancialTransactionId_key" ON "cash_handovers"("regularFinancialTransactionId");
CREATE UNIQUE INDEX "cash_handovers_bonusFinancialTransactionId_key" ON "cash_handovers"("bonusFinancialTransactionId");

-- A cash bonus is credited to the Bonus Account once; this links the bonus to that posting.
ALTER TABLE "supplier_bonuses" ADD COLUMN "bonusAccountTransactionId" TEXT;
CREATE UNIQUE INDEX "supplier_bonuses_bonusAccountTransactionId_key" ON "supplier_bonuses"("bonusAccountTransactionId");
