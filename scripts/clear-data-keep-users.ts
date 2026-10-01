import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Wipes all business data while keeping the company's setup:
 * - employees (users) and their login sessions;
 * - stores, incl. the main warehouse (sellers are assigned to them) — cash reset to 0;
 * - partners (owners) with their user links — every balance reset to 0;
 * - partner profit shares per store (StoreProfitShare) — configuration, not operations;
 * - each store's cash ledger account — balances reset to 0.
 * Everything else — devices, sales, suppliers, invoices, transfers, repairs, expenses,
 * customers, exchange rates, notifications, audit/ledger history, document counters — is
 * truncated, and id sequences restart so receipt numbers begin at 1 again.
 *
 * The table list comes from the Prisma schema, so a newly added model is cleared too
 * unless it is added to KEEP.
 */
const KEEP = new Set(['User', 'AuthSession', 'Store', 'Owner', 'FinancialAccount', 'StoreProfitShare']);

const prisma = new PrismaClient();

async function main() {
  const tables = Prisma.dmmf.datamodel.models
    .filter((model) => !KEEP.has(model.name))
    .map((model) => `"${model.dbName ?? model.name}"`);

  console.log('Clearing all business data, keeping employees, stores and partners...');
  await prisma.$transaction([
    // No CASCADE: if a kept table referenced one of these, Postgres refuses instead of
    // silently emptying the kept table too.
    prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY`),
    prisma.store.updateMany({ data: { cashBalanceUsd: 0 } }),
    prisma.financialAccount.updateMany({ data: { balanceTjs: 0, balanceUsd: 0 } }),
    prisma.owner.updateMany({
      data: { capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
    }),
  ]);

  const users = await prisma.user.findMany({ select: { login: true, name: true, role: true }, orderBy: { createdAt: 'asc' } });
  console.log(`Done. Cleared ${tables.length} tables.`);
  console.log(`Employees kept (${users.length}):`);
  users.forEach((u) => console.log(`  - ${u.name} (@${u.login}) [${u.role}]`));
  console.log(`Stores kept: ${await prisma.store.count()}, partners kept: ${await prisma.owner.count()}`);
}

main()
  .catch((error) => {
    console.error('Error clearing data:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
