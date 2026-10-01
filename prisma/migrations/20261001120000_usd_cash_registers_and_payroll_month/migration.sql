-- Cash registers are kept in USD from now on: TJS takings and payouts are converted at the
-- day's rate when they happen, so owner capital (USD) and the registers no longer drift apart
-- with the exchange rate. Existing TJS balances convert once at the latest known rate; the
-- original TJS figure is kept in the audit log.
ALTER TABLE "stores" ADD COLUMN "cashBalanceUsd" DECIMAL(14,2) NOT NULL DEFAULT 0;

DO $$
DECLARE
  latest_rate DECIMAL(10,4);
BEGIN
  SELECT "rate" INTO latest_rate FROM "exchange_rates" WHERE "rate" > 0 ORDER BY "date" DESC LIMIT 1;

  IF latest_rate IS NULL THEN
    IF EXISTS (SELECT 1 FROM "stores" WHERE "cashBalanceTjs" <> 0)
       OR EXISTS (SELECT 1 FROM "financial_accounts" WHERE "balanceTjs" <> 0) THEN
      RAISE EXCEPTION 'Нет курса USD/TJS: невозможно перевести остатки касс в доллары';
    END IF;
  ELSE
    INSERT INTO "audit_logs" ("id", "action", "details", "financialDetails", "targetId")
    SELECT gen_random_uuid()::text,
           'CASH_REGISTER_USD_MIGRATION',
           format('Касса «%s» переведена в доллары: %s TJS / %s = %s USD',
                  s."name", s."cashBalanceTjs", latest_rate, ROUND(s."cashBalanceTjs" / latest_rate, 2)),
           jsonb_build_object('cashBalanceTjs', s."cashBalanceTjs", 'exchangeRate', latest_rate,
                              'cashBalanceUsd', ROUND(s."cashBalanceTjs" / latest_rate, 2),
                              'previousAccountBalanceTjs', a."balanceTjs"),
           s."id"
    FROM "stores" s
    LEFT JOIN "financial_accounts" a ON a."storeId" = s."id"
    WHERE s."cashBalanceTjs" <> 0 OR COALESCE(a."balanceTjs", 0) <> 0;

    UPDATE "stores" SET "cashBalanceUsd" = ROUND("cashBalanceTjs" / latest_rate, 2);

    -- Accounts without a store keep their own figure, converted the same way.
    UPDATE "financial_accounts"
    SET "balanceUsd" = "balanceUsd" + ROUND("balanceTjs" / latest_rate, 2), "balanceTjs" = 0
    WHERE "storeId" IS NULL;
  END IF;

  -- The register is the authoritative balance; its ledger account mirrors it in USD.
  UPDATE "financial_accounts" a
  SET "balanceUsd" = s."cashBalanceUsd", "balanceTjs" = 0
  FROM "stores" s
  WHERE a."storeId" = s."id";
END $$;

ALTER TABLE "stores" DROP COLUMN "cashBalanceTjs";

-- Expenses recorded before amountUsd was stored get it from their own day's rate.
UPDATE "expenses" e
SET "exchangeRate" = r."rate",
    "amountUsd" = ROUND(e."amountTjs" / r."rate", 2)
FROM (
  SELECT o."id", COALESCE(
    o."exchangeRate",
    (SELECT x."rate" FROM "exchange_rates" x
       WHERE x."date" <= to_char((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')
       ORDER BY x."date" DESC LIMIT 1),
    (SELECT x."rate" FROM "exchange_rates" x ORDER BY x."date" ASC LIMIT 1)
  ) AS "rate"
  FROM "expenses" o
  WHERE o."amountUsd" IS NULL
) r
WHERE e."id" = r."id" AND r."rate" > 0;

-- An advance belongs to the payroll month it is paid against, not the day it was handed out.
ALTER TABLE "expenses" ADD COLUMN "payrollMonth" TEXT;
UPDATE "expenses"
SET "payrollMonth" = to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM')
WHERE "isEmployeeAdvance" = true OR "category" = 'EMPLOYEE_ADVANCE';
