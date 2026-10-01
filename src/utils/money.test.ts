import { expect, it } from 'vitest';
import { decimal, moneyNumber, sumMoney, formatMoney, formatTjs, formatUsd, formatRateOrInput } from './money';
import { getBusinessDateKey } from './businessDate';

it('does not show binary floating point tails in split payment', () => {
  expect(moneyNumber(decimal('1200.10').minus(600))).toBe(600.1);
  expect(sumMoney([0.1, 0.2])).toBe(0.3);
});
it('rounds a commission to cents instead of whole somoni', () => {
  expect(moneyNumber(decimal('1200.10').mul('1.25').div(100))).toBe(15);
});
it('uses the business date around UTC day/month boundaries', () => {
  expect(getBusinessDateKey(new Date('2026-08-31T20:00:00Z'))).toBe('2026-09-01');
  expect(getBusinessDateKey(new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-26');
});
it('formats money and rates always with 2 decimal places', () => {
  expect(formatRateOrInput(10.5)).toBe('10.50');
  expect(formatRateOrInput('10.5')).toBe('10.50');
  expect(formatRateOrInput('10,5')).toBe('10.50');
  expect(formatRateOrInput(10)).toBe('10.00');
  expect(formatRateOrInput('')).toBe('');
  expect(formatRateOrInput(null)).toBe('');

  // formatMoney guarantees 2 fraction digits
  expect(formatMoney(10.5, { locale: 'en-US' })).toBe('10.50');
  expect(formatMoney(10, { locale: 'en-US' })).toBe('10.00');
  expect(formatMoney(1250, { locale: 'en-US' })).toBe('1,250.00');
  expect(formatTjs(10.5)).toContain('.50');
  expect(formatTjs(10.5)).toContain('TJS');
  expect(formatUsd(10.5)).toContain('$');
  expect(formatUsd(10.5)).toContain('.50');
});

