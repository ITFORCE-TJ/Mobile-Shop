import { expect, it } from 'vitest';
import { decimal, moneyNumber, sumMoney } from './money';
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
