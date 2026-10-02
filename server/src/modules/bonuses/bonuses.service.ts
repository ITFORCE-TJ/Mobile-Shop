import { D, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireNonNegativeMoney, roundMoney } from '../../common/money';
import { allocateMoney } from '../../common/allocation';
import type { OwnerProfitAllocation } from '../sales/profit';
import { readOwnerAllocations, replaceOwnerAllocations } from '../finance/owner-allocations';

/**
 * A refunded sale takes back the bonus profit its devices already paid out. Each owner
 * returns what they actually received for these entries: the distribution's allocations,
 * scaled by how much of that pool was handed out (a partial distribution annuls the rest).
 * Returns negative per-owner deltas; the caller applies them with the rest of the refund.
 */
export async function reverseDistributedBonus(tx: TransactionClient, saleId: string, note: string, actorName: string): Promise<OwnerProfitAllocation[]> {
  const entries = await tx.bonusPoolEntry.findMany({ where: { saleId, status: 'DISTRIBUTED', annulledAt: null } });
  return reverseDistributedEntries(tx, entries, note, actorName);
}

/** Takes back what earlier distributions paid owners for these pool entries (see reverseDistributedBonus). */
async function reverseDistributedEntries(
  tx: TransactionClient,
  entries: { id: string; distributionId: string | null; profitUsd: MoneyInput }[],
  note: string,
  actorName: string,
): Promise<OwnerProfitAllocation[]> {
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

export interface LegacyBonusAccruals {
  totalUsd: ReturnType<typeof roundMoney>;
  cashBonuses: { id: string; supplierName: string; campaignTitle: string | null; amountUsd: MoneyInput; dateReceived: string; allocations: OwnerProfitAllocation[] }[];
  distributedPool: { entries: number; amountUsd: ReturnType<typeof roundMoney> };
  perOwner: { ownerId: string; name: string; amountUsd: ReturnType<typeof roundMoney>; availableProfitUsd: MoneyInput; availableAfterUsd: ReturnType<typeof roundMoney> }[];
}

/**
 * Bonus amounts an earlier version booked as owner profit: cash bonuses accrued to owners and
 * bonus-pool profit distributed to them. Bonuses are nobody's income, so the admin can take
 * these accruals back (see reverseLegacyAccruals). Read-only.
 */
async function findLegacyAccruals(db: TransactionClient) {
  const cashBonuses = (await db.supplierBonus.findMany({
    where: { bonusType: 'CASH_DISCOUNT' },
    include: { supplier: { select: { name: true } } },
    orderBy: { dateReceived: 'asc' },
  })).filter((b) => Array.isArray(b.ownerProfitAllocations) && b.ownerProfitAllocations.length > 0);
  const distributed = await db.bonusPoolEntry.findMany({ where: { status: 'DISTRIBUTED', annulledAt: null } });
  return { cashBonuses, distributed };
}

/** Per-owner amounts the distributed pool entries would give back (same rule as a refund). */
async function distributedDeltas(db: TransactionClient, entries: { id: string; distributionId: string | null; profitUsd: MoneyInput }[]) {
  const deltas = new Map<string, ReturnType<typeof D>>();
  const byDistribution = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (!entry.distributionId) throw new Error('Не найдено распределение бонусной прибыли. Требуется сверка');
    byDistribution.set(entry.distributionId, [...(byDistribution.get(entry.distributionId) ?? []), entry]);
  }
  for (const [distributionId, part] of byDistribution) {
    const log = await db.bonusDistributionLog.findUnique({ where: { id: distributionId } });
    const allocations = Array.isArray(log?.allocations) ? (log!.allocations as { ownerId?: unknown; amountUsd?: unknown }[]) : [];
    if (!log || !allocations.length) throw new Error('Не сохранено распределение бонусной прибыли. Требуется сверка');
    const pool = (await db.bonusPoolEntry.findMany({ where: { distributionId }, select: { profitUsd: true } })).reduce((sum, e) => sum.plus(e.profitUsd), D(0));
    if (pool.lte(0)) continue;
    const paidOut = roundMoney(D(log.totalAmountUsd).mul(part.reduce((sum, e) => sum.plus(e.profitUsd), D(0))).div(pool));
    const perOwner = allocateMoney(paidOut, allocations.map((a) => a.amountUsd as number));
    allocations.forEach((a, i) => deltas.set(a.ownerId as string, (deltas.get(a.ownerId as string) ?? D(0)).plus(perOwner[i])));
  }
  return deltas;
}

export interface AnnulBonusInput {
  periodName?: string;
  note?: string;
  userId: string;
}

