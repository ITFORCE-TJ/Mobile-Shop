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
