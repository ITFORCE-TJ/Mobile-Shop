import { describe, expect, it } from 'vitest';
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


describe('allocateByShares (same cent-exact split as the server)', () => {
  it('splits $100.01 at 50/50 into $50.01 + $50.00, never $50.01 twice', async () => {
    const { allocateByShares } = await import('./money');
    expect(allocateByShares(100.01, [{ id: 'admin', percent: 50 }, { id: 'partner', percent: 50 }])).toEqual({ admin: 50.01, partner: 50 });
  });

  it('always adds up to the total exactly, losses included', async () => {
    const { allocateByShares } = await import('./money');
    for (const total of [0.03, 100.01, 333.33, -0.03, -150.55, 1234.57]) {
      const split = allocateByShares(total, [{ id: 'a', percent: 33.33 }, { id: 'b', percent: 33.33 }, { id: 'c', percent: 33.34 }]);
      expect(Object.values(split).reduce((s, v) => s + Math.round(v * 100), 0)).toBe(Math.round(total * 100));
    }
  });

  it('matches the server allocation (allocateOwnerProfit) cent for cent', async () => {
    const { allocateByShares } = await import('./money');
    const { allocateOwnerProfit } = await import('../../server/src/modules/sales/profit');
    const owners = [{ id: 'owner-admin', percent: 60 }, { id: 'owner-partner', percent: 40 }];
    for (const total of [0.01, 0.05, 99.99, 100.01, -19.04, -150.55, 7.77]) {
      const server = Object.fromEntries(allocateOwnerProfit(total, owners.map((o) => ({ id: o.id, profitSharePercent: o.percent })))
        .map((a) => [a.ownerId, Number(a.amountUsd)]));
      expect(allocateByShares(total, owners)).toEqual(server);
    }
  });
});
