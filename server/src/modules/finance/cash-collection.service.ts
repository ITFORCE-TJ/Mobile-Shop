import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { lockCashRegister, lockCentralCashRegister } from './account.service';
import { postTransaction } from './financial-transaction.service';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { getBusinessDateKey } from '../../common/business-date';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney, roundMoney } from '../../common/money';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';

export interface CashCollectionDto {
  id: string;
  transactionNumber: string;
  storeId: string | null;
  storeName: string;
  destinationName: string;
  amountTjs: number;
  amountUsd: number;
  comment: string | null;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
  createdByName: string;
  cancelledAt: string | null;
}

export class CashCollectionService {
  /**
   * List cash collections (handovers) with filtering by period, month, and store.
   */
  public static async list(params: {
    period?: ReportPeriod;
    month?: string;
    storeId?: string;
  }): Promise<CashCollectionDto[]> {
    const period = params.period || 'ALL';
    const dateRange = dateRangeForPeriod(period, params.month);

    const handovers = await prisma.cashHandover.findMany({
      where: {
        ...(params.storeId && params.storeId !== 'all' ? { storeId: params.storeId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      include: {
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    if (handovers.length === 0) return [];

    const txIds = handovers.map((h) => h.financialTransactionId);
    const txs = await prisma.financialTransaction.findMany({
      where: { id: { in: txIds } },
      include: {
        destinationAccount: { select: { name: true } },
      },
    });
    const txMap = new Map(txs.map((t) => [t.id, t]));

    return handovers.map((h) => {
      const tx = txMap.get(h.financialTransactionId);
      const isCancelled = tx?.status === 'CANCELLED';
      return {
        id: h.id,
        transactionNumber: tx?.transactionNumber || `INK-${h.id.slice(0, 8)}`,
        storeId: h.storeId,
        storeName: h.store?.name || 'Магазин',
        destinationName: tx?.destinationAccount?.name || 'Центральная касса',
        amountTjs: Number(h.amountTjs),
        amountUsd: Number(h.amountUsd),
        comment: tx?.comment || null,
        status: isCancelled ? 'CANCELLED' : 'POSTED',
        createdAt: h.createdAt.toISOString(),
        createdByName: h.acceptedByName,
        cancelledAt: isCancelled ? (tx?.cancelledAt ?? tx?.updatedAt)?.toISOString() ?? null : null,
      };
    });
  }

  /**
   * Execute an atomic cash collection from a retail store into central safe.
   */
  public static async collect(input: {
    storeId: string;
    amountUsd: MoneyInput;
    comment?: string;
    actorUserId: string;
  }): Promise<CashCollectionDto> {
    // Registers hold USD, so the handover moves dollars; the TJS figure is informational.
    const amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма инкассации');

    return prisma.$transaction(async (tx: TransactionClient) => {
      const actor = await resolveActor(tx, input.actorUserId);
      const exchangeRate = await requireTodayRate(tx);
      const businessDate = getBusinessDateKey(new Date());

      // 1. Lock and validate source retail store
      const { store: sourceStore, account: sourceAccount } = await lockCashRegister(
        tx,
        input.storeId,
        actor,
        'Инкассация в центральную кассу'
      );
      if (sourceStore.isMainWarehouse) {
        throw new Error('Нельзя производить инкассацию из Центральной кассы в Центральную кассу');
      }

      // Check balance and decrement source store register
      const sourceGuard = await tx.store.updateMany({
        where: { id: input.storeId, cashBalanceUsd: { gte: amountUsd } },
        data: { cashBalanceUsd: { decrement: amountUsd } },
      });
      if (sourceGuard.count !== 1) {
        throw new Error(
          `В кассе «${sourceStore.name}» недостаточно средств: доступно $${sourceStore.cashBalanceUsd}`
        );
      }

      // 2. Lock and increment central cash register
      const { store: centralStore, account: centralAccount } = await lockCentralCashRegister(
        tx,
        actor,
        `Приём инкассации из «${sourceStore.name}»`
      );
      await tx.store.update({
        where: { id: centralStore.id },
        data: { cashBalanceUsd: { increment: amountUsd } },
      });

      const amountTjs = roundMoney(D(amountUsd).mul(exchangeRate));

      // 3. Post financial ledger TRANSFER between store accounts
      const financialTx = await postTransaction(tx, {
        type: 'TRANSFER',
        direction: 'NEUTRAL',
        numberPrefix: 'TR',
        accountId: sourceAccount.id,
        destinationAccountId: centralAccount.id,
        balanceCurrency: 'USD',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate,
        amountTjs,
        amountUsd,
        shopId: sourceStore.id,
        sourceType: 'CASH_COLLECTION',
        description: `Инкассация кассы: ${sourceStore.name} → ${centralStore.name}`,
        comment: input.comment,
        createdByUserId: actor.id,
        guardBalance: true,
      });

      // 4. Create CashHandover document record
      const handover = await tx.cashHandover.create({
        data: {
          storeId: sourceStore.id,
          amountTjs,
          exchangeRate,
          amountUsd,
          businessDate,
          acceptedByUserId: actor.id,
          acceptedByName: actor.name,
          financialTransactionId: financialTx.id,
        },
      });

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'CASH_COLLECTION',
          details: `Инкассация $${amountUsd} (${amountTjs} сомони) из магазина «${sourceStore.name}» в «${centralStore.name}»`,
          financialDetails: moneyJson({
            amountTjs,
            amountUsd,
            exchangeRate,
            sourceStoreId: sourceStore.id,
            targetStoreId: centralStore.id,
            handoverId: handover.id,
            financialTransactionId: financialTx.id,
          }),
        },
      });

      return {
        id: handover.id,
        transactionNumber: financialTx.transactionNumber,
        storeId: sourceStore.id,
        storeName: sourceStore.name,
        destinationName: centralAccount.name,
        amountTjs: Number(amountTjs),
        amountUsd: Number(amountUsd),
        comment: input.comment || null,
        status: 'POSTED' as const,
        createdAt: handover.createdAt.toISOString(),
        createdByName: actor.name,
        cancelledAt: null,
      };
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * Cancel an existing cash collection and return cash to the store register.
   */
  public static async cancel(id: string, actorUserId: string): Promise<CashCollectionDto> {
    return prisma.$transaction(async (tx: TransactionClient) => {
      const actor = await resolveActor(tx, actorUserId);

      const handover = await tx.cashHandover.findUnique({
        where: { id },
        include: { store: true },
      });
      if (!handover) throw new Error('Запись об инкассации не найдена');

      const origTx = await tx.financialTransaction.findUnique({
        where: { id: handover.financialTransactionId },
        include: { destinationAccount: true },
      });
      if (!origTx) throw new Error('Финансовая транзакция инкассации не найдена');
      // Claim the cancellation first: the row lock makes a concurrent cancel of the same
      // collection wait here and then find it no longer POSTED, so cash moves back only once.
      const claimed = await tx.financialTransaction.updateMany({
        where: { id: origTx.id, status: 'POSTED' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: actor.id },
      });
      if (claimed.count !== 1) throw new Error('Эта инкассация уже была отменена ранее');

      // 1. Lock central cash and verify it has sufficient cash to return
      const { store: centralStore, account: centralAccount } = await lockCentralCashRegister(
        tx,
        actor,
        `Отмена инкассации ${origTx.transactionNumber}`
      );

      const centralGuard = await tx.store.updateMany({
        where: { id: centralStore.id, cashBalanceUsd: { gte: handover.amountUsd } },
        data: { cashBalanceUsd: { decrement: handover.amountUsd } },
      });
      if (centralGuard.count !== 1) {
        throw new Error(
          `В Центральной кассе недостаточно средств ($${centralStore.cashBalanceUsd}) для возврата инкассации`
        );
      }

      // 2. Lock retail store and return cash to its register
      const { store: retailStore, account: retailAccount } = await lockCashRegister(
        tx,
        handover.storeId,
        actor,
        `Возврат отмененной инкассации ${origTx.transactionNumber}`
      );
      await tx.store.update({
        where: { id: retailStore.id },
        data: { cashBalanceUsd: { increment: handover.amountUsd } },
      });

      // 3. Post the reversing TRANSFER (the original was marked CANCELLED above)
      await postTransaction(tx, {
        type: 'TRANSFER',
        direction: 'NEUTRAL',
        numberPrefix: 'TR',
        accountId: centralAccount.id,
        destinationAccountId: retailAccount.id,
        balanceCurrency: 'USD',
        amount: handover.amountTjs,
        currency: 'TJS',
        exchangeRate: handover.exchangeRate,
        amountTjs: handover.amountTjs,
        amountUsd: handover.amountUsd,
        shopId: retailStore.id,
        sourceType: 'CASH_COLLECTION_REVERSAL',
        reversedTransactionId: origTx.id,
        description: `Отмена инкассации ${origTx.transactionNumber}: ${centralStore.name} → ${retailStore.name}`,
        createdByUserId: actor.id,
        guardBalance: true,
      });

      // 4. Audit log
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'CASH_COLLECTION_CANCEL',
          details: `Отменена инкассация ${origTx.transactionNumber} на сумму $${handover.amountUsd} (${handover.amountTjs} сомони); средства возвращены в кассу «${retailStore.name}»`,
          financialDetails: moneyJson({
            handoverId: handover.id,
            originalTransactionId: origTx.id,
            amountTjs: handover.amountTjs,
            amountUsd: handover.amountUsd,
          }),
        },
      });

      return {
        id: handover.id,
        transactionNumber: origTx.transactionNumber,
        storeId: retailStore.id,
        storeName: retailStore.name,
        destinationName: centralAccount.name,
        amountTjs: Number(handover.amountTjs),
        amountUsd: Number(handover.amountUsd),
        comment: origTx.comment,
        status: 'CANCELLED' as const,
        createdAt: handover.createdAt.toISOString(),
        createdByName: handover.acceptedByName,
        cancelledAt: new Date().toISOString(),
      };
    }, { maxWait: 10000, timeout: 25000 });
  }
}
