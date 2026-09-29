import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney, roundMoney } from '../../common/money';
import { dateRangeForPeriod, type ReportPeriod } from '../../common/business-date';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { getStoreCashAccount } from '../finance/account.service';
import { cancelTransaction, postTransaction } from '../finance/financial-transaction.service';

/**
 * «Инкассация»: cash handed over from a retail store's register to the central safe
 * (the main warehouse cash, where owner capital lives). It's a NEUTRAL transfer between
 * the business's own accounts — the store's cash goes down, the central cash goes up, and
 * neither revenue nor expenses change — so a store's cash in reports always matches the
 * physical money left in its register.
 */
export const CASH_COLLECTION_SOURCE = 'CASH_COLLECTION';

interface CreateCashCollectionInput {
  storeId: string;
  amountTjs: MoneyInput;
  comment?: string;
  actorId: string;
}

export async function createCashCollection(input: CreateCashCollectionInput) {
  const amountTjs = requirePositiveMoney(input.amountTjs, 'Сумма инкассации');
  const comment = typeof input.comment === 'string' && input.comment.trim() ? input.comment.trim() : undefined;

  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, input.actorId);
    const mainWarehouse = await tx.store.findFirst({ where: { isMainWarehouse: true } });
    if (!mainWarehouse) throw new Error('Главный склад не найден в системе');
    // Lock both registers in a stable order so two concurrent collections can't deadlock.
    const lockIds = [input.storeId, mainWarehouse.id].sort();
    await tx.$queryRaw`SELECT id FROM stores WHERE id = ${lockIds[0]} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM stores WHERE id = ${lockIds[1]} FOR UPDATE`;

    const store = await tx.store.findUnique({ where: { id: input.storeId } });
    if (!store || !store.active) throw new Error('Магазин не найден или неактивен');
    if (store.isMainWarehouse) throw new Error('Инкассация выполняется из кассы розничного магазина в центральную кассу');

    const cashGuard = await tx.store.updateMany({
      where: { id: store.id, cashBalanceTjs: { gte: amountTjs } },
      data: { cashBalanceTjs: { decrement: amountTjs } },
    });
    if (cashGuard.count !== 1) throw new Error(`В кассе недостаточно наличных: остаток ${store.cashBalanceTjs} TJS`);
    await tx.store.update({ where: { id: mainWarehouse.id }, data: { cashBalanceTjs: { increment: amountTjs } } });

    const rate = await requireTodayRate(tx);
    const amountUsd = roundMoney(D(amountTjs).div(rate));
    const [sourceAccount, destinationAccount] = await Promise.all([
      getStoreCashAccount(tx, store.id, store.name),
      getStoreCashAccount(tx, mainWarehouse.id, mainWarehouse.name),
    ]);
    const transaction = await postTransaction(tx, {
      type: 'TRANSFER',
      direction: 'NEUTRAL',
      numberPrefix: 'INC',
      accountId: sourceAccount.id,
      destinationAccountId: destinationAccount.id,
      balanceCurrency: 'TJS',
      amount: amountTjs,
      currency: 'TJS',
      exchangeRate: rate,
      amountTjs,
      amountUsd,
      categoryName: 'Инкассация',
      shopId: store.id,
      sourceType: CASH_COLLECTION_SOURCE,
      description: `Инкассация: ${store.name} → ${mainWarehouse.name}`,
      comment,
      createdByUserId: actor.id,
      // The store register (cashBalanceTjs, guarded above) is the source of truth here.
      guardBalance: false,
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'CASH_COLLECTION',
        details: `Инкассация ${transaction.transactionNumber}: ${amountTjs} TJS из кассы "${store.name}" в "${mainWarehouse.name}"${comment ? `. ${comment}` : ''}`,
        financialDetails: moneyJson({ amountTjs, amountUsd, exchangeRate: rate }),
        targetId: transaction.id,
      },
    });

    // Owners see every hand-over made by store staff, so the physical cash can be checked.
    if (actor.role !== 'ADMIN' && actor.role !== 'PARTNER') {
      await tx.notification.createMany({
        data: (['ADMIN', 'PARTNER'] as const).map((targetRole) => ({
          title: 'Инкассация',
          message: `${actor.name} сдал(а) ${amountTjs} TJS из кассы "${store.name}" в центральную кассу`,
          targetType: 'CASH_COLLECTION',
          targetId: transaction.id,
          targetRoute: '/finance',
          targetRole,
          resolved: true,
        })),
      });
    }

    return { transaction, storeId: store.id, mainWarehouseId: mainWarehouse.id };
  }, { maxWait: 10000, timeout: 25000 });
}

