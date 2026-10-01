import { describe, expect, it } from 'vitest';
import { cashBalanceFromLedger } from './cash-balance';

const STORE = 'acc-store';
const CENTRAL = 'acc-central';
const row = (over: Record<string, unknown>) => ({
  accountId: STORE, destinationAccountId: null, direction: 'IN', balanceCurrency: 'USD', amountTjs: 0, amountUsd: 0, ...over,
});

describe('cashBalanceFromLedger', () => {
  it('adds cash sales at the rate each sale was made at', () => {
    // 1000 TJS at 10, 1100 TJS at 11, 1200 TJS at 12 → $100 + $100 + $100.
    const result = cashBalanceFromLedger(STORE, [
      row({ amountTjs: 1000, amountUsd: 100 }),
      row({ amountTjs: 1100, amountUsd: 100 }),
      row({ amountTjs: 1200, amountUsd: 100 }),
    ]);
    expect(result).toEqual({ tjs: '3300', usd: '300' });
  });

  it('subtracts expenses and refunds paid from the register with their own amounts', () => {
    const result = cashBalanceFromLedger(STORE, [
      row({ amountTjs: 1000, amountUsd: 100 }),
      row({ direction: 'OUT', amountTjs: 110, amountUsd: 10 }),
      row({ direction: 'OUT', amountTjs: 220.5, amountUsd: 20.05 }),
    ]);
    expect(result).toEqual({ tjs: '669.5', usd: '69.95' });
  });

  it('counts a transfer out of the store and into the central register', () => {
    const rows = [
      row({ amountTjs: 1000, amountUsd: 100 }),
      row({ type: 'TRANSFER', direction: 'NEUTRAL', destinationAccountId: CENTRAL, amountTjs: 1000, amountUsd: 100 }),
    ];
    expect(cashBalanceFromLedger(STORE, rows)).toEqual({ tjs: '0', usd: '0' });
    expect(cashBalanceFromLedger(CENTRAL, rows)).toEqual({ tjs: '1000', usd: '100' });
  });

  it('a cancelled row and its reversal cancel out (both moved the balance)', () => {
    const rows = [
      row({ amountTjs: 500, amountUsd: 50 }),
      row({ direction: 'OUT', amountTjs: 110, amountUsd: 10, status: 'CANCELLED' }),
      row({ direction: 'IN', amountTjs: 110, amountUsd: 10, reversedTransactionId: 'x' }),
    ];
    expect(cashBalanceFromLedger(STORE, rows)).toEqual({ tjs: '500', usd: '50' });
  });

  it('ignores rows that moved a TJS balance (before registers were kept in USD) and other accounts', () => {
    const rows = [
      row({ amountTjs: 1000, amountUsd: 100 }),
      row({ balanceCurrency: 'TJS', amountTjs: 999, amountUsd: 99 }),
      row({ accountId: 'other', amountTjs: 50, amountUsd: 5 }),
    ];
    expect(cashBalanceFromLedger(STORE, rows)).toEqual({ tjs: '1000', usd: '100' });
  });
});
