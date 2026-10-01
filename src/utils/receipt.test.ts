import { describe, expect, it } from 'vitest';
import type { Sale } from '../types';
import { formatMoney } from './money';
import { formatReceiptText, paymentSummary } from './receipt';

const sale: Sale = {
  id: 's1', receiptNumber: 42, date: '2026-10-01T10:00:00.000Z', storeId: 'store-a', storeName: 'Сиёма',
  sellerId: 'u1', sellerName: 'Ахмад', customerName: 'Бехруз',
  items: [
    { deviceId: 'd1', imei: '351111111111111', brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Black', salePriceTjs: 9500, salePriceUsd: 0, purchaseCostUsd: 0, costBasisUsd: 0 },
    { deviceId: 'd2', imei: '352222222222222', brand: 'Samsung', model: 'A55', storage: '256GB', color: 'Blue', salePriceTjs: 3200.5, salePriceUsd: 0, purchaseCostUsd: 0, costBasisUsd: 0 },
  ],
  totalTjs: 12700.5, totalUsd: 0, paymentMethod: 'SPLIT', cashAmountTjs: 10000, cardAmountTjs: 2700.5, status: 'COMPLETED',
};

describe('receipt text', () => {
  it('lists every phone with IMEI and price, the total and how it was paid', () => {
    const text = formatReceiptText(sale);
    expect(text).toContain('Чек №42');
    expect(text).toContain('Магазин: Сиёма');
    expect(text).toContain('IMEI: 351111111111111');
    expect(text).toContain(`Samsung A55 256GB — ${formatMoney(3200.5)} TJS`);
    expect(text).toContain(`Итого: ${formatMoney(12700.5)} TJS`);
    expect(text).toContain(`Оплата: Наличные ${formatMoney(10000)} TJS + карта ${formatMoney(2700.5)} TJS`);
    expect(text).toContain('Покупатель: Бехруз');
  });

  it('can leave the store out and names single payment methods', () => {
    expect(formatReceiptText(sale, { showStore: false })).not.toContain('Магазин:');
    expect(paymentSummary({ paymentMethod: 'CARD', cashAmountTjs: 0, cardAmountTjs: 10 })).toBe('Карта');
  });
});