export class BonusesService {
  /** Old bonus accruals to owners, with what each owner would give back. Read-only. */
  public static async legacyAccruals(db: TransactionClient = prisma as unknown as TransactionClient): Promise<LegacyBonusAccruals> {
    const { cashBonuses, distributed } = await findLegacyAccruals(db);
    const perOwner = new Map<string, ReturnType<typeof D>>();
    const add = (ownerId: string, amount: MoneyInput) => perOwner.set(ownerId, (perOwner.get(ownerId) ?? D(0)).plus(amount));
    const cash = cashBonuses.map((b) => {
      const allocations = readOwnerAllocations(b.ownerProfitAllocations);
      allocations.forEach((a) => add(a.ownerId, a.amountUsd));
      return { id: b.id, supplierName: b.supplier.name, campaignTitle: b.campaignTitle, amountUsd: b.amountUsd ?? 0, dateReceived: b.dateReceived.toISOString(), allocations };
    });
    const poolDeltas = await distributedDeltas(db, distributed);
    let poolTotal = D(0);
    for (const [ownerId, amount] of poolDeltas) { add(ownerId, amount); poolTotal = poolTotal.plus(amount); }
    const owners = await db.owner.findMany({ where: { id: { in: [...perOwner.keys()] } }, select: { id: true, name: true, availableProfitUsd: true } });
    return {
      totalUsd: roundMoney([...perOwner.values()].reduce((s, v) => s.plus(v), D(0))),
      cashBonuses: cash,
      distributedPool: { entries: distributed.length, amountUsd: roundMoney(poolTotal) },
      perOwner: [...perOwner].map(([ownerId, amount]) => {
        const owner = owners.find((o) => o.id === ownerId);
        return { ownerId, name: owner?.name ?? ownerId, amountUsd: roundMoney(amount), availableProfitUsd: owner?.availableProfitUsd ?? 0, availableAfterUsd: roundMoney(D(owner?.availableProfitUsd ?? 0).minus(amount)) };
      }),
    };
  }

