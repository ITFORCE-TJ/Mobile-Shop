import { D, type MoneyInput } from '../../common/decimal';
import type { TransactionClient } from '../../prisma/prisma.service';
import { roundMoney } from '../../common/money';

type Db = Pick<TransactionClient, 'quarterClosure' | 'ownerTransaction'>;

/**
 * Partner profit becomes capital only after its quarter is closed. The part a partner can still
 * reinvest by hand is what was left unpaid at the last quarter close, minus payouts and
 * reinvestments made since then (closed-quarter profit is spent first), never more than the
 * profit still available. Profit of the open quarter reaches capital only through the next close.
 */
export function closedQuarterProfitUsd(input: {
  availableProfitUsd: MoneyInput;
  carriedAtLastCloseUsd: MoneyInput | null | undefined;
  spentSinceCloseUsd: MoneyInput | null | undefined;
}): MoneyInput {
  const left = D(input.carriedAtLastCloseUsd ?? 0).minus(input.spentSinceCloseUsd ?? 0);
  const available = D(input.availableProfitUsd);
  const capped = left.lt(available) ? left : available;
  return roundMoney(capped.lt(0) ? 0 : capped);
}

/** Closed-quarter profit per owner, from the last quarter close and owner history after it. */
export async function closedQuarterProfitByOwner(db: Db, owners: { id: string; availableProfitUsd: MoneyInput }[]) {
  const result = new Map<string, MoneyInput>();
  const lastClose = await db.quarterClosure.findFirst({ orderBy: { closedAt: 'desc' } });
  const carried = new Map<string, MoneyInput>();
  const spent = new Map<string, MoneyInput>();
  if (lastClose) {
    for (const row of Array.isArray(lastClose.snapshot) ? lastClose.snapshot as any[] : []) {
      if (row && typeof row.ownerId === 'string') carried.set(row.ownerId, D(row.availableProfitUsd ?? 0));
    }
    // >= keeps the close's own automatic sweep (same transaction) on the spent side.
    const sums = await db.ownerTransaction.groupBy({
      by: ['ownerId'],
      where: { type: { in: ['PROFIT_PAYOUT', 'REINVEST'] }, createdAt: { gte: lastClose.closedAt } },
      _sum: { amountUsd: true },
    });
    for (const row of sums) spent.set(row.ownerId, D(row._sum.amountUsd ?? 0));
  }
  for (const owner of owners) {
    result.set(owner.id, closedQuarterProfitUsd({
      availableProfitUsd: owner.availableProfitUsd,
      carriedAtLastCloseUsd: carried.get(owner.id),
      spentSinceCloseUsd: spent.get(owner.id),
    }));
  }
  return result;
}
