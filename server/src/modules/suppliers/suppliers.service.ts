import { D, decimalMin, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireNonNegativeMoney, requirePositiveMoney, roundMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { getStoreCashAccount } from '../finance/account.service';
import { currentOwnerAllocations, readOwnerAllocations, replaceOwnerAllocations } from '../finance/owner-allocations';
import type { OwnerProfitAllocation } from '../sales/profit';
import { postTransaction } from '../finance/financial-transaction.service';
import { allocateMoney } from '../../common/allocation';

/** The store register is the authoritative cash balance used by every cash operation.
 * Older imports may predate the financial ledger. Reconcile its mirror explicitly,
 * under the store lock, before posting payment; never add money to the register. */
async function preparePaymentAccount(tx: TransactionClient, storeId: string, actor: { id: string; name: string; role: string }) {
  await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
  const store = await tx.store.findUnique({ where: { id: storeId } });
  if (!store || !store.active) throw new Error('Касса магазина не найдена или неактивна');
  const account = await getStoreCashAccount(tx, storeId, store.name);
  await tx.$queryRaw`SELECT id FROM financial_accounts WHERE id = ${account.id} FOR UPDATE`;
  const current = await tx.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
  const difference = D(store.cashBalanceTjs).minus(current.balanceTjs);
  if (!difference.eq(0)) {
    await postTransaction(tx, {
      type: 'ADJUSTMENT', direction: difference.gt(0) ? 'IN' : 'OUT', numberPrefix: 'AJ',
      accountId: account.id, balanceCurrency: 'TJS', currency: 'TJS',
      amount: difference.abs(), amountTjs: difference.abs(), amountUsd: 0,
      shopId: storeId, sourceType: 'CASH_LEDGER_RECONCILIATION', sourceId: storeId,
      description: `Сверка финансового счёта с кассой ${store.name} перед оплатой поставщику`,
      createdByUserId: actor.id, guardBalance: false,
    });
    await tx.auditLog.create({ data: {
      userId: actor.id, userName: actor.name, userRole: actor.role,
      action: 'CASH_LEDGER_RECONCILIATION',
      details: `Счёт ${account.id}: ${current.balanceTjs} → ${store.cashBalanceTjs} TJS; остаток кассы не изменён`,
      financialDetails: moneyJson({ previousAccountBalanceTjs: current.balanceTjs, cashBalanceTjs: store.cashBalanceTjs, differenceTjs: difference }),
    } });
  }
  return { store, account };
}

/** True if any of these devices has a sale, transfer, or repair record referencing it (hard FK, no cascade). */
async function deviceHasTransactionHistory(tx: TransactionClient, deviceIds: string[]): Promise<boolean> {
  const [saleItem, transferItem, repairTicket] = await Promise.all([
    tx.saleItem.findFirst({ where: { deviceId: { in: deviceIds } } }),
    tx.transferItem.findFirst({ where: { deviceId: { in: deviceIds } } }),
    tx.repairTicket.findFirst({ where: { deviceId: { in: deviceIds } } }),
  ]);
  return Boolean(saleItem || transferItem || repairTicket);
}

interface PaySupplierInput {
  supplierId: string;
  amountUsd: MoneyInput;
  // Always a store's (or the main warehouse's) cash register — the company-wide
  // «Главный счёт» was removed, so there is no other place a payment can come from.
  sourceAccount: 'STORE_CASH';
  storeId: string;
  note?: string;
  createdByUserId: string;
}

interface SupplierBonusInput {
  supplierId: string;
  campaignTitle?: string;
  bonusType: 'FREE_DEVICES' | 'CASH_DISCOUNT';
  amountUsd?: MoneyInput;
  freeDevices?: { brand: string; model: string; storage: string; color: string; imei: string; costBasisUsd: MoneyInput }[];
  destinationStoreId?: string;
  createdByUserId: string;
}

async function recordSupplierAudit(tx: TransactionClient, actorId: string | undefined, action: string, targetId: string, before: unknown, after: unknown) {
  if (!actorId) return;
  const actor = await resolveActor(tx, actorId);
  await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, userRole: actor.role, action, targetId,
    details: action, financialDetails: moneyJson({ before, after }) } });
}

