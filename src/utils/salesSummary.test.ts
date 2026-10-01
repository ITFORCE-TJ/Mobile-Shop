import { describe, expect, it } from 'vitest';
import { summarizeSales } from './salesSummary';

describe('summarizeSales', () => {
  it('totals receipts, cash and card to the cent and leaves refunds out of the money', () => {
    const summary = summarizeSales([
      { status: 'COMPLETED', totalTjs: 0.1, cashAmountTjs: 0.1, cardAmountTjs: 0 },
      { status: 'COMPLETED', totalTjs: 0.2, cashAmountTjs: 0, cardAmountTjs: 0.2 },
      { status: 'EXCHANGED', totalTjs: 1000, cashAmountTjs: 400, cardAmountTjs: 600 },
      { status: 'REFUNDED', totalTjs: 5000, cashAmountTjs: 5000, cardAmountTjs: 0 },
    ]);
    expect(summary).toEqual({ receipts: 3, totalTjs: 1000.3, cashTjs: 400.1, cardTjs: 600.2, refunded: 1 });
  });

  it('is all zero for an empty period', () => {
    expect(summarizeSales([])).toEqual({ receipts: 0, totalTjs: 0, cashTjs: 0, cardTjs: 0, refunded: 0 });
  });
});
