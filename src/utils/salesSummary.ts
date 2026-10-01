import type { Sale } from '../types';
import { moneyNumber, sumMoney } from './money';

export interface SalesSummary {
  receipts: number;
  totalTjs: number;
  cashTjs: number;
  cardTjs: number;
  refunded: number;
}

/**
 * Shift totals for the receipts on screen: refunded receipts are counted separately and left
 * out of the money, since their payment went back to the customer.
 */
export function summarizeSales(sales: Pick<Sale, 'status' | 'totalTjs' | 'cashAmountTjs' | 'cardAmountTjs'>[]): SalesSummary {
  const kept = sales.filter((s) => s.status !== 'REFUNDED');
  return {
    receipts: kept.length,
    totalTjs: moneyNumber(sumMoney(kept.map((s) => s.totalTjs || 0))),
    cashTjs: moneyNumber(sumMoney(kept.map((s) => s.cashAmountTjs || 0))),
    cardTjs: moneyNumber(sumMoney(kept.map((s) => s.cardAmountTjs || 0))),
    refunded: sales.length - kept.length,
  };
}
