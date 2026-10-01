import type { PaymentMethod, Sale } from '../types';
import { formatMoney } from './money';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Наличные',
  CARD: 'Карта',
  SPLIT: 'Наличные + карта',
  DEBT: 'В долг',
};

/** How the customer paid, with the split amounts when both were used. */
export function paymentSummary(sale: Pick<Sale, 'paymentMethod' | 'cashAmountTjs' | 'cardAmountTjs'>): string {
  if (sale.paymentMethod === 'SPLIT') {
    return `Наличные ${formatMoney(sale.cashAmountTjs)} TJS + карта ${formatMoney(sale.cardAmountTjs)} TJS`;
  }
  return PAYMENT_METHOD_LABELS[sale.paymentMethod] || sale.paymentMethod;
}

/** Plain-text receipt for sharing with the customer (messenger, SMS) or copying. */
export function formatReceiptText(sale: Sale, opts: { showStore?: boolean } = {}): string {
  const lines = [
    `Чек №${sale.receiptNumber}`,
    new Date(sale.date).toLocaleString('ru-RU'),
    ...(opts.showStore !== false && sale.storeName ? [`Магазин: ${sale.storeName}`] : []),
    '',
    ...sale.items.map((item) =>
      `${item.brand} ${item.model}${item.storage ? ` ${item.storage}` : ''} — ${formatMoney(item.salePriceTjs)} TJS\nIMEI: ${item.imei}`),
    '',
    `Итого: ${formatMoney(sale.totalTjs)} TJS`,
    `Оплата: ${paymentSummary(sale)}`,
    ...(sale.customerName ? [`Покупатель: ${sale.customerName}`] : []),
  ];
  return lines.join('\n');
}