export class SuppliersService {
  public static async create(input: { name: string; phone?: string; contactPerson?: string }, actorId?: string) {
    const name = input.name?.trim();
    if (!name) throw new Error('Укажите название поставщика');
    return prisma.$transaction(async tx => {
      const result = await tx.supplier.create({ data: { name, phone: input.phone, contactPerson: input.contactPerson } });
      await recordSupplierAudit(tx, actorId, 'SUPPLIER_CREATE', result.id, null, result);
      return result;
    });
  }

  /** FIFO allocation across the supplier's open invoices, oldest first. */
  public static async pay(input: PaySupplierInput) {
    const amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма оплаты');
    if (input.sourceAccount !== 'STORE_CASH') throw new Error('Некорректный источник оплаты');
    if (!input.storeId) throw new Error('Выберите кассу, из которой оплатить');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const exchangeRate = await requireTodayRate(tx);
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new Error('Поставщик не найден');
      if (D(amountUsd).gt(supplier.totalDebtUsd)) throw new Error('Сумма оплаты превышает задолженность поставщику');

      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE "supplierId" = ${input.supplierId} ORDER BY id FOR UPDATE`;
      const openInvoices = await tx.supplierInvoice.findMany({
        where: { supplierId: input.supplierId },
        orderBy: { date: 'asc' },
      });

      let remainingToPay = amountUsd;
      const allocations: { invoiceId: string; invoiceNumber: string; allocatedAmountUsd: MoneyInput }[] = [];

      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: input.supplierId,
          amountUsd,
          exchangeRate,
          sourceAccount: input.sourceAccount,
          storeId: input.storeId,
          createdByUserId: actor.id,
        },
      });

      for (const invoice of openInvoices) {
        if (D(remainingToPay).lte(0)) break;
        const remainingOnInvoice = roundMoney(D(invoice.totalAmountUsd).minus(invoice.paidAmountUsd));
        if (D(remainingOnInvoice).lte(0)) continue;

        const payForThis = decimalMin(remainingOnInvoice, remainingToPay);
        const invoiceGuard = await tx.supplierInvoice.updateMany({
          where: { id: invoice.id, paidAmountUsd: invoice.paidAmountUsd, totalAmountUsd: invoice.totalAmountUsd },
          data: { paidAmountUsd: { increment: payForThis } },
        });
        if (invoiceGuard.count !== 1) throw new Error('Накладная оплачивается параллельно, обновите данные и повторите оплату');
        await tx.supplierPaymentAllocation.create({
          data: { paymentId: payment.id, invoiceId: invoice.id, allocatedAmountUsd: payForThis },
        });
        allocations.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, allocatedAmountUsd: payForThis });
        remainingToPay = roundMoney(D(remainingToPay).minus(payForThis));
      }
      if (!D(remainingToPay).eq(0)) throw new Error('Долг поставщика не совпадает с остатками накладных. Требуется сверка');

      const debtGuard = await tx.supplier.updateMany({
        where: { id: input.supplierId, totalDebtUsd: { gte: amountUsd } },
        data: {
          totalPaidUsd: { increment: amountUsd },
          totalDebtUsd: { decrement: amountUsd },
        },
      });
      if (!D(debtGuard.count).eq(1)) throw new Error('Задолженность изменилась, обновите данные и повторите оплату');

      const { store, account: financeAccount } = await preparePaymentAccount(tx, input.storeId, actor);
      // Unlike sales/expenses, supplier payments may be funded from the main
      // warehouse's account — purchases (приходы) are recorded there and its
      // balance is meant to fund paying those suppliers back, not just retail stores.
      // amountUsd was collected in USD terms but store registers hold TJS; convert via today's rate if available.
      const cashAmountTjs = roundMoney(D(amountUsd).mul(exchangeRate));
      const cashGuard = await tx.store.updateMany({ where: { id: input.storeId, cashBalanceTjs: { gte: cashAmountTjs } }, data: { cashBalanceTjs: { decrement: cashAmountTjs } } });
      if (!D(cashGuard.count).eq(1)) throw new Error('В кассе недостаточно наличных для оплаты поставщику');

      await postTransaction(tx, {
        type: 'SUPPLIER_PAYMENT',
        direction: 'OUT',
        numberPrefix: 'SP',
        accountId: financeAccount.id,
        balanceCurrency: 'TJS',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate,
        amountTjs: roundMoney(D(amountUsd).mul(exchangeRate)),
        amountUsd,
        categoryName: 'Оплата поставщику',
        counterpartyType: 'SUPPLIER',
        counterpartyId: supplier.id,
        counterpartyName: supplier.name,
        shopId: input.storeId,
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: payment.id,
        description: `Выплата поставщику ${supplier.name}: $${amountUsd}`,
        createdByUserId: actor.id,
        guardBalance: true,
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'SUPPLIER_PAYMENT',
          description: `Выплата поставщику ${supplier.name}: $${amountUsd}`,
          amountUsd: D(amountUsd).negated(),
          exchangeRate,
          storeId: input.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: payment.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'SUPPLIER_PAYMENT',
          details: `Проведена оплата поставщику ${supplier.name} на сумму $${amountUsd}. Распределено по FIFO: ${allocations
            .map((a) => `${a.invoiceNumber} ($${a.allocatedAmountUsd})`)
            .join(', ')}`,
          financialDetails: moneyJson({ amountUsd, exchangeRate }),
          targetId: payment.id,
        },
      });

      return { payment, allocations };
    }, { maxWait: 10000, timeout: 25000 });
  }

  /** Pays a single specific invoice directly, instead of FIFO across all open invoices. */
  public static async payInvoice(input: { invoiceId: string; amountUsd: MoneyInput; sourceAccount: 'STORE_CASH'; storeId: string; createdByUserId: string }) {
    const amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма оплаты');
    if (input.sourceAccount !== 'STORE_CASH') throw new Error('Некорректный источник оплаты');
    if (!input.storeId) throw new Error('Выберите кассу, из которой оплатить');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const exchangeRate = await requireTodayRate(tx);
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${input.invoiceId} FOR UPDATE`;
      const invoice = await tx.supplierInvoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice) throw new Error('Накладная не найдена');
      const supplier = await tx.supplier.findUnique({ where: { id: invoice.supplierId } });
      if (!supplier) throw new Error('Поставщик не найден');

