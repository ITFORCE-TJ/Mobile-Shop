import { D, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { createExpense } from '../expenses/expenses.service';
import { requireNonNegativeMoney, roundMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';

interface CreateRepairInput {
  storeId: string;
  userId: string;
  imei: string;
  imei2?: string;
  brand: string;
  model: string;
  storage?: string;
  color?: string;
  saleReceiptNumber?: number;
  saleDate?: string;
  customerName?: string;
  customerPhone?: string;
  problemDescription: string;
  visualCondition?: string;
  equipmentPackage?: string;
  comment?: string;
  estimatedCostTjs?: MoneyInput;
  repairCostTjs?: MoneyInput;
  prepaymentTjs?: MoneyInput;
}

export class RepairsService {
  public static async create(input: CreateRepairInput) {
    if (input.estimatedCostTjs !== undefined) input.estimatedCostTjs = requireNonNegativeMoney(input.estimatedCostTjs, 'Предварительная стоимость');
    if (input.prepaymentTjs !== undefined && requireNonNegativeMoney(input.prepaymentTjs, 'Предоплата').gt(0)) {
      throw new Error('Приём предоплаты за ремонт не поддерживается');
    }
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.userId);
      const matchedDevice = await tx.device.findFirst({
        where: { imei: input.imei },
      });

      // Snapshot the intake quote in USD right now, at today's rate — same as every other
      // money-in-TJS operation in the app — instead of leaving it to be reconstructed later
      // from whatever the rate happens to be at read time.
      let estimatedCostUsd: MoneyInput | undefined;
      let intakeRate: MoneyInput | undefined;
      if (input.estimatedCostTjs) {
        intakeRate = await requireTodayRate(tx);
        estimatedCostUsd = roundMoney(D(input.estimatedCostTjs).div(intakeRate));
      }

      const ticket = await tx.repairTicket.create({
        data: {
          storeId: input.storeId,
          userId: input.userId,
          deviceId: matchedDevice?.id,
          imei: input.imei,
          imei2: input.imei2,
          brand: input.brand,
          model: input.model,
          storage: input.storage,
          color: input.color,
          saleReceiptNumber: input.saleReceiptNumber,
          saleDate: input.saleDate ? new Date(input.saleDate) : undefined,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          problemDescription: input.problemDescription,
          visualCondition: input.visualCondition,
          equipmentPackage: input.equipmentPackage,
          comment: input.comment,
          estimatedCostTjs: input.estimatedCostTjs,
          estimatedCostUsd,
          exchangeRate: intakeRate,
          prepaymentTjs: input.prepaymentTjs !== undefined ? requireNonNegativeMoney(input.prepaymentTjs, 'Предоплата') : undefined,
          statusHistory: {
            create: [{ status: 'ACCEPTED', updatedByUserId: input.userId, note: 'Прием телефона на ремонт' }],
          },
        },
      });

      // No expense is booked at intake: estimatedCostTjs here is a rough quote, not a
      // confirmed spend. The real REPAIR_PARTS expense is recorded once, in updateStatus,
      // when the ticket is marked ISSUED with the actual final cost — booking it here too
      // used to double-charge the cash register for every repair with a non-zero estimate.
      if (matchedDevice) {
        await tx.deviceTimelineEvent.create({
          data: {
            deviceId: matchedDevice.id,
            type: 'REPAIR_INTAKE',
            description: `Принят на ремонт, квитанция #${ticket.ticketNumber}`,
            userName: actor.name,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'REPAIR_INTAKE',
          details: `Принят на ремонт телефон ${input.brand} ${input.model} (IMEI ${input.imei}), квитанция #${ticket.ticketNumber}. Неисправность: ${input.problemDescription}`,
          imei: input.imei,
          targetId: ticket.id,
        },
      });

      return ticket;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async updateStatus(ticketId: string, newStatus: string, updatedByUserId: string, note?: string, finalCostTjs?: MoneyInput) {
    const statuses = ['ACCEPTED', 'IN_PROGRESS', 'READY', 'ISSUED', 'DIAGNOSTICS', 'IN_REPAIR', 'DELIVERED', 'UNREPAIRABLE'];
    if (!statuses.includes(newStatus)) throw new Error('Некорректный статус ремонта');
    if (finalCostTjs !== undefined) requireNonNegativeMoney(finalCostTjs, 'Стоимость ремонта');
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, updatedByUserId);
      const ticket = await tx.repairTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw new Error('Ремонт не найден');
      // Idempotency guard: issuing books a real cash-register expense, so re-issuing an
      // already-ISSUED ticket (double-click, retried request) must not book it twice.
      if (newStatus === 'ISSUED' && ticket.status === 'ISSUED') {
        throw new Error('Этот ремонт уже был выдан клиенту');
      }
      if (ticket.status === 'ISSUED' && newStatus !== ticket.status) {
        throw new Error('Выданный ремонт закрыт. Для повторного обращения создайте новую квитанцию');
      }
      if (newStatus === 'ISSUED' && ticket.status !== 'READY') throw new Error('Сначала отметьте ремонт как готовый к выдаче');
      if (newStatus === ticket.status) return ticket;

      const costVal = finalCostTjs !== undefined && finalCostTjs !== null
        ? requireNonNegativeMoney(finalCostTjs, 'Стоимость ремонта')
        : (ticket.finalCostTjs ?? ticket.estimatedCostTjs ?? 0);

      // Snapshot in USD only when the final cost is actually being decided right now — an
      // explicit new value, or the first time it's ever being set (e.g. carried over from the
      // estimate). A later status change that just carries the same already-snapshotted final
      // cost forward must not re-price it at whatever the rate happens to be that day.
      const explicitOverride = finalCostTjs !== undefined && finalCostTjs !== null && D(D(finalCostTjs)).gt(0);
      const needsUsdSnapshot = D(costVal).gt(0) && (explicitOverride || ticket.finalCostUsd === null);
      let finalCostUsd = ticket.finalCostUsd ?? undefined;
      let operationRate = ticket.exchangeRate ?? undefined;
      if (needsUsdSnapshot) {
        operationRate = await requireTodayRate(tx);
        finalCostUsd = roundMoney(D(costVal).div(operationRate));
      }

      const updated = await tx.repairTicket.update({
        where: { id: ticketId, status: ticket.status, updatedAt: ticket.updatedAt },
        data: {
          status: newStatus as any,
          finalCostTjs: costVal,
          finalCostUsd: D(costVal).gt(0) ? finalCostUsd : 0,
          exchangeRate: D(costVal).gt(0) ? operationRate : ticket.exchangeRate,
          statusHistory: { create: [{ status: newStatus as any, updatedByUserId, note }] },
        },
      });

      if (D(costVal).gt(0) && newStatus === 'ISSUED') {
        await createExpense(tx, {
          category: 'REPAIR_PARTS',
          amountTjs: costVal,
          storeId: ticket.storeId,
          comment: `Выдача ремонта #${ticket.ticketNumber}: ${ticket.brand} ${ticket.model}`,
          paidFromCashRegister: true,
          createdByUserId: updatedByUserId,
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'REPAIR_STATUS_CHANGE',
          details: `Ремонт #${ticket.ticketNumber} (${ticket.model}): статус "${newStatus}".${newStatus === 'ISSUED' && D(costVal).gt(0) ? ` Расход: ${costVal} TJS списан с кассы магазина.` : ''}`,
          targetId: ticketId,
        },
      });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
