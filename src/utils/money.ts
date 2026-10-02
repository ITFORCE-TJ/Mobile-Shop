import { Decimal } from '@prisma/client/runtime/index-browser.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const decimal = (value: number | string) => new Decimal(value);
export const moneyNumber = (value: Decimal | number | string) => new Decimal(value).toDecimalPlaces(2).toNumber();
export const sumMoney = (values: number[]) => values.reduce((a, b) => a.plus(b), decimal(0)).toNumber();

/**
 * Formats a monetary amount to always show 2 decimal places.
 * Example: 10.5 -> "10.50" (or "10,50"), 1250 -> "1,250.00" (or "1 250,00")
 */
export function formatMoney(
  value: Decimal | number | string | null | undefined,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    locale?: string;
  }
): string {
  if (value === null || value === undefined || value === '') return '0.00';
  const num = typeof value === 'number'
    ? value
    : typeof value === 'string'
    ? Number(value.trim().replace(',', '.'))
    : Number(value);
  if (!Number.isFinite(num)) return '0.00';
  const min = options?.minimumFractionDigits ?? 2;
  const max = options?.maximumFractionDigits ?? 2;
  return num.toLocaleString(options?.locale, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

/** Formats a monetary value in TJS with 2 decimal places: e.g. "10.50 TJS" */
export function formatTjs(value: Decimal | number | string | null | undefined): string {
  return `${formatMoney(value)} TJS`;
}

/** Formats a monetary value in USD with 2 decimal places: e.g. "$10.50" */
export function formatUsd(value: Decimal | number | string | null | undefined): string {
  return `$${formatMoney(value)}`;
}

/**
 * Formats a rate or price for an input field with standard dot separator and 2 decimal places.
 * Example: 10.5 -> "10.50", "10,5" -> "10.50", 11 -> "11.00"
 */
export function formatRateOrInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return '';
  return num.toFixed(2);
}


/**
 * Splits an amount between owners by percent, cent-exact, exactly as the server books owner
 * profit (allocateOwnerProfit): floor each share in cents, then hand the leftover cents to the
 * largest remainders (ties by id). The parts always add up to the total, losses included.
 */
export function allocateByShares(total: Decimal | number | string, shares: { id: string; percent: number | string }[]): Record<string, number> {
  const active = shares.filter((s) => new Decimal(s.percent).gt(0));
  if (!active.length) return {};
  const amount = new Decimal(total).toDecimalPlaces(2);
  const cents = amount.abs().mul(100).round();
  const totalShare = active.reduce((sum, s) => sum.plus(s.percent), new Decimal(0));
  const parts = active.map((s) => {
    const exact = cents.mul(s.percent).div(totalShare);
    return { id: s.id, cents: exact.floor(), remainder: exact.minus(exact.floor()) };
  });
  const leftover = cents.minus(parts.reduce((sum, p) => sum.plus(p.cents), new Decimal(0))).toNumber();
  const ranked = [...parts].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.id.localeCompare(b.id));
  for (let i = 0; i < leftover; i++) ranked[i].cents = ranked[i].cents.plus(1);
  const sign = amount.isNegative() ? -1 : 1;
  return Object.fromEntries(parts.map((p) => [p.id, p.cents.isZero() ? 0 : p.cents.mul(sign).div(100).toNumber()]));
}
