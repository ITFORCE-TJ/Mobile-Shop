import { describe, expect, it } from 'vitest';
import { resolveStoreContext, formatStoreName } from './storeContext';

const stores = [
  { id: 'main', name: 'Главный склад', isMainWarehouse: true },
  { id: 'siyoma', name: 'Сиёма', isMainWarehouse: false },
  { id: 'sahovat', name: 'Саховат', isMainWarehouse: false },
];

describe('resolveStoreContext', () => {
  it('admin in a store sees only that store', () => {
    expect(resolveStoreContext({ role: 'ADMIN', selectedStoreId: 'sahovat', stores })).toEqual({ mode: 'STORE', storeId: 'sahovat', storeName: 'Саховат' });
  });

  it('admin in Central Cash gets the overview of every store', () => {
    for (const selectedStoreId of ['all', '', null, undefined, 'main', 'unknown']) {
      expect(resolveStoreContext({ role: 'ADMIN', selectedStoreId, stores })).toEqual({ mode: 'CENTRAL', storeId: null, storeName: null });
    }
  });

  it('store staff are always in their own store, whatever is selected', () => {
    expect(resolveStoreContext({ role: 'SELLER', userStoreId: 'siyoma', selectedStoreId: 'all', stores })).toEqual({ mode: 'STORE', storeId: 'siyoma', storeName: 'Сиёма' });
    expect(resolveStoreContext({ role: 'PARTNER', userStoreId: 'sahovat', selectedStoreId: 'siyoma', stores })).toEqual({ mode: 'STORE', storeId: 'sahovat', storeName: 'Саховат' });
  });
});

describe('formatStoreName', () => {
  it('strips redundant "Магазин «»" prefixes and quotes cleanly', () => {
    expect(formatStoreName('Магазин «Сиёма»')).toBe('Сиёма');
    expect(formatStoreName('Магазин «Садбарг»')).toBe('Садбарг');
    expect(formatStoreName('Магазин "ЦУМ"')).toBe('ЦУМ');
    expect(formatStoreName('Магазин Саховат')).toBe('Саховат');
    expect(formatStoreName('Сиёма')).toBe('Сиёма');
  });

  it('preserves warehouse and headquarter names', () => {
    expect(formatStoreName('Главный склад')).toBe('Главный склад');
    expect(formatStoreName('Центральный склад')).toBe('Центральный склад');
    expect(formatStoreName('Центральная касса (Главный офис)')).toBe('Центральная касса (Главный офис)');
  });

  it('handles empty and null inputs safely', () => {
    expect(formatStoreName(null)).toBe('');
    expect(formatStoreName(undefined)).toBe('');
    expect(formatStoreName('')).toBe('');
  });
});
