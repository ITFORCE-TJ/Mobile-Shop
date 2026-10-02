import { D, type MoneyInput } from '../../common/decimal';
import type { TransactionClient } from '../../prisma/prisma.service';

type Actor = { id: string; name: string; role: string };

/**
 * Returns the CASH FinancialAccount linked to a store, creating it on first use.
 * Every store gets exactly one (Phase 1 backfill creates these for existing stores;
 * this covers a store created afterwards).
 */
export async function getStoreCashAccount(tx: TransactionClient, storeId: string, storeName?: string) {
  const existing = await tx.financialAccount.findUnique({ where: { storeId } });
  if (existing) return existing;
  const store = storeName ? { name: storeName } : await tx.store.findUnique({ where: { id: storeId }, select: { name: true } });
  return tx.financialAccount.create({
    data: { name: `Касса ${store?.name ?? ''}`.trim(), type: 'CASH', storeId },
  });
}

/** The store register (USD) is the authoritative cash balance used by every cash operation,
 * and its ledger account must mirror it exactly. A difference means some write moved one
 * without the other, so it is reported and the operation refused instead of being papered
 * over — the admin fixes it explicitly with a cash adjustment, which resets both. */
export async function lockCashRegister(tx: TransactionClient, storeId: string, actor: Actor, purpose: string) {
  await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
  const store = await tx.store.findUnique({ where: { id: storeId } });
  if (!store || !store.active) throw new Error('Касса магазина не найдена или неактивна');
  const account = await getStoreCashAccount(tx, storeId, store.name);
  await tx.$queryRaw`SELECT id FROM financial_accounts WHERE id = ${account.id} FOR UPDATE`;
  const current = await tx.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
  const difference = D(store.cashBalanceUsd).minus(current.balanceUsd);
  if (!difference.eq(0)) {
    throw Object.assign(new Error(
      `Расхождение кассы «${store.name}» ($${store.cashBalanceUsd}) и её финансового счёта ($${current.balanceUsd}) на $${difference}. ` +
      `Операция «${purpose}» остановлена: выполните корректировку кассы в настройках.`,
    ), { statusCode: 409 });
  }
  return { store, account };
}

/** The central register is the main warehouse's register: every payout leaves from it
 * and every store hands its daily cash over into it. */
export async function lockCentralCashRegister(tx: TransactionClient, actor: Actor, purpose: string) {
  const mainWarehouse = await tx.store.findFirst({ where: { isMainWarehouse: true }, select: { id: true } });
  if (!mainWarehouse) throw new Error('Центральная касса (Главный склад) не найдена');
  return lockCashRegister(tx, mainWarehouse.id, actor, purpose);
}

/** Takes cash out of the central register, refusing to overdraw it. The caller posts the
 * matching ledger transaction on the returned account. */
export async function withdrawFromCentralCash(tx: TransactionClient, amountUsd: MoneyInput, actor: Actor, purpose: string) {
  const register = await lockCentralCashRegister(tx, actor, purpose);
  const guard = await tx.store.updateMany({
    where: { id: register.store.id, cashBalanceUsd: { gte: amountUsd } },
    data: { cashBalanceUsd: { decrement: amountUsd } },
  });
  if (guard.count !== 1) throw new Error(`В центральной кассе недостаточно наличных: ${purpose}`);
  return register;
}

/** Stable identity of the Bonus Account (never looked up by name once adopted). */
export const BONUS_ACCOUNT_KEY = 'BONUS_ACCOUNT';
const BONUS_ACCOUNT_NAME = 'Бонусный счёт';

/**
 * The company's Bonus Account (monetary supplier bonuses and the profit of sold bonus phones),
 * read-only: never creates anything. Falls back to an account the earlier version created by
 * name until it is adopted by the first write.
 */
export async function findBonusAccount(db: Pick<TransactionClient, 'financialAccount'>) {
  return (await db.financialAccount.findUnique({ where: { systemKey: BONUS_ACCOUNT_KEY } }))
    ?? db.financialAccount.findFirst({ where: { name: BONUS_ACCOUNT_NAME, storeId: null, systemKey: null }, orderBy: { createdAt: 'asc' } });
}

/**
 * The Bonus Account for a write, created exactly once and row-locked for the caller's
 * transaction. A transaction-scoped advisory lock serializes first use; the unique systemKey
 * guarantees a single account. An existing name-only account is adopted, never duplicated.
 */
export async function lockBonusAccount(tx: TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('financial-account:BONUS_ACCOUNT'))::text`;
  let account = await tx.financialAccount.findUnique({ where: { systemKey: BONUS_ACCOUNT_KEY } });
  if (!account) {
    const legacy = await tx.financialAccount.findFirst({ where: { name: BONUS_ACCOUNT_NAME, storeId: null, systemKey: null }, orderBy: { createdAt: 'asc' } });
    account = legacy
      ? await tx.financialAccount.update({ where: { id: legacy.id }, data: { systemKey: BONUS_ACCOUNT_KEY } })
      : await tx.financialAccount.create({ data: { name: BONUS_ACCOUNT_NAME, type: 'OTHER', systemKey: BONUS_ACCOUNT_KEY } });
  }
  await tx.$queryRaw`SELECT id FROM financial_accounts WHERE id = ${account.id} FOR UPDATE`;
  return tx.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
}
