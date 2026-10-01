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

export async function getOwnersForStore(tx: TransactionClient, storeId?: string | null) {
  const allOwners = await tx.owner.findMany({ include: { user: true } });
  if (allOwners.length === 0) return [];

  const storeSpecificOwners = allOwners.filter((o) => Boolean(o.storeId));
  if (!storeId || storeSpecificOwners.length === 0) {
    const sum = allOwners.reduce((acc, o) => D(acc).plus(o.profitSharePercent), D(0));
    if (sum.eq(100)) return allOwners;
    const adminOwner = allOwners.find((o) => !o.storeId || o.user?.role === 'ADMIN');
    return adminOwner ? [{ ...adminOwner, profitSharePercent: D(100) }] : allOwners;
  }

  const storePartner = allOwners.find((o) => o.storeId === storeId);
  const adminOwner = allOwners.find((o) => !o.storeId || o.user?.role === 'ADMIN');

  if (adminOwner && storePartner) {
    const partnerShare = D(storePartner.profitSharePercent);
    const adminShare = D(100).minus(partnerShare);
    return [
      { ...adminOwner, profitSharePercent: adminShare },
      { ...storePartner, profitSharePercent: partnerShare },
    ];
  } else if (storePartner) {
    return [{ ...storePartner, profitSharePercent: D(100) }];
  } else if (adminOwner) {
    return [{ ...adminOwner, profitSharePercent: D(100) }];
  }
  return allOwners;
}

export async function currentOwnerAllocations(tx: TransactionClient, amountUsd: MoneyInput, storeId?: string | null) {
  const owners = await getOwnersForStore(tx, storeId);
  return allocateOwnerProfit(amountUsd, owners);
}
