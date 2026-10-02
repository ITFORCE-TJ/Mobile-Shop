import { randomUUID } from 'node:crypto';
import { D, decimalMin, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { lockCashRegister, lockCentralCashRegister, findBonusAccount, lockBonusAccount } from './account.service';
import { cancelTransaction, postTransaction } from './financial-transaction.service';
import { getBusinessDateKey } from '../../common/business-date';
import { resolveActor } from '../../common/actor';
import { requireNonNegativeMoney } from '../../common/money';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';
import { cashBalanceFromLedger, loadCashLedger } from './cash-balance';
import { notifyAdmins } from '../notifications/notification.service';

type Db = Pick<TransactionClient, 'financialAccount' | 'financialTransaction' | 'auditLog' | 'cashHandover' | 'bonusPoolEntry'>;
type Money = ReturnType<typeof D>;

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
  /** Part of the register a collection sends to the Bonus Account. */
  bonusCashUsd: string;
  bonusCashTjs: string;
  /** Part of the register a collection sends to Central Cash. */
  regularCashUsd: string;
  regularCashTjs: string;
  /** Bonus phones sold in this store since its last collection. */
  bonusCount: number;
}

/**
 * Bonus-derived money a store still owes the Bonus Account: the profit of the free bonus phones
 * it sold (each entry at its own recorded TJS and USD), minus what its collections already moved
 * there. Classification follows the bonus pool, never the payment method. A refunded sale gave
 * its money back, so its phone no longer counts; the quarterly close of bonus reporting does not
 * change where the cash is. Cash collected before the split existed went to Central Cash whole,
 * so only phones sold after the store's latest such collection count.
 */
