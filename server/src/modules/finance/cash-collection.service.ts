import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { lockCashRegister, lockCentralCashRegister } from './account.service';
import { postTransaction } from './financial-transaction.service';
import { getBusinessDateKey } from '../../common/business-date';
import { resolveActor } from '../../common/actor';
import { requireNonNegativeMoney } from '../../common/money';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';
import { cashBalanceFromLedger, loadCashLedger } from './cash-balance';
import { notifyAdmins } from '../notifications/notification.service';

export interface RegisterBalance {
  storeId: string;
  storeName: string;
  isMainWarehouse: boolean;
  /** The register itself (authoritative USD). */
  cashUsd: string;
  /** The same cash in TJS: the historical amounts of the rows that moved it. */
  cashTjs: string;
  /** USD in the register not explained by ledger rows (must be 0 to collect). */
  unreconciledUsd: string;
}

/**
 * A register's cash in TJS and USD. Registers are kept in USD; the TJS figure is rebuilt from
 * the TJS amount each ledger row froze on its own day. Balances converted when registers moved
 * to USD have no rows: their original TJS and USD come from that migration's audit record.
 */
async function registerBalance(tx: TransactionClient, store: { id: string; name: string; isMainWarehouse: boolean; cashBalanceUsd: MoneyInput }): Promise<RegisterBalance> {
  const account = await tx.financialAccount.findUnique({ where: { storeId: store.id } });
  const ledger = account ? cashBalanceFromLedger(account.id, await loadCashLedger(tx, account.id)) : { tjs: '0', usd: '0' };
  const migration = await tx.auditLog.findFirst({ where: { action: 'CASH_REGISTER_USD_MIGRATION', targetId: store.id }, orderBy: { createdAt: 'asc' } });
  const carried = (migration?.financialDetails ?? {}) as { cashBalanceTjs?: number; cashBalanceUsd?: number };
  const tjs = D(ledger.tjs).plus(carried.cashBalanceTjs ?? 0);
  const usd = D(ledger.usd).plus(carried.cashBalanceUsd ?? 0);
  return {
    storeId: store.id,
    storeName: store.name,
    isMainWarehouse: store.isMainWarehouse,
    cashUsd: D(store.cashBalanceUsd).toString(),
    cashTjs: tjs.toString(),
    unreconciledUsd: D(store.cashBalanceUsd).minus(usd).toString(),
  };
}

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
  /** Every active register in TJS and USD: retail stores to collect from, and Central Cash. */
  public static async balances(): Promise<{ stores: RegisterBalance[]; central: RegisterBalance | null }> {
    const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    const rows = await Promise.all(stores.map((store) => registerBalance(prisma as unknown as TransactionClient, store)));
    return { stores: rows.filter((r) => !r.isMainWarehouse), central: rows.find((r) => r.isMainWarehouse) ?? null };
  }

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
   * Hands a store register's WHOLE cash over to Central Cash in one transaction: the store ends
   * at exactly 0 in both currencies and Central Cash grows by the same TJS and USD. The USD is
   * the register itself; the TJS is the historical total of the rows that filled it — today's
   * rate is never applied. Card payments never entered the register, so they are not collected.
   * `expectedCashUsd` is the balance the admin confirmed: if a sale changed it meanwhile the
   * collection is refused instead of silently taking a different amount.
   */
  public static async collect(input: {
    storeId: string;
    expectedCashUsd: MoneyInput;
    comment?: string;
    actorUserId: string;
  }): Promise<CashCollectionDto> {
    const expectedCashUsd = requireNonNegativeMoney(input.expectedCashUsd, 'Подтверждённый остаток кассы');

    return prisma.$transaction(async (tx: TransactionClient) => {
      const actor = await resolveActor(tx, input.actorUserId);
      const businessDate = getBusinessDateKey(new Date());

      // 1. Lock the store register (refuses a register out of step with its ledger account).
      const { store: sourceStore, account: sourceAccount } = await lockCashRegister(tx, input.storeId, actor, 'Инкассация в центральную кассу');
      if (sourceStore.isMainWarehouse) {
        throw new Error('Нельзя производить инкассацию из Центральной кассы в Центральную кассу');
      }
      const amountUsd = D(sourceStore.cashBalanceUsd);
      if (amountUsd.lte(0)) {
        throw new Error(`В кассе «${sourceStore.name}» нет наличных для инкассации`);
      }
      if (!amountUsd.eq(expectedCashUsd)) {
        throw Object.assign(new Error(
          `Остаток кассы «${sourceStore.name}» изменился: подтверждено $${D(expectedCashUsd)}, сейчас $${amountUsd}. Обновите данные и подтвердите инкассацию снова`,
        ), { statusCode: 409 });
      }
      const balance = await registerBalance(tx, sourceStore);
      if (!D(balance.unreconciledUsd).eq(0)) {
        throw Object.assign(new Error(
          `Касса «${sourceStore.name}» не сверена с журналом операций (расхождение $${balance.unreconciledUsd}): сумму в сомони нельзя определить. Инкассация остановлена`,
        ), { statusCode: 409 });
      }
      const amountTjs = D(balance.cashTjs);
      // Average rate of the collected cash, for the document only (amounts are not derived from it).
      const effectiveRate = amountTjs.div(amountUsd).toDecimalPlaces(4);

      // 2. Empty the store register (only from exactly the locked balance) and fill Central Cash.
      const sourceGuard = await tx.store.updateMany({
        where: { id: sourceStore.id, cashBalanceUsd: amountUsd },
        data: { cashBalanceUsd: 0 },
      });
      if (sourceGuard.count !== 1) throw new Error(`Остаток кассы «${sourceStore.name}» изменился во время инкассации. Повторите`);
      const { store: centralStore, account: centralAccount } = await lockCentralCashRegister(tx, actor, `Приём инкассации из «${sourceStore.name}»`);
      await tx.store.update({ where: { id: centralStore.id }, data: { cashBalanceUsd: { increment: amountUsd } } });

      // 3. One ledger TRANSFER with both historical amounts.
      const financialTx = await postTransaction(tx, {
        type: 'TRANSFER',
        direction: 'NEUTRAL',
        numberPrefix: 'TR',
        accountId: sourceAccount.id,
        destinationAccountId: centralAccount.id,
        balanceCurrency: 'USD',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate: effectiveRate,
        amountTjs,
        amountUsd,
        shopId: sourceStore.id,
        sourceType: 'CASH_COLLECTION',
        description: `Инкассация кассы: ${sourceStore.name} → ${centralStore.name}`,
        comment: input.comment,
        createdByUserId: actor.id,
        guardBalance: true,
      });

      // 4. The handover document.
      const handover = await tx.cashHandover.create({
        data: {
          storeId: sourceStore.id,
          amountTjs,
          exchangeRate: effectiveRate,
          amountUsd,
          businessDate,
          acceptedByUserId: actor.id,
          acceptedByName: actor.name,
          financialTransactionId: financialTx.id,
        },
      });

      // 5. Audit log and the admin notification.
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'CASH_COLLECTION',
          targetId: handover.id,
          details: `Инкассация ${amountTjs} сомони ($${amountUsd}) из магазина «${sourceStore.name}» в «${centralStore.name}»`,
          financialDetails: moneyJson({
            amountTjs,
            amountUsd,
            averageRate: effectiveRate,
            sourceStoreId: sourceStore.id,
            targetStoreId: centralStore.id,
            handoverId: handover.id,
            financialTransactionId: financialTx.id,
          }),
        },
      });
      await notifyAdmins(tx, {
        actionType: 'CASH_COLLECTION',
        dedupeKey: `CASH_COLLECTION:${handover.id}`,
        title: 'Инкассация',
        message: `${sourceStore.name}: ${amountTjs} сомони ($${amountUsd}) переданы в Центральную кассу`,
        store: { id: sourceStore.id, name: sourceStore.name },
        actor,
        amountTjs,
        amountUsd,
        documentRef: financialTx.transactionNumber,
        targetType: 'CASH_COLLECTION',
        targetId: handover.id,
        targetRoute: '/finance',
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
      await notifyAdmins(tx, {
        actionType: 'CASH_COLLECTION_CANCEL',
        dedupeKey: `CASH_COLLECTION_CANCEL:${handover.id}`,
        title: 'Инкассация отменена',
        message: `${retailStore.name}: ${handover.amountTjs} сомони ($${handover.amountUsd}) возвращены в кассу магазина`,
        store: { id: retailStore.id, name: retailStore.name },
        actor,
        amountTjs: handover.amountTjs,
        amountUsd: handover.amountUsd,
        documentRef: origTx.transactionNumber,
        targetType: 'CASH_COLLECTION',
        targetId: handover.id,
        targetRoute: '/finance',
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
