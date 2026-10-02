import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { moneyEquals, requireFiniteNumber, requireNonNegativeMoney, requirePositiveMoney, roundMoney } from '../../common/money';
import { allocateOwnerProfit } from '../sales/profit';
import { getOwnersForStore } from '../finance/owner-allocations';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';

interface ExchangeInput {
  saleId: string;
  returnedImei: string;
  returnedBrand: string;
  returnedModel: string;
  returnedStorage?: string;
  returnedColor?: string;
  exchangeInValueTjs: MoneyInput;
  replacementDeviceId: string;
  newPriceTjs: MoneyInput;
  differenceTjs?: MoneyInput;
  paymentMethod?: 'CASH' | 'CARD';
  cashAmountTjs?: MoneyInput;
  cardAmountTjs?: MoneyInput;
  processedByUserId: string;
}

export class ExchangesService {
  public static async process(input: ExchangeInput) {
    const exchangeInValueTjs = requirePositiveMoney(input.exchangeInValueTjs, 'Зачётная стоимость');
    const newPriceTjs = requirePositiveMoney(input.newPriceTjs, 'Цена нового устройства');
    const canonicalDifferenceTjs = D(newPriceTjs).minus(exchangeInValueTjs);
    if (input.differenceTjs !== undefined && !moneyEquals(requireFiniteNumber(input.differenceTjs, 'Разница обмена'), canonicalDifferenceTjs)) {
      throw new Error('Разница обмена не совпадает с ценой нового устройства минус зачётная стоимость');
    }
    if (input.paymentMethod && !['CASH', 'CARD'].includes(input.paymentMethod)) throw new Error('Некорректный способ расчёта при обмене');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.processedByUserId);
      const rate = await requireTodayRate(tx);

      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true } });
      if (!sale) throw new Error('Продажа не найдена');
      if (sale.status === 'REFUNDED') throw new Error('Нельзя обменять товар из возвращённого чека');

      // The replacement device must come from the same store as the sale being
      // exchanged — otherwise stock would silently teleport between stores with no
      // transfer record at all.
      const replacementDevice = await tx.device.findFirst({
        where: { id: input.replacementDeviceId, storeId: sale.storeId, status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
      });
      if (!replacementDevice) throw new Error('Выбранный телефон на замену недоступен на складе');

      const matchedItem = sale.saleItems.find((i) => i.imei === input.returnedImei);
      if (!matchedItem) throw new Error('В указанном чеке не найдена позиция с этим IMEI');

      if (replacementDevice.id === matchedItem.deviceId) throw new Error('Нельзя обменять устройство на него же');
      // The credit is for the very device sold on this receipt, so it can't exceed what the
      // customer paid for it — anything above would hand out cash the sale never took in.
      if (D(exchangeInValueTjs).gt(matchedItem.salePriceTjs)) {
        throw new Error(`Зачётная стоимость не может превышать цену этой позиции в чеке (${matchedItem.salePriceTjs} TJS)`);
      }

      const exchangeInValueUsd = roundMoney(D(exchangeInValueTjs).div(rate));
      const newPriceUsd = roundMoney(D(newPriceTjs).div(rate));
      const diffTjs = canonicalDifferenceTjs;
      const paymentMethod = input.paymentMethod ?? 'CASH';
      const cashAmountTjs = roundMoney(input.cashAmountTjs ?? (paymentMethod === 'CASH' ? diffTjs : 0));
      const cardAmountTjs = roundMoney(input.cardAmountTjs ?? (paymentMethod === 'CARD' ? diffTjs : 0));
      if (!moneyEquals(D(cashAmountTjs).plus(cardAmountTjs), diffTjs)) {
        throw new Error('Сумма расчёта наличными и по карте должна совпадать с разницей обмена');
      }
      if (paymentMethod === 'CASH' && !moneyEquals(cardAmountTjs, 0)) throw new Error('При наличном расчёте сумма по карте должна быть нулевой');
      if (paymentMethod === 'CARD' && !moneyEquals(cashAmountTjs, 0)) throw new Error('При расчёте картой сумма наличными должна быть нулевой');
      if (D(diffTjs).gt(0)) {
        requireNonNegativeMoney(cashAmountTjs, 'Доплата наличными');
        requireNonNegativeMoney(cardAmountTjs, 'Доплата по карте');
      }

      // This flow swaps one item within an existing sale for another — the "returned"
      // device is the very device already sold in this sale (matchedItem.deviceId), not
      // some unrelated personal phone the customer brings in. It comes back into stock
      // at a new cost basis (the agreed trade-in value); its purchase history is untouched.
      const returnedDevice = await tx.device.findUniqueOrThrow({ where: { id: matchedItem.deviceId } });
      const returnDeviceGuard = await tx.device.updateMany({
        where: { id: matchedItem.deviceId, status: 'SOLD' },
        data: { status: 'IN_STOCK_AFTER_EXCHANGE', costBasisUsd: exchangeInValueUsd },
      });
      if (returnDeviceGuard.count !== 1) {
        throw new Error('Возвращаемое устройство уже было обработано параллельно, повторите попытку');
      }
      await tx.deviceTimelineEvent.create({
        data: { deviceId: returnedDevice.id, type: 'EXCHANGE_IN', description: 'Принят по программе Trade-In', userName: actor.name },
      });

      const soldResult = await tx.device.updateMany({
        where: { id: replacementDevice.id, status: { in: ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
        data: { status: 'SOLD' },
      });
      if (soldResult.count !== 1) {
        throw new Error('Телефон на замену был продан параллельно, повторите попытку');
      }
      await tx.deviceTimelineEvent.create({
        data: {
          deviceId: replacementDevice.id,
          type: 'EXCHANGE_OUT',
          description: `Выдан по обмену за ${newPriceTjs} TJS`,
          userName: actor.name,
          priceTjs: input.newPriceTjs,
          priceUsd: newPriceUsd,
        },
      });

      const diffUsd = roundMoney(D(newPriceUsd).minus(exchangeInValueUsd));
      const newTotalTjs = D(sale.totalTjs).plus(diffTjs);
      const newTotalUsd = roundMoney(D(sale.totalUsd).plus(diffUsd));
      // Same rule as a sale: a replacement that cost nothing is a bonus device, so its price
      // goes to the bonus pool instead of straight to the owners.
      const isBonusReplacement = Boolean((replacementDevice.isBonus || replacementDevice.bonusCampaign) && D(replacementDevice.costBasisUsd).eq(0));
      const exchangeProfitUsd = isBonusReplacement ? D(0) : roundMoney(D(newPriceUsd).minus(replacementDevice.costBasisUsd));
      const bonusProfitUsd = isBonusReplacement ? newPriceUsd : D(0);

      await tx.saleItem.update({
        where: { id: matchedItem.id },
        data: {
          deviceId: replacementDevice.id,
          brand: replacementDevice.brand,
          model: replacementDevice.model,
          storage: replacementDevice.storage,
          color: replacementDevice.color,
          imei: replacementDevice.imei,
          imei2: replacementDevice.imei2,
          salePriceTjs: newPriceTjs,
          salePriceUsd: newPriceUsd,
          purchaseCostUsd: replacementDevice.purchasePriceUsd,
          costBasisUsd: replacementDevice.costBasisUsd,
          isBelowCost: !isBonusReplacement && D(newPriceUsd).lt(replacementDevice.costBasisUsd),
          isBonus: isBonusReplacement,
        },
      });

      if (isBonusReplacement) {
        await tx.bonusPoolEntry.create({
          data: {
            deviceId: replacementDevice.id,
            saleId: sale.id,
            imei: replacementDevice.imei,
            brand: replacementDevice.brand,
            model: replacementDevice.model,
            salePriceUsd: newPriceUsd,
            salePriceTjs: newPriceTjs,
            profitUsd: newPriceUsd,
            profitTjs: newPriceTjs,
            status: 'PENDING',
          },
        });
      }

      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          totalTjs: newTotalTjs,
          totalUsd: newTotalUsd,
          cashAmountTjs: D(sale.cashAmountTjs).plus(cashAmountTjs),
          cardAmountTjs: D(sale.cardAmountTjs).plus(cardAmountTjs),
          status: 'EXCHANGED',
          hasBelowCostItem: sale.saleItems.some((item) => item.id !== matchedItem.id && item.isBelowCost) || D(newPriceUsd).lt(replacementDevice.costBasisUsd),
          exchangeEvents: {
            create: [
              {
                returnedDeviceId: returnedDevice.id,
                returnedImei: returnedDevice.imei,
                returnedModel: returnedDevice.model,
                exchangeInValueTjs,
                exchangeInValueUsd,
                replacementDeviceId: replacementDevice.id,
                replacementImei: replacementDevice.imei,
                replacementModel: replacementDevice.model,
                newPriceTjs,
                newPriceUsd,
                differenceTjs: diffTjs,
                paymentMethod,
                cashAmountTjs,
                cardAmountTjs,
                exchangeRate: rate,
                processedByUserId: actor.id,
              },
            ],
          },
        },
      });

      const store = await tx.store.findUnique({ where: { id: sale.storeId } });
      const cashDelta = diffTjs;
      // In USD the settlement is exactly the new price minus the credit, both at today's rate —
      // the same figures the exchange books as revenue, so register and report agree to the cent.
      const cashDeltaUsd = diffUsd;
      if (!D(cashDelta).eq(0) && store) {
        const cashGuard = D(cashDeltaUsd).lt(0)
          ? await tx.store.updateMany({ where: { id: sale.storeId, cashBalanceUsd: { gte: D(cashDeltaUsd).abs() } }, data: { cashBalanceUsd: { increment: cashDeltaUsd } } })
          : await tx.store.updateMany({ where: { id: sale.storeId }, data: { cashBalanceUsd: { increment: cashDeltaUsd } } });
        if (!D(cashGuard.count).eq(1)) throw new Error('В кассе недостаточно средств для выплаты разницы клиенту');

        const cashAccount = await getStoreCashAccount(tx, sale.storeId, store.name);
        await postTransaction(tx, {
          type: D(cashDelta).gt(0) ? 'INCOME' : 'REFUND',
          direction: D(cashDelta).gt(0) ? 'IN' : 'OUT',
          numberPrefix: D(cashDelta).gt(0) ? 'CR' : 'RF',
          accountId: cashAccount.id,
          balanceCurrency: 'USD',
          amount: D(cashDelta).abs(),
          currency: 'TJS',
          exchangeRate: rate,
          amountTjs: D(cashDelta).abs(),
          amountUsd: D(cashDeltaUsd).abs(),
          categoryName: D(cashDelta).gt(0) ? 'Продажа' : 'Возврат покупателю',
          shopId: sale.storeId,
          sourceType: 'SALE',
          sourceId: sale.id,
          description: `Обмен по чеку #${sale.receiptNumber}: ${returnedDevice.model} → ${replacementDevice.model}`,
          createdByUserId: actor.id,
        });
      }

      // Incremental exchange profit is the new device's selling price minus its cost.
      // The original sale profit remains booked; the returned device comes back as an
      // asset at the agreed trade-in value, which offsets the customer's trade-in credit.
      const owners = await getOwnersForStore(tx, sale.storeId);
      const ownerProfitAllocations = allocateOwnerProfit(exchangeProfitUsd, owners);
      await Promise.all(ownerProfitAllocations.filter(({ amountUsd }) => !D(amountUsd).isZero()).map(({ ownerId, amountUsd: delta }) => {
        return tx.owner.update({
          where: { id: ownerId },
          data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
        });
      }));

      await tx.ledgerEntry.create({
        data: {
          type: 'EXCHANGE_SETTLEMENT',
          description: `Обмен по чеку #${sale.receiptNumber}: ${returnedDevice.model} → ${replacementDevice.model}`,
          amountTjs: diffTjs,
          amountUsd: diffUsd,
          exchangeRate: rate,
          storeId: sale.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: sale.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'EXCHANGE',
          details: `Чек #${sale.receiptNumber}: обмен ${returnedDevice.model} (IMEI ${returnedDevice.imei}) на ${replacementDevice.model} (IMEI ${replacementDevice.imei}). Расчет: ${D(diffTjs).gte(0) ? '+' : ''}${diffTjs} TJS`,
          // returnedDeviceId/returnedCostBasisUsd let a later refund of this sale restore the
          // traded-in device's original cost basis (see exchangeCostRestorations).
          financialDetails: moneyJson({ returnedDeviceId: returnedDevice.id, returnedCostBasisUsd: returnedDevice.costBasisUsd, exchangeInValueTjs, exchangeInValueUsd, newPriceTjs, newPriceUsd, differenceTjs: diffTjs, exchangeProfitUsd, bonusProfitUsd, ownerProfitAllocations: moneyJson(ownerProfitAllocations) }),
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return updatedSale;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
