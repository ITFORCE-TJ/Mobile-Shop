import { D, type MoneyInput } from '../../common/decimal';
import type { TransactionClient } from '../../prisma/prisma.service';
import { nextTransactionNumber } from './transaction-number.service';

type FinancialTransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'SUPPLIER_PAYMENT'
  | 'OWNER_DEPOSIT'
  | 'OWNER_WITHDRAWAL'
  | 'REFUND'
  | 'ADJUSTMENT';
type FinancialDirection = 'IN' | 'OUT' | 'NEUTRAL';
type LedgerCurrency = 'TJS' | 'USD';
type CounterpartyType = 'SUPPLIER' | 'CUSTOMER' | 'EMPLOYEE' | 'OWNER' | 'OTHER';

interface PostTransactionInput {
  type: FinancialTransactionType;
  direction: FinancialDirection;
  /** Document number prefix, e.g. "CR"/"CE"/"SP"/"OD"/"OW"/"RF". */
  numberPrefix: string;
  accountId: string;
  /** TRANSFER only — the account money moved into. */
  destinationAccountId?: string;
  /** Which of the account's two balance columns this transaction actually moves. */
  balanceCurrency: LedgerCurrency;
  amount: MoneyInput;
  currency: LedgerCurrency;
  exchangeRate?: MoneyInput | null;
  amountTjs: MoneyInput;
  amountUsd: MoneyInput;
  categoryId?: string;
  categoryName?: string;
  counterpartyType?: CounterpartyType;
  counterpartyId?: string;
  counterpartyName?: string;
  shopId?: string;
  sourceType?: string;
  sourceId?: string;
  reversedTransactionId?: string;
  description: string;
  comment?: string;
  createdByUserId: string;
  /** Reject the movement if it would take the account balance negative (default true). */
  guardBalance?: boolean;
}

async function adjustBalance(tx: TransactionClient, accountId: string, currency: LedgerCurrency, delta: MoneyInput, guard: boolean) {
  if (D(delta).eq(0)) return;
  if (currency === 'TJS') {
    if (D(delta).lt(0) && guard) {
      const res = await tx.financialAccount.updateMany({ where: { id: accountId, balanceTjs: { gte: D(delta).negated() } }, data: { balanceTjs: { increment: delta } } });
      if (res.count !== 1) throw new Error('Недостаточно средств на счёте для этой операции');
    } else {
      await tx.financialAccount.update({ where: { id: accountId }, data: { balanceTjs: { increment: delta } } });
    }
  } else {
    if (D(delta).lt(0) && guard) {
      const res = await tx.financialAccount.updateMany({ where: { id: accountId, balanceUsd: { gte: D(delta).negated() } }, data: { balanceUsd: { increment: delta } } });
      if (res.count !== 1) throw new Error('Недостаточно средств на счёте для этой операции');
    } else {
      await tx.financialAccount.update({ where: { id: accountId }, data: { balanceUsd: { increment: delta } } });
    }
  }
}

/** Finds a FinancialCategory by name, creating it (as a system category) if missing. */
async function resolveCategory(tx: TransactionClient, name: string, direction: FinancialDirection) {
  const existing = await tx.financialCategory.findFirst({ where: { name } });
  if (existing) return existing;
  return tx.financialCategory.create({ data: { name, direction, isSystem: true } });
}

/**
 * Core ledger primitive: records one FinancialTransaction row and moves the
 * corresponding account balance(s), all within the caller's existing transaction.
 * Every money-moving module (sales, expenses, suppliers, owners, ...) calls this
 * right alongside its own existing Store/Owner/Supplier balance mutation — see
 * the Phase 1 finance plan for why both are kept in sync rather than replaced.
 */
