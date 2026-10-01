import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireNonNegativeMoney, roundMoney } from '../../common/money';

export interface DistributeBonusInput {
  periodName: string;
  allocations: { ownerId: string; amountUsd: MoneyInput }[];
  note?: string;
  userId: string;
}

export interface AnnulBonusInput {
  periodName?: string;
  note?: string;
  userId: string;
}

export class BonusesService {
  public static async getBonusPool() {
    const pendingEntries = await prisma.bonusPoolEntry.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        sale: {
          select: {
            receiptNumber: true,
            createdAt: true,
            storeId: true,
          },
        },
      },
    });

    const pendingProfitUsd = roundMoney(
      pendingEntries.reduce((sum, e) => D(sum).plus(e.profitUsd), D(0))
    );
    const pendingProfitTjs = roundMoney(
      pendingEntries.reduce((sum, e) => D(sum).plus(e.profitTjs), D(0))
    );

    const history = await prisma.bonusDistributionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      pendingProfitUsd,
      pendingProfitTjs,
      pendingCount: pendingEntries.length,
      pendingEntries,
      history,
    };
  }

  public static async distributeBonusProfit(input: DistributeBonusInput) {
    if (!input.periodName?.trim()) {
      throw new Error('Укажите название отчётного периода (например, 1 квартал 2026)');
    }
    if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
      throw new Error('Укажите хотя бы одного партнёра для распределения прибыли');
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.userId);
      const pendingEntries = await tx.bonusPoolEntry.findMany({
        where: { status: 'PENDING' },
      });

      if (pendingEntries.length === 0) {
        throw new Error('В бонусном пуле нет нераспределенной прибыли');
      }

      const totalPoolUsd = roundMoney(
        pendingEntries.reduce((sum, e) => D(sum).plus(e.profitUsd), D(0))
      );

      const normalizedAllocations = input.allocations.map((a) => {
        const amountUsd = requireNonNegativeMoney(a.amountUsd, 'Сумма распределения');
        return { ownerId: a.ownerId, amountUsd };
      }).filter((a) => D(a.amountUsd).gt(0));

      if (normalizedAllocations.length === 0) {
        throw new Error('Сумма распределения должна быть больше 0');
      }

      const totalAllocatedUsd = roundMoney(
        normalizedAllocations.reduce((sum, a) => D(sum).plus(a.amountUsd), D(0))
      );

      if (D(totalAllocatedUsd).gt(totalPoolUsd)) {
        throw new Error(`Сумма распределения ($${totalAllocatedUsd}) превышает остаток бонусного пула ($${totalPoolUsd})`);
      }

      const ownerIds = normalizedAllocations.map((a) => a.ownerId);
      const owners = await tx.owner.findMany({
        where: { id: { in: ownerIds } },
      });
      if (owners.length !== ownerIds.length) {
        throw new Error('Один или несколько указанных владельцев не найдены');
      }
      const ownerMap = new Map(owners.map((o) => [o.id, o]));

      const log = await tx.bonusDistributionLog.create({
        data: {
          periodName: input.periodName.trim(),
          totalAmountUsd: totalAllocatedUsd,
          type: 'DISTRIBUTION',
          allocations: normalizedAllocations.map((a) => ({
            ownerId: a.ownerId,
            ownerName: ownerMap.get(a.ownerId)?.name ?? a.ownerId,
            amountUsd: a.amountUsd,
          })),
          note: input.note?.trim() || null,
          performedByUserId: actor.id,
          performedByName: actor.name,
        },
      });

      for (const allocation of normalizedAllocations) {
        const delta = allocation.amountUsd;
        await tx.owner.update({
          where: { id: allocation.ownerId },
          data: {
            totalAccruedProfitUsd: { increment: delta },
            availableProfitUsd: { increment: delta },
          },
        });
      }

      await tx.bonusPoolEntry.updateMany({
        where: { status: 'PENDING' },
        data: {
          status: 'DISTRIBUTED',
          distributionId: log.id,
          distributedAt: new Date(),
          distributedBy: actor.name,
          distributionNote: input.note?.trim() || input.periodName.trim(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'BONUS_PROFIT_DISTRIBUTED',
          details: `Распределена бонусная прибыль за ${input.periodName}: $${totalAllocatedUsd} среди ${normalizedAllocations.length} партнёров`,
          financialDetails: moneyJson({
            periodName: input.periodName,
            totalAllocatedUsd,
            allocations: normalizedAllocations,
          }),
        },
      });

      return log;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async annulBonusPool(input: AnnulBonusInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.userId);
      const pendingEntries = await tx.bonusPoolEntry.findMany({
        where: { status: 'PENDING' },
      });

      if (pendingEntries.length === 0) {
        throw new Error('В бонусном пуле нет активных записей для обнуления');
      }

      const totalAnnulledUsd = roundMoney(
        pendingEntries.reduce((sum, e) => D(sum).plus(e.profitUsd), D(0))
      );

      const log = await tx.bonusDistributionLog.create({
        data: {
          periodName: input.periodName?.trim() || 'Обнуление после квартального отчёта',
          totalAmountUsd: totalAnnulledUsd,
          type: 'ANNULMENT',
          allocations: [],
          note: input.note?.trim() || 'Обнуление нераспределённого бонусного пула',
          performedByUserId: actor.id,
          performedByName: actor.name,
        },
      });

      await tx.bonusPoolEntry.updateMany({
        where: { status: 'PENDING' },
        data: {
          status: 'ANNULLED',
          annulledAt: new Date(),
          annulledBy: actor.name,
          annulledNote: input.note?.trim() || 'Обнуление бонусного пула администратором',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'BONUS_POOL_ANNULLED',
          details: `Обнулен бонусный пул на сумму $${totalAnnulledUsd} (${pendingEntries.length} устройств)`,
          financialDetails: moneyJson({
            totalAnnulledUsd,
            entriesCount: pendingEntries.length,
            note: input.note,
          }),
        },
      });

      return log;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
