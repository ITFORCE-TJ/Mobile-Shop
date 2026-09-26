import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { requirePositiveMoney, roundMoney } from '../../common/money';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction, cancelTransaction } from '../finance/financial-transaction.service';
import { currentOwnerAllocations, readOwnerAllocations, replaceOwnerAllocations } from '../finance/owner-allocations';

/** Employee lock serializes advances, salary payouts, payment, edits and cancellation. */
export async function lockExpenseEmployee(tx: TransactionClient, expenseId: string) {
  await tx.$queryRaw`SELECT u.id FROM users u JOIN expenses e ON e."employeeId" = u.id WHERE e.id = ${expenseId} FOR UPDATE OF u`;
}

interface CreateExpenseInput {
  category: string;
  amountTjs: MoneyInput;
  targetType?: 'STORE' | 'BUSINESS';
  storeId?: string;
  sourceAccount?: string;
  comment?: string;
  description?: string;
  paidFromCashRegister?: boolean;
  employeeId?: string;
  isEmployeeAdvance?: boolean;
  createdByUserId: string;
}

/** Runs inside a caller-supplied transaction so repair-cost bookings share one atomic unit. */
export async function createExpense(tx: TransactionClient, input: CreateExpenseInput) {
  if (input.employeeId) await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.employeeId} FOR UPDATE`;
  const actor = await resolveActor(tx, input.createdByUserId);
  const amountTjs = requirePositiveMoney(input.amountTjs, 'Сумма расхода');
  const rate = await getRateForDate(new Date());
  if (!rate) throw new Error('Сначала задайте курс валют на сегодня');
  const amountUsd = roundMoney(D(amountTjs).div(rate));
  const resolvedTargetType = input.targetType || (input.storeId ? 'STORE' : 'BUSINESS');

  const store = input.storeId ? await tx.store.findUnique({ where: { id: input.storeId } }) : null;
  const paidFromCashRegister = input.paidFromCashRegister ?? true;
  const writesOffCash = Boolean(input.storeId && store && paidFromCashRegister);
  // Not written off the cash register → nothing has actually been paid yet; the expense is
  // recorded as UNPAID and settled later from the register via payExpense.
  const status = writesOffCash ? 'PAID' : 'UNPAID';
  const resolvedSource = writesOffCash ? (input.sourceAccount || `Касса ${store!.name}`) : input.sourceAccount || null;
  const ownerProfitAllocations = await currentOwnerAllocations(tx, amountUsd);

  const expense = await tx.expense.create({
    data: {
      category: input.category,
      amountTjs,
      amountUsd,
      ownerProfitAllocations: moneyJson(ownerProfitAllocations),
      exchangeRate: rate,
      targetType: resolvedTargetType,
      storeId: input.storeId,
      sourceAccount: resolvedSource,
      comment: input.comment,
      description: input.description,
      createdByUserId: actor.id,
      paidFromCashRegister: writesOffCash,
      status,
      paidAt: writesOffCash ? new Date() : null,
      employeeId: input.employeeId,
      isEmployeeAdvance: input.isEmployeeAdvance ?? false,
    },
  });

  if (writesOffCash && store && input.storeId) {
    if (store.isMainWarehouse) throw new Error('Главный склад не является торговой кассой');
    const cashGuard = await tx.store.updateMany({ where: { id: input.storeId, cashBalanceTjs: { gte: amountTjs } }, data: { cashBalanceTjs: { decrement: amountTjs } } });
    if (!D(cashGuard.count).eq(1)) throw new Error('В кассе недостаточно наличных для расхода');

    const cashAccount = await getStoreCashAccount(tx, input.storeId, store.name);
    await postTransaction(tx, {
      type: 'EXPENSE',
      direction: 'OUT',
      numberPrefix: 'CE',
      accountId: cashAccount.id,
      balanceCurrency: 'TJS',
      amount: amountTjs,
      currency: 'TJS',
      exchangeRate: rate,
      amountTjs,
      amountUsd,
      categoryName: input.category,
      shopId: input.storeId,
      sourceType: 'EXPENSE',
      sourceId: expense.id,
      description: input.comment || input.description || `Расход: ${input.category}`,
      comment: input.comment,
      createdByUserId: actor.id,
    });
  }

  await replaceOwnerAllocations(tx, [], ownerProfitAllocations, -1);

  await tx.ledgerEntry.create({
    data: {
      type: input.category === 'Зарплата' || input.category === 'SALARY' ? 'SALARY' : 'EXPENSE',
      description: input.comment || input.description || `Расход: ${input.category}`,
      amountTjs: D(amountTjs).negated(),
      amountUsd: D(amountUsd).negated(),
      exchangeRate: rate,
      storeId: input.storeId,
      storeName: store?.name,
      userName: actor.name,
      referenceId: expense.id,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: 'EXPENSE',
      details: `Зарегистрирован расход [${input.category}]: ${amountTjs} TJS ($${amountUsd}) (${store?.name || 'Бизнес'})${status === 'UNPAID' ? ' — не оплачено' : ''}`,
      financialDetails: moneyJson({ amountTjs, amountUsd, exchangeRate: rate }),
      targetId: expense.id,
    },
  });

  return expense;
}

export async function createExpenseStandalone(input: CreateExpenseInput) {
  return prisma.$transaction((tx) => createExpense(tx, input), { maxWait: 10000, timeout: 25000 });
}

/** Pays an UNPAID expense in full from its store's cash register. */
export async function payExpense(id: string, actorId: string, storeIdForBusinessExpense?: string) {
  return prisma.$transaction(async (tx) => {
    await lockExpenseEmployee(tx, id);
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.expense.findUnique({ where: { id } });
    if (!existing) throw new Error('Расход не найден');
    if (existing.cancelledAt) throw new Error('Нельзя оплатить отменённый расход');
    if (existing.status !== 'UNPAID') throw new Error('Расход уже оплачен');

    const actor = await resolveActor(tx, actorId);
    const storeId = existing.storeId || storeIdForBusinessExpense;
    if (!storeId) throw new Error('Выберите кассу для оплаты расхода');
    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store || store.isMainWarehouse) throw new Error('Главный склад не является торговой кассой');

    const cashGuard = await tx.store.updateMany({
      where: { id: storeId, cashBalanceTjs: { gte: existing.amountTjs } },
      data: { cashBalanceTjs: { decrement: existing.amountTjs } },
    });
    if (!D(cashGuard.count).eq(1)) throw new Error('В кассе недостаточно наличных для оплаты расхода');

    const rate = existing.exchangeRate || (await getRateForDate(new Date()));
    if (!rate) throw new Error('Не найден курс валют для расхода');
    const amountUsd = existing.amountUsd ?? roundMoney(D(existing.amountTjs).div(rate));
    const description = existing.comment || existing.description || `Расход: ${existing.category}`;

    const cashAccount = await getStoreCashAccount(tx, storeId, store.name);
    await postTransaction(tx, {
      type: 'EXPENSE',
      direction: 'OUT',
      numberPrefix: 'CE',
      accountId: cashAccount.id,
      balanceCurrency: 'TJS',
      amount: existing.amountTjs,
      currency: 'TJS',
      exchangeRate: rate,
      amountTjs: existing.amountTjs,
      amountUsd,
      categoryName: existing.category,
      shopId: storeId,
      sourceType: 'EXPENSE',
      sourceId: id,
      description,
      comment: existing.comment ?? undefined,
      createdByUserId: actor.id,
    });

    const updated = await tx.expense.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paidFromCashRegister: true,
        storeId,
        sourceAccount: `Касса ${store.name}`,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'EXPENSE_PAID',
        details: `Оплачен расход [${existing.category}]: ${existing.amountTjs} TJS ($${amountUsd}) из кассы ${store.name}`,
        financialDetails: moneyJson({ amountTjs: existing.amountTjs, amountUsd, exchangeRate: rate }),
        targetId: id,
      },
    });

    return updated;
  }, { maxWait: 10000, timeout: 25000 });
}

export async function updateExpense(
  id: string,
  input: {
    category?: string;
    amountTjs?: MoneyInput;
    storeId?: string;
    comment?: string;
    description?: string;
  },
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    await lockExpenseEmployee(tx, id);
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.expense.findUnique({ where: { id } });
    if (!existing) throw new Error('Расход не найден');
    if (existing.cancelledAt) throw new Error('Нельзя редактировать отменённый расход');
    const payroll = await tx.$queryRaw<Array<{ expense_id: string }>>`SELECT expense_id FROM payroll_payouts WHERE expense_id = ${id}`;
    if (payroll?.length && (input.amountTjs !== undefined || input.category !== undefined || input.storeId !== undefined)) {
      throw new Error('Сумму и категорию расчётной выплаты нельзя менять. Отмените выплату и выполните новый расчёт зарплаты.');
    }

    const actor = await resolveActor(tx, actorId);
    const rate = existing.exchangeRate || (await getRateForDate(new Date()));
    if (!rate) throw new Error('Не найден курс валют для пересчёта расхода');

    const newAmountTjs = input.amountTjs !== undefined ? requirePositiveMoney(input.amountTjs, 'Сумма расхода') : existing.amountTjs;
    const newAmountUsd = roundMoney(D(newAmountTjs).div(rate));
    const newCategory = input.category !== undefined ? input.category.trim() : existing.category;
    const newStoreId = input.storeId !== undefined ? input.storeId : existing.storeId;
    if (existing.status === 'PAID' && existing.paidFromCashRegister && !newStoreId) throw new Error('Для оплаченного расхода необходимо сохранить кассу оплаты');
    const newComment = input.comment !== undefined ? input.comment.trim() : existing.comment;
    const newDescription = input.description !== undefined ? input.description.trim() : existing.description;

    // The ledger transaction is cancelled and reposted from scratch on every edit,
    // exactly mirroring the reverse-old/apply-new pattern already used for the store
    // cash balance and owner profit below — simpler and safer than trying to patch a
    // POSTED row in place, and it naturally handles the store-changed case too.
    const existingTransaction = await tx.financialTransaction.findFirst({ where: { sourceType: 'EXPENSE', sourceId: id, status: 'POSTED', reversedTransactionId: null } });
    if (existingTransaction) {
      await cancelTransaction(tx, existingTransaction.id, actor.id);
    }

    // Adjust store cash balance if amount or store changed
    if (existing.storeId && existing.status === 'PAID' && existing.paidFromCashRegister) {
      await tx.store.update({
        where: { id: existing.storeId },
        data: { cashBalanceTjs: { increment: existing.amountTjs } },
      });
    }
    let newCashAccountId: string | undefined;
    if (newStoreId && existing.status === 'PAID' && existing.paidFromCashRegister) {
      const targetStore = await tx.store.findUnique({ where: { id: newStoreId }, select: { isMainWarehouse: true, name: true } });
      if (!targetStore || targetStore.isMainWarehouse) throw new Error('Главный склад не является торговой кассой');
      const cashGuard = await tx.store.updateMany({
        where: { id: newStoreId, cashBalanceTjs: { gte: newAmountTjs } },
        data: { cashBalanceTjs: { decrement: newAmountTjs } },
      });
      if (!D(cashGuard.count).eq(1)) throw new Error('В кассе недостаточно наличных для расхода');
      newCashAccountId = (await getStoreCashAccount(tx, newStoreId, targetStore.name)).id;
    }

    // Reverse the old amount's owner profit impact and re-apply it for the new amount —
    // an expense decrements owner profit at creation (see createExpense), so an edit that
    // changes the amount must roll that accrual forward too, or owner profit permanently
    // drifts from the actual expense total.
    let ownerProfitAllocations;
    if (existing.amountUsd === null || !D(newAmountUsd).eq(existing.amountUsd)) {
      const previous = readOwnerAllocations(existing.ownerProfitAllocations);
      ownerProfitAllocations = await currentOwnerAllocations(tx, newAmountUsd);
      await replaceOwnerAllocations(tx, previous, ownerProfitAllocations, -1);
    }

    const updated = await tx.expense.update({
      where: { id },
      data: {
        category: newCategory,
        amountTjs: newAmountTjs,
        amountUsd: newAmountUsd,
        ...(ownerProfitAllocations ? { ownerProfitAllocations: moneyJson(ownerProfitAllocations) } : {}),
        storeId: newStoreId,
        comment: newComment,
        description: newDescription,
      },
    });

    // Update corresponding ledger entries
    await tx.ledgerEntry.updateMany({
      where: { referenceId: id },
      data: {
        amountTjs: D(newAmountTjs).negated(),
        amountUsd: D(newAmountUsd).negated(),
        description: newComment || newDescription || `Расход: ${newCategory}`,
        storeId: newStoreId,
      },
    });

    if (newCashAccountId) {
      await postTransaction(tx, {
        type: 'EXPENSE',
        direction: 'OUT',
        numberPrefix: 'CE',
        accountId: newCashAccountId,
        balanceCurrency: 'TJS',
        amount: newAmountTjs,
        currency: 'TJS',
        exchangeRate: rate,
        amountTjs: newAmountTjs,
        amountUsd: newAmountUsd,
        categoryName: newCategory,
        shopId: newStoreId ?? undefined,
        sourceType: 'EXPENSE',
        sourceId: id,
        description: newComment || newDescription || `Расход: ${newCategory}`,
        comment: newComment ?? undefined,
        createdByUserId: actor.id,
      });
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'EXPENSE_EDIT',
        details: `Отредактирован расход [${newCategory}]: ${newAmountTjs} TJS ($${newAmountUsd})`,
        financialDetails: moneyJson({ amountTjs: newAmountTjs, amountUsd: newAmountUsd }),
        targetId: id,
      },
    });

    return updated;
  }, { maxWait: 10000, timeout: 25000 });
}

export async function deleteExpense(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await lockExpenseEmployee(tx, id);
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id} FOR UPDATE`;
    const existing = await tx.expense.findUnique({ where: { id } });
    if (!existing) throw new Error('Расход не найден');
    if (existing.cancelledAt) throw new Error('Расход уже отменён');

    const actor = await resolveActor(tx, actorId);

    // Revert store cash balance
    if (existing.storeId && existing.status === 'PAID' && existing.paidFromCashRegister) {
      await tx.store.update({
        where: { id: existing.storeId },
        data: { cashBalanceTjs: { increment: existing.amountTjs } },
      });
    }

    // Reverse the profit impact this expense accrued against owners at creation time.
    await replaceOwnerAllocations(tx, readOwnerAllocations(existing.ownerProfitAllocations), [], -1);

    // Reverse (never hard-delete) the financial ledger transaction, if one was posted —
    // no more `ledgerEntry.deleteMany` here either, matching the same no-hard-delete rule.
    const existingTransaction = await tx.financialTransaction.findFirst({ where: { sourceType: 'EXPENSE', sourceId: id, status: 'POSTED', reversedTransactionId: null } });
    if (existingTransaction) {
      await cancelTransaction(tx, existingTransaction.id, actor.id);
    }

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        action: 'EXPENSE_DELETE',
        details: `Отменён расход [${existing.category}]: ${existing.amountTjs} TJS ($${existing.amountUsd})`,
        financialDetails: moneyJson({ amountTjs: existing.amountTjs, amountUsd: existing.amountUsd }),
        targetId: id,
      },
    });

    // Cancelled, never hard-deleted — the row (and its reversed ledger transaction)
    // stay queryable forever for audit purposes.
    return tx.expense.update({ where: { id }, data: { cancelledAt: new Date(), cancelledByUserId: actor.id } });
  }, { maxWait: 10000, timeout: 25000 });
}
