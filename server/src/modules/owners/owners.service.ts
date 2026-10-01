import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireFiniteNumber, requirePositiveMoney, roundMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';
import { allocateOwnerProfit } from '../sales/profit';

export class OwnersService {
  /**
   * Owner capital/profit moves in and out of the physical main-warehouse cash
   * register, same as sales/expenses/supplier payments do for their stores —
   * without this, investments and payouts were pure bookkeeping with no
   * matching movement in any real till.
   */
  private static async getMainWarehouse(tx: TransactionClient) {
    const store = await tx.store.findFirst({ where: { isMainWarehouse: true } });
    if (!store) throw new Error('Главный склад не найден');
    return store;
  }

  public static async resolveTargetStore(tx: TransactionClient, storeIdentifier?: string) {
    if (storeIdentifier && storeIdentifier !== 'Главный счет') {
      const byId = await tx.store.findFirst({ where: { id: storeIdentifier } });
      if (byId) return byId;
      const byName = await tx.store.findFirst({ where: { name: storeIdentifier } });
      if (byName) return byName;
    }
    return OwnersService.getMainWarehouse(tx);
  }

  public static async investment(ownerId: string, amountUsd: MoneyInput, destination: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма инвестиции');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const exchangeRate = await requireTodayRate(tx);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');

      const targetStore = await OwnersService.resolveTargetStore(tx, destination);
      const cashAmountTjs = roundMoney(D(amountUsd).mul(exchangeRate));
      await tx.store.update({ where: { id: targetStore.id }, data: { cashBalanceTjs: { increment: cashAmountTjs } } });

