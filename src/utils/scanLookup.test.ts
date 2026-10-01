import { describe, expect, it } from 'vitest';
import type { Device } from '../types';
import { looksLikeDeviceCode, normalizeScanCode, resolveSaleScan, saleScanMessage } from './scanLookup';

const device = (over: Partial<Device>): Device => ({
  id: 'd1', imei: '111111111111111', brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Black',
  status: 'STORE_STOCK', locationId: 'store-a', locationName: 'Сиёма', purchaseCostUsd: 500, costBasisUsd: 500,
  createdAt: '', timeline: [], ...over,
});

const stores: Record<string, string> = { 'store-a': 'Сиёма', 'store-b': 'ЦУМ' };
const resolve = (devices: Device[], code: string, cart: string[] = []) =>
  resolveSaleScan({ devices, code, storeId: 'store-a', cartDeviceIds: cart, storeName: (id) => stores[id] });

describe('resolveSaleScan', () => {
  it('adds an in-stock phone of this store, found by either IMEI and with scanner spaces', () => {
    const d = device({ imei2: '222222222222222' });
    expect(resolve([d], '111111111111111').kind).toBe('add');
    expect(resolve([d], ' 2222 2222 2222 222\n').kind).toBe('add');
  });

  it('explains why a phone is not added', () => {
    expect(saleScanMessage(resolve([device({})], '111111111111111', ['d1']) as any)).toMatch('уже в корзине');
    const other = resolve([device({ locationId: 'store-b' })], '111111111111111');
    expect(other.kind).toBe('other-location');
    expect(saleScanMessage(other as any)).toMatch('«ЦУМ»');
    const transit = resolve([device({ status: 'TRANSFER_PENDING' })], '111111111111111');
    expect(saleScanMessage(transit as any)).toMatch('«В транзите»');
    const missing = resolve([device({})], '999999999999999');
    expect(missing.kind).toBe('not-found');
    expect(saleScanMessage(missing as any)).toMatch('999999999999999');
  });

  it('a phone after exchange is sellable', () => {
    expect(resolve([device({ status: 'IN_STOCK_AFTER_EXCHANGE' })], '111111111111111').kind).toBe('add');
  });
});

describe('scan code helpers', () => {
  it('normalizes and recognizes device codes', () => {
    expect(normalizeScanCode(' 35 1234 \r\n')).toBe('351234');
    expect(looksLikeDeviceCode('351234567890123')).toBe(true);
    expect(looksLikeDeviceCode('iphone 15')).toBe(false);
    expect(looksLikeDeviceCode('1234')).toBe(false);
  });
});
