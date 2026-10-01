import { describe, expect, it } from 'vitest';
import { capitalByLocation, resolveTxStore } from './ownerCapital';

const stores = [
  { id: 'main', name: 'Главный склад', isMainWarehouse: true },
  { id: 'tsum', name: 'Магазин «ЦУМ»', isMainWarehouse: false },
  { id: 'sadbarg', name: 'Магазин «Садбарг»', isMainWarehouse: false },
];

const tx = (type: string, amountUsd: number, sourceOrDestination: string) => ({ type, amountUsd, sourceOrDestination });

describe('capitalByLocation', () => {
  it('places a store partner\'s capital where it was actually invested, not in their own store', () => {
    // Partner of ЦУМ invested $10,000 into the main warehouse and $5,000 into ЦУМ.
    const map = capitalByLocation({
      capitalUsd: 15000,
      transactions: [tx('INVESTMENT', 10000, 'Главный склад'), tx('INVESTMENT', 5000, 'Магазин «ЦУМ»')],
      stores,
    });
    expect(map).toEqual({ main: 10000, tsum: 5000, sadbarg: 0 });
  });

  it('reduces the register a withdrawal came from and counts reinvestments at their destination', () => {
    const map = capitalByLocation({
      capitalUsd: 7000.5,
      transactions: [
        tx('INVESTMENT', 8000, 'Магазин «Садбарг»'),
        tx('WITHDRAWAL', 1500, 'Магазин «Садбарг»'),
        tx('REINVEST', 500.5, 'Главный склад'),
      ],
      stores,
    });
    expect(map).toEqual({ main: 500.5, tsum: 0, sadbarg: 6500 });
  });

  it('books capital without matching history (opening balances) to the main warehouse', () => {
    expect(capitalByLocation({ capitalUsd: 1000, transactions: [], stores })).toEqual({ main: 1000, tsum: 0, sadbarg: 0 });
  });

  it('never shows a negative location and keeps the total equal to the capital', () => {
    const map = capitalByLocation({
      capitalUsd: 100,
      transactions: [tx('INVESTMENT', 100, 'Главный склад'), tx('WITHDRAWAL', 50, 'Магазин «ЦУМ»'), tx('INVESTMENT', 50, 'Главный склад')],
      stores,
    });
    expect(map.tsum).toBe(0);
    expect(map.main + map.tsum + map.sadbarg).toBe(100);
  });

  it('shows nothing for an owner without capital', () => {
    expect(capitalByLocation({ capitalUsd: 0, transactions: [tx('INVESTMENT', 10, 'Главный склад')], stores })).toEqual({ main: 0, tsum: 0, sadbarg: 0 });
  });
});

describe('resolveTxStore', () => {
  it('matches by id, exact name and quote-insensitive name', () => {
    expect(resolveTxStore('tsum', stores)?.id).toBe('tsum');
    expect(resolveTxStore('Главный склад', stores)?.id).toBe('main');
    expect(resolveTxStore('Садбарг', stores)?.id).toBe('sadbarg');
    expect(resolveTxStore('Саховат', stores)).toBeNull();
  });
});