      const updated = await tx.owner.update({ where: { id: ownerId }, data: { capitalBalanceUsd: { increment: amountUsd } } });
      const ownerTx = await tx.ownerTransaction.create({
        data: { ownerId, type: 'INVESTMENT', amountUsd, exchangeRate, sourceOrDestination: targetStore.name, createdByUserId: actor.id, note },
      });
      const cashAccount = await getStoreCashAccount(tx, targetStore.id, targetStore.name);
      await postTransaction(tx, {
        type: 'OWNER_DEPOSIT',
        direction: 'IN',
        numberPrefix: 'OD',
        accountId: cashAccount.id,
        balanceCurrency: 'TJS',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate,
        amountTjs: cashAmountTjs,
        amountUsd,
        categoryName: 'Взнос владельца',
        counterpartyType: 'OWNER',
        counterpartyId: ownerId,
        counterpartyName: owner.name,
        shopId: targetStore.id,
        sourceType: 'OWNER_TRANSACTION',
        sourceId: ownerTx.id,
        description: `${owner.name} вложил $${amountUsd} в капитал (${targetStore.name})`,
        createdByUserId: actor.id,
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_INVESTMENT', description: `${owner.name} вложил $${amountUsd} в капитал (${targetStore.name})`, amountUsd, exchangeRate, storeId: targetStore.id, storeName: targetStore.name, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_INVESTMENT', details: `${owner.name} вложил $${amountUsd} в капитал (${targetStore.name})`, financialDetails: moneyJson({ amountUsd, exchangeRate }) },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async withdrawal(ownerId: string, amountUsd: MoneyInput, source: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма изъятия');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const exchangeRate = await requireTodayRate(tx);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({ where: { id: ownerId, capitalBalanceUsd: { gte: amountUsd } }, data: { capitalBalanceUsd: { decrement: amountUsd } } });
      if (guard.count !== 1) throw new Error('Сумма изъятия превышает текущий капитал');

      const targetStore = await OwnersService.resolveTargetStore(tx, source);
      const cashAmountTjs = roundMoney(D(amountUsd).mul(exchangeRate));
      const cashGuard = await tx.store.updateMany({ where: { id: targetStore.id, cashBalanceTjs: { gte: cashAmountTjs } }, data: { cashBalanceTjs: { decrement: cashAmountTjs } } });
      if (!D(cashGuard.count).eq(1)) throw new Error(`В кассе "${targetStore.name}" недостаточно наличных для изъятия`);

      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      const ownerTx = await tx.ownerTransaction.create({
        data: { ownerId, type: 'WITHDRAWAL', amountUsd, exchangeRate, sourceOrDestination: targetStore.name, createdByUserId: actor.id, note },
      });
      const cashAccount = await getStoreCashAccount(tx, targetStore.id, targetStore.name);
      await postTransaction(tx, {
        type: 'OWNER_WITHDRAWAL',
        direction: 'OUT',
        numberPrefix: 'OW',
        accountId: cashAccount.id,
        balanceCurrency: 'TJS',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate,
        amountTjs: cashAmountTjs,
        amountUsd,
        categoryName: 'Изъятие капитала владельцем',
        counterpartyType: 'OWNER',
        counterpartyId: ownerId,
        counterpartyName: owner.name,
        shopId: targetStore.id,
        sourceType: 'OWNER_TRANSACTION',
        sourceId: ownerTx.id,
        description: `${owner.name} изъял $${amountUsd} из капитала (${targetStore.name})`,
        createdByUserId: actor.id,
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_CAPITAL_WITHDRAWAL', description: `${owner.name} изъял $${amountUsd} из капитала (${targetStore.name})`, amountUsd: D(amountUsd).negated(), exchangeRate, storeId: targetStore.id, storeName: targetStore.name, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_WITHDRAWAL', details: `${owner.name} изъял $${amountUsd} из капитала (${targetStore.name})`, financialDetails: moneyJson({ amountUsd, exchangeRate }) },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async payout(ownerId: string, amountUsd: MoneyInput, source: string, note: string | undefined, userId: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма выплаты');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const exchangeRate = await requireTodayRate(tx);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({
        where: { id: ownerId, availableProfitUsd: { gte: amountUsd } },
        data: { totalPaidProfitUsd: { increment: amountUsd }, availableProfitUsd: { decrement: amountUsd } },
      });
      if (guard.count !== 1) throw new Error('Сумма выплаты превышает доступную прибыль');

      const targetStore = await OwnersService.resolveTargetStore(tx, source);
      const cashAmountTjs = roundMoney(D(amountUsd).mul(exchangeRate));
      const cashGuard = await tx.store.updateMany({ where: { id: targetStore.id, cashBalanceTjs: { gte: cashAmountTjs } }, data: { cashBalanceTjs: { decrement: cashAmountTjs } } });
      if (!D(cashGuard.count).eq(1)) throw new Error(`В кассе "${targetStore.name}" недостаточно наличных для выплаты прибыли`);

      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      const ownerTx = await tx.ownerTransaction.create({
        data: { ownerId, type: 'PROFIT_PAYOUT', amountUsd, exchangeRate, sourceOrDestination: targetStore.name, createdByUserId: actor.id, note },
      });
      const cashAccount = await getStoreCashAccount(tx, targetStore.id, targetStore.name);
      await postTransaction(tx, {
        type: 'OWNER_WITHDRAWAL',
        direction: 'OUT',
        numberPrefix: 'OW',
        accountId: cashAccount.id,
        balanceCurrency: 'TJS',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate,
        amountTjs: cashAmountTjs,
        amountUsd,
        categoryName: 'Выплата прибыли владельцу',
        counterpartyType: 'OWNER',
        counterpartyId: ownerId,
        counterpartyName: owner.name,
        shopId: targetStore.id,
        sourceType: 'OWNER_TRANSACTION',
        sourceId: ownerTx.id,
        description: `Выплачена прибыль ${owner.name}: $${amountUsd} (${targetStore.name})`,
        createdByUserId: actor.id,
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_PROFIT_PAYOUT', description: `Выплачена прибыль ${owner.name}: $${amountUsd} (${targetStore.name})`, amountUsd: D(amountUsd).negated(), exchangeRate, storeId: targetStore.id, storeName: targetStore.name, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'PROFIT_PAYOUT', details: `Выплачена прибыль ${owner.name}: $${amountUsd} (${targetStore.name})`, financialDetails: moneyJson({ amountUsd, exchangeRate }) },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async reinvest(ownerId: string, amountUsd: MoneyInput, note: string | undefined, userId: string, destination?: string) {
    amountUsd = requirePositiveMoney(amountUsd, 'Сумма реинвестирования');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const exchangeRate = await requireTodayRate(tx);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');
      const guard = await tx.owner.updateMany({
        where: { id: ownerId, availableProfitUsd: { gte: amountUsd } },
        data: { availableProfitUsd: { decrement: amountUsd }, totalReinvestedUsd: { increment: amountUsd }, capitalBalanceUsd: { increment: amountUsd } },
      });
      if (guard.count !== 1) throw new Error('Сумма реинвестирования превышает доступную прибыль');
      const targetStore = await OwnersService.resolveTargetStore(tx, destination);
      const updated = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      await tx.ownerTransaction.create({
        data: { ownerId, type: 'REINVEST', amountUsd, exchangeRate, sourceOrDestination: targetStore.name, createdByUserId: actor.id, note },
      });
      await tx.ledgerEntry.create({ data: { type: 'OWNER_REINVESTMENT', description: `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал (${targetStore.name})`, amountUsd, exchangeRate, storeId: targetStore.id, storeName: targetStore.name, userName: actor.name } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'REINVEST', details: `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал (${targetStore.name})`, financialDetails: moneyJson({ amountUsd, exchangeRate }) },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async updateProfitShares(shares: { ownerId: string; sharePercent: number }[], userId: string, rebalanceBalances = false) {
    if (!Array.isArray(shares) || D(shares.length).eq(0)) throw new Error('Укажите доли владельцев');
    // Stored as DECIMAL(7,4): keep 4 places so e.g. 33.3333/33.3333/33.3334 sums to 100
    // (money rounding to 2 places made any three-way split impossible to save).
    const normalized = shares.map((share) => {
      const sharePercent = D(requireFiniteNumber(share.sharePercent, 'Доля владельца')).toDecimalPlaces(4);
      if (sharePercent.lt(0) || sharePercent.gt(100)) throw new Error('Доля владельца должна быть от 0 до 100%');
      return { ownerId: share.ownerId, sharePercent };
    });
    if (!D(new Set(normalized.map((share) => share.ownerId)).size).eq(normalized.length)) throw new Error('Владелец не может быть указан дважды');
    const total = normalized.reduce((sum, s) => D(sum).plus(s.sharePercent), D(0));
    if (D(D(D(total).minus(100)).abs()).gt(0.000001)) {
      throw new Error(`Сумма долей должна равняться 100% (сейчас ${total}%)`);
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      await tx.$queryRaw`SELECT id FROM owners ORDER BY id FOR UPDATE`;
      const owners = await tx.owner.findMany();
      const actualIds = new Set(owners.map((owner) => owner.id));
      if (normalized.length !== owners.length || normalized.some((share) => !actualIds.has(share.ownerId))) {
        throw new Error('Необходимо указать долю каждого владельца');
      }

      if (rebalanceBalances) {
        // Settled profit belongs to its recipient. Rewriting lifetime accruals while
        // keeping payouts/reinvestments would create an unsupported partner debt.
        if (owners.some(o => !D(o.totalPaidProfitUsd).isZero() || !D(o.totalReinvestedUsd).isZero())) {
          throw new Error('Перераспределение остатков после выплат или реинвестирования запрещено. Новые доли можно сохранить без перерасчёта истории.');
        }
        const totalAvailable = roundMoney(owners.reduce((sum, o) => D(sum).plus((o.availableProfitUsd || 0)), D(0)));
        const totalAccrued = roundMoney(owners.reduce((sum, o) => D(sum).plus((o.totalAccruedProfitUsd || 0)), D(0)));

        const availAllocations = allocateOwnerProfit(
          totalAvailable,
          normalized.map(s => ({ id: s.ownerId, profitSharePercent: s.sharePercent }))
        );
        const accruedAllocations = allocateOwnerProfit(
          totalAccrued,
          normalized.map(s => ({ id: s.ownerId, profitSharePercent: s.sharePercent }))
        );

        for (const s of normalized) {
          const avail = availAllocations.find(a => a.ownerId === s.ownerId)?.amountUsd ?? 0;
          const accrued = accruedAllocations.find(a => a.ownerId === s.ownerId)?.amountUsd ?? 0;
          await tx.owner.update({
            where: { id: s.ownerId },
            data: {
              profitSharePercent: s.sharePercent,
              availableProfitUsd: roundMoney(avail),
              totalAccruedProfitUsd: roundMoney(accrued),
            },
          });
        }
      } else {
        for (const s of normalized) {
          await tx.owner.update({ where: { id: s.ownerId }, data: { profitSharePercent: s.sharePercent } });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'PROFIT_SHARE_CHANGE',
          details: `Изменены доли партнеров: ${normalized.map((s) => `${s.sharePercent}%`).join(', ')}${rebalanceBalances ? ' (остатки прибыли пересчитаны по долям)' : ''}`,
        },
      });
      return tx.owner.findMany();
    });
  }

  public static async closeQuarter(quarterName: string, transferRemainingToCapital: boolean, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const owners = await tx.owner.findMany();

      // Snapshot the pre-close figures so quarterly history survives the reset below —
      // the original mock logic zeroed these counters with no historical record at all.
      const snapshot = owners.map((o) => ({
        ownerId: o.id,
        name: o.name,
        capitalBalanceUsd: o.capitalBalanceUsd,
        totalAccruedProfitUsd: o.totalAccruedProfitUsd,
        totalPaidProfitUsd: o.totalPaidProfitUsd,
        availableProfitUsd: o.availableProfitUsd,
      }));
      await tx.quarterClosure.create({ data: { quarterName, closedByUserId: actor.id, snapshot: moneyJson(snapshot) } });

      // totalAccruedProfitUsd / totalPaidProfitUsd are lifetime counters — the same
      // fields drive the always-visible KPI cards on the main Owners dashboard, which
      // carry no "this quarter" qualifier. Closing a quarter must not zero them; only
      // the yet-unclaimed availableProfitUsd is affected, and only if the admin opts
      // to sweep it into capital instead of leaving it payable into next quarter.
      if (transferRemainingToCapital) {
        const sweptOwners = owners.filter((owner) => D((owner.availableProfitUsd || 0)).gt(0));
        if (sweptOwners.length > 0) {
          const exchangeRate = await requireTodayRate(tx);
          await Promise.all(sweptOwners.map(async (owner) => {
            const remaining = owner.availableProfitUsd || 0;
            const guard = await tx.owner.updateMany({
              where: { id: owner.id, availableProfitUsd: remaining },
              data: {
                capitalBalanceUsd: { increment: remaining },
                totalReinvestedUsd: { increment: remaining },
                availableProfitUsd: { decrement: remaining },
              },
            });
            if (guard.count !== 1) throw new Error('Прибыль изменилась во время закрытия квартала. Обновите данные и повторите');
            // Mirrors what a manual REINVEST produces — without this, capital visibly
            // grows with no matching entry in the transaction history feed.
            await tx.ownerTransaction.create({
              data: {
                ownerId: owner.id,
                type: 'REINVEST',
                amountUsd: remaining,
                exchangeRate,
                createdByUserId: actor.id,
                note: `Автоматическое реинвестирование остатка при закрытии квартала ${quarterName}`,
              },
            });
          }));
        }
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'QUARTER_CLOSE',
          details: `Закрыт квартальный период (${quarterName})${transferRemainingToCapital ? ', неполученный остаток прибыли зачислен в капитал' : ', неполученный остаток прибыли перенесён на следующий период'}`,
        },
      });

      return tx.owner.findMany();
    });
  }

  public static async initializeDefaultOwners(userId?: string) {
    const existing = await prisma.owner.findMany();
    if (existing.length > 0) return existing;

    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
    const partnerUser = await prisma.user.findFirst({ where: { role: 'PARTNER' }, orderBy: { createdAt: 'asc' } });

    await prisma.owner.createMany({
      data: [
        { userId: adminUser?.id, name: adminUser?.name || 'Далер', profitSharePercent: 50, capitalBalanceUsd: D(0), totalAccruedProfitUsd: D(0), totalPaidProfitUsd: D(0), totalReinvestedUsd: D(0), availableProfitUsd: D(0) },
        { userId: partnerUser?.id, name: partnerUser?.name || 'Рустам', profitSharePercent: 50, capitalBalanceUsd: D(0), totalAccruedProfitUsd: D(0), totalPaidProfitUsd: D(0), totalReinvestedUsd: D(0), availableProfitUsd: D(0) },
      ],
    });

    if (userId) {
      try {
        const actor = await resolveActor(prisma, userId);
        await prisma.auditLog.create({
          data: {
            userId: actor.id,
            userName: actor.name,
            userRole: actor.role,
            action: 'INITIALIZE_OWNERS',
            details: 'Инициализированы владельцы по умолчанию (50% / 50%)',
          },
        });
      } catch (e) {
        console.error(e);
      }
    }

    return prisma.owner.findMany();
  }

  /**
   * Returns owners with their display name always resolved live from the linked
   * User account — never a manually-copied snapshot that can silently drift out of
   * sync with a rename. Linking/unlinking is an explicit mutation; reading never
   * recreates a link the administrator deliberately removed.
   */
  public static async listWithResolvedNames() {
    const owners = await prisma.owner.findMany({ include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } });
    return owners.map((o) => ({ ...o, name: o.user?.name ?? o.name }));
  }

  /** Explicitly (re)links an owner's capital record to a specific login account. */
  public static async linkUser(ownerId: string, targetUserId: string | null, actingUserId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const owner = await tx.owner.findUnique({ where: { id: ownerId } });
      if (!owner) throw new Error('Владелец не найден');

      if (targetUserId) {
        const user = await tx.user.findUnique({ where: { id: targetUserId } });
        if (!user) throw new Error('Сотрудник не найден');
        const alreadyLinked = await tx.owner.findUnique({ where: { userId: targetUserId } });
        if (alreadyLinked && alreadyLinked.id !== ownerId) throw new Error(`Этот аккаунт уже привязан к владельцу "${alreadyLinked.name}"`);
        const updated = await tx.owner.update({ where: { id: ownerId }, data: { userId: targetUserId, name: user.name } });
        await tx.auditLog.create({
          data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_LINK_USER', details: `Владелец "${owner.name}" привязан к аккаунту "${user.name}" (${user.login})`, targetId: ownerId },
        });
        return updated;
      }

      const updated = await tx.owner.update({ where: { id: ownerId }, data: { userId: null } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'OWNER_LINK_USER', details: `Владелец "${owner.name}" отвязан от аккаунта`, targetId: ownerId },
      });
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
