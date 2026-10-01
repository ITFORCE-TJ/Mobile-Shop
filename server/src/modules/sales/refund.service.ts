import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { reverseDistributedBonus } from '../bonuses/bonuses.service';
import { moneyEquals, requireNonNegativeMoney, roundMoney } from '../../common/money';
import { exchangeCostRestorations, refundOwnerProfit } from './profit';
import { getOwnersForStore } from '../finance/owner-allocations';
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

      const rate = await requireTodayRate(tx);
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
      const actualRefundTjs = requestedRefundTjs;
      // Registers hold USD, so the TJS handed back today costs today's dollars, while the sale
      // booked its revenue at its own day's rates. That difference is an exchange-rate result
      // and is booked to the owners, so cash and profit never drift apart. Example: 1000 TJS
      // sold at 10 ($100) and refunded at 11 costs $90.91 — a $9.09 gain.
      const collectedTodayUsd = roundMoney(D(amountActuallyCollectedTjs).div(rate));
      const penaltyUsd = roundMoney(D(penaltyFeeTjs).div(rate));
      const actualRefundUsd = roundMoney(D(collectedTodayUsd).minus(penaltyUsd));
      const bookedCollectedUsd = D(sale.totalTjs).gt(0)
        ? roundMoney(D(sale.totalUsd ?? D(sale.totalTjs).div(sale.exchangeRate || rate)).mul(amountActuallyCollectedTjs).div(sale.totalTjs))
        : D(0);
      const fxGainUsd = roundMoney(D(bookedCollectedUsd).minus(collectedTodayUsd));
      const profitLogs = await tx.auditLog.findMany({
        where: { targetId: sale.id, action: { in: ['SALE', 'SALE_BELOW_COST', 'EXCHANGE'] } },
        select: { action: true, financialDetails: true },
      });
      const owners = await getOwnersForStore(tx, sale.storeId);

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
      const ownerProfitAllocations = refundOwnerProfit(profitLogs, owners, D(penaltyUsd).plus(resoldTradeInAdjustmentUsd).plus(fxGainUsd));

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
        const cashGuard = await tx.store.updateMany({ where: { id: sale.storeId, cashBalanceUsd: { gte: actualRefundUsd } }, data: { cashBalanceUsd: { decrement: actualRefundUsd } } });
        if (!D(cashGuard.count).eq(1)) throw new Error('В кассе недостаточно наличных для возврата');
        const cashAccount = await getStoreCashAccount(tx, sale.storeId, store?.name);
        await postTransaction(tx, {
          type: 'REFUND',
          direction: 'OUT',
          numberPrefix: 'RF',
          accountId: cashAccount.id,
          balanceCurrency: 'USD',
          amount: actualRefundTjs,
          currency: 'TJS',
          exchangeRate: rate,
          amountTjs: actualRefundTjs,
          amountUsd: actualRefundUsd,
          categoryName: 'Возврат покупателю',
          shopId: sale.storeId,
          sourceType: 'SALE',
          sourceId: sale.id,
          description: `Возврат по чеку #${sale.receiptNumber}: ${input.reason}`,
          createdByUserId: actor.id,
        });
      }

      // Bonus profit already handed out to owners for this sale's devices goes back too —
      // the devices return to stock and will earn it again when resold.
      const refundNote = `Возврат по чеку #${sale.receiptNumber}: ${input.reason}`;
      const bonusReversalAllocations = await reverseDistributedBonus(tx, sale.id, refundNote, actor.name);
      const ownerDeltas = new Map<string, MoneyInput>();
      for (const { ownerId, amountUsd } of [...ownerProfitAllocations, ...bonusReversalAllocations]) {
        ownerDeltas.set(ownerId, roundMoney(D(ownerDeltas.get(ownerId) ?? 0).plus(amountUsd)));
      }
      for (const [ownerId, delta] of ownerDeltas) {
        if (D(delta).isZero()) continue;
        const updated = await tx.owner.updateMany({
          where: { id: ownerId },
          data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
        });
        if (updated.count !== 1) throw new Error('Партнёр из распределения прибыли не найден. Восстановите его учётную запись перед возвратом.');
      }

      await tx.bonusPoolEntry.updateMany({
        where: { saleId: sale.id, status: 'PENDING' },
        data: {
          status: 'ANNULLED',
          annulledAt: new Date(),
          annulledBy: actor.name,
          annulledNote: refundNote,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'REFUND',
          description: `Возврат по чеку #${sale.receiptNumber}: ${input.reason}`,
          amountTjs: D(actualRefundTjs).negated(),
          amountUsd: D(actualRefundUsd).negated(),
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
          financialDetails: moneyJson({ amountTjs: actualRefundTjs, amountUsd: actualRefundUsd, exchangeRate: rate, penaltyTjs: penaltyFeeTjs, penaltyUsd, fxGainUsd, resoldTradeInAdjustmentUsd, ownerProfitAllocations: moneyJson(ownerProfitAllocations), bonusReversalAllocations: moneyJson(bonusReversalAllocations) }),
          receiptNumber: sale.receiptNumber,
          targetId: sale.id,
        },
      });

      return updatedSale;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
