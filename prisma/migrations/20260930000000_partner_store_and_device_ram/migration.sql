-- AlterTable
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "storeId" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_storeId_fkey') THEN
    ALTER TABLE "owners" ADD CONSTRAINT "owners_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
