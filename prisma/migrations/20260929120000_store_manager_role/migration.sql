-- Store manager ("Управляющий магазином"): sees reports, expenses, stock and sales of
-- exactly one store (users.storeId), never other stores or network/owner figures.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STORE_MANAGER';
