import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requirePositiveMoney, roundMoney } from '../../common/money';
import { findBonusAccount, lockBonusAccount, lockCentralCashRegister } from '../finance/account.service';
import { cancelTransaction, postTransaction } from '../finance/financial-transaction.service';
import { cashBalanceFromLedger, loadCashLedger } from '../finance/cash-balance';

const TRANSFER = 'BONUS_ACCOUNT_TRANSFER';
const PAYOUT = 'BONUS_ACCOUNT_PAYOUT';

export interface BonusAccountOperation {
  id: string;
  kind: 'TRANSFER' | 'PAYOUT';
  transactionNumber: string;
  amountUsd: MoneyInput;
  amountTjs: MoneyInput;
  comment: string | null;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
}

const toDto = (t: { id: string; sourceType: string | null; transactionNumber: string; amountUsd: MoneyInput; amountTjs: MoneyInput; comment: string | null; status: string; transactionDate: Date }): BonusAccountOperation => ({
  id: t.id,
  kind: t.sourceType === PAYOUT ? 'PAYOUT' : 'TRANSFER',
  transactionNumber: t.transactionNumber,
  amountUsd: t.amountUsd,
  amountTjs: t.amountTjs,
  comment: t.comment,
  status: t.status === 'CANCELLED' ? 'CANCELLED' : 'POSTED',
  createdAt: t.transactionDate.toISOString(),
});

/**
 * The Bonus Account's money is the company's, managed by the admin: moved into Central Cash
 * or paid out for a stated purpose. Every movement is one ledger posting; it never becomes
 * owner profit and never overdraws the account.
 */
export class BonusAccountService {
  /**
   * Locks the account and returns how much of its TJS a USD amount carries: its share of the
   * account's historical TJS (all of it when the whole balance moves), never today's rate.
   */
  private static async take(tx: TransactionClient, amountUsd: MoneyInput) {
    const account = await lockBonusAccount(tx);
    const ledger = cashBalanceFromLedger(account.id, await loadCashLedger(tx, account.id));
    if (!D(ledger.usd).eq(account.balanceUsd)) {
      throw Object.assign(new Error(`Бонусный счёт не сверен с журналом ($${account.balanceUsd} против $${ledger.usd}). Операция остановлена — выполните сверку (npm run audit:bonus-collections)`), { statusCode: 409 });
    }
    if (D(account.balanceUsd).lt(amountUsd)) {
      throw new Error(`На Бонусном счёте недостаточно средств: $${account.balanceUsd}, требуется $${D(amountUsd)}`);
    }
    const amountTjs = D(amountUsd).eq(account.balanceUsd) ? D(ledger.tjs) : roundMoney(D(ledger.tjs).mul(amountUsd).div(ledger.usd));
    return { account, amountTjs };
  }

