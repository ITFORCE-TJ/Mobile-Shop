import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireFiniteNumber, requirePositiveMoney, roundMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';
import { allocateOwnerProfit } from '../sales/profit';
import { findAdminOwner } from '../finance/owner-allocations';

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
      // The register is kept in USD, so owner money moves dollar for dollar — capital and cash never drift with the rate.
      await tx.store.update({ where: { id: targetStore.id }, data: { cashBalanceUsd: { increment: amountUsd } } });

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
        balanceCurrency: 'USD',
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
      const cashGuard = await tx.store.updateMany({ where: { id: targetStore.id, cashBalanceUsd: { gte: amountUsd } }, data: { cashBalanceUsd: { decrement: amountUsd } } });
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
        balanceCurrency: 'USD',
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
      const cashGuard = await tx.store.updateMany({ where: { id: targetStore.id, cashBalanceUsd: { gte: amountUsd } }, data: { cashBalanceUsd: { decrement: amountUsd } } });
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
        balanceCurrency: 'USD',
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

  public static async listStoreShares() {
    return prisma.storeProfitShare.findMany({ orderBy: [{ storeId: 'asc' }, { ownerId: 'asc' }] });
  }

  /**
   * Replaces a store's partner shares (admin only). The admin owner always keeps the rest of
   * the store's profit, so partner shares must total less than 100%; a share of 0 removes the
   * partner from the store. Only profit booked after the change uses the new shares — past
   * sales are refunded with the amounts they actually booked.
   */
  public static async setStoreShares(storeId: string, shares: { ownerId: string; sharePercent: unknown }[], userId: string) {
    const normalized = shares.map((share) => {
      const sharePercent = D(requireFiniteNumber(share?.sharePercent, 'Доля партнёра')).toDecimalPlaces(4);
      if (sharePercent.lt(0) || sharePercent.gte(100)) throw new Error('Доля партнёра должна быть от 0 до 100% (не включая 100)');
      return { ownerId: String(share?.ownerId || ''), sharePercent };
    }).filter((share) => share.sharePercent.gt(0));
    if (new Set(normalized.map((s) => s.ownerId)).size !== normalized.length) throw new Error('Партнёр указан дважды');
    const partnerTotal = normalized.reduce((sum, s) => D(sum).plus(s.sharePercent), D(0));
    if (partnerTotal.gte(100)) {
      throw new Error(`Сумма долей партнёров должна быть меньше 100%: администратор всегда получает часть прибыли магазина (сейчас ${partnerTotal}%)`);
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const store = await tx.store.findUnique({ where: { id: storeId } });
      if (!store) throw new Error('Магазин не найден');
      if (store.isMainWarehouse) throw new Error('Прибыль главного склада целиком принадлежит администратору — доли партнёров для него не задаются');
      await tx.$queryRaw`SELECT id FROM owners ORDER BY id FOR UPDATE`;
      const owners = await tx.owner.findMany({ include: { user: { select: { role: true } } } });
      const admin = findAdminOwner(owners);
      for (const share of normalized) {
        const owner = owners.find((o) => o.id === share.ownerId);
        if (!owner) throw new Error('Партнёр не найден');
        if (admin && owner.id === admin.id) throw new Error('Доля администратора не задаётся: он получает остаток прибыли магазина');
      }

      const before = await tx.storeProfitShare.findMany({ where: { storeId } });
      await tx.storeProfitShare.deleteMany({ where: { storeId } });
      if (normalized.length) {
        await tx.storeProfitShare.createMany({
          data: normalized.map((s) => ({ storeId, ownerId: s.ownerId, sharePercent: s.sharePercent, updatedByUserId: actor.id })),
        });
      }
      const name = (ownerId: string) => owners.find((o) => o.id === ownerId)?.name ?? ownerId;
      const adminShare = D(100).minus(partnerTotal);
      await tx.auditLog.create({
        data: {
          userId: actor.id, userName: actor.name, userRole: actor.role,
          action: 'STORE_PROFIT_SHARE_CHANGE',
          targetId: storeId,
          details: `Доли прибыли магазина «${store.name}»: ${admin?.name ?? 'Администратор'} ${adminShare}%${normalized.map((s) => `, ${name(s.ownerId)} ${s.sharePercent}%`).join('')}`,
          financialDetails: moneyJson({
            before: before.map((b) => ({ ownerId: b.ownerId, sharePercent: b.sharePercent })),
            after: normalized,
            adminSharePercent: adminShare,
          }),
        },
      });
      return tx.storeProfitShare.findMany({ where: { storeId } });
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
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      await tx.$queryRaw`SELECT id FROM owners ORDER BY id FOR UPDATE`;
      const owners = await tx.owner.findMany();
      const actualIds = new Set(owners.map((owner) => owner.id));
      if (normalized.some((share) => !actualIds.has(share.ownerId))) {
        throw new Error('Неизвестный владелец в списке долей');
      }

      // With partners per store, shares live on StoreProfitShare (setStoreShares); writing the
      // owner rows here would only overwrite the admin's share with one store's split.
      if ((await tx.storeProfitShare.count()) > 0) {
        throw new Error('Доли прибыли задаются отдельно для каждого магазина (окно «Доли магазина»)');
      }
      const hasStoreSpecific = owners.some((o: any) => Boolean(o.storeId));
      if (!hasStoreSpecific) {
        if (normalized.length !== owners.length) {
          throw new Error('Необходимо указать долю каждого владельца');
        }
        const total = normalized.reduce((sum, s) => D(sum).plus(s.sharePercent), D(0));
        if (D(D(D(total).minus(100)).abs()).gt(0.000001)) {
          throw new Error(`Сумма долей должна равняться 100% (сейчас ${total}%)`);
        }
      } else {
        // If an admin and a store partner are provided, ensure their sum equals 100%
        const adminShareItem = normalized.find((s) => {
          const owner = owners.find((o: any) => o.id === s.ownerId);
          return !(owner as any)?.storeId;
        });
        const storePartnerItems = normalized.filter((s) => {
          const owner = owners.find((o: any) => o.id === s.ownerId);
          return Boolean((owner as any)?.storeId);
        });

        if (adminShareItem && storePartnerItems.length === 1) {
          const storeSum = D(adminShareItem.sharePercent).plus(storePartnerItems[0].sharePercent);
          if (D(D(D(storeSum).minus(100)).abs()).gt(0.000001)) {
            throw new Error(`Сумма долей администратора и партнёра магазина должна равняться 100% (сейчас ${storeSum}%)`);
          }
        }
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
    const cleanQuarterName = String(quarterName || '').trim();
    if (!cleanQuarterName) throw new Error('Укажите название закрываемого квартала');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);

      const existingClosure = await tx.quarterClosure.findFirst({ where: { quarterName: cleanQuarterName } });
      if (existingClosure) {
        throw new Error(`Квартал «${cleanQuarterName}» уже закрыт`);
      }

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
      await tx.quarterClosure.create({ data: { quarterName: cleanQuarterName, closedByUserId: actor.id, snapshot: moneyJson(snapshot) } });

      // totalAccruedProfitUsd / totalPaidProfitUsd are lifetime counters — the same
      // fields drive the always-visible KPI cards on the main Owners dashboard, which
      // carry no "this quarter" qualifier. Closing a quarter must not zero them; only
      // the yet-unclaimed availableProfitUsd is affected, and only if the admin opts
      // to sweep it into capital instead of leaving it payable into next quarter.
      const swept: { ownerId: string; name: string; amountUsd: MoneyInput }[] = [];
      if (transferRemainingToCapital) {
        const sweptOwners = owners.filter((owner) => D((owner.availableProfitUsd || 0)).gt(0));
        if (sweptOwners.length > 0) {
          const exchangeRate = await requireTodayRate(tx);
          const mainWarehouse = await OwnersService.getMainWarehouse(tx);
          for (const owner of sweptOwners) {
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
            // Same records a manual REINVEST produces: owner history, journal and audit amounts.
            const note = `Автоматическое реинвестирование остатка при закрытии квартала ${cleanQuarterName}`;
            await tx.ownerTransaction.create({
              data: {
                ownerId: owner.id,
                type: 'REINVEST',
                amountUsd: remaining,
                exchangeRate,
                sourceOrDestination: mainWarehouse.name,
                createdByUserId: actor.id,
                note,
              },
            });
            await tx.ledgerEntry.create({ data: { type: 'OWNER_REINVESTMENT', description: `${owner.name}: ${note} — $${remaining}`, amountUsd: remaining, exchangeRate, storeId: mainWarehouse.id, storeName: mainWarehouse.name, userName: actor.name } });
            swept.push({ ownerId: owner.id, name: owner.name, amountUsd: remaining });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'QUARTER_CLOSE',
          details: `Закрыт квартальный период (${cleanQuarterName})${transferRemainingToCapital ? ', неполученный остаток прибыли зачислен в капитал' : ', неполученный остаток прибыли перенесён на следующий период'}`,
          financialDetails: moneyJson({ quarterName: cleanQuarterName, transferRemainingToCapital, sweptToCapital: swept }),
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
    const owners = await prisma.owner.findMany({ include: { user: { select: { id: true, name: true, storeId: true } } }, orderBy: { createdAt: 'asc' } });
    return owners.map((o: any) => ({ ...o, name: o.user?.name ?? o.name, storeId: o.storeId ?? o.user?.storeId ?? null }));
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
