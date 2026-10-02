import { D, decimalMin, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { lockCashRegister, lockCentralCashRegister, getBonusFinancialAccount, lockBonusAccount } from './account.service';
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
  /** Portion of register cash originating from bonus device sales. */
  bonusCashUsd: string;
  bonusCashTjs: string;
  /** Regular cash portion going to Central Cash. */
  regularCashUsd: string;
  regularCashTjs: string;
  /** Number of pending bonus devices sold in this store. */
  bonusCount: number;
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

  // Bonus cash identification: pending bonus sales from this retail store that have not been collected
  let bonusCashUsd = D(0);
  let bonusCashTjs = D(0);
  let bonusCount = 0;

  if (!store.isMainWarehouse) {
    const pendingBonusEntries = await tx.bonusPoolEntry.findMany({
      where: {
        status: 'PENDING',
        distributionNote: null,
        sale: { storeId: store.id },
      },
      select: { profitUsd: true, profitTjs: true },
    });

    bonusCount = pendingBonusEntries.length;
    const rawBonusUsd = pendingBonusEntries.reduce((sum, e) => sum.plus(e.profitUsd), D(0));
    const rawBonusTjs = pendingBonusEntries.reduce((sum, e) => sum.plus(e.profitTjs), D(0));

    // Bonus cash in register cannot exceed total cash currently present in the register
    const currentUsd = D(store.cashBalanceUsd);
    if (currentUsd.gt(0)) {
      bonusCashUsd = decimalMin(currentUsd, rawBonusUsd);
      bonusCashTjs = tjs.gt(0) ? decimalMin(tjs, rawBonusTjs) : D(0);
    }
  }

  const currentCashUsd = D(store.cashBalanceUsd);
  const regularCashUsd = currentCashUsd.minus(bonusCashUsd);
  const regularCashTjs = tjs.minus(bonusCashTjs);

  return {
    storeId: store.id,
    storeName: store.name,
    isMainWarehouse: store.isMainWarehouse,
    cashUsd: currentCashUsd.toString(),
    cashTjs: tjs.toString(),
    unreconciledUsd: currentCashUsd.minus(usd).toString(),
    bonusCashUsd: bonusCashUsd.toString(),
    bonusCashTjs: bonusCashTjs.toString(),
    regularCashUsd: regularCashUsd.toString(),
    regularCashTjs: regularCashTjs.toString(),
    bonusCount,
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
  regularAmountUsd?: number;
  bonusAmountUsd?: number;
  bonusCount?: number;
  comment: string | null;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
  createdByName: string;
  cancelledAt: string | null;
}

export class CashCollectionService {
  /** Every active register in TJS and USD: retail stores to collect from, Central Cash, and Bonus Account. */
  public static async balances(): Promise<{
    stores: RegisterBalance[];
    central: RegisterBalance | null;
    bonusAccount: { id: string; name: string; balanceUsd: string; balanceTjs: string } | null;
  }> {
    const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    const rows = await Promise.all(stores.map((store) => registerBalance(prisma as unknown as TransactionClient, store)));
    const bonusAcc = await getBonusFinancialAccount(prisma as unknown as TransactionClient);

    return {
      stores: rows.filter((r) => !r.isMainWarehouse),
      central: rows.find((r) => r.isMainWarehouse) ?? null,
      bonusAccount: bonusAcc ? {
        id: bonusAcc.id,
        name: bonusAcc.name,
        balanceUsd: D(bonusAcc.balanceUsd).toString(),
        balanceTjs: D(bonusAcc.balanceTjs).toString(),
      } : null,
    };
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

    const audits = await prisma.auditLog.findMany({
      where: { action: 'CASH_COLLECTION', targetId: { in: handovers.map((h) => h.id) } },
      select: { targetId: true, financialDetails: true },
    });
    const auditMap = new Map(audits.map((a) => [a.targetId, a.financialDetails as any]));

    return handovers.map((h) => {
      const tx = txMap.get(h.financialTransactionId);
      const fin = auditMap.get(h.id);
      const isCancelled = tx?.status === 'CANCELLED';
      return {
        id: h.id,
        transactionNumber: tx?.transactionNumber || `INK-${h.id.slice(0, 8)}`,
        storeId: h.storeId,
        storeName: h.store?.name || 'Магазин',
        destinationName: tx?.destinationAccount?.name || 'Центральная касса',
        amountTjs: Number(h.amountTjs),
        amountUsd: Number(h.amountUsd),
        regularAmountUsd: fin?.regularUsd !== undefined ? Number(fin.regularUsd) : undefined,
        bonusAmountUsd: fin?.bonusUsd !== undefined ? Number(fin.bonusUsd) : undefined,
        bonusCount: fin?.bonusCount !== undefined ? Number(fin.bonusCount) : undefined,
        comment: tx?.comment || null,
        status: isCancelled ? 'CANCELLED' : 'POSTED',
        createdAt: h.createdAt.toISOString(),
        createdByName: h.acceptedByName,
        cancelledAt: isCancelled ? (tx?.cancelledAt ?? tx?.updatedAt)?.toISOString() ?? null : null,
      };
    });
  }

  /**
   * Hands a store register's WHOLE cash over in one transaction:
   * - The store register is completely emptied to 0 (cashier doesn't have to separate cash).
   * - Regular sales cash automatically goes into Central Cash (Касса Главный склад).
   * - Bonus devices cash automatically goes into the dedicated Bonus Account (Бонусный счёт).
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
      const bonusUsd = D(balance.bonusCashUsd);
      const bonusTjs = D(balance.bonusCashTjs);
      const regularUsd = D(balance.regularCashUsd);
      const regularTjs = D(balance.regularCashTjs);
      const effectiveRate = amountUsd.gt(0) ? amountTjs.div(amountUsd).toDecimalPlaces(4) : D(0);

      // 2. Empty the store register completely to 0
      const sourceGuard = await tx.store.updateMany({
        where: { id: sourceStore.id, cashBalanceUsd: amountUsd },
        data: { cashBalanceUsd: 0 },
      });
      if (sourceGuard.count !== 1) throw new Error(`Остаток кассы «${sourceStore.name}» изменился во время инкассации. Повторите`);

      // 3. Deposit regular sales cash into Central Cash
      const { store: centralStore, account: centralAccount } = await lockCentralCashRegister(tx, actor, `Приём инкассации из «${sourceStore.name}»`);
      if (regularUsd.gt(0)) {
        await tx.store.update({ where: { id: centralStore.id }, data: { cashBalanceUsd: { increment: regularUsd } } });
      }

      // Post the main TRANSFER to Central Cash
      const primaryFinancialTx = await postTransaction(tx, {
        type: 'TRANSFER',
        direction: 'NEUTRAL',
        numberPrefix: 'TR',
        accountId: sourceAccount.id,
        destinationAccountId: centralAccount.id,
        balanceCurrency: 'USD',
        amount: regularUsd.gt(0) ? regularUsd : amountUsd,
        currency: 'USD',
        exchangeRate: effectiveRate,
        amountTjs: regularTjs.gt(0) ? regularTjs : amountTjs,
        amountUsd: regularUsd.gt(0) ? regularUsd : amountUsd,
        shopId: sourceStore.id,
        sourceType: 'CASH_COLLECTION',
        description: bonusUsd.gt(0)
          ? `Инкассация кассы (в Центральную кассу): ${sourceStore.name} → ${centralStore.name}`
          : `Инкассация кассы: ${sourceStore.name} → ${centralStore.name}`,
        comment: input.comment,
        createdByUserId: actor.id,
        guardBalance: true,
      });

      // 4. Deposit bonus device cash into the dedicated Bonus Account (Бонусный счёт)
      let bonusTxId: string | null = null;
      let bonusAccountEntity: any = null;

      if (bonusUsd.gt(0)) {
        bonusAccountEntity = await lockBonusAccount(tx, actor, `Приём бонусной инкассации из «${sourceStore.name}»`);
        await tx.financialAccount.update({
          where: { id: bonusAccountEntity.id },
          data: {
            balanceUsd: { increment: bonusUsd },
            balanceTjs: { increment: bonusTjs },
          },
        });

        const bonusFinancialTx = await postTransaction(tx, {
          type: 'TRANSFER',
          direction: 'NEUTRAL',
          numberPrefix: 'TR',
          accountId: sourceAccount.id,
          destinationAccountId: bonusAccountEntity.id,
          balanceCurrency: 'USD',
          amount: bonusUsd,
          currency: 'USD',
          exchangeRate: effectiveRate,
          amountTjs: bonusTjs,
          amountUsd: bonusUsd,
          shopId: sourceStore.id,
          sourceType: 'CASH_COLLECTION_BONUS',
          description: `Инкассация бонусов: ${sourceStore.name} → Бонусный счёт (${balance.bonusCount} устройств)`,
          comment: input.comment,
          createdByUserId: actor.id,
          guardBalance: true,
        });
        bonusTxId = bonusFinancialTx.id;
      }

      // 5. The handover document
      const handover = await tx.cashHandover.create({
        data: {
          storeId: sourceStore.id,
          amountTjs,
          exchangeRate: effectiveRate,
          amountUsd,
          businessDate,
          acceptedByUserId: actor.id,
          acceptedByName: actor.name,
          financialTransactionId: primaryFinancialTx.id,
        },
      });

      // Link pending bonus entries from this store to this collection handover
      if (bonusUsd.gt(0)) {
        await tx.bonusPoolEntry.updateMany({
          where: {
            status: 'PENDING',
            distributionNote: null,
            sale: { storeId: sourceStore.id },
          },
          data: {
            distributionId: handover.id,
            distributionNote: `COLLECTED:${handover.id}`,
            distributedAt: new Date(),
            distributedBy: actor.name,
          },
        });
      }

      // 6. Audit log and the admin notification
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'CASH_COLLECTION',
          targetId: handover.id,
          details: bonusUsd.gt(0)
            ? `Инкассация ${amountTjs} TJS ($${amountUsd}) из магазина «${sourceStore.name}»: $${regularUsd} в Центральную кассу, $${bonusUsd} на Бонусный счёт (${balance.bonusCount} устройств)`
            : `Инкассация ${amountTjs} сомони ($${amountUsd}) из магазина «${sourceStore.name}» в «${centralStore.name}»`,
          financialDetails: moneyJson({
            amountTjs,
            amountUsd,
            regularUsd,
            regularTjs,
            bonusUsd,
            bonusTjs,
            bonusCount: balance.bonusCount,
            averageRate: effectiveRate,
            sourceStoreId: sourceStore.id,
            targetStoreId: centralStore.id,
            bonusAccountId: bonusAccountEntity?.id ?? null,
            bonusTxId,
            handoverId: handover.id,
            financialTransactionId: primaryFinancialTx.id,
          }),
        },
      });

      await notifyAdmins(tx, {
        actionType: 'CASH_COLLECTION',
        dedupeKey: `CASH_COLLECTION:${handover.id}`,
        title: 'Инкассация',
        message: bonusUsd.gt(0)
          ? `${sourceStore.name}: $${amountUsd} инкассированы ($${regularUsd} в Центральную кассу, $${bonusUsd} на Бонусный счёт)`
          : `${sourceStore.name}: ${amountTjs} сомони ($${amountUsd}) переданы в Центральную кассу`,
        store: { id: sourceStore.id, name: sourceStore.name },
        actor,
        amountTjs,
        amountUsd,
        documentRef: primaryFinancialTx.transactionNumber,
        targetType: 'CASH_COLLECTION',
        targetId: handover.id,
        targetRoute: '/finance',
      });

      return {
        id: handover.id,
        transactionNumber: primaryFinancialTx.transactionNumber,
        storeId: sourceStore.id,
        storeName: sourceStore.name,
        destinationName: bonusUsd.gt(0) ? `${centralAccount.name} + Бонусный счёт` : centralAccount.name,
        amountTjs: Number(amountTjs),
        amountUsd: Number(amountUsd),
        regularAmountUsd: Number(regularUsd),
        bonusAmountUsd: Number(bonusUsd),
        bonusCount: balance.bonusCount,
        comment: input.comment || null,
        status: 'POSTED' as const,
        createdAt: handover.createdAt.toISOString(),
        createdByName: actor.name,
        cancelledAt: null,
      };
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * Cancel an existing cash collection and return cash to the store register:
   * - Central Cash portion is deducted from Central Cash.
   * - Bonus portion is deducted from the Bonus Account.
   * - Full amount is returned to the retail store register.
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

      // Check if this handover had a bonus split recorded in audit log
      const audit = await tx.auditLog.findFirst({
        where: { action: 'CASH_COLLECTION', targetId: handover.id },
      });
      const finDetails = (audit?.financialDetails ?? {}) as {
        regularUsd?: number;
        bonusUsd?: number;
        bonusTxId?: string;
      };

      const bonusUsd = D(finDetails.bonusUsd ?? 0);
      const regularUsd = D(finDetails.regularUsd !== undefined ? finDetails.regularUsd : handover.amountUsd);

      // 1. Lock central cash and verify it has sufficient cash to return the regular part
      const { store: centralStore, account: centralAccount } = await lockCentralCashRegister(
        tx,
        actor,
        `Отмена инкассации ${origTx.transactionNumber}`
      );

      if (regularUsd.gt(0)) {
        const centralGuard = await tx.store.updateMany({
          where: { id: centralStore.id, cashBalanceUsd: { gte: regularUsd } },
          data: { cashBalanceUsd: { decrement: regularUsd } },
        });
        if (centralGuard.count !== 1) {
          throw new Error(
            `В Центральной кассе недостаточно средств ($${centralStore.cashBalanceUsd}) для возврата инкассации (требуется $${regularUsd})`
          );
        }
      }

      // If bonus was collected, withdraw it from the Bonus Account and cancel its transaction
      if (bonusUsd.gt(0)) {
        const bonusAccount = await lockBonusAccount(tx, actor, `Отмена бонусной инкассации ${origTx.transactionNumber}`);
        await tx.financialAccount.update({
          where: { id: bonusAccount.id },
          data: {
            balanceUsd: { decrement: bonusUsd },
          },
        });

        if (finDetails.bonusTxId) {
          await tx.financialTransaction.updateMany({
            where: { id: finDetails.bonusTxId, status: 'POSTED' },
            data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: actor.id },
          });
        }

        // Revert bonus pool entries back to uncollected PENDING
        await tx.bonusPoolEntry.updateMany({
          where: { distributionNote: `COLLECTED:${handover.id}` },
          data: {
            distributionId: null,
            distributionNote: null,
            distributedAt: null,
            distributedBy: null,
          },
        });
      }

      // 2. Lock retail store and return full cash to its register
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

      // 3. Post the reversing TRANSFER for central cash
      if (regularUsd.gt(0)) {
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
          amountUsd: regularUsd,
          shopId: retailStore.id,
          sourceType: 'CASH_COLLECTION_REVERSAL',
          reversedTransactionId: origTx.id,
          description: `Отмена инкассации ${origTx.transactionNumber}: ${centralStore.name} → ${retailStore.name}`,
          createdByUserId: actor.id,
          guardBalance: true,
        });
      }

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
            regularUsd,
            bonusUsd,
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
        regularAmountUsd: Number(regularUsd),
        bonusAmountUsd: Number(bonusUsd),
        comment: origTx.comment,
        status: 'CANCELLED' as const,
        createdAt: handover.createdAt.toISOString(),
        createdByName: handover.acceptedByName,
        cancelledAt: new Date().toISOString(),
      };
    }, { maxWait: 10000, timeout: 25000 });
  }
}