/** Reverses a collection: the money goes back from the central safe to the store register. */
export async function cancelCashCollection(transactionId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const actor = await resolveActor(tx, actorId);
    const original = await tx.financialTransaction.findUnique({ where: { id: transactionId } });
    if (!original || original.sourceType !== CASH_COLLECTION_SOURCE || original.reversedTransactionId) throw new Error('Инкассация не найдена');
    if (original.status === 'CANCELLED') throw new Error('Инкассация уже отменена');
    const mainWarehouse = await tx.store.findFirst({ where: { isMainWarehouse: true } });
    if (!mainWarehouse || !original.shopId) throw new Error('Не найдены кассы инкассации');

    const lockIds = [original.shopId, mainWarehouse.id].sort();
    await tx.$queryRaw`SELECT id FROM stores WHERE id = ${lockIds[0]} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM stores WHERE id = ${lockIds[1]} FOR UPDATE`;

    const cashGuard = await tx.store.updateMany({
      where: { id: mainWarehouse.id, cashBalanceTjs: { gte: original.amountTjs } },
      data: { cashBalanceTjs: { decrement: original.amountTjs } },
    });
    if (cashGuard.count !== 1) throw new Error('В центральной кассе недостаточно наличных, чтобы вернуть инкассацию');
    await tx.store.update({ where: { id: original.shopId }, data: { cashBalanceTjs: { increment: original.amountTjs } } });
    await cancelTransaction(tx, original.id, actor.id);

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'CASH_COLLECTION_CANCEL',
        details: `Отменена инкассация ${original.transactionNumber}: ${original.amountTjs} TJS возвращены в кассу магазина`,
        financialDetails: moneyJson({ amountTjs: original.amountTjs, amountUsd: original.amountUsd }),
        targetId: original.id,
      },
    });

    return { storeId: original.shopId, mainWarehouseId: mainWarehouse.id };
  }, { maxWait: 10000, timeout: 25000 });
}

export async function listCashCollections(input: { storeId?: string; period: ReportPeriod; month?: string }) {
  const dateRange = dateRangeForPeriod(input.period, input.month);
  const where: Prisma.FinancialTransactionWhereInput = {
    sourceType: CASH_COLLECTION_SOURCE,
    reversedTransactionId: null,
    ...(input.storeId ? { shopId: input.storeId } : {}),
    ...(dateRange ? { transactionDate: dateRange } : {}),
  };
  const rows = await prisma.financialTransaction.findMany({
    where,
    include: { shop: { select: { name: true } }, destinationAccount: { select: { name: true } } },
    orderBy: { transactionDate: 'desc' },
    take: 500,
  });
  const userIds = [...new Set(rows.map((row) => row.createdByUserId))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const userNames = new Map(users.map((user) => [user.id, user.name]));

  return rows.map((row) => ({
    id: row.id,
    transactionNumber: row.transactionNumber,
    storeId: row.shopId,
    storeName: row.shop?.name ?? '—',
    destinationName: row.destinationAccount?.name ?? 'Центральная касса',
    amountTjs: row.amountTjs,
    amountUsd: row.amountUsd,
    comment: row.comment,
    status: row.status,
    createdAt: row.transactionDate,
    createdByName: userNames.get(row.createdByUserId) ?? '—',
    cancelledAt: row.cancelledAt,
  }));
}
