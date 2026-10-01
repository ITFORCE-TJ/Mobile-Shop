import { describe, expect, it } from 'vitest';
import { D } from '../../common/decimal';
import { closedQuarterProfitUsd } from './reinvest-limit';

const limit = (available: number, carried: number | null, spent: number) =>
  D(closedQuarterProfitUsd({ availableProfitUsd: available, carriedAtLastCloseUsd: carried, spentSinceCloseUsd: spent })).toString();

describe('closedQuarterProfitUsd', () => {
  it('allows nothing before any quarter is closed', () => {
    expect(limit(500, null, 0)).toBe('0');
  });

  it('allows the unpaid profit carried over at the last close, but not the open quarter profit', () => {
    // $300 left unpaid at close, $200 earned since: only $300 may become capital by hand.
    expect(limit(500, 300, 0)).toBe('300');
  });

  it('counts payouts and reinvestments since the close against the closed profit first', () => {
    expect(limit(400, 300, 100)).toBe('200');
    expect(limit(150, 300, 350)).toBe('0');
  });

  it('never exceeds the profit still available (refunds after the close)', () => {
    expect(limit(120, 300, 0)).toBe('120');
    expect(limit(0, 300, 0)).toBe('0');
  });

  it('is exact in cents', () => {
    expect(limit(1000.01, 333.33, 0.01)).toBe('333.32');
  });
});