export async function postTransaction(tx: TransactionClient, input: PostTransactionInput) {
  const moveAmount = input.balanceCurrency === 'TJS' ? input.amountTjs : input.amountUsd;
  const guard = input.guardBalance ?? true;

  if (input.direction === 'OUT') {
    await adjustBalance(tx, input.accountId, input.balanceCurrency, D(moveAmount).negated(), guard);
  } else if (input.direction === 'IN') {
    await adjustBalance(tx, input.accountId, input.balanceCurrency, moveAmount, guard);
  } else if (input.type === 'TRANSFER') {
    if (!input.destinationAccountId) throw new Error('Не указан счёт назначения перевода');
    await adjustBalance(tx, input.accountId, input.balanceCurrency, D(moveAmount).negated(), guard);
    await adjustBalance(tx, input.destinationAccountId, input.balanceCurrency, moveAmount, false);
  }

  const category = input.categoryId
    ? { id: input.categoryId }
    : input.categoryName
      ? await resolveCategory(tx, input.categoryName, input.direction)
      : null;

  const transactionNumber = await nextTransactionNumber(tx, input.numberPrefix);

  return tx.financialTransaction.create({
    data: {
      transactionNumber,
      type: input.type,
      direction: input.direction,
      transactionDate: new Date(),
      accountId: input.accountId,
      destinationAccountId: input.destinationAccountId,
      balanceCurrency: input.balanceCurrency,
      amount: input.amount,
      currency: input.currency,
      exchangeRate: input.exchangeRate ?? null,
      amountTjs: input.amountTjs,
      amountUsd: input.amountUsd,
      categoryId: category?.id,
      counterpartyType: input.counterpartyType,
      counterpartyId: input.counterpartyId,
      counterpartyName: input.counterpartyName,
      shopId: input.shopId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reversedTransactionId: input.reversedTransactionId,
      description: input.description,
      comment: input.comment,
      createdByUserId: input.createdByUserId,
    },
  });
}

/**
 * Cancels a POSTED transaction: marks it CANCELLED (never deleted) and posts a new
 * reversal transaction with the opposite balance movement, linked via
 * `reversedTransactionId`. The reversal never blocks on insufficient funds — undoing
 * a transaction must always be possible.
 */
export async function cancelTransaction(tx: TransactionClient, transactionId: string, actorId: string) {
  const original = await tx.financialTransaction.findUnique({ where: { id: transactionId } });
  if (!original) throw new Error('Финансовая операция не найдена');
  if (original.status === 'CANCELLED') throw new Error('Операция уже отменена');
  if (original.reversedTransactionId) throw new Error('Нельзя отменить сторнирующую операцию');
  if (original.type === 'TRANSFER' && !original.destinationAccountId) throw new Error('Не указан счёт назначения перевода');

  await tx.financialTransaction.update({
    where: { id: transactionId },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: actorId },
  });

  const reverseDirection: FinancialDirection = original.direction === 'IN' ? 'OUT' : original.direction === 'OUT' ? 'IN' : 'NEUTRAL';

  return postTransaction(tx, {
    type: original.type as FinancialTransactionType,
    direction: reverseDirection,
    numberPrefix: 'AJ',
    accountId: original.type === 'TRANSFER' ? original.destinationAccountId! : original.accountId,
    destinationAccountId: original.type === 'TRANSFER' ? original.accountId : undefined,
    balanceCurrency: (original.balanceCurrency as LedgerCurrency) || 'USD',
    amount: original.amount,
    currency: original.currency as LedgerCurrency,
    exchangeRate: original.exchangeRate ?? undefined,
    amountTjs: original.amountTjs,
    amountUsd: original.amountUsd,
    categoryId: original.categoryId ?? undefined,
    counterpartyType: (original.counterpartyType as CounterpartyType) ?? undefined,
    counterpartyId: original.counterpartyId ?? undefined,
    counterpartyName: original.counterpartyName ?? undefined,
    shopId: original.shopId ?? undefined,
    sourceType: original.sourceType ?? undefined,
    sourceId: original.sourceId ?? undefined,
    reversedTransactionId: original.id,
    description: `Отмена: ${original.description}`,
    createdByUserId: actorId,
    guardBalance: false,
  });
}