  /**
   * Takes back every old bonus accrual from the owners (bonuses are nobody's income): each
   * owner's accrued and available profit go down by exactly what was booked — profit already
   * capitalized may leave a negative balance, which shows the overpayment. Journal lines and an
   * audit record are written; no money moves and the bonuses stay in history. The admin
   * confirms the previewed total; runs once.
   */
  public static async reverseLegacyAccruals(input: { expectedTotalUsd: MoneyInput; userId: string }) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.userId);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('bonus-legacy-accruals'))::text`;
      const preview = await BonusesService.legacyAccruals(tx);
      if (D(preview.totalUsd).isZero()) throw new Error('Старых начислений бонусов нет');
      if (!D(preview.totalUsd).eq(D(input.expectedTotalUsd ?? -1))) {
        throw Object.assign(new Error(`Сумма начислений изменилась: подтверждено $${input.expectedTotalUsd}, сейчас $${preview.totalUsd}. Обновите страницу`), { statusCode: 409 });
      }
      const note = 'Снятие старых начислений бонусов: бонусы не являются доходом';
      const { cashBonuses, distributed } = await findLegacyAccruals(tx);
      for (const b of cashBonuses) {
        await replaceOwnerAllocations(tx, readOwnerAllocations(b.ownerProfitAllocations), [], 1);
        await tx.supplierBonus.update({ where: { id: b.id }, data: { ownerProfitAllocations: [] } });
        await tx.ledgerEntry.create({
          data: { type: 'SUPPLIER_BONUS', description: `Сторно (бонусы не доход владельцев): бонус от ${b.supplier.name} −$${b.amountUsd}`, amountUsd: D(b.amountUsd ?? 0).negated(), exchangeRate: b.exchangeRate, userName: actor.name, referenceId: b.id },
        });
      }
      const poolDeltas = await reverseDistributedEntries(tx, distributed, note, actor.name);
      for (const { ownerId, amountUsd } of poolDeltas) {
        if (D(amountUsd).isZero()) continue;
        const updated = await tx.owner.updateMany({ where: { id: ownerId }, data: { totalAccruedProfitUsd: { increment: amountUsd }, availableProfitUsd: { increment: amountUsd } } });
        if (updated.count !== 1) throw new Error('Партнёр из распределения бонусов не найден. Требуется сверка');
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id, userName: actor.name, userRole: actor.role,
          action: 'BONUS_LEGACY_ACCRUAL_REVERSED',
          details: `Сняты старые начисления бонусов владельцам на $${preview.totalUsd}: ${preview.perOwner.map((o) => `${o.name} −$${o.amountUsd}`).join(', ')}`,
          financialDetails: moneyJson({ totalUsd: preview.totalUsd, perOwner: preview.perOwner, cashBonusIds: cashBonuses.map((b) => b.id), poolEntries: distributed.length }),
        },
      });
      return { totalUsd: preview.totalUsd, perOwner: preview.perOwner };
    });
  }

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

  /**
   * The current bonus quarter, shown on the Bonuses page: everything since the last quarterly
   * close. Bonuses are nobody's income — this is a report, not a balance anyone can draw from.
   */
  public static async quarterSummary(db: Pick<TransactionClient, 'bonusDistributionLog' | 'supplierBonus' | 'bonusPoolEntry'> = prisma) {
    const lastClose = await db.bonusDistributionLog.findFirst({ where: { type: 'ANNULMENT' }, orderBy: { createdAt: 'desc' } });
    const since = lastClose?.createdAt ?? null;
    const sinceFilter = since ? { createdAt: { gt: since } } : {};
    const [cashBonuses, deviceBonuses, pending] = await Promise.all([
      db.supplierBonus.findMany({ where: { bonusType: 'CASH_DISCOUNT', ...sinceFilter }, select: { amountUsd: true, exchangeRate: true } }),
      db.supplierBonus.findMany({ where: { bonusType: 'FREE_DEVICES', ...sinceFilter }, select: { id: true } }),
      db.bonusPoolEntry.findMany({ where: { status: 'PENDING' }, select: { profitUsd: true, profitTjs: true } }),
    ]);
    return {
      since: since?.toISOString() ?? null,
      cashBonusesCount: cashBonuses.length,
      cashBonusesUsd: roundMoney(cashBonuses.reduce((sum, b) => D(sum).plus(b.amountUsd ?? 0), D(0))),
      cashBonusesTjs: roundMoney(cashBonuses.reduce((sum, b) => D(sum).plus(D(b.amountUsd ?? 0).mul(b.exchangeRate)), D(0))),
      bonusDevicesReceived: deviceBonuses.length,
      bonusDevicesSold: pending.length,
      bonusDeviceProfitUsd: roundMoney(pending.reduce((sum, e) => D(sum).plus(e.profitUsd), D(0))),
      bonusDeviceProfitTjs: roundMoney(pending.reduce((sum, e) => D(sum).plus(e.profitTjs), D(0))),
    };
  }

  /** Past quarterly closes, newest first. */
  public static async quarterHistory() {
    return prisma.bonusDistributionLog.findMany({ where: { type: 'ANNULMENT' }, orderBy: { createdAt: 'desc' }, take: 20 });
  }

  /**
   * Quarterly close of bonuses (confirmed on the Bonuses page): the quarter's cash bonuses and
   * bonus-phone profit are recorded in the close log and the counters start from zero. Nothing
   * is credited to anyone and no money moves — the sold phones' cash simply stays in the registers.
   */
  public static async annulBonusPool(input: AnnulBonusInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.userId);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('bonus-quarter-close'))::text`;
      const quarter = await BonusesService.quarterSummary(tx);
      const pendingEntries = await tx.bonusPoolEntry.findMany({
        where: { status: 'PENDING' },
      });

      if (pendingEntries.length === 0 && quarter.cashBonusesCount === 0 && quarter.bonusDevicesReceived === 0) {
        throw new Error('За этот квартал бонусов нет — обнулять нечего');
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
          note: input.note?.trim() || `Квартал бонусов закрыт: денежные бонусы $${quarter.cashBonusesUsd} (${quarter.cashBonusesCount}), бонусные телефоны продано ${quarter.bonusDevicesSold} на $${quarter.bonusDeviceProfitUsd}, получено ${quarter.bonusDevicesReceived}`,
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
          details: `Закрыт квартал бонусов «${input.periodName?.trim() || 'без названия'}»: денежные бонусы $${quarter.cashBonusesUsd}, прибыль бонусных телефонов $${totalAnnulledUsd} (${pendingEntries.length} шт.) — счётчики обнулены, деньги на Бонусном счёте не изменились`,
          financialDetails: moneyJson({
            totalAnnulledUsd,
            entriesCount: pendingEntries.length,
            cashBonusesUsd: quarter.cashBonusesUsd,
            cashBonusesCount: quarter.cashBonusesCount,
            bonusDevicesReceived: quarter.bonusDevicesReceived,
            note: input.note,
          }),
        },
      });

      return log;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
