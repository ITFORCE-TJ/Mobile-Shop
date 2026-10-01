import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireNonNegativeMoney, roundMoney } from '../../common/money';
import { allocateMoney } from '../../common/allocation';
import type { OwnerProfitAllocation } from '../sales/profit';

/**
 * A refunded sale takes back the bonus profit its devices already paid out. Each owner
 * returns what they actually received for these entries: the distribution's allocations,
 * scaled by how much of that pool was handed out (a partial distribution annuls the rest).
 * Returns negative per-owner deltas; the caller applies them with the rest of the refund.
 */
export async function reverseDistributedBonus(tx: TransactionClient, saleId: string, note: string, actorName: string): Promise<OwnerProfitAllocation[]> {
  const entries = await tx.bonusPoolEntry.findMany({ where: { saleId, status: 'DISTRIBUTED', annulledAt: null } });
  const deltas = new Map<string, ReturnType<typeof D>>();
  const byDistribution = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (!entry.distributionId) throw new Error('Не найдено распределение бонусной прибыли для этого чека. Требуется сверка');
    byDistribution.set(entry.distributionId, [...(byDistribution.get(entry.distributionId) ?? []), entry]);
  }
  for (const [distributionId, saleEntries] of byDistribution) {
    const log = await tx.bonusDistributionLog.findUnique({ where: { id: distributionId } });
    const allocations = Array.isArray(log?.allocations) ? (log!.allocations as { ownerId?: unknown; amountUsd?: unknown }[]) : [];
    if (!log || !allocations.length || allocations.some((a) => typeof a?.ownerId !== 'string' || typeof a?.amountUsd !== 'number')) {
      throw new Error('Не сохранено распределение бонусной прибыли для этого чека. Требуется сверка');
    }
    const pool = (await tx.bonusPoolEntry.findMany({ where: { distributionId }, select: { profitUsd: true } }))
      .reduce((sum, e) => sum.plus(e.profitUsd), D(0));
    const share = saleEntries.reduce((sum, e) => sum.plus(e.profitUsd), D(0));
    if (pool.lte(0)) continue;
    const paidOut = roundMoney(D(log.totalAmountUsd).mul(share).div(pool));
    const perOwner = allocateMoney(paidOut, allocations.map((a) => a.amountUsd as number));
    allocations.forEach((a, i) => {
      const ownerId = a.ownerId as string;
      deltas.set(ownerId, (deltas.get(ownerId) ?? D(0)).minus(perOwner[i]));
    });
  }
  if (entries.length) {
    await tx.bonusPoolEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { annulledAt: new Date(), annulledBy: actorName, annulledNote: note },
    });
  }
  return Array.from(deltas, ([ownerId, amountUsd]) => ({ ownerId, amountUsd: roundMoney(amountUsd) }));
}

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

      // Exactly the entries summed above: one added meanwhile waits for the next distribution,
      // and a concurrent distribution of the same entries is rejected instead of doubled.
      const distributed = await tx.bonusPoolEntry.updateMany({
        where: { id: { in: pendingEntries.map((e) => e.id) }, status: 'PENDING' },
        data: {
          status: 'DISTRIBUTED',
          distributionId: log.id,
          distributedAt: new Date(),
          distributedBy: actor.name,
          distributionNote: input.note?.trim() || input.periodName.trim(),
        },
      });
      if (distributed.count !== pendingEntries.length) throw new Error('Бонусный пул изменился во время распределения. Обновите данные и повторите');

      // Every pending entry is closed by this distribution, so whatever wasn't handed out is
      // written off explicitly instead of silently vanishing from the pool.
      const remainderUsd = roundMoney(D(totalPoolUsd).minus(totalAllocatedUsd));
      if (remainderUsd.gt(0)) {
        await tx.bonusDistributionLog.create({
          data: {
            periodName: input.periodName.trim(),
            totalAmountUsd: remainderUsd,
            type: 'ANNULMENT',
            allocations: [],
            note: `Нераспределённый остаток бонусного пула при распределении «${input.periodName.trim()}»`,
            performedByUserId: actor.id,
            performedByName: actor.name,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'BONUS_PROFIT_DISTRIBUTED',
          details: `Распределена бонусная прибыль за ${input.periodName}: $${totalAllocatedUsd} среди ${normalizedAllocations.length} партнёров${remainderUsd.gt(0) ? `; нераспределённый остаток $${remainderUsd} списан` : ''}`,
          financialDetails: moneyJson({
            periodName: input.periodName,
            totalAllocatedUsd,
            annulledRemainderUsd: remainderUsd,
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
