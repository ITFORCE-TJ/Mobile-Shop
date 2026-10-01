import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { moneyEquals, requireNonNegativeMoney, requirePositiveMoney, roundMoney } from '../../common/money';
import { allocateOwnerProfit } from './profit';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';

interface CreateSaleInput {
  storeId: string;
  userId: string;
  items: { deviceId: string; salePriceTjs: MoneyInput }[];
  paymentMethod: 'CASH' | 'CARD' | 'SPLIT';
  cashAmountTjs?: MoneyInput;
  cardAmountTjs?: MoneyInput;
  customerName?: string;
}

export class SalesService {
  /**
   * Atomic Sale Execution using PostgreSQL Prisma Transaction.
   * Mirrors AppContext.createSale's business rules exactly:
   * 1. Devices must currently be STORE_STOCK or IN_STOCK_AFTER_EXCHANGE at this store.
   * 2. Devices flip to SOLD (race-safe: guarded updateMany + count check).
   * 3. Store cash register only moves for the cash portion of the payment.
   * 4. Every owner accrues their profit-share of this sale's margin.
   * 5. A ledger entry and an audit log entry are recorded.
   */
  public static async executeSale(input: CreateSaleInput) {
    if (!input.items || input.items.length === 0) {
      throw new Error('Корзина пуста');
    }

    const rate = await getRateForDate(new Date());
    if (!rate) {
      throw new Error('Сначала задайте курс валют на сегодня');
    }

    if (!input.storeId) throw new Error('Не удалось определить магазин продажи');
    if (!['CASH', 'CARD', 'SPLIT'].includes(input.paymentMethod)) throw new Error('Некорректный способ оплаты');
    const deviceIds = input.items.map((item) => item.deviceId);
    if (new Set(deviceIds).size !== deviceIds.length) throw new Error('Одно устройство нельзя добавить в чек дважды');

    const normalizedItems = input.items.map((item) => ({
      ...item,
      salePriceTjs: requirePositiveMoney(item.salePriceTjs, 'Цена продажи'),
    }));
    const totalTjs = normalizedItems.reduce((sum, item) => D(sum).plus(item.salePriceTjs), D(0));
    const cashAmountTjs = requireNonNegativeMoney(input.paymentMethod === 'CASH' ? totalTjs : input.paymentMethod === 'SPLIT' ? input.cashAmountTjs ?? 0 : 0, 'Сумма наличными');
    const cardAmountTjs = requireNonNegativeMoney(input.paymentMethod === 'CARD' ? totalTjs : input.paymentMethod === 'SPLIT' ? input.cardAmountTjs ?? 0 : 0, 'Сумма по карте');

    requireNonNegativeMoney(cashAmountTjs, 'Сумма наличными');
    requireNonNegativeMoney(cardAmountTjs, 'Сумма по карте');
    if (input.paymentMethod === 'SPLIT' && !moneyEquals(D(cashAmountTjs).plus(cardAmountTjs), totalTjs)) {
      throw new Error('Сумма наличных и по карте должна совпадать с итоговой суммой чека');
    }

    return prisma.$transaction(async (tx: TransactionClient) => {
      const store = await tx.store.findUnique({ where: { id: input.storeId } });
      if (!store || !store.active || store.isMainWarehouse) {
        throw new Error('Главный склад предназначен исключительно для хранения телефонов. Продажи со склада запрещены — продажа возможна только через розничные торговые точки.');
      }
      await tx.$queryRaw(Prisma.sql`SELECT id FROM devices WHERE id IN (${Prisma.join(deviceIds)}) ORDER BY id FOR UPDATE`);
      const devices = await tx.device.findMany({
        where: {
          id: { in: deviceIds },
          storeId: input.storeId,
          status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] },
        },
      });

      if (devices.length !== deviceIds.length) {
        throw new Error('Одно или несколько выбранных устройств недоступны для продажи (уже продано, в ремонте или перемещается)');
      }
      const deviceById = new Map(devices.map((d) => [d.id, d]));

      const totalUsd = roundMoney(D(totalTjs).div(rate));
      let totalCostUsd = D(0);
      let regularRevenueUsd = D(0);
      let regularCostUsd = D(0);
      let bonusProfitUsd = D(0);
      let bonusProfitTjs = D(0);
      let hasBelowCostItem = false;

      const saleItemsData = normalizedItems.map((item) => {
        const device = deviceById.get(item.deviceId)!;
        const isBonus = Boolean(device.isBonus || (device.bonusCampaign && D(device.costBasisUsd).eq(0)));
        const salePriceUsd = roundMoney(D(item.salePriceTjs).div(rate));
        const costTjs = D(device.costBasisUsd).mul(rate);
        const isBelowCost = !isBonus && D(item.salePriceTjs).lt(costTjs);
        if (isBelowCost) hasBelowCostItem = true;
        totalCostUsd = D(totalCostUsd).plus(device.costBasisUsd);

        if (isBonus) {
          bonusProfitUsd = D(bonusProfitUsd).plus(salePriceUsd);
          bonusProfitTjs = D(bonusProfitTjs).plus(item.salePriceTjs);
        } else {
          regularRevenueUsd = D(regularRevenueUsd).plus(salePriceUsd);
          regularCostUsd = D(regularCostUsd).plus(device.costBasisUsd);
        }

        return {
          deviceId: device.id,
          brand: device.brand,
          model: device.model,
          storage: device.storage,
          color: device.color,
          imei: device.imei,
          imei2: device.imei2,
          salePriceTjs: item.salePriceTjs,
          salePriceUsd,
          purchaseCostUsd: device.purchasePriceUsd,
          costBasisUsd: device.costBasisUsd,
          isBelowCost,
          isBonus,
        };
      });

      const sale = await tx.sale.create({
        data: {
          storeId: input.storeId,
          userId: input.userId,
          totalTjs,
          totalUsd,
          exchangeRate: rate,
          cashAmountTjs,
          cardAmountTjs,
          paymentMethod: input.paymentMethod,
          customerName: input.customerName,
          hasBelowCostItem,
          saleItems: { create: saleItemsData },
        },
        include: { saleItems: true },
      });

      const bonusItems = saleItemsData.filter((i) => i.isBonus);
      if (bonusItems.length > 0) {
        await tx.bonusPoolEntry.createMany({
          data: bonusItems.map((b) => ({
            deviceId: b.deviceId,
            saleId: sale.id,
            imei: b.imei,
            brand: b.brand,
            model: b.model,
            salePriceUsd: b.salePriceUsd,
            salePriceTjs: b.salePriceTjs,
            profitUsd: b.salePriceUsd,
            profitTjs: b.salePriceTjs,
            status: 'PENDING',
          })),
        });
      }

      const updateResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, storeId: input.storeId, status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
        data: { status: 'SOLD' },
      });
      if (updateResult.count !== deviceIds.length) {
        throw new Error('One or more selected devices were sold concurrently. Please refresh and try again.');
      }

      await tx.deviceTimelineEvent.createMany({
        data: saleItemsData.map((item) => ({
          deviceId: item.deviceId,
          type: 'SALE',
          description: `Продано за ${item.salePriceTjs} TJS (чек #${sale.receiptNumber})${item.isBonus ? ' (Бонусный товар)' : ''}`,
          userName: input.userId,
          priceTjs: item.salePriceTjs,
          priceUsd: item.salePriceUsd,
        })),
      });

      if (!D(cashAmountTjs).eq(0)) {
        await tx.store.update({ where: { id: input.storeId }, data: { cashBalanceTjs: { increment: cashAmountTjs } } });
        // Card payments settle outside any account this system tracks today (no
        // card/bank settlement account exists yet — matches existing behavior, where
        // the card portion has never moved a balance field either), so only the cash
        // component is posted to the ledger.
        const cashAccount = await getStoreCashAccount(tx, input.storeId, store.name);
        await postTransaction(tx, {
          type: 'INCOME',
          direction: 'IN',
          numberPrefix: 'CR',
          accountId: cashAccount.id,
          balanceCurrency: 'TJS',
          amount: cashAmountTjs,
          currency: 'TJS',
          exchangeRate: rate,
          amountTjs: cashAmountTjs,
          amountUsd: roundMoney(D(cashAmountTjs).div(rate)),
          categoryName: 'Продажа',
          shopId: input.storeId,
          sourceType: 'SALE',
          sourceId: sale.id,
          description: `Чек #${sale.receiptNumber}: продажа наличными`,
          createdByUserId: input.userId,
        });
      }

      const regularProfitUsd = roundMoney(D(regularRevenueUsd).minus(regularCostUsd));
      const owners = await tx.owner.findMany();
      // Only regular profit is auto-distributed to owners on sale.
      // Bonus device profit is stored in the pending bonus pool for quarterly manual allocation.
      const ownerProfitAllocations = regularProfitUsd.gt(0) ? allocateOwnerProfit(regularProfitUsd, owners) : [];
      if (ownerProfitAllocations.length > 0) {
        await Promise.all(ownerProfitAllocations.map(({ ownerId, amountUsd: delta }) => {
          return tx.owner.update({
            where: { id: ownerId },
            data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
          });
        }));
      }

      await tx.ledgerEntry.create({
        data: {
          type: input.paymentMethod === 'CASH' ? 'CASH_SALE' : input.paymentMethod === 'CARD' ? 'CARD_SALE' : 'SALE',
          description: `Чек #${sale.receiptNumber}: продажа ${saleItemsData.length} устройств`,
          amountTjs: totalTjs,
          amountUsd: totalUsd,
          exchangeRate: rate,
          storeId: input.storeId,
          storeName: store?.name,
          referenceId: sale.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: hasBelowCostItem ? 'SALE_BELOW_COST' : 'SALE',
          details: `Чек #${sale.receiptNumber}: продажа ${saleItemsData.length} устройств на сумму ${totalTjs} TJS ($${totalUsd})${bonusItems.length > 0 ? ` (включая ${bonusItems.length} бонусных устройств, $${roundMoney(bonusProfitUsd)} в бонусный пул)` : ''}`,
          financialDetails: moneyJson({
            amountTjs: totalTjs,
            amountUsd: totalUsd,
            exchangeRate: rate,
            recognizedProfitUsd: regularProfitUsd,
            bonusProfitUsd: roundMoney(bonusProfitUsd),
            ownerProfitAllocations: moneyJson(ownerProfitAllocations),
          }),
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return sale;
    }, { maxWait: 10000, timeout: 20000 });
  }
}
