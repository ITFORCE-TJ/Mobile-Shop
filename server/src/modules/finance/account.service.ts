import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import type { TransactionClient } from '../../prisma/prisma.service';
import { postTransaction } from './financial-transaction.service';

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

/** The store register is the authoritative cash balance used by every cash operation.
 * Older imports may predate the financial ledger. Reconcile its mirror explicitly,
 * under the store lock, before money leaves it; never add money to the register. */
export async function lockCashRegister(tx: TransactionClient, storeId: string, actor: Actor, purpose: string) {
  await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
  const store = await tx.store.findUnique({ where: { id: storeId } });
  if (!store || !store.active) throw new Error('Касса магазина не найдена или неактивна');
  const account = await getStoreCashAccount(tx, storeId, store.name);
  await tx.$queryRaw`SELECT id FROM financial_accounts WHERE id = ${account.id} FOR UPDATE`;
  const current = await tx.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
  const difference = D(store.cashBalanceTjs).minus(current.balanceTjs);
  if (!difference.eq(0)) {
    await postTransaction(tx, {
      type: 'ADJUSTMENT', direction: difference.gt(0) ? 'IN' : 'OUT', numberPrefix: 'AJ',
      accountId: account.id, balanceCurrency: 'TJS', currency: 'TJS',
      amount: difference.abs(), amountTjs: difference.abs(), amountUsd: 0,
      shopId: storeId, sourceType: 'CASH_LEDGER_RECONCILIATION', sourceId: storeId,
      description: `Сверка финансового счёта с кассой ${store.name} перед операцией: ${purpose}`,
      createdByUserId: actor.id, guardBalance: false,
    });
    await tx.auditLog.create({ data: {
      userId: actor.id, userName: actor.name, userRole: actor.role,
      action: 'CASH_LEDGER_RECONCILIATION',
      details: `Счёт ${account.id}: ${current.balanceTjs} → ${store.cashBalanceTjs} TJS; остаток кассы не изменён`,
      financialDetails: moneyJson({ previousAccountBalanceTjs: current.balanceTjs, cashBalanceTjs: store.cashBalanceTjs, differenceTjs: difference }),
    } });
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
export async function withdrawFromCentralCash(tx: TransactionClient, amountTjs: MoneyInput, actor: Actor, purpose: string) {
  const register = await lockCentralCashRegister(tx, actor, purpose);
  const guard = await tx.store.updateMany({
    where: { id: register.store.id, cashBalanceTjs: { gte: amountTjs } },
    data: { cashBalanceTjs: { decrement: amountTjs } },
  });
  if (guard.count !== 1) throw new Error(`В центральной кассе недостаточно наличных: ${purpose}`);
  return register;
}
