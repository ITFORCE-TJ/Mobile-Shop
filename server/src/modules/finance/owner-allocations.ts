import { D, type MoneyInput } from '../../common/decimal';
import type { TransactionClient } from '../../prisma/prisma.service';
import { roundMoney } from '../../common/money';
import { allocateOwnerProfit, type OwnerProfitAllocation } from '../sales/profit';

export function readOwnerAllocations(value: unknown): OwnerProfitAllocation[] {
  const error = () => new Error('Не сохранено исходное распределение прибыли партнёров. Сначала восстановите историю начислений для этой операции.');
  if (!Array.isArray(value)) throw error();
  const seen = new Set<string>();
  return value.map((row) => {
    if (!row || typeof row.ownerId !== 'string' || !row.ownerId || seen.has(row.ownerId) ||
        typeof row.amountUsd !== 'number' || !Number.isFinite(row.amountUsd) || D(row.amountUsd).lt(0)) throw error();
    seen.add(row.ownerId);
    return { ownerId: row.ownerId, amountUsd: roundMoney(row.amountUsd) };
  });
}

// Preserve the amounts actually booked for unchanged documents. On an amount
// change reverse those amounts, then book the replacement at the current shares.
export async function replaceOwnerAllocations(tx: TransactionClient, previous: OwnerProfitAllocation[], next: OwnerProfitAllocation[], sign: 1 | -1, guard = false) {
  const deltas = new Map<string, MoneyInput>();
  for (const row of previous) deltas.set(row.ownerId, roundMoney(D((deltas.get(row.ownerId) ?? 0)).minus(D(sign).mul(row.amountUsd))));
  for (const row of next) deltas.set(row.ownerId, roundMoney(D((deltas.get(row.ownerId) ?? 0)).plus(D(sign).mul(row.amountUsd))));
  for (const [id, delta] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
    if (D(delta).eq(0)) continue;
    const result = await tx.owner.updateMany({
      where: { id, ...(guard && D(delta).lt(0) ? { availableProfitUsd: { gte: D(delta).negated() } } : {}) },
      data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
    });
    if (result.count !== 1) throw new Error('Не удалось скорректировать прибыль партнёра: запись отсутствует или прибыль уже выплачена/реинвестирована. Требуется сверка.');
  }
}

/** The owner record of the admin, who receives every store's profit not assigned to partners. */
export function findAdminOwner<T extends { storeId?: string | null; user?: { role?: string } | null }>(owners: T[]): T | undefined {
  return owners.find((o) => o.user?.role === 'ADMIN') ?? owners.find((o) => !o.storeId && o.user?.role !== 'PARTNER');
}

/**
 * Who shares a store's profit and in what proportion. Partner shares are stored per store
 * (StoreProfitShare, set by the admin); the admin always gets the rest — and 100% of stores
 * without partners, the main warehouse and operations not tied to a store. Without any store
 * shares at all the legacy company-wide split on the owner rows applies.
 */
export async function getOwnersForStore(tx: TransactionClient, storeId?: string | null) {
  const owners = await tx.owner.findMany({ include: { user: { select: { role: true } } }, orderBy: { createdAt: 'asc' } });
  if (owners.length === 0) return [];

  const storeProfitShareCount = tx.storeProfitShare?.count ? await tx.storeProfitShare.count() : 0;
  if (storeProfitShareCount === 0) {
    const total = owners.reduce((sum, o) => D(sum).plus(o.profitSharePercent), D(0));
    if (total.eq(100)) return owners;
    const legacyAdmin = findAdminOwner(owners);
    return legacyAdmin ? [{ ...legacyAdmin, profitSharePercent: D(100) }] : owners;
  }

  const admin = findAdminOwner(owners);
  if (!admin) throw new Error('Не найден владелец-администратор для распределения прибыли');
  const shares = storeId && tx.storeProfitShare ? await tx.storeProfitShare.findMany({ where: { storeId }, orderBy: { ownerId: 'asc' } }) : [];
  const partnerTotal = shares.reduce((sum, sh) => D(sum).plus(sh.sharePercent), D(0));
  if (partnerTotal.gte(100)) throw new Error('Доли партнёров магазина должны быть меньше 100%: администратор всегда получает часть прибыли');
  const partners = shares.map((sh) => {
    const owner = owners.find((o) => o.id === sh.ownerId);
    if (!owner) throw new Error('Партнёр из долей магазина не найден');
    return { ...owner, profitSharePercent: D(sh.sharePercent) };
  });
  return [{ ...admin, profitSharePercent: D(100).minus(partnerTotal) }, ...partners.filter((p) => p.id !== admin.id)];
}

export async function currentOwnerAllocations(tx: TransactionClient, amountUsd: MoneyInput, storeId?: string | null) {
  const owners = await getOwnersForStore(tx, storeId);
  return allocateOwnerProfit(amountUsd, owners);
}
