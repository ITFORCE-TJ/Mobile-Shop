import { decimal, moneyNumber } from './money';

type StoreRef = { id: string; name: string; isMainWarehouse?: boolean };
type CapitalTx = { type: string; amountUsd?: number | null; sourceOrDestination?: string | null };

const normalizeStoreName = (name?: string | null) =>
  (name || '').toLowerCase().replace(/["'«»]|магазин|склад/gi, '').trim();

/** Finds the register an owner transaction went through, from its stored id or store name. */
export function resolveTxStore<T extends StoreRef>(sourceOrDestination: string | null | undefined, stores: T[]): T | null {
  if (!sourceOrDestination) return null;
  const raw = sourceOrDestination.trim().toLowerCase();
  const byId = stores.find((s) => s.id === sourceOrDestination || s.id.toLowerCase() === raw);
  if (byId) return byId;
  const byName = stores.find((s) => s.name.trim().toLowerCase() === raw);
  if (byName) return byName;
  const cleanTarget = normalizeStoreName(sourceOrDestination);
  if (!cleanTarget) return null;
  return stores.find((s) => {
    const c = normalizeStoreName(s.name);
    return Boolean(c) && (c === cleanTarget || c.includes(cleanTarget) || cleanTarget.includes(c));
  }) ?? null;
}

/**
 * Where an owner's capital physically sits, by register, rebuilt from where each investment,
 * reinvestment and withdrawal actually went. A partner belongs to one store, but that link
 * says nothing about where their money was put — only the transaction history does.
 * Capital the history doesn't explain (opening balances) is shown at the main warehouse,
 * which holds the partners' equity; no location goes below zero and the total always
 * equals the owner's capital.
 */
export function capitalByLocation({ capitalUsd, transactions, stores }: {
  capitalUsd: number;
  transactions: CapitalTx[];
  stores: StoreRef[];
}): Record<string, number> {
  const amounts = new Map(stores.map((s) => [s.id, decimal(0)]));
  const capital = decimal(Math.max(0, capitalUsd || 0));
  const fallbackId = (stores.find((s) => s.isMainWarehouse) ?? stores[0])?.id;
  const result = () => Object.fromEntries([...amounts].map(([id, v]) => [id, moneyNumber(v)]));
  if (capital.isZero() || !fallbackId) return result();

  let booked = decimal(0);
  for (const tx of transactions) {
    if (!['INVESTMENT', 'REINVEST', 'WITHDRAWAL'].includes(tx.type)) continue;
    const id = resolveTxStore(tx.sourceOrDestination, stores)?.id ?? fallbackId;
    const delta = tx.type === 'WITHDRAWAL' ? decimal(tx.amountUsd || 0).negated() : decimal(tx.amountUsd || 0);
    amounts.set(id, amounts.get(id)!.plus(delta));
    booked = booked.plus(delta);
  }
  amounts.set(fallbackId, amounts.get(fallbackId)!.plus(capital.minus(booked)));

  for (const [id, v] of amounts) if (v.isNegative()) amounts.set(id, decimal(0));
  const shown = [...amounts.values()].reduce((sum, v) => sum.plus(v), decimal(0));
  if (!shown.eq(capital)) {
    const adjusted = amounts.get(fallbackId)!.plus(capital.minus(shown));
    amounts.set(fallbackId, adjusted.isNegative() ? decimal(0) : adjusted);
  }
  return result();
}
