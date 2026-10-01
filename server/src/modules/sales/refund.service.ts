import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { moneyEquals, requireNonNegativeMoney, roundMoney } from '../../common/money';
import { exchangeCostRestorations, refundOwnerProfit } from './profit';
import { getStoreCashAccount } from '../finance/account.service';
import { postTransaction } from '../finance/financial-transaction.service';

interface RefundInput {
  saleId: string;
  reason: string;
  refundAmountTjs: MoneyInput;
  penaltyFeeTjs?: MoneyInput;
  paymentMethod: 'CASH' | 'CARD';
  refundedByUserId: string;
}

export class RefundService {
  public static async refund(input: RefundInput) {
    if (!input.reason?.trim()) throw new Error('Укажите причину возврата');
    if (!['CASH', 'CARD'].includes(input.paymentMethod)) throw new Error('Некорректный способ возврата');
    const requestedRefundTjs = requireNonNegativeMoney(input.refundAmountTjs, 'Сумма возврата');
    const requestedPenaltyTjs = requireNonNegativeMoney(input.penaltyFeeTjs ?? 0, 'Штраф');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.refundedByUserId);
      const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { saleItems: true } });
      if (!sale) throw new Error('Чек не найден');
      // Idempotency guard: a sale can only be refunded once.
      if (sale.status === 'REFUNDED') throw new Error('Этот чек уже был возвращён');

      const rate = (await getRateForDate(new Date())) ?? sale.exchangeRate;
      if (!rate || D(rate).lte(0)) throw new Error('Не найден курс валют для возврата');
      const penaltyFeeTjs = requestedPenaltyTjs;
      // For a DEBT sale, only the cash/card portion actually collected up front can be
      // handed back — the still-unpaid remainder was never real money in the register.
      // That remainder is simply forgiven below instead of being refunded.
      const amountActuallyCollectedTjs = D(sale.totalTjs).minus(sale.debtAmountTjs);
      if (D(penaltyFeeTjs).gt(amountActuallyCollectedTjs)) throw new Error('Штраф не может превышать фактически полученную сумму по чеку');
      const expectedRefundTjs = D(amountActuallyCollectedTjs).minus(penaltyFeeTjs);
      if (!moneyEquals(requestedRefundTjs, expectedRefundTjs)) {
        throw new Error('Сумма возврата должна равняться фактически полученной сумме по чеку за вычетом штрафа');
      }
      const penaltyUsd = roundMoney(D(penaltyFeeTjs).div(rate));
      const actualRefundTjs = requestedRefundTjs;
      const profitLogs = await tx.auditLog.findMany({
        where: { targetId: sale.id, action: { in: ['SALE', 'SALE_BELOW_COST', 'EXCHANGE'] } },
        select: { action: true, financialDetails: true },
      });
      const owners = await tx.owner.findMany();

      const updatedSale = await tx.sale.update({
        where: { id: input.saleId },
        data: {
          status: 'REFUNDED',
          refundReason: input.reason,
          refundedAt: new Date(),
          refundedByUserId: actor.id,
          penaltyFeeTjs,
          penaltyFeeUsd: penaltyUsd,
          actualRefundAmountTjs: actualRefundTjs,
          debtAmountTjs: D(0),
        },
      });

      // Refunding a sale returns the devices to stock, so any debt the customer still
      // owed on it is forgiven — there's nothing left to collect for.
      if (D(sale.debtAmountTjs).gt(0) && sale.customerId) {
        await tx.customer.update({ where: { id: sale.customerId }, data: { totalDebtTjs: { decrement: sale.debtAmountTjs } } });
      }

      const deviceIds = sale.saleItems.map((i) => i.deviceId);
      const restockResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, status: 'SOLD' },
        data: { status: 'STORE_STOCK' },
      });
      if (restockResult.count !== deviceIds.length) {
        throw new Error('Не удалось вернуть устройства на склад — состояние изменилось');
      }

      // Undo every trade-in on this sale: a device still on hand gets its pre-exchange cost
      // basis back. One that was already resold had its profit booked against the trade-in
      // value instead, so the difference is corrected through owner profit below.
      let resoldTradeInAdjustmentUsd = D(0);
      for (const restoration of exchangeCostRestorations(profitLogs)) {
        const restored = await tx.device.updateMany({
          where: { id: restoration.deviceId, costBasisUsd: restoration.tradeInCostUsd, status: { not: 'SOLD' } },
          data: { costBasisUsd: restoration.originalCostUsd },
        });
        if (restored.count === 1) continue;
        const device = await tx.device.findUnique({ where: { id: restoration.deviceId }, select: { status: true } });
        if (device?.status === 'SOLD') {
          resoldTradeInAdjustmentUsd = resoldTradeInAdjustmentUsd.plus(D(restoration.tradeInCostUsd).minus(restoration.originalCostUsd));
        }
      }
      resoldTradeInAdjustmentUsd = roundMoney(resoldTradeInAdjustmentUsd);
      const ownerProfitAllocations = refundOwnerProfit(profitLogs, owners, D(penaltyUsd).plus(resoldTradeInAdjustmentUsd));

      await tx.deviceTimelineEvent.createMany({
        data: sale.saleItems.map((item) => ({
          deviceId: item.deviceId,
          type: 'REFUND' as const,
          description: `Возврат по чеку #${sale.receiptNumber}${D(penaltyFeeTjs).gt(0) ? `, штраф ${penaltyFeeTjs} TJS` : ''}`,
          userName: actor.name,
        })),
      });

      const store = await tx.store.findUnique({ where: { id: sale.storeId } });
      if (input.paymentMethod === 'CASH') {
        const cashGuard = await tx.store.updateMany({ where: { id: sale.storeId, cashBalanceTjs: { gte: actualRefundTjs } }, data: { cashBalanceTjs: { decrement: actualRefundTjs } } });
        if (!D(cashGuard.count).eq(1)) throw new Error('В кассе недостаточно наличных для возврата');
        const cashAccount = await getStoreCashAccount(tx, sale.storeId, store?.name);
        await postTransaction(tx, {
          type: 'REFUND',
          direction: 'OUT',
          numberPrefix: 'RF',
          accountId: cashAccount.id,
          balanceCurrency: 'TJS',
          amount: actualRefundTjs,
          currency: 'TJS',
          exchangeRate: rate,
          amountTjs: actualRefundTjs,
          amountUsd: roundMoney(D(actualRefundTjs).div(rate)),
          categoryName: 'Возврат покупателю',
          shopId: sale.storeId,
          sourceType: 'SALE',
          sourceId: sale.id,
          description: `Возврат по чеку #${sale.receiptNumber}: ${input.reason}`,
          createdByUserId: actor.id,
        });
      }

      await Promise.all(ownerProfitAllocations.map(({ ownerId, amountUsd: delta }) => {
        return tx.owner.update({
          where: { id: ownerId },
          data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
        });
      }));

      if (tx.bonusPoolEntry) {
        await tx.bonusPoolEntry.updateMany({
          where: { saleId: sale.id, status: 'PENDING' },
          data: {
            status: 'ANNULLED',
            annulledAt: new Date(),
            annulledBy: actor.name,
            annulledNote: `Возврат по чеку #${sale.receiptNumber}: ${input.reason}`,
          },
        });
      }

      await tx.ledgerEntry.create({
        data: {
          type: 'REFUND',
          description: `Возврат по чеку #${sale.receiptNumber}: ${input.reason}`,
          amountTjs: D(actualRefundTjs).negated(),
          amountUsd: D(roundMoney(D(actualRefundTjs).div(rate))).negated(),
          exchangeRate: rate,
          storeId: sale.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: sale.id,
        },
      });
      // The retained penalty is already included in the reduced cash refund.
      // Its profit impact is stored on the sale and in owner allocations, not as
      // another cash receipt (which would count the same penalty twice).

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'REFUND',
          details: `Чек #${sale.receiptNumber}: возврат на сумму ${actualRefundTjs} TJS. ${D(penaltyFeeTjs).gt(0) ? `Удержан штраф: ${penaltyFeeTjs} TJS.` : ''} Причина: ${input.reason}`,
          financialDetails: moneyJson({ amountTjs: actualRefundTjs, penaltyTjs: penaltyFeeTjs, penaltyUsd, resoldTradeInAdjustmentUsd, ownerProfitAllocations: moneyJson(ownerProfitAllocations) }),
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return updatedSale;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
