import { D, moneyJson } from '../../common/decimal';
import '../../common/decimal-test-setup';
import { describe, expect, it } from 'vitest';
import { allocateOwnerProfit, calculateRecognizedProfit, exchangeCostRestorations, refundOwnerProfit } from './profit';

describe('recognized sale profit', () => {
  it('adds original sale and every exchange profit impact', () => {
    expect(calculateRecognizedProfit([
      { action: 'SALE', financialDetails: { recognizedProfitUsd: 400 } },
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: 500 } },
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: -25.235 } },
    ], 1)).toEqual(874.77);
  });

  it('uses the fallback for legacy sales without an audited original profit', () => {
    expect(calculateRecognizedProfit([
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: 50 } },
    ], 125.126)).toEqual(125.13);
  });

  it('preserves a real zero or negative audited profit', () => {
    expect(calculateRecognizedProfit([{ action: 'SALE_BELOW_COST', financialDetails: { recognizedProfitUsd: -10 } }], 99)).toEqual(-10);
    expect(calculateRecognizedProfit([{ action: 'SALE', financialDetails: { recognizedProfitUsd: 0 } }], 99)).toEqual(0);
  });
});

describe('refund owner allocations', () => {
  const originalOwners = [{ id: 'a', profitSharePercent: 60 }, { id: 'b', profitSharePercent: 40 }];
  const currentOwners = [{ id: 'a', profitSharePercent: 50 }, { id: 'b', profitSharePercent: 50 }];
  const sale = (amount: number) => ({ action: 'SALE', financialDetails: {
    ownerProfitAllocations: moneyJson(allocateOwnerProfit(amount, originalOwners)),
  } });

  it('reverses 60/40 amounts even after shares become 50/50', () => {
    expect(refundOwnerProfit([sale(100)], currentOwners, 0)).toEqual([
      { ownerId: 'a', amountUsd: -60 }, { ownerId: 'b', amountUsd: -40 },
    ]);
  });

  it('allocates a new penalty using current shares independently of the reversal', () => {
    expect(refundOwnerProfit([sale(100)], currentOwners, 10)).toEqual([
      { ownerId: 'a', amountUsd: -55 }, { ownerId: 'b', amountUsd: -35 },
    ]);
  });

  it('reverses each exchange using its own recorded amounts', () => {
    const exchange = { action: 'EXCHANGE', financialDetails: {
      ownerProfitAllocations: moneyJson(allocateOwnerProfit(50, currentOwners)),
    } };
    expect(refundOwnerProfit([sale(100), exchange], originalOwners, 0)).toEqual([
      { ownerId: 'a', amountUsd: -85 }, { ownerId: 'b', amountUsd: -65 },
    ]);
  });

  it('preserves original cent rounding and reverses losses', () => {
    expect(refundOwnerProfit([sale(-0.03)], currentOwners, 0)).toEqual([
      { ownerId: 'a', amountUsd: 0.02 }, { ownerId: 'b', amountUsd: 0.01 },
    ]);
  });

  it('does not charge a new partner for profit they never received', () => {
    expect(refundOwnerProfit([sale(100)], [
      { id: 'b', profitSharePercent: 50 }, { id: 'a', profitSharePercent: 0 },
      { id: 'c', profitSharePercent: 50 },
    ], 0)).toEqual([
      { ownerId: 'b', amountUsd: -40 }, { ownerId: 'a', amountUsd: -60 }, { ownerId: 'c', amountUsd: 0 },
    ]);
  });

  it('rejects missing original or exchange snapshots instead of guessing current shares', () => {
    expect(() => refundOwnerProfit([], currentOwners, 0)).toThrow('исходное распределение');
    expect(() => refundOwnerProfit([{ action: 'SALE', financialDetails: { recognizedProfitUsd: 100 } }], currentOwners, 0)).toThrow('исходное распределение');
    expect(() => refundOwnerProfit([sale(100), { action: 'EXCHANGE', financialDetails: {} }], currentOwners, 0)).toThrow('исходное распределение');
  });

  it('reverses a partner no longer in the store and rejects corrupt duplicate allocations', () => {
    // 'b' has since left the store: it still gets back exactly its original 40.
    expect(refundOwnerProfit([sale(100)], [{ id: 'a', profitSharePercent: 100 }], 0)).toEqual([
      { ownerId: 'a', amountUsd: -60 }, { ownerId: 'b', amountUsd: -40 },
    ]);
    expect(() => refundOwnerProfit([{ action: 'SALE', financialDetails: { ownerProfitAllocations: [
      { ownerId: 'a', amountUsd: 60 }, { ownerId: 'a', amountUsd: 40 },
    ] } }], currentOwners, 0)).toThrow('исходное распределение');
  });
});


describe('exact owner allocation', () => {
  const owners = [{ id: 'a', profitSharePercent: 50 }, { id: 'b', profitSharePercent: 50 }];
  it.each([0.01, 0.03, 1.01, -0.01, -0.03, 100.99])('preserves the total for %s', (amount) => {
    const allocated = allocateOwnerProfit(amount, owners);
    expect(allocated.reduce((sum, row) => sum.plus(row.amountUsd), D(0)).toFixed(2)).toEqual(D(amount).toFixed(2));
    expect(allocateOwnerProfit(amount, [...owners].reverse()).reverse()).toEqual(allocated);
  });
  it('does not allocate a remainder to zero-share owners', () => {
    expect(allocateOwnerProfit(0.01, [{ id: 'a', profitSharePercent: 0 }, { id: 'b', profitSharePercent: 100 }]))
      .toEqual([{ ownerId: 'a', amountUsd: 0 }, { ownerId: 'b', amountUsd: 0.01 }]);
  });
  it('rejects invalid shares before booking money', () => {
    expect(() => allocateOwnerProfit(100, [{ id: 'a', profitSharePercent: 99.99 }])).toThrow('100%');
  });
});

describe('exchange cost restorations', () => {
  it('returns each traded-in device with its trade-in and original cost', () => {
    expect(exchangeCostRestorations([
      { action: 'SALE', financialDetails: { recognizedProfitUsd: 100 } },
      { action: 'EXCHANGE', financialDetails: { returnedDeviceId: 'a', exchangeInValueUsd: 150, returnedCostBasisUsd: 100.004 } },
    ])).toEqual([{ deviceId: 'a', tradeInCostUsd: D(150), originalCostUsd: D(100) }]);
  });

  it('skips legacy exchanges that never recorded the original cost', () => {
    expect(exchangeCostRestorations([{ action: 'EXCHANGE', financialDetails: { exchangeInValueUsd: 150 } }])).toEqual([]);
  });
});
