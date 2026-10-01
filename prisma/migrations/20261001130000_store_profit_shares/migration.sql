-- A partner's share is stored per store (set by the admin); the admin owner receives the
-- rest of each store's profit. Until now the share lived on the owner row together with a
-- single store link, so the admin's own share was overwritten whenever any store was edited.
CREATE TABLE "store_profit_shares" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharePercent" DECIMAL(7,4) NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_profit_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_profit_shares_storeId_ownerId_key" ON "store_profit_shares"("storeId", "ownerId");
CREATE INDEX "store_profit_shares_storeId_idx" ON "store_profit_shares"("storeId");

ALTER TABLE "store_profit_shares" ADD CONSTRAINT "store_profit_shares_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_profit_shares" ADD CONSTRAINT "store_profit_shares_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over today's pairs: a non-admin owner tied to a retail store (directly or through
-- its partner login) keeps its current share of that store.
INSERT INTO "store_profit_shares" ("id", "storeId", "ownerId", "sharePercent", "updatedAt")
SELECT gen_random_uuid()::text, pair."storeId", pair."ownerId", pair."sharePercent", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (COALESCE(o."storeId", u."storeId"), o."id")
         COALESCE(o."storeId", u."storeId") AS "storeId", o."id" AS "ownerId", o."profitSharePercent" AS "sharePercent"
  FROM "owners" o
  LEFT JOIN "users" u ON u."id" = o."userId"
  WHERE COALESCE(o."storeId", u."storeId") IS NOT NULL
    AND COALESCE(u."role"::text, '') <> 'ADMIN'
) pair
JOIN "stores" s ON s."id" = pair."storeId" AND s."isMainWarehouse" = false
WHERE pair."sharePercent" > 0 AND pair."sharePercent" < 100;

INSERT INTO "audit_logs" ("id", "action", "details", "financialDetails", "targetId")
SELECT gen_random_uuid()::text, 'STORE_PROFIT_SHARE_MIGRATION',
       format('Доля партнёра «%s» в магазине «%s» перенесена в доли по магазинам: %s%%', o."name", s."name", sh."sharePercent"),
       jsonb_build_object('storeId', sh."storeId", 'ownerId', sh."ownerId", 'sharePercent', sh."sharePercent"),
       sh."storeId"
FROM "store_profit_shares" sh
JOIN "owners" o ON o."id" = sh."ownerId"
JOIN "stores" s ON s."id" = sh."storeId";
