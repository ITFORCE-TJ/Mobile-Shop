import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';

export interface ExpenseBreakdown {
  expensesUsd: number;
  expensesTjs: number;
  unpaidExpensesTjs: number;
  expensesByCategory: { category: string; amountUsd: number; amountTjs: number }[];
}

export interface DailyPoint { date: string; salesCount: number; revenueUsd: number; profitUsd: number }
export interface SellerStat { sellerId: string; sellerName: string; salesCount: number; unitsSold: number; revenueUsd: number; profitUsd: number }

export interface StoreBreakdown extends ExpenseBreakdown {
  storeId: string; storeName: string; revenueUsd: number; revenueTjs: number; cogsUsd: number; cogsTjs: number;
  profitUsd: number; profitTjs: number; refundPenaltiesUsd: number; netProfitUsd: number; netProfitTjs: number;
  unitsSold: number; salesCount: number; refundsCount: number; cashTjs: number;
  stockCount: number; stockCostUsd: number; stockCostTjs: number;
  grossMarginPercent: number; avgCheckUsd: number; avgCheckTjs: number;
  cashCollectedTjs: number; cashCollectionsCount: number;
  sellers: SellerStat[];
  daily: DailyPoint[];
  topModels: { name: string; count: number; revenueUsd: number; profitUsd: number }[];
}

export interface ReportsSummary {
  unitsSold: number;
  salesCount: number;
  refundsCount: number;
  refundsRevenueUsd: number;
  exchangesCount: number;
  revenueUsd: number;
  revenueTjs: number;
  cogsUsd: number;
  cogsTjs: number;
  grossProfitUsd: number;
  grossProfitTjs: number;
  grossMarginPercent: number;
  profitUsd: number;
  profitTjs: number;
  expensesTjs: number;
  expensesUsd: number;
  periodRefundPenaltiesUsd: number;
  periodRefundPenaltiesTjs: number;
  netProfitUsd: number;
  netProfitTjs: number;
  avgCheckUsd: number;
  avgCheckTjs: number;
  sellers: SellerStat[];
  daily: DailyPoint[];
  storeBreakdown: StoreBreakdown[];
  modelCounts: { name: string; count: number; revenueUsd: number; cogsUsd: number; profitUsd: number }[];
  periodCashBonusesUsd: number;
  periodCashBonusesTjs: number;
  giftDeviceUnitsSold: number;
  giftDeviceProfitUsd: number;
  giftDeviceProfitTjs: number;
  periodFreeDeviceBonusesReceived: number;
  freeDeviceBonusesInStock: number;
  totalSupplierDebtUsd: number;
  mainWarehouseStockCount: number;
  mainWarehouseStockCostUsd: number;
  mainWarehouseCashUsd: number;
  mainWarehouseCashTjs: number;
  mainWarehouseExpenses: ExpenseBreakdown;
  topSuppliersByDebt: { id: string; name: string; totalPurchasedUsd: number; totalPaidUsd: number; totalDebtUsd: number }[];
}

export const EMPTY_EXPENSES: ExpenseBreakdown = { expensesUsd: 0, expensesTjs: 0, unpaidExpensesTjs: 0, expensesByCategory: [] };
export const EMPTY_SUMMARY: ReportsSummary = {
  unitsSold: 0, salesCount: 0, refundsCount: 0, refundsRevenueUsd: 0, exchangesCount: 0, revenueUsd: 0, revenueTjs: 0, cogsUsd: 0, cogsTjs: 0,
  grossProfitUsd: 0, grossProfitTjs: 0, grossMarginPercent: 0,
  profitUsd: 0, profitTjs: 0, expensesTjs: 0, expensesUsd: 0,
  periodRefundPenaltiesUsd: 0, periodRefundPenaltiesTjs: 0,
  netProfitUsd: 0, netProfitTjs: 0, avgCheckUsd: 0, avgCheckTjs: 0, sellers: [], daily: [],
  periodCashBonusesUsd: 0, periodCashBonusesTjs: 0,
  giftDeviceUnitsSold: 0, giftDeviceProfitUsd: 0, giftDeviceProfitTjs: 0,
  periodFreeDeviceBonusesReceived: 0, freeDeviceBonusesInStock: 0,
  totalSupplierDebtUsd: 0,
  mainWarehouseStockCount: 0, mainWarehouseStockCostUsd: 0, mainWarehouseCashUsd: 0, mainWarehouseCashTjs: 0,
  mainWarehouseExpenses: EMPTY_EXPENSES,
  topSuppliersByDebt: [], storeBreakdown: [], modelCounts: [],
};

/** Fills in fields a store manager's (stripped) report doesn't carry. */
export function withSummaryDefaults(data: Partial<ReportsSummary>): ReportsSummary {
  return { ...EMPTY_SUMMARY, ...data, mainWarehouseExpenses: data.mainWarehouseExpenses ?? EMPTY_EXPENSES };
}

export const usd = (v: number) => `$${(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const signedUsd = (v: number) => `${v >= 0 ? '+' : '−'}${usd(Math.abs(v))}`;
export const tjs = (v: number) => `${(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TJS`;
export const pct = (v: number) => `${(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function useReportsSummary(month: string, storeId: string) {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => setRevision(v => v + 1), 150); };
    window.addEventListener('business-data-changed', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('business-data-changed', refresh); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ period: 'SPECIFIC_MONTH', month });
    if (storeId !== 'all') params.set('storeId', storeId);
    apiClient<Partial<ReportsSummary>>(`/reports/summary?${params.toString()}`, { signal: controller.signal })
      .then((data) => { if (!cancelled) setSummary(withSummaryDefaults(data)); })
      .catch((err) => { if (!cancelled) { setSummary(null); setError(err.message || 'Не удалось загрузить отчёт'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [month, storeId, revision]);

  return { summary, loading, error, reload: () => setRevision(v => v + 1) };
}