async function bonusDue(db: Db, storeId: string) {
  const legacy = await db.cashHandover.findMany({
    where: { storeId, bonusAmountUsd: null, cancelledAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, financialTransactionId: true },
  });
  let cutoff: Date | null = null;
  for (const h of legacy) {
    const t = await db.financialTransaction.findUnique({ where: { id: h.financialTransactionId }, select: { status: true } });
    if (t?.status !== 'CANCELLED') { cutoff = h.createdAt; break; }
  }
  const [earned, collected, lastSplit] = await Promise.all([
    db.bonusPoolEntry.findMany({
      where: { sale: { storeId, status: { not: 'REFUNDED' } }, ...(cutoff ? { createdAt: { gt: cutoff } } : {}) },
      select: { profitUsd: true, profitTjs: true, createdAt: true },
    }),
    db.cashHandover.findMany({ where: { storeId, cancelledAt: null, bonusAmountUsd: { not: null } }, select: { bonusAmountUsd: true, bonusAmountTjs: true, createdAt: true } }),
    db.cashHandover.findFirst({ where: { storeId, cancelledAt: null, bonusAmountUsd: { not: null } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const usd = earned.reduce((s, e) => s.plus(e.profitUsd), D(0)).minus(collected.reduce((s, h) => s.plus(h.bonusAmountUsd ?? 0), D(0)));
  const tjs = earned.reduce((s, e) => s.plus(e.profitTjs), D(0)).minus(collected.reduce((s, h) => s.plus(h.bonusAmountTjs ?? 0), D(0)));
  const count = earned.filter((e) => !lastSplit || e.createdAt > lastSplit.createdAt).length;
  return { usd, tjs, count };
}

/**
 * Splits a register into its bonus and regular parts so that, in each currency,
 * bonus + regular = register exactly. The bonus part never exceeds the register; whatever
 * cannot be covered now stays due for the next collection.
 */
export function splitRegister(cash: { usd: MoneyInput; tjs: MoneyInput }, due: { usd: MoneyInput; tjs: MoneyInput }) {
  const cashUsd = D(cash.usd);
  const cashTjs = D(cash.tjs);
  const dueUsd = D(due.usd).gt(0) ? D(due.usd) : D(0);
  const bonusUsd = cashUsd.gt(0) ? D(decimalMin(dueUsd, cashUsd)) : D(0);
  let bonusTjs = D(0);
  if (bonusUsd.gt(0)) {
    // The whole register is bonus: all of its TJS goes too, so it ends at exactly 0 in both.
    bonusTjs = bonusUsd.eq(cashUsd) ? cashTjs : D(decimalMin(D(due.tjs), cashTjs));
    if (bonusTjs.lt(0)) bonusTjs = D(0);
  }
  return { bonusUsd, bonusTjs, regularUsd: cashUsd.minus(bonusUsd), regularTjs: cashTjs.minus(bonusTjs) };
}

/**
 * A register's cash in TJS and USD. Registers are kept in USD; the TJS figure is rebuilt from
 * the TJS amount each ledger row froze on its own day. Balances converted when registers moved
 * to USD have no rows: their original TJS and USD come from that migration's audit record.
 */
async function registerBalance(db: Db, store: { id: string; name: string; isMainWarehouse: boolean; cashBalanceUsd: MoneyInput }): Promise<RegisterBalance> {
  const account = await db.financialAccount.findUnique({ where: { storeId: store.id } });
  const ledger = account ? cashBalanceFromLedger(account.id, await loadCashLedger(db as TransactionClient, account.id)) : { tjs: '0', usd: '0' };
  const migration = await db.auditLog.findFirst({ where: { action: 'CASH_REGISTER_USD_MIGRATION', targetId: store.id }, orderBy: { createdAt: 'asc' } });
  const carried = (migration?.financialDetails ?? {}) as { cashBalanceTjs?: number; cashBalanceUsd?: number };
  const tjs = D(ledger.tjs).plus(carried.cashBalanceTjs ?? 0);
  const usd = D(ledger.usd).plus(carried.cashBalanceUsd ?? 0);
  const cashUsd = D(store.cashBalanceUsd);

  const due = store.isMainWarehouse ? { usd: D(0), tjs: D(0), count: 0 } : await bonusDue(db, store.id);
  const split = splitRegister({ usd: cashUsd, tjs }, due);

  return {
    storeId: store.id,
    storeName: store.name,
    isMainWarehouse: store.isMainWarehouse,
    cashUsd: cashUsd.toString(),
    cashTjs: tjs.toString(),
    unreconciledUsd: cashUsd.minus(usd).toString(),
    bonusCashUsd: split.bonusUsd.toString(),
    bonusCashTjs: split.bonusTjs.toString(),
    regularCashUsd: split.regularUsd.toString(),
    regularCashTjs: split.regularTjs.toString(),
    bonusCount: due.count,
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
  regularAmountTjs?: number;
  bonusAmountUsd?: number;
  bonusAmountTjs?: number;
  bonusCount?: number;
  comment: string | null;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
  createdByName: string;
  cancelledAt: string | null;
}

const destinationName = (regularUsd: Money, bonusUsd: Money, centralName = 'Центральная касса') =>
  bonusUsd.gt(0) && regularUsd.gt(0) ? `${centralName} + Бонусный счёт` : bonusUsd.gt(0) ? 'Бонусный счёт' : centralName;
const rateOf = (tjs: Money, usd: Money) => (usd.gt(0) ? tjs.div(usd).toDecimalPlaces(4) : null);

export class CashCollectionService {
  /** Every active register in TJS and USD: retail stores to collect from, Central Cash, and the Bonus Account. Read-only. */
  public static async balances(): Promise<{
    stores: RegisterBalance[];
    central: RegisterBalance | null;
    bonusAccount: { id: string | null; name: string; balanceUsd: string; balanceTjs: string };
  }> {
    const db = prisma as unknown as TransactionClient;
    const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    const rows = await Promise.all(stores.map((store) => registerBalance(db, store)));
    const bonus = await findBonusAccount(db);
    // TJS is rebuilt from the ledger rows' own historical amounts, like a store register.
    const bonusLedger = bonus ? cashBalanceFromLedger(bonus.id, await loadCashLedger(db, bonus.id)) : { tjs: '0', usd: '0' };

    return {
      stores: rows.filter((r) => !r.isMainWarehouse),
      central: rows.find((r) => r.isMainWarehouse) ?? null,
      bonusAccount: {
        id: bonus?.id ?? null,
        name: bonus?.name ?? 'Бонусный счёт',
        balanceUsd: D(bonus?.balanceUsd ?? 0).toString(),
        balanceTjs: D(bonusLedger.tjs).toString(),
      },
    };
  }

  /** Cash collections (handovers) filtered by period, month and store. */
  public static async list(params: { period?: ReportPeriod; month?: string; storeId?: string }): Promise<CashCollectionDto[]> {
    const dateRange = dateRangeForPeriod(params.period || 'ALL', params.month);
    const handovers = await prisma.cashHandover.findMany({
      where: {
        ...(params.storeId && params.storeId !== 'all' ? { storeId: params.storeId } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    if (handovers.length === 0) return [];

    const txs = await prisma.financialTransaction.findMany({ where: { id: { in: handovers.map((h) => h.financialTransactionId) } } });
    const txMap = new Map(txs.map((t) => [t.id, t]));
    // Collections made before the split stored it only in their audit record.
    const audits = await prisma.auditLog.findMany({
      where: { action: 'CASH_COLLECTION', targetId: { in: handovers.map((h) => h.id) } },
      select: { targetId: true, financialDetails: true },
    });
    const auditMap = new Map(audits.map((a) => [a.targetId, (a.financialDetails ?? {}) as Record<string, number | undefined>]));

    return handovers.map((h) => {
      const tx = txMap.get(h.financialTransactionId);
      const fin = auditMap.get(h.id) ?? {};
      const split = h.bonusAmountUsd !== null;
      const regularUsd = split ? D(h.regularAmountUsd ?? 0) : D(fin.regularUsd ?? h.amountUsd);
      const bonusUsd = split ? D(h.bonusAmountUsd ?? 0) : D(fin.bonusUsd ?? 0);
      const cancelled = h.cancelledAt !== null || tx?.status === 'CANCELLED';
      return {
        id: h.id,
        transactionNumber: tx?.transactionNumber || `INK-${h.id.slice(0, 8)}`,
        storeId: h.storeId,
        storeName: h.store?.name || 'Магазин',
        destinationName: destinationName(regularUsd, bonusUsd),
        amountTjs: Number(h.amountTjs),
        amountUsd: Number(h.amountUsd),
        regularAmountUsd: Number(regularUsd),
        regularAmountTjs: split ? Number(h.regularAmountTjs) : undefined,
        bonusAmountUsd: Number(bonusUsd),
        bonusAmountTjs: split ? Number(h.bonusAmountTjs) : undefined,
        bonusCount: fin.bonusCount !== undefined ? Number(fin.bonusCount) : undefined,
        comment: tx?.comment || null,
        status: cancelled ? 'CANCELLED' : 'POSTED',
        createdAt: h.createdAt.toISOString(),
        createdByName: h.acceptedByName,
        cancelledAt: cancelled ? (h.cancelledAt ?? tx?.cancelledAt ?? tx?.updatedAt)?.toISOString() ?? null : null,
      };
    });
  }

  /**
   * Hands a store register's WHOLE balance over in one transaction: the register goes to exactly
   * 0 TJS / $0; its regular part moves to Central Cash and its bonus-derived part to the Bonus
   * Account, each by one ledger transfer carrying its own historical TJS and USD amounts, so the
   * two credits equal the debit in each currency.
   */
  public static async collect(input: { storeId: string; expectedCashUsd: MoneyInput; comment?: string; actorUserId: string }): Promise<CashCollectionDto> {
    const expectedCashUsd = requireNonNegativeMoney(input.expectedCashUsd, 'Подтверждённый остаток кассы');

    return prisma.$transaction(async (tx: TransactionClient) => {
      const actor = await resolveActor(tx, input.actorUserId);
      const businessDate = getBusinessDateKey(new Date());

      // 1. Lock the store register (refuses a register out of step with its ledger account).
      const { store: sourceStore, account: sourceAccount } = await lockCashRegister(tx, input.storeId, actor, 'Инкассация');
      if (sourceStore.isMainWarehouse) throw new Error('Нельзя производить инкассацию из Центральной кассы в Центральную кассу');
      const amountUsd = D(sourceStore.cashBalanceUsd);
      if (amountUsd.lte(0)) throw new Error(`В кассе «${sourceStore.name}» нет наличных для инкассации`);
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
      const handoverId = randomUUID();
      const hasRegular = !regularUsd.isZero() || !regularTjs.isZero();
      const hasBonus = !bonusUsd.isZero() || !bonusTjs.isZero();
      // Lock order (store register → Bonus Account → Central Cash → postings) is the same in
      // every writer, so concurrent collections and bonus postings never deadlock.
      const bonusAccount = hasBonus ? await lockBonusAccount(tx) : null;

      // 2. Empty the store register to 0.
      const sourceGuard = await tx.store.updateMany({ where: { id: sourceStore.id, cashBalanceUsd: amountUsd }, data: { cashBalanceUsd: 0 } });
      if (sourceGuard.count !== 1) throw new Error(`Остаток кассы «${sourceStore.name}» изменился во время инкассации. Повторите`);

      // 3. Regular part → Central Cash (register and its ledger account, one transfer).
      let centralName = 'Центральная касса';
      let regularTx: { id: string; transactionNumber: string } | null = null;
      if (hasRegular) {
        const { store: centralStore, account: centralAccount } = await lockCentralCashRegister(tx, actor, `Приём инкассации из «${sourceStore.name}»`);
        centralName = centralStore.name;
        await tx.store.update({ where: { id: centralStore.id }, data: { cashBalanceUsd: { increment: regularUsd } } });
        regularTx = await postTransaction(tx, {
          type: 'TRANSFER', direction: 'NEUTRAL', numberPrefix: 'TR',
          accountId: sourceAccount.id, destinationAccountId: centralAccount.id,
          balanceCurrency: 'USD', amount: regularTjs, currency: 'TJS', exchangeRate: rateOf(regularTjs, regularUsd),
          amountTjs: regularTjs, amountUsd: regularUsd,
          shopId: sourceStore.id, sourceType: 'CASH_COLLECTION', sourceId: handoverId,
          description: `Инкассация кассы: ${sourceStore.name} → ${centralStore.name}`,
          comment: input.comment, createdByUserId: actor.id, guardBalance: true,
        });
      }

      // 4. Bonus-derived part → Bonus Account (one transfer; the ledger alone moves its balance).
      let bonusTx: { id: string; transactionNumber: string } | null = null;
      const bonusAccountId = bonusAccount?.id ?? null;
      if (bonusAccount) {
        bonusTx = await postTransaction(tx, {
          type: 'TRANSFER', direction: 'NEUTRAL', numberPrefix: 'TR',
          accountId: sourceAccount.id, destinationAccountId: bonusAccount.id,
          balanceCurrency: 'USD', amount: bonusTjs, currency: 'TJS', exchangeRate: rateOf(bonusTjs, bonusUsd),
          amountTjs: bonusTjs, amountUsd: bonusUsd,
          shopId: sourceStore.id, sourceType: 'CASH_COLLECTION_BONUS', sourceId: handoverId,
          description: `Инкассация бонусов: ${sourceStore.name} → Бонусный счёт (${balance.bonusCount} шт.)`,
          comment: input.comment, createdByUserId: actor.id, guardBalance: true,
        });
      }
      const primaryTx = (regularTx ?? bonusTx)!;

      // 5. The handover document with its split.
      const handover = await tx.cashHandover.create({
        data: {
          id: handoverId,
          storeId: sourceStore.id,
          amountTjs,
          exchangeRate: rateOf(amountTjs, amountUsd) ?? 0,
          amountUsd,
          businessDate,
          acceptedByUserId: actor.id,
          acceptedByName: actor.name,
          financialTransactionId: primaryTx.id,
          regularAmountTjs: regularTjs,
          regularAmountUsd: regularUsd,
          bonusAmountTjs: bonusTjs,
          bonusAmountUsd: bonusUsd,
          regularFinancialTransactionId: regularTx?.id ?? null,
          bonusFinancialTransactionId: bonusTx?.id ?? null,
        },
      });

      // 6. Audit log and the admin notification.
      const splitText = bonusUsd.gt(0) ? `: $${regularUsd} в Центральную кассу, $${bonusUsd} на Бонусный счёт (${balance.bonusCount} шт.)` : ` в «${centralName}»`;
      await tx.auditLog.create({
        data: {
          userId: actor.id, userName: actor.name, userRole: actor.role,
          action: 'CASH_COLLECTION',
          targetId: handover.id,
          details: `Инкассация ${amountTjs} TJS ($${amountUsd}) из магазина «${sourceStore.name}»${splitText}`,
          financialDetails: moneyJson({
            amountTjs, amountUsd, regularUsd, regularTjs, bonusUsd, bonusTjs, bonusCount: balance.bonusCount,
            sourceStoreId: sourceStore.id, bonusAccountId,
            regularTxId: regularTx?.id ?? null, bonusTxId: bonusTx?.id ?? null, handoverId: handover.id,
          }),
        },
      });
      await notifyAdmins(tx, {
        actionType: 'CASH_COLLECTION',
        dedupeKey: `CASH_COLLECTION:${handover.id}`,
        title: 'Инкассация',
        message: `${sourceStore.name}: ${amountTjs} сомони ($${amountUsd}) инкассированы${splitText}`,
        store: { id: sourceStore.id, name: sourceStore.name },
        actor, amountTjs, amountUsd,
        documentRef: primaryTx.transactionNumber,
        targetType: 'CASH_COLLECTION', targetId: handover.id, targetRoute: '/finance',
      });

      return {
        id: handover.id,
        transactionNumber: primaryTx.transactionNumber,
        storeId: sourceStore.id,
        storeName: sourceStore.name,
        destinationName: destinationName(regularUsd, bonusUsd, centralName),
        amountTjs: Number(amountTjs),
        amountUsd: Number(amountUsd),
        regularAmountUsd: Number(regularUsd),
        regularAmountTjs: Number(regularTjs),
        bonusAmountUsd: Number(bonusUsd),
        bonusAmountTjs: Number(bonusTjs),
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
   * Cancels a collection: each of its ledger transfers is reversed with its original TJS and
   * USD amounts (regular part out of Central Cash, bonus part out of the Bonus Account) and the
   * whole amount returns to the store register. Refused as a whole when a destination no longer
   * holds its part, and only ever applied once.
   */
  public static async cancel(id: string, actorUserId: string): Promise<CashCollectionDto> {
    return prisma.$transaction(async (tx: TransactionClient) => {
      const actor = await resolveActor(tx, actorUserId);
      const handover = await tx.cashHandover.findUnique({ where: { id }, include: { store: true } });
      if (!handover) throw new Error('Запись об инкассации не найдена');
      const primary = await tx.financialTransaction.findUnique({ where: { id: handover.financialTransactionId } });
      if (!primary) throw new Error('Финансовая транзакция инкассации не найдена');

      // Claim first: a concurrent cancel of the same collection waits on this row and then
      // finds it already cancelled, so the money moves back only once.
      const claimed = await tx.cashHandover.updateMany({ where: { id, cancelledAt: null }, data: { cancelledAt: new Date(), cancelledByUserId: actor.id } });
      if (claimed.count !== 1 || primary.status === 'CANCELLED') throw new Error('Эта инкассация уже была отменена ранее');

      const split = handover.bonusAmountUsd !== null;
      if (!split) {
        // Made before the split was recorded: a bonus part, if any, was booked incorrectly then.
        const audit = await tx.auditLog.findFirst({ where: { action: 'CASH_COLLECTION', targetId: handover.id } });
        const fin = (audit?.financialDetails ?? {}) as { bonusUsd?: number };
        if (D(fin.bonusUsd ?? 0).gt(0)) {
          throw Object.assign(new Error(
            'Эта инкассация проведена до исправления разделения бонусов, её суммы на Бонусном счёте требуют сверки. Отмена остановлена — обратитесь к администратору системы',
          ), { statusCode: 409 });
        }
      }
      const regularUsd = split ? D(handover.regularAmountUsd ?? 0) : D(handover.amountUsd);
      const bonusUsd = split ? D(handover.bonusAmountUsd ?? 0) : D(0);
      const regularTxId = split ? handover.regularFinancialTransactionId : primary.id;
      const bonusTxId = split ? handover.bonusFinancialTransactionId : null;
      const label = `Отмена инкассации ${primary.transactionNumber}`;

      const { store: retailStore } = await lockCashRegister(tx, handover.storeId, actor, label);
      // Same lock order as a collection: Bonus Account before Central Cash and any posting.
      const bonusAccount = bonusTxId ? await lockBonusAccount(tx) : null;
      if (bonusAccount && D(bonusAccount.balanceUsd).lt(bonusUsd)) {
        throw new Error(`На Бонусном счёте недостаточно средств ($${bonusAccount.balanceUsd}) для отмены инкассации (требуется $${bonusUsd})`);
      }

      if (regularTxId) {
        const { store: centralStore } = await lockCentralCashRegister(tx, actor, label);
        const guard = await tx.store.updateMany({ where: { id: centralStore.id, cashBalanceUsd: { gte: regularUsd } }, data: { cashBalanceUsd: { decrement: regularUsd } } });
        if (guard.count !== 1) {
          throw new Error(`В Центральной кассе недостаточно средств ($${centralStore.cashBalanceUsd}) для отмены инкассации (требуется $${regularUsd})`);
        }
        await cancelTransaction(tx, regularTxId, actor.id);
      }
      if (bonusTxId) await cancelTransaction(tx, bonusTxId, actor.id);
      await tx.store.update({ where: { id: retailStore.id }, data: { cashBalanceUsd: { increment: regularUsd.plus(bonusUsd) } } });

      await tx.auditLog.create({
        data: {
          userId: actor.id, userName: actor.name, userRole: actor.role,
          action: 'CASH_COLLECTION_CANCEL',
          targetId: handover.id,
          details: `Отменена инкассация ${primary.transactionNumber} на сумму $${handover.amountUsd} (${handover.amountTjs} сомони); средства возвращены в кассу «${retailStore.name}»${bonusUsd.gt(0) ? ` ($${regularUsd} из Центральной кассы, $${bonusUsd} с Бонусного счёта)` : ''}`,
          financialDetails: moneyJson({
            handoverId: handover.id, originalTransactionId: primary.id,
            amountTjs: handover.amountTjs, amountUsd: handover.amountUsd, regularUsd, bonusUsd,
            regularTxId, bonusTxId,
          }),
        },
      });
      await notifyAdmins(tx, {
        actionType: 'CASH_COLLECTION_CANCEL',
        dedupeKey: `CASH_COLLECTION_CANCEL:${handover.id}`,
        title: 'Инкассация отменена',
        message: `${retailStore.name}: ${handover.amountTjs} сомони ($${handover.amountUsd}) возвращены в кассу магазина`,
        store: { id: retailStore.id, name: retailStore.name },
        actor, amountTjs: handover.amountTjs, amountUsd: handover.amountUsd,
        documentRef: primary.transactionNumber,
        targetType: 'CASH_COLLECTION', targetId: handover.id, targetRoute: '/finance',
      });

      return {
        id: handover.id,
        transactionNumber: primary.transactionNumber,
        storeId: retailStore.id,
        storeName: retailStore.name,
        destinationName: destinationName(regularUsd, bonusUsd),
        amountTjs: Number(handover.amountTjs),
        amountUsd: Number(handover.amountUsd),
        regularAmountUsd: Number(regularUsd),
        bonusAmountUsd: Number(bonusUsd),
        comment: primary.comment,
        status: 'CANCELLED' as const,
        createdAt: handover.createdAt.toISOString(),
        createdByName: handover.acceptedByName,
        cancelledAt: new Date().toISOString(),
      };
    }, { maxWait: 10000, timeout: 25000 });
  }
}