  /** Moves money from the Bonus Account into Central Cash (register and its ledger account). */
  public static async transfer(input: { amountUsd: MoneyInput; comment?: string; userId: string }) {
    const amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма перевода');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.userId);
      // Lock order as everywhere: Bonus Account, then Central Cash, then postings.
      const { account, amountTjs } = await BonusAccountService.take(tx, amountUsd);
      const { store: central, account: centralAccount } = await lockCentralCashRegister(tx, actor, 'Перевод с Бонусного счёта');
      await tx.store.update({ where: { id: central.id }, data: { cashBalanceUsd: { increment: amountUsd } } });
      const posting = await postTransaction(tx, {
        type: 'TRANSFER', direction: 'NEUTRAL', numberPrefix: 'TR',
        accountId: account.id, destinationAccountId: centralAccount.id,
        balanceCurrency: 'USD', amount: amountTjs, currency: 'TJS',
        exchangeRate: D(amountTjs).div(amountUsd).toDecimalPlaces(4),
        amountTjs, amountUsd, sourceType: TRANSFER,
        description: `Перевод с Бонусного счёта в «${central.name}»`,
        comment: input.comment?.trim() || undefined,
        createdByUserId: actor.id, guardBalance: true,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id, userName: actor.name, userRole: actor.role,
          action: 'BONUS_ACCOUNT_TRANSFER', targetId: posting.id,
          details: `Перевод с Бонусного счёта в «${central.name}»: ${amountTjs} TJS ($${amountUsd})${input.comment?.trim() ? `. ${input.comment.trim()}` : ''}`,
          financialDetails: moneyJson({ amountUsd, amountTjs, transactionId: posting.id }),
        },
      });
      return toDto(posting);
    });
  }

  /** Pays money out of the Bonus Account for a stated purpose (who and what for). */
  public static async payout(input: { amountUsd: MoneyInput; comment?: string; userId: string }) {
    const amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма выдачи');
    const purpose = input.comment?.trim();
    if (!purpose) throw new Error('Укажите, кому и за что выдаются деньги');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.userId);
      const { account, amountTjs } = await BonusAccountService.take(tx, amountUsd);
      const posting = await postTransaction(tx, {
        type: 'ADJUSTMENT', direction: 'OUT', numberPrefix: 'BO',
        accountId: account.id, balanceCurrency: 'USD', amount: amountTjs, currency: 'TJS',
        exchangeRate: D(amountTjs).div(amountUsd).toDecimalPlaces(4),
        amountTjs, amountUsd, categoryName: 'Выдача с Бонусного счёта', sourceType: PAYOUT,
        description: `Выдача с Бонусного счёта: ${purpose}`, comment: purpose,
        createdByUserId: actor.id, guardBalance: true,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id, userName: actor.name, userRole: actor.role,
          action: 'BONUS_ACCOUNT_PAYOUT', targetId: posting.id,
          details: `Выдача с Бонусного счёта: ${amountTjs} TJS ($${amountUsd}) — ${purpose}`,
          financialDetails: moneyJson({ amountUsd, amountTjs, transactionId: posting.id }),
        },
      });
      return toDto(posting);
    });
  }

  /**
   * Cancels a transfer or payout by a reversal with its original amounts. A transfer comes back
   * only if Central Cash still holds it; each operation is cancelled once.
   */
  public static async cancel(id: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      await lockBonusAccount(tx);
      await tx.$queryRaw`SELECT id FROM financial_transactions WHERE id = ${id} FOR UPDATE`;
      const original = await tx.financialTransaction.findUnique({ where: { id } });
      if (!original || ![TRANSFER, PAYOUT].includes(original.sourceType ?? '') || original.reversedTransactionId) {
        throw Object.assign(new Error('Операция Бонусного счёта не найдена'), { statusCode: 404 });
      }
      if (original.status === 'CANCELLED') throw new Error('Эта операция уже отменена');
      if (original.sourceType === TRANSFER) {
        const { store: central } = await lockCentralCashRegister(tx, actor, `Отмена перевода ${original.transactionNumber}`);
        const guard = await tx.store.updateMany({ where: { id: central.id, cashBalanceUsd: { gte: original.amountUsd } }, data: { cashBalanceUsd: { decrement: original.amountUsd } } });
        if (guard.count !== 1) throw new Error(`В Центральной кассе недостаточно средств ($${central.cashBalanceUsd}) для отмены перевода (требуется $${original.amountUsd})`);
      }
      await cancelTransaction(tx, original.id, actor.id);
      await tx.auditLog.create({
        data: {
          userId: actor.id, userName: actor.name, userRole: actor.role,
          action: 'BONUS_ACCOUNT_CANCEL', targetId: original.id,
          details: `Отменена операция Бонусного счёта ${original.transactionNumber}: ${original.amountTjs} TJS ($${original.amountUsd}) возвращены на Бонусный счёт`,
          financialDetails: moneyJson({ amountUsd: original.amountUsd, amountTjs: original.amountTjs, transactionId: original.id }),
        },
      });
      const updated = await tx.financialTransaction.findUniqueOrThrow({ where: { id } });
      return toDto(updated);
    });
  }

  /** Transfers and payouts, newest first. Read-only. */
  public static async operations(): Promise<BonusAccountOperation[]> {
    const account = await findBonusAccount(prisma as unknown as TransactionClient);
    if (!account) return [];
    const rows = await prisma.financialTransaction.findMany({
      where: { accountId: account.id, sourceType: { in: [TRANSFER, PAYOUT] }, reversedTransactionId: null },
      orderBy: { transactionDate: 'desc' },
      take: 100,
    });
    return rows.map(toDto);
  }
}