      const remainingOnInvoice = roundMoney(D(invoice.totalAmountUsd).minus(invoice.paidAmountUsd));
      if (D(amountUsd).gt(remainingOnInvoice)) throw new Error('Сумма оплаты превышает остаток долга по накладной');

      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: invoice.supplierId,
          amountUsd,
          exchangeRate,
          sourceAccount: input.sourceAccount,
          storeId: input.storeId,
          createdByUserId: actor.id,
        },
      });

      const invoiceGuard = await tx.supplierInvoice.updateMany({
        where: { id: input.invoiceId, paidAmountUsd: invoice.paidAmountUsd, totalAmountUsd: invoice.totalAmountUsd },
        data: { paidAmountUsd: { increment: amountUsd } },
      });
      if (invoiceGuard.count !== 1) throw new Error('Данные накладной изменились, обновите страницу и повторите оплату');

      await tx.supplierPaymentAllocation.create({
        data: { paymentId: payment.id, invoiceId: invoice.id, allocatedAmountUsd: amountUsd },
      });

      const debtGuard = await tx.supplier.updateMany({
        where: { id: invoice.supplierId, totalDebtUsd: { gte: amountUsd } },
        data: {
          totalPaidUsd: { increment: amountUsd },
          totalDebtUsd: { decrement: amountUsd },
        },
      });
      if (!D(debtGuard.count).eq(1)) throw new Error('Задолженность изменилась, обновите данные и повторите оплату');

      const { store, account: financeAccount } = await preparePaymentAccount(tx, input.storeId, actor);
      const cashAmountTjs = roundMoney(D(amountUsd).mul(exchangeRate));
      const cashGuard = await tx.store.updateMany({ where: { id: input.storeId, cashBalanceTjs: { gte: cashAmountTjs } }, data: { cashBalanceTjs: { decrement: cashAmountTjs } } });
      if (!D(cashGuard.count).eq(1)) throw new Error('В кассе недостаточно наличных для оплаты поставщику');

      await postTransaction(tx, {
        type: 'SUPPLIER_PAYMENT',
        direction: 'OUT',
        numberPrefix: 'SP',
        accountId: financeAccount.id,
        balanceCurrency: 'TJS',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate,
        amountTjs: roundMoney(D(amountUsd).mul(exchangeRate)),
        amountUsd,
        categoryName: 'Оплата поставщику',
        counterpartyType: 'SUPPLIER',
        counterpartyId: supplier.id,
        counterpartyName: supplier.name,
        shopId: input.storeId,
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: payment.id,
        description: `Выплата поставщику ${supplier.name} по накладной ${invoice.invoiceNumber}: $${amountUsd}`,
        createdByUserId: actor.id,
        guardBalance: true,
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'SUPPLIER_PAYMENT',
          description: `Выплата поставщику ${supplier.name} по накладной ${invoice.invoiceNumber}: $${amountUsd}`,
          amountUsd: D(amountUsd).negated(),
          exchangeRate,
          storeId: input.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: payment.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'SUPPLIER_PAYMENT',
          details: `Проведена оплата поставщику ${supplier.name} по накладной ${invoice.invoiceNumber} на сумму $${amountUsd}`,
          financialDetails: moneyJson({ amountUsd, exchangeRate }),
          targetId: payment.id,
        },
      });

      return { payment, invoiceId: invoice.id };
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async createBonus(input: SupplierBonusInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const exchangeRate = await requireTodayRate(tx);
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new Error('Поставщик не найден');
      if (!['FREE_DEVICES', 'CASH_DISCOUNT'].includes(input.bonusType)) throw new Error('Некорректный тип бонуса');
      if (input.bonusType === 'CASH_DISCOUNT') input.amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма бонуса');
      const ownerProfitAllocations = input.bonusType === 'CASH_DISCOUNT' ? await currentOwnerAllocations(tx, input.amountUsd!) : [];

      const bonus = await tx.supplierBonus.create({
        data: {
          supplierId: input.supplierId,
          campaignTitle: input.campaignTitle,
          bonusType: input.bonusType,
          ownerProfitAllocations: moneyJson(ownerProfitAllocations),
          amountUsd: input.amountUsd,
          exchangeRate,
          status: 'IN_STOCK',
        },
      });

      if (input.bonusType === 'FREE_DEVICES' && input.freeDevices?.length) {
        const imeis = input.freeDevices.map((d) => d.imei);
        const existing = await tx.device.findFirst({ where: { OR: imeis.flatMap((imei) => [{ imei }, { imei2: imei }]) } });
        if (existing) throw new Error(`IMEI ${existing.imei} уже зарегистрирован`);

        // Bug: this used to infer status from whether destinationStoreId was merely PROVIDED,
        // not from what it actually points at — so explicitly picking "Главный склад" as the
        // destination (a valid dropdown option, not just the default) produced a device stuck
        // at the main warehouse with STORE_STOCK status, which every consumer keys off store
        // type for (sale eligibility, transfer source matching, inventory grouping...).
        const storeId = input.destinationStoreId ?? 'main-warehouse';
        const destinationStore = await tx.store.findUnique({ where: { id: storeId } });
        if (!destinationStore) throw new Error('Склад назначения не найден');
        const targetStatus = destinationStore.isMainWarehouse ? ('MAIN_WAREHOUSE' as const) : ('STORE_STOCK' as const);

        for (const device of input.freeDevices) {
          const costBasisUsd = requireNonNegativeMoney(device.costBasisUsd, 'Себестоимость бонусного устройства');
          const created = await tx.device.create({
            data: {
              imei: device.imei,
              brand: device.brand,
              model: device.model,
              storage: device.storage,
              color: device.color,
              status: targetStatus,
              storeId,
              purchasePriceUsd: D(0),
              costBasisUsd,
              isBonus: true,
              bonusCampaign: input.campaignTitle,
              supplierId: input.supplierId,
              supplierName: supplier.name,
              timeline: { create: [{ type: 'BONUS', description: `Бонусное устройство от ${supplier.name}`, userName: actor.name }] },
            },
          });
          await tx.supplierBonusDevice.create({
            data: { bonusId: bonus.id, deviceId: created.id, brand: device.brand, model: device.model, storage: device.storage, color: device.color, imei: device.imei, costBasisUsd },
          });
        }
      } else if (input.bonusType === 'CASH_DISCOUNT' && input.amountUsd) {
        // Booked purely as accrued profit, not a movement through any store's cash register —
        // per the user (2026-09-07), this is realized straight into net profit, deliberately
        // kept separate from the main warehouse's operating till (same profit/capital split
        // already established for owner payout — see the domain-total-invested-capital memory).
        await replaceOwnerAllocations(tx, [], ownerProfitAllocations, 1);
        await tx.ledgerEntry.create({
          data: {
            type: 'SUPPLIER_BONUS',
            description: `Денежный бонус от ${supplier.name}: +$${input.amountUsd}`,
            amountUsd: input.amountUsd,
            exchangeRate,
            userName: actor.name,
            referenceId: bonus.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'SUPPLIER_BONUS',
          details: `Зафиксирован бонус от ${supplier.name}${input.amountUsd ? `: $${input.amountUsd}` : ''}`,
          financialDetails: moneyJson(input.amountUsd ? { amountUsd: input.amountUsd, exchangeRate } : { exchangeRate }),
          targetId: bonus.id,
        },
      });

      return bonus;
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * CASH_DISCOUNT edits reverse the old owner-profit accrual and re-apply the new
   * amount, same revert-then-apply pattern as expense edits. FREE_DEVICES edits are
   * blocked once the underlying device has any transaction history (sold, transferred,
   * sent to repair) — the bonus record isn't the source of truth for that device anymore.
   */
  public static async updateBonus(id: string, input: { campaignTitle?: string; amountUsd?: MoneyInput; freeDevice?: { brand?: string; model?: string; storage?: string; color?: string; imei?: string; imei2?: string }; actorUserId: string }) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_bonuses WHERE id = ${id} FOR UPDATE`;
      const actor = await resolveActor(tx, input.actorUserId);
      const bonus = await tx.supplierBonus.findUnique({ where: { id }, include: { freeDevices: true, supplier: { select: { name: true } } } });
      if (!bonus) throw new Error('Бонус не найден');

      const data: { campaignTitle?: string | null; amountUsd?: MoneyInput; ownerProfitAllocations?: OwnerProfitAllocation[] } = {};
      if (input.campaignTitle !== undefined) data.campaignTitle = input.campaignTitle.trim() || null;

      if (bonus.bonusType === 'CASH_DISCOUNT') {
        if (input.amountUsd !== undefined) {
          const newAmountUsd = requirePositiveMoney(input.amountUsd, 'Сумма бонуса');
          const oldAmountUsd = bonus.amountUsd || 0;
          if (!D(newAmountUsd).eq(oldAmountUsd)) {
            const previous = readOwnerAllocations(bonus.ownerProfitAllocations);
            data.ownerProfitAllocations = await currentOwnerAllocations(tx, newAmountUsd);
            await replaceOwnerAllocations(tx, previous, data.ownerProfitAllocations, 1, true);
          }
          data.amountUsd = newAmountUsd;
          await tx.ledgerEntry.updateMany({
            where: { referenceId: id, type: 'SUPPLIER_BONUS' },
            data: { amountUsd: newAmountUsd, description: `Денежный бонус от ${bonus.supplier.name}: +$${newAmountUsd}` },
          });
        }
      } else if (bonus.bonusType === 'FREE_DEVICES' && input.freeDevice) {
        const bonusDevice = bonus.freeDevices[0];
        if (!bonusDevice) throw new Error('У этого бонуса нет привязанного устройства');
        if (bonusDevice.deviceId) {
          const hasHistory = await deviceHasTransactionHistory(tx, [bonusDevice.deviceId]);
          if (hasHistory) throw new Error('Нельзя редактировать: устройство уже продано, перемещено или отправлено в ремонт');
        }

        const newImei = input.freeDevice.imei?.trim();
        if (newImei && newImei !== bonusDevice.imei) {
          const existing = await tx.device.findFirst({
            where: { AND: [{ id: { not: bonusDevice.deviceId ?? undefined } }, { OR: [{ imei: newImei }, { imei2: newImei }] }] },
          });
          if (existing) throw new Error(`IMEI ${newImei} уже зарегистрирован`);
        }

        const deviceUpdate: Record<string, string | null> = {};
        const bonusDeviceUpdate: Record<string, string> = {};
        if (input.freeDevice.brand !== undefined) { deviceUpdate.brand = input.freeDevice.brand; bonusDeviceUpdate.brand = input.freeDevice.brand; }
        if (input.freeDevice.model !== undefined) { deviceUpdate.model = input.freeDevice.model; bonusDeviceUpdate.model = input.freeDevice.model; }
        if (input.freeDevice.storage !== undefined) { deviceUpdate.storage = input.freeDevice.storage; bonusDeviceUpdate.storage = input.freeDevice.storage; }
        if (input.freeDevice.color !== undefined) { deviceUpdate.color = input.freeDevice.color; bonusDeviceUpdate.color = input.freeDevice.color; }
        if (newImei) { deviceUpdate.imei = newImei; bonusDeviceUpdate.imei = newImei; }
        if (input.freeDevice.imei2 !== undefined) { deviceUpdate.imei2 = input.freeDevice.imei2.trim() || null; }
        if (input.campaignTitle !== undefined) deviceUpdate.bonusCampaign = input.campaignTitle.trim() || null;

        if (bonusDevice.deviceId && Object.keys(deviceUpdate).length > 0) {
          await tx.device.update({ where: { id: bonusDevice.deviceId }, data: deviceUpdate });
        }
        if (D(Object.keys(bonusDeviceUpdate).length).gt(0)) {
          await tx.supplierBonusDevice.update({ where: { id: bonusDevice.id }, data: bonusDeviceUpdate });
        }
      }

      const updated = await tx.supplierBonus.update({ where: { id }, data, include: { freeDevices: true, supplier: { select: { name: true } } } });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'BONUS_EDIT',
          details: `Отредактирован бонус от ${bonus.supplier.name}`,
          targetId: id,
        },
      });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * FREE_DEVICES bonuses can't be deleted once the device they created has any
   * transaction history — same guard as deleting a supplier outright, for the same
   * reason (SaleItem/TransferItem/RepairTicket hold a hard FK with no cascade).
   * CASH_DISCOUNT deletes reverse the owner-profit accrual booked at creation.
   */
  public static async deleteBonus(id: string, actorUserId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_bonuses WHERE id = ${id} FOR UPDATE`;
      const actor = await resolveActor(tx, actorUserId);
      const bonus = await tx.supplierBonus.findUnique({ where: { id }, include: { freeDevices: true, supplier: { select: { name: true } } } });
      if (!bonus) throw new Error('Бонус не найден');

      if (bonus.bonusType === 'FREE_DEVICES') {
        const deviceIds = bonus.freeDevices.map((d) => d.deviceId).filter((v): v is string => Boolean(v));
        if (deviceIds.length > 0) {
          const hasHistory = await deviceHasTransactionHistory(tx, deviceIds);
          if (hasHistory) throw new Error('Нельзя удалить бонус: устройство уже продано, перемещено или отправлено в ремонт');
          await tx.deviceTimelineEvent.deleteMany({ where: { deviceId: { in: deviceIds } } });
          await tx.device.deleteMany({ where: { id: { in: deviceIds } } });
        }
      } else if (bonus.bonusType === 'CASH_DISCOUNT' && bonus.amountUsd) {
        await replaceOwnerAllocations(tx, readOwnerAllocations(bonus.ownerProfitAllocations), [], 1, true);
        await tx.ledgerEntry.deleteMany({ where: { referenceId: id, type: 'SUPPLIER_BONUS' } });
      }

      await tx.supplierBonus.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'BONUS_DELETE',
          details: `Удалён бонус от ${bonus.supplier.name}${bonus.amountUsd ? `: $${bonus.amountUsd}` : ''}`,
          targetId: id,
        },
      });

      return { success: true };
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async update(id: string, input: { name?: string; phone?: string; contactPerson?: string }, actorId?: string) {
    const data: any = {};
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Укажите название поставщика');
      data.name = input.name.trim();
    }
    if (input.phone !== undefined) data.phone = input.phone.trim() || null;
    if (input.contactPerson !== undefined) data.contactPerson = input.contactPerson.trim() || null;

    return prisma.$transaction(async tx => {
      const before = await tx.supplier.findUnique({ where: { id } });
      const result = await tx.supplier.update({ where: { id }, data });
      await recordSupplierAudit(tx, actorId, 'SUPPLIER_EDIT', id, before, result);
      return result;
    });
  }

  public static async delete(id: string, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id },
        select: {
          id: true,
          _count: { select: { devices: true, invoices: true, payments: true, bonuses: true } },
        },
      });
      if (!supplier) throw new Error('Поставщик не найден');

      // A supplier with purchases/payments/bonuses must retain its financial history.
      if (Object.values(supplier._count).some((count) => count > 0)) {
        throw new Error('Нельзя удалить поставщика: у него есть финансовую историю. Пометьте его как неактивного');
      }

      const result = await tx.supplier.delete({ where: { id } });
      await recordSupplierAudit(tx, actorId, 'SUPPLIER_DELETE', id, result, null);
      return result;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async updateInvoice(id: string, input: { invoiceNumber?: string; date?: string; totalAmountUsd?: MoneyInput }, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM devices WHERE "purchaseInvoiceId" = ${id} ORDER BY id FOR UPDATE`;
      const invoice = await tx.supplierInvoice.findUnique({ where: { id } });
      if (!invoice) throw new Error('Накладная не найдена');

      const data: any = {};
      if (input.invoiceNumber !== undefined && input.invoiceNumber.trim()) {
        data.invoiceNumber = input.invoiceNumber.trim();
      }
      if (input.date !== undefined) {
        data.date = new Date(input.date);
      }

      if (input.totalAmountUsd !== undefined) {
        const oldTotal = invoice.totalAmountUsd;
        const newTotal = requireNonNegativeMoney(input.totalAmountUsd, 'Сумма накладной');
        if (newTotal.lt(invoice.paidAmountUsd)) throw new Error('Сумма накладной не может быть меньше уже оплаченной суммы');
        const diff = D(newTotal).minus(oldTotal);

        data.totalAmountUsd = newTotal;

        if (!diff.isZero()) {
          const invoiceDevices = await tx.device.findMany({ where: { purchaseInvoiceId: id }, select: { id: true } });
          if (await deviceHasTransactionHistory(tx, invoiceDevices.map((device) => device.id))) {
            throw new Error('Нельзя менять сумму накладной после продажи, перемещения или ремонта её устройств');
          }
          if (D(oldTotal).lte(0) && invoiceDevices.length > 0) throw new Error('Для изменения нулевой накладной отредактируйте состав прихода');
          const devices = await tx.device.findMany({ where: { purchaseInvoiceId: id }, orderBy: { id: 'asc' } });
          const costs = devices.length ? allocateMoney(newTotal, devices.map(d => d.purchasePriceUsd)) : [];
          await tx.invoiceGroup.deleteMany({ where: { invoiceId: id } });
          for (const [index, device] of devices.entries()) {
            const adjustedCost = costs[index];
            await tx.device.update({ where: { id: device.id }, data: { purchasePriceUsd: adjustedCost, costBasisUsd: adjustedCost } });
            await tx.invoiceGroup.create({ data: { invoiceId: id, brand: device.brand, model: device.model,
              ram: device.ram, storage: device.storage, color: device.color, quantity: 1, purchasePriceUsd: adjustedCost } });
          }
          await tx.supplier.update({
            where: { id: invoice.supplierId },
            data: {
              totalPurchasedUsd: { increment: diff },
              totalDebtUsd: { increment: diff },
            },
          });
        }
      }

      const updated = await tx.supplierInvoice.update({
        where: { id },
        data,
      });

      if (input.invoiceNumber && input.invoiceNumber.trim() !== invoice.invoiceNumber) {
        await tx.device.updateMany({
          where: { purchaseInvoiceId: id },
          data: { invoiceNumber: input.invoiceNumber.trim() },
        });
      }

      await recordSupplierAudit(tx, actorId, 'INVOICE_EDIT', id, invoice, updated);
      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async deleteInvoice(id: string, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM devices WHERE "purchaseInvoiceId" = ${id} ORDER BY id FOR UPDATE`;
      const invoice = await tx.supplierInvoice.findUnique({ where: { id } });
      if (!invoice) throw new Error('Накладная не найдена');
      if (D(invoice.paidAmountUsd).gt(0)) throw new Error('Нельзя удалить уже оплаченную или частично оплаченную накладную');

      // purchaseInvoiceId is the only reliable link — invoiceNumber has no uniqueness
      // constraint (two invoices, even from different suppliers, can share one), so
      // matching by it too would risk sweeping up and deleting another invoice's devices.
      const invoiceDevices = await tx.device.findMany({
        where: { purchaseInvoiceId: id },
        select: { id: true }
      });
      const invoiceDeviceIds = invoiceDevices.map((d) => d.id);
      if (invoiceDeviceIds.length > 0) {
        const hasHistory = await deviceHasTransactionHistory(tx, invoiceDeviceIds);
        if (hasHistory) {
          throw new Error('Нельзя удалить накладную: устройства из неё уже проданы, перемещены или отправлены в ремонт');
        }
      }

      const remainingDebtOnInvoice = D(invoice.totalAmountUsd).minus(invoice.paidAmountUsd);

      await tx.invoiceGroup.deleteMany({ where: { invoiceId: id } });
      await tx.supplierPaymentAllocation.deleteMany({ where: { invoiceId: id } });
      if (invoiceDeviceIds.length > 0) {
        await tx.deviceTimelineEvent.deleteMany({ where: { deviceId: { in: invoiceDeviceIds } } });
        await tx.device.deleteMany({ where: { id: { in: invoiceDeviceIds } } });
      }

      // Atomic guarded decrement, not a read-then-write — matches create's atomic
      // increment of these same fields (app.ts) and avoids a lost update if another
      // change to this supplier's totals lands between the read and the write.
      const supplierGuard = await tx.supplier.updateMany({
        where: { id: invoice.supplierId, totalPurchasedUsd: { gte: invoice.totalAmountUsd }, totalDebtUsd: { gte: remainingDebtOnInvoice } },
        data: {
          totalPurchasedUsd: { decrement: invoice.totalAmountUsd },
          totalDebtUsd: { decrement: remainingDebtOnInvoice },
        },
      });
      if (supplierGuard.count !== 1) throw new Error('Данные поставщика изменились, обновите страницу и повторите удаление');

      const result = await tx.supplierInvoice.delete({ where: { id } });
      await recordSupplierAudit(tx, actorId, 'INVOICE_DELETE', id, invoice, null);
      return result;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
