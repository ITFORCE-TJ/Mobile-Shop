import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { allocateByShares, decimal, moneyNumber, sumMoney } from '../../utils/money';
import { useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { mapExpense, mapSale, buildNameLookup } from '../../api/mappers';
import { Expense, Sale } from '../../types';
import {
  Smartphone,
  ArrowDownRight,
  Download,
  Store as StoreIcon,
  Warehouse,
  Receipt,
  TrendingUp,
  Wallet,
  PiggyBank,
  ChevronDown,
  Users,
  Sparkles,
  Briefcase,
  Package,
  Banknote
} from 'lucide-react';
import { MonthPicker } from '../ui/MonthPicker';
import { StatCard } from '../ui/StatCard';
import {
  exportComprehensiveReport,
  buildSalesReportTable,
  type ComprehensiveReportSummary,
} from '../../utils/exportReports';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { expenseCategoryLabel } from '../../utils/expenseCategories';
import { ReportPreviewModal } from '../common/ReportPreviewModal';
import { useStoreContext, formatStoreName } from '../../utils/storeContext';

interface ExpenseBreakdown {
  expensesUsd: number;
  expensesTjs: number;
  unpaidExpensesTjs: number;
  expensesByCategory: { category: string; amountUsd: number; amountTjs: number }[];
}

interface StoreBreakdown extends ExpenseBreakdown {
  storeId: string; storeName: string; revenueUsd: number; revenueTjs: number; cogsUsd: number; cogsTjs: number;
  profitUsd: number; profitTjs: number; refundPenaltiesUsd: number; netProfitUsd: number; netProfitTjs: number;
  /** Profit of sold free bonus phones: nobody's income, left out of profitUsd/netProfitUsd. */
  bonusDeviceProfitUsd?: number; bonusDeviceProfitTjs?: number;
  unitsSold: number; salesCount: number; cashUsd: number; cashTjs: number;
  stockCount: number; stockCostUsd: number; stockCostTjs: number;
  topModels: { name: string; count: number; revenueUsd: number; profitUsd: number }[];
}

interface ReportsSummary {
  unitsSold: number;
  salesCount: number;
  /** Refunds processed in the period — already subtracted from revenue/profit below, even
   *  when the refunded sale itself was made in an earlier period. */
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
  /** "Прибыль (с учетом возвратов)" — recognized profit plus retained refund penalties; the
   *  one profit figure the summary card, per-store cards, and netProfitUsd/Tjs all share. */
  profitUsd: number;
  profitTjs: number;
  expensesTjs: number;
  expensesUsd: number;
  periodRefundPenaltiesUsd: number;
  periodRefundPenaltiesTjs: number;
  netProfitUsd: number;
  netProfitTjs: number;
  /** Supplier bonuses are nobody's income: shown for reference, never in profit or owner shares. */
  periodCashBonusesUsd: number;
  periodCashBonusesTjs: number;
  bonusDeviceProfitUsd?: number;
  bonusDeviceProfitTjs?: number;
  giftDeviceUnitsSold?: number;
  giftDeviceProfitUsd?: number;
  giftDeviceProfitTjs?: number;
  periodFreeDeviceBonusesReceived?: number;
  freeDeviceBonusesInStock?: number;
  totalSupplierDebtUsd: number;
  mainWarehouseStockCount: number;
  mainWarehouseStockCostUsd: number;
  mainWarehouseCashUsd: number;
  mainWarehouseCashTjs: number;
  mainWarehouseExpenses: ExpenseBreakdown;
  topSuppliersByDebt: { id: string; name: string; totalPurchasedUsd: number; totalPaidUsd: number; totalDebtUsd: number }[];
  storeBreakdown: StoreBreakdown[];
  modelCounts: { name: string; count: number; revenueUsd: number; cogsUsd: number; profitUsd: number }[];
}

const EMPTY_EXPENSES: ExpenseBreakdown = { expensesUsd: 0, expensesTjs: 0, unpaidExpensesTjs: 0, expensesByCategory: [] };
const EMPTY_SUMMARY: ReportsSummary = {
  unitsSold: 0, salesCount: 0, refundsCount: 0, refundsRevenueUsd: 0, exchangesCount: 0, revenueUsd: 0, revenueTjs: 0, cogsUsd: 0, cogsTjs: 0,
  grossProfitUsd: 0, grossProfitTjs: 0, grossMarginPercent: 0,
  profitUsd: 0, profitTjs: 0, expensesTjs: 0, expensesUsd: 0,
  periodRefundPenaltiesUsd: 0, periodRefundPenaltiesTjs: 0,
  netProfitUsd: 0, netProfitTjs: 0, periodCashBonusesUsd: 0, periodCashBonusesTjs: 0,
  giftDeviceUnitsSold: 0, giftDeviceProfitUsd: 0, giftDeviceProfitTjs: 0,
  periodFreeDeviceBonusesReceived: 0, freeDeviceBonusesInStock: 0,
  totalSupplierDebtUsd: 0,
  mainWarehouseStockCount: 0, mainWarehouseStockCostUsd: 0, mainWarehouseCashUsd: 0, mainWarehouseCashTjs: 0,
  mainWarehouseExpenses: EMPTY_EXPENSES,
  topSuppliersByDebt: [], storeBreakdown: [], modelCounts: [],
};

const usd = (v: number) => `$${(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedUsd = (v: number) => `${v >= 0 ? '+' : '−'}${usd(Math.abs(v))}`;
const tjs = (v: number) => `${(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TJS`;

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

const ExpenseCategoryList: React.FC<{ data: ExpenseBreakdown }> = ({ data }) => (
  data.expensesByCategory.length === 0 ? (
    <p className="text-xs text-fg-subtle">Расходов за период нет</p>
  ) : (
    <div className="rounded-lg border border-border overflow-hidden">
      {data.expensesByCategory.map((c) => (
        <div key={c.category} className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border last:border-0 text-xs">
          <span className="text-fg-muted truncate">{expenseCategoryLabel(c.category)}</span>
          <span className="font-semibold text-danger shrink-0">−{usd(c.amountUsd)} <span className="font-normal text-fg-subtle">({tjs(c.amountTjs)})</span></span>
        </div>
      ))}
    </div>
  )
);

interface ProfitReportProps {
  /** 'summary' — the whole business for the month; 'stores' — every store in detail. */
  view: 'summary' | 'stores';
  month: string;
  onMonthChange: (month: string) => void;
}

/** "Отчёт" / "По складам" tabs of FinancePage — SELLER gating is done by FinancePage itself. */
export const ProfitReport: React.FC<ProfitReportProps> = ({ view, month, onMonthChange }) => {
  const navigate = useNavigate();
  const {
    currentUser,
    stores,
    users,
    todayRate,
    selectedStoreId: globalSelectedStoreId,
    owners,
    storeProfitShares,
    setActivePage,
  } = useAppFields('currentUser', 'stores', 'users', 'todayRate', 'selectedStoreId', 'owners', 'storeProfitShares', 'setActivePage');
  // Admin inside a store sees only that store; Central Cash shows every store.
  const storeCtx = useStoreContext();

  const period = 'SPECIFIC_MONTH';
  // Summary view defaults to whichever store is active on the POS Terminal page (same
  // fallback SalePage uses); the per-store view always needs every store.
  const [selectedStore, setSelectedStore] = useState<string>(() => {
    const retail = stores.filter((s) => !s.isMainWarehouse);
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all' && retail.some((s) => s.id === globalSelectedStoreId)) return globalSelectedStoreId;
    return 'all';
  });

  useEffect(() => {
    const retail = stores.filter((s) => !s.isMainWarehouse);
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all' && retail.some((s) => s.id === globalSelectedStoreId)) {
      setSelectedStore(globalSelectedStoreId);
    } else {
      setSelectedStore('all');
    }
  }, [globalSelectedStoreId, stores]);

  const scopeStoreId = view === 'stores' ? 'all' : selectedStore;
  // Which store's Excel preview is open — 'all' for every store combined, null when closed.
  const [salesReportStoreId, setSalesReportStoreId] = useState<string | null>(null);
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;
  const namesLookup = useMemo(() => buildNameLookup(users), [users]);
  const periodLabel = monthLabel(month);
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse), [stores]);
  const mainWarehouse = useMemo(() => stores.find((s) => s.isMainWarehouse), [stores]);

  const sortedOwners = useMemo(() => {
    return [...owners].sort((a, b) => {
      const roleA = a.userId ? users.find((u) => u.id === a.userId)?.role : undefined;
      const roleB = b.userId ? users.find((u) => u.id === b.userId)?.role : undefined;
      const rank = (r?: string) => (r === 'ADMIN' ? 0 : r === 'PARTNER' ? 1 : 2);
      return rank(roleA) - rank(roleB);
    });
  }, [owners, users]);


  const adminOwner = useMemo(() => {
    return owners.find(o => (!o.storeId && !users.find(u => u.id === o.userId)?.storeId) || users.find(u => u.id === o.userId)?.role === 'ADMIN') || owners[0];
  }, [owners, users]);

  const getOwnerStoreId = useCallback((owner: { storeId?: string | null; userId?: string | null }) => {
    return owner.storeId || (owner.userId ? users.find((u) => u.id === owner.userId)?.storeId : null) || null;
  }, [users]);

  const getStorePartner = useCallback((storeId: string) => {
    return owners.find((o) => {
      const sId = getOwnerStoreId(o);
      const role = o.userId ? users.find((u) => u.id === o.userId)?.role : undefined;
      return sId === storeId && (role === 'PARTNER' || Boolean(sId));
    });
  }, [owners, users, getOwnerStoreId]);

  // Partner shares are stored per store (set by the admin); the admin gets the rest of each
  // store's profit — the same split the server books on every sale.
  const getOwnerShareForStore = useCallback((owner: { id: string }, storeId: string) => {
    const pairs = storeProfitShares.filter((sh) => sh.storeId === storeId);
    if (owner.id === adminOwner?.id) {
      return moneyNumber(decimal(100).minus(sumMoney(pairs.map((sh) => sh.sharePercent))));
    }
    return pairs.find((sh) => sh.ownerId === owner.id)?.sharePercent ?? 0;
  }, [adminOwner, storeProfitShares]);

  // A store's amount split between its owners cent-exact, the same way the server books profit:
  // the parts always add up to the store figure (no cent shown twice).
  const splitStoreAmount = useCallback((storeId: string, amount: number) =>
    allocateByShares(amount, owners.map((o) => ({ id: o.id, percent: getOwnerShareForStore(o, storeId) }))),
  [owners, getOwnerShareForStore]);

  const getOwnerPeriodTotal = useCallback((owner: { id: string; storeId?: string | null; userId?: string | null; profitSharePercent?: number }, data: ReportsSummary) => {
    const isOwnerAdmin = owner.id === adminOwner?.id || (!owner.storeId && users.find(u => u.id === owner.userId)?.role === 'ADMIN');
    let periodUsd = decimal(0);
    let periodTjs = decimal(0);

    const breakdown = selectedStore === 'all' ? data.storeBreakdown : data.storeBreakdown.filter(s => s.storeId === selectedStore);

    for (const store of breakdown) {
      periodUsd = periodUsd.plus(splitStoreAmount(store.storeId, store.netProfitUsd)[owner.id] ?? 0);
      periodTjs = periodTjs.plus(splitStoreAmount(store.storeId, store.netProfitTjs)[owner.id] ?? 0);
    }

    // Central office: only its general expenses. Supplier bonuses are not added to anyone.
    if (selectedStore === 'all' && isOwnerAdmin && data.mainWarehouseExpenses.expensesUsd > 0) {
      periodUsd = periodUsd.minus(data.mainWarehouseExpenses.expensesUsd);
      periodTjs = periodTjs.minus(data.mainWarehouseExpenses.expensesTjs);
    }

    return {
      periodAccruedUsd: moneyNumber(periodUsd),
      periodAccruedTjs: moneyNumber(periodTjs),
    };
  }, [adminOwner, splitStoreAmount, selectedStore]);

  // Period/store filtering happens on the server (/api/reports/summary), so what crosses the
  // network scales with the selected month, not with the business's entire history.
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
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
    setSummaryLoading(true);
    setSummaryError(null);

    const params = new URLSearchParams({ period, month });
    if (scopeStoreId !== 'all') params.set('storeId', scopeStoreId);

    apiClient<ReportsSummary>(`/reports/summary?${params.toString()}`, { signal: controller.signal })
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((error) => { if (!cancelled) { setSummary(null); setSummaryError(error.message || 'Не удалось загрузить отчёт'); } })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });

    return () => { cancelled = true; controller.abort(); };
  }, [month, scopeStoreId, revision]);

  // The itemized sales/expenses list is only needed for the Excel preview, so it's fetched
  // only once that preview is opened, scoped to just the one store being previewed.
  const [reportSales, setReportSales] = useState<Sale[]>([]);
  const [reportExpenses, setReportExpenses] = useState<Expense[]>([]);
  const [reportDataLoading, setReportDataLoading] = useState(false);
  const [reportDataError, setReportDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!salesReportStoreId) return;
    let cancelled = false;
    const controller = new AbortController();
    setReportDataLoading(true);
    setReportDataError(null);

    const params = new URLSearchParams({ period, month });
    if (salesReportStoreId !== 'all') params.set('storeId', salesReportStoreId);
    const query = params.toString();

    Promise.all([
      apiClient<any[]>(`/sales?${query}`, { signal: controller.signal }),
      apiClient<any[]>(`/expenses?${query}`, { signal: controller.signal }),
    ])
      .then(([rawSales, rawExpenses]) => {
        if (cancelled) return;
        setReportSales(rawSales.map((s) => mapSale(s, namesLookup)));
        setReportExpenses(rawExpenses.map((expense) => mapExpense(expense, namesLookup)));
      })
      .catch((error) => {
        if (cancelled) return;
        setReportDataError(error.message || 'Не удалось загрузить строки отчёта');
        setReportSales([]);
        setReportExpenses([]);
      })
      .finally(() => { if (!cancelled) setReportDataLoading(false); });

    return () => { cancelled = true; controller.abort(); };
  }, [salesReportStoreId, month, namesLookup, revision]);

  const data: ReportsSummary = summary ?? EMPTY_SUMMARY;

  const totalCapitalInvested = useMemo(() => owners.reduce((acc, o) => acc + (o.capitalBalanceUsd || 0), 0), [owners]);

  const totalStockCostUsd = useMemo(() => {
    if (selectedStore !== 'all') {
      const current = data.storeBreakdown.find((s) => s.storeId === selectedStore);
      return current?.stockCostUsd ?? 0;
    }
    return (data.mainWarehouseStockCostUsd || 0) + data.storeBreakdown.reduce((sum, s) => sum + (s.stockCostUsd || 0), 0);
  }, [data, selectedStore]);

  const totalStockCount = useMemo(() => {
    if (selectedStore !== 'all') {
      const current = data.storeBreakdown.find((s) => s.storeId === selectedStore);
      return current?.stockCount ?? 0;
    }
    return (data.mainWarehouseStockCount || 0) + data.storeBreakdown.reduce((sum, s) => sum + (s.stockCount || 0), 0);
  }, [data, selectedStore]);

  const totalCashInRegistersUsd = useMemo(() => {
    if (selectedStore !== 'all') {
      const current = data.storeBreakdown.find((s) => s.storeId === selectedStore);
      return current?.cashUsd ?? 0;
    }
    return (data.mainWarehouseCashUsd || 0) + data.storeBreakdown.reduce((sum, s) => sum + (s.cashUsd || 0), 0);
  }, [data, selectedStore]);

  const salesReportTable = useMemo(() => {
    if (!salesReportStoreId || reportDataLoading) return null;
    // Supplier cash bonuses aren't tied to a retail store — only the combined report shows them.
    return buildSalesReportTable(reportSales, rate, salesReportStoreId === 'all' ? data.periodCashBonusesUsd : 0);
  }, [salesReportStoreId, reportSales, reportDataLoading, rate, data.periodCashBonusesUsd]);

  const salesReportStoreName = salesReportStoreId === 'all'
    ? 'Все магазины'
    : formatStoreName(retailStores.find((s) => s.id === salesReportStoreId)?.name || '');

  const downloadFinancialReport = async () => {
    if (!salesReportStoreId || !summary || reportDownloading || reportDataLoading || reportDataError) return;

    let reportSummary: ComprehensiveReportSummary;
    const breakdown = data.storeBreakdown.find((item) => item.storeId === salesReportStoreId);
    if (salesReportStoreId === 'all') {
      reportSummary = {
        periodLabel, storeName: salesReportStoreName, exchangeRate: rate,
        unitsSold: data.unitsSold,
        revenueTjs: data.revenueTjs, revenueUsd: data.revenueUsd,
        cogsTjs: data.cogsTjs, cogsUsd: data.cogsUsd,
        grossProfitTjs: data.grossProfitTjs, grossProfitUsd: data.grossProfitUsd,
        refundPenaltiesTjs: data.periodRefundPenaltiesTjs, refundPenaltiesUsd: data.periodRefundPenaltiesUsd,
        bonusDeviceProfitTjs: data.bonusDeviceProfitTjs ?? 0, bonusDeviceProfitUsd: data.bonusDeviceProfitUsd ?? 0,
        profitTjs: data.profitTjs, profitUsd: data.profitUsd,
        cashBonusesTjs: data.periodCashBonusesTjs, cashBonusesUsd: data.periodCashBonusesUsd,
        expensesTjs: data.expensesTjs, expensesUsd: data.expensesUsd,
        netProfitTjs: data.netProfitTjs, netProfitUsd: data.netProfitUsd,
      };
    } else {
      const expensesTjs = sumMoney(reportExpenses.map((expense) => expense.amountTjs || 0));
      const expensesUsd = sumMoney(reportExpenses.map((expense) => expense.amountUsd ?? moneyNumber((expense.amountTjs || 0) / (expense.exchangeRate || rate))));
      const revenueTjs = breakdown?.revenueTjs ?? 0;
      const revenueUsd = breakdown?.revenueUsd ?? 0;
      const cogsTjs = breakdown?.cogsTjs ?? 0;
      const cogsUsd = breakdown?.cogsUsd ?? 0;
      const grossProfitTjs = revenueTjs - cogsTjs;
      const grossProfitUsd = revenueUsd - cogsUsd;
      const profitTjs = breakdown?.profitTjs ?? grossProfitTjs;
      const profitUsd = breakdown?.profitUsd ?? grossProfitUsd;
      const bonusDeviceProfitTjs = breakdown?.bonusDeviceProfitTjs ?? 0;
      const bonusDeviceProfitUsd = breakdown?.bonusDeviceProfitUsd ?? 0;

      reportSummary = {
        periodLabel, storeName: salesReportStoreName, exchangeRate: rate,
        unitsSold: breakdown?.unitsSold ?? 0,
        revenueTjs, revenueUsd, cogsTjs, cogsUsd, grossProfitTjs, grossProfitUsd,
        // profit = gross − bonus-phone profit + retained penalties
        refundPenaltiesTjs: profitTjs - grossProfitTjs + bonusDeviceProfitTjs,
        refundPenaltiesUsd: profitUsd - grossProfitUsd + bonusDeviceProfitUsd,
        bonusDeviceProfitTjs, bonusDeviceProfitUsd,
        profitTjs, profitUsd,
        cashBonusesTjs: 0, cashBonusesUsd: 0,
        expensesTjs: +expensesTjs.toFixed(2),
        expensesUsd: +expensesUsd.toFixed(2),
        netProfitTjs: +(profitTjs - expensesTjs).toFixed(2),
        netProfitUsd: moneyNumber(decimal(profitUsd).minus(expensesUsd)),
      };
    }

    setReportDownloading(true);
    try {
      await exportComprehensiveReport({ sales: reportSales, expenses: reportExpenses, summary: reportSummary, generatedBy: currentUser?.name });
      setSalesReportStoreId(null);
    } catch (error) {
      console.error('Failed to create financial report', error);
      window.alert('Не удалось сформировать Excel-отчёт. Попробуйте ещё раз.');
    } finally {
      setReportDownloading(false);
    }
  };

  const monthPicker = (
    <MonthPicker
      value={month}
      onChange={onMonthChange}
      className="h-9 px-3 rounded-lg border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none"
    />
  );

  if (summaryError) return <div className="p-4 space-y-3" role="alert">
    {monthPicker}<p>Не удалось загрузить финансовый отчёт. Итоги недоступны.</p>
    <p>{summaryError}</p><button type="button" onClick={() => setRevision(v => v + 1)}>Повторить загрузку</button>
  </div>;
  if (!summary) return <div className="p-4" role="status">{monthPicker}<p>Загрузка финансового отчёта…</p></div>;

  return (
    <div className="flex flex-col">
      {/* Filter bar */}
      <div className="px-3 py-2.5 border-b border-border bg-surface flex flex-wrap items-center gap-2">
        {monthPicker}
        {view === 'summary' && storeCtx.mode === 'CENTRAL' && (
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="h-9 rounded-lg bg-surface-raised border border-border px-2.5 text-xs font-semibold text-fg-muted focus:outline-none focus:border-accent"
          >
            <option value="all">Все магазины</option>
            {retailStores.map((s) => <option key={s.id} value={s.id}>{formatStoreName(s.name)}</option>)}
          </select>
        )}
        {view === 'summary' && (
          <button
            type="button"
            onClick={() => setSalesReportStoreId(selectedStore)}
            className="h-9 ml-auto px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-semibold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
        )}
      </div>

      <div className={`p-3 sm:p-4 space-y-4 transition-opacity ${summaryLoading ? 'opacity-60' : ''}`}>
        {view === 'summary' ? (
          <>
            <div>
              <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wide mb-2 px-0.5">
                Итог за {periodLabel}{selectedStore !== 'all' ? ` — ${formatStoreName(retailStores.find((s) => s.id === selectedStore)?.name ?? '')}` : ''}
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <StatCard label="Выручка" value={usd(data.revenueUsd)} subvalue={`${tjs(data.revenueTjs)} · ${data.salesCount} чеков${data.refundsCount ? ` · ${data.refundsCount} возвр.` : ''}`} icon={Receipt} tone="neutral" />
                <StatCard label="Прибыль с продаж" value={signedUsd(data.profitUsd)} subvalue="с учётом возвратов" icon={TrendingUp} tone={data.profitUsd >= 0 ? 'accent' : 'danger'} />
                <StatCard label="Расходы" value={`−${usd(data.expensesUsd)}`} subvalue={tjs(data.expensesTjs)} icon={Wallet} tone="danger" />
                <StatCard label="Чистая прибыль" value={signedUsd(data.netProfitUsd)} subvalue="после вычета расходов" icon={PiggyBank} tone={data.netProfitUsd >= 0 ? 'accent' : 'danger'} />
              </div>
            </div>

            {/* Capital & Active Assets Snapshot (Stock vs Cash) */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-border shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Капитал учредителей</span>
                  <span className="font-bold text-fg text-sm">{usd(totalCapitalInvested)}</span>
                </div>
              </div>

              <div className="h-6 w-px bg-border hidden sm:block" />

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-info/10 border border-info/20 flex items-center justify-center text-info shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-fg-subtle uppercase font-semibold block">В товаре на складах</span>
                  <span className="font-bold text-info text-sm">
                    {usd(totalStockCostUsd)} <span className="font-normal text-fg-subtle text-xs">({totalStockCount} шт)</span>
                  </span>
                </div>
              </div>

              <div className="h-6 w-px bg-border hidden sm:block" />

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Наличными в кассах</span>
                  <span className="font-bold text-accent text-sm">{usd(totalCashInRegistersUsd)}</span>
                </div>
              </div>
            </div>

            {/* How net profit is built — clearly distinguishing core operations from separate bonus income */}
            <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5 text-sm">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">Как считается чистая прибыль</h4>
                <span className="text-[10px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20">
                  Операционная деятельность
                </span>
              </div>
              <div className="space-y-1.5">
                {[
                  ...(data.refundsCount
                    ? [
                        { label: 'Продажи и обмены', value: usd(data.revenueUsd + data.refundsRevenueUsd) },
                        { label: `Возвраты за период (${data.refundsCount})`, value: `−${usd(data.refundsRevenueUsd)}` },
                      ]
                    : [{ label: 'Выручка', value: usd(data.revenueUsd) }]),
                  { label: 'Себестоимость проданного', value: `−${usd(data.cogsUsd)}` },
                  ...(data.bonusDeviceProfitUsd ? [{ label: 'Прибыль бонусных телефонов (не доход)', value: `−${usd(data.bonusDeviceProfitUsd)}` }] : []),
                  ...(data.periodRefundPenaltiesUsd ? [{ label: 'Удержано при возвратах', value: `+${usd(data.periodRefundPenaltiesUsd)}` }] : []),
                  { label: 'Расходы (включая зарплату)', value: `−${usd(data.expensesUsd)}` },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-fg-muted">
                    <span>{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-border font-bold">
                <span>Чистая прибыль</span>
                <span className={data.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}>
                  {signedUsd(data.netProfitUsd)}
                </span>
              </div>

              {/* Supplier bonuses: for reference only — not income, not in profit, not credited anywhere */}
              <div className="pt-2 border-t border-dashed border-border/80 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-info flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Бонусы поставщиков — справочно</span>
                  </span>
                  <span className="text-[10px] text-fg-subtle">не входят в прибыль</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-fg-subtle">
                  <span>Денежные бонусы</span>
                  <span className="font-medium text-fg-muted">{usd(data.periodCashBonusesUsd || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-fg-subtle">
                  <span>Прибыль бонусных телефонов</span>
                  <span className="font-medium text-fg-muted">{usd(data.bonusDeviceProfitUsd || 0)}</span>
                </div>
              </div>
            </div>

            {/* Distribution to partners per store & balance */}
            {owners.length > 0 && (
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3 text-sm">
                <div className="flex items-center justify-between pb-1.5 border-b border-border">
                  <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-accent" />
                    <span>Партнёры: начисления по магазинам и остаток</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('OWNERS');
                      navigate('/owners');
                    }}
                    className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Партнеры и капитал →
                  </button>
                </div>

                {/* Overall summary cards for Admin and Partner */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {sortedOwners.map((owner) => {
                    const isOwnerAdmin = owner.id === adminOwner?.id || (!owner.storeId && users.find(u => u.id === owner.userId)?.role === 'ADMIN');
                    const ownerStoreId = getOwnerStoreId(owner);
                    const attachedStore = ownerStoreId ? stores.find(s => s.id === ownerStoreId) : undefined;
                    // Shares are per store: list each store this owner shares in.
                    const ownerStoreShares = storeProfitShares
                      .filter((sh) => sh.ownerId === owner.id)
                      .map((sh) => `${formatStoreName(stores.find((st) => st.id === sh.storeId)?.name ?? 'Магазин')} ${sh.sharePercent}%`)
                      .join(', ');
                    const { periodAccruedUsd, periodAccruedTjs } = getOwnerPeriodTotal(owner, data);
                    return (
                      <div key={owner.id} className="p-3 rounded-xl bg-surface-raised border border-border flex flex-col justify-between gap-2.5 shadow-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold shrink-0">
                                {owner.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs sm:text-sm font-bold text-fg">{owner.name}</span>
                              {attachedStore && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border text-fg-subtle font-semibold shrink-0">
                                  {formatStoreName(attachedStore.name)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-fg-subtle mt-1">
                              {isOwnerAdmin ? (
                                <>Остаток прибыли каждого магазина после долей партнёров</>
                              ) : ownerStoreShares ? (
                                <>Доля: <strong className="text-fg-muted">{ownerStoreShares}</strong></>
                              ) : (
                                <span className="text-warning font-semibold">Доля в магазинах не задана (0%)</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] text-fg-subtle uppercase">Остаток к выплате</p>
                            <p className="text-sm font-bold text-warning">${(owner.availableProfitUsd || 0).toLocaleString()} USD</p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                          <span className="text-fg-subtle">Начислено за {periodLabel}:</span>
                          <span className={`font-bold ${periodAccruedUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                            {signedUsd(periodAccruedUsd)} <span className="font-normal text-fg-subtle text-[11px]">({tjs(periodAccruedTjs)})</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Per-store breakdown table */}
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                    Начисления по магазинам ({selectedStore === 'all' ? 'все магазины' : formatStoreName(retailStores.find(s => s.id === selectedStore)?.name || 'выбранный магазин')}):
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border bg-surface-raised text-[10px] text-fg-subtle uppercase">
                          <th className="py-2 px-3">Магазин / Точка</th>
                          <th className="py-2 px-3 text-right">Чистая прибыль</th>
                          {sortedOwners.map((owner) => {
                            const isOwnerAdmin = owner.id === adminOwner?.id || (!owner.storeId && users.find(u => u.id === owner.userId)?.role === 'ADMIN');
                            const ownerStoreId = getOwnerStoreId(owner);
                            const attachedStore = ownerStoreId ? stores.find(s => s.id === ownerStoreId) : undefined;
                            return (
                              <th key={owner.id} className="py-2 px-3 text-right">
                                {owner.name} {attachedStore ? `(${formatStoreName(attachedStore.name)})` : isOwnerAdmin ? '(Все магазины)' : ''}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(selectedStore === 'all' ? data.storeBreakdown : data.storeBreakdown.filter(s => s.storeId === selectedStore)).map((store) => (
                          <tr key={store.storeId} className="hover:bg-surface-raised/50">
                            <td className="py-2.5 px-3 font-semibold text-fg-muted flex items-center gap-1.5">
                              <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                              <span>{formatStoreName(store.storeName)}</span>
                            </td>
                            <td className={`py-2.5 px-3 text-right font-bold ${store.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                              {signedUsd(store.netProfitUsd)}
                            </td>
                            {sortedOwners.map((owner) => {
                              const share = getOwnerShareForStore(owner, store.storeId);
                              const ownerProfit = share > 0 ? splitStoreAmount(store.storeId, store.netProfitUsd)[owner.id] ?? 0 : 0;
                              return (
                                <td key={owner.id} className={`py-2.5 px-3 text-right font-bold ${share === 0 ? 'text-fg-subtle/40 font-normal' : ownerProfit >= 0 ? 'text-fg-muted' : 'text-danger'}`}>
                                  {share > 0 ? signedUsd(ownerProfit) : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}

                        {/* Central office general expenses row if viewing all stores (bonuses are not anyone's) */}
                        {selectedStore === 'all' && data.mainWarehouseExpenses.expensesUsd > 0 && (() => {
                          const centralNetUsd = -data.mainWarehouseExpenses.expensesUsd;
                          return (
                            <tr className="hover:bg-surface-raised/50 bg-surface-raised/20">
                              <td className="py-2.5 px-3 text-fg-subtle flex items-center gap-1.5">
                                <Warehouse className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
                                <span>Центральный офис (общие расходы)</span>
                              </td>
                              <td className={`py-2.5 px-3 text-right font-semibold ${centralNetUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                                {signedUsd(centralNetUsd)}
                              </td>
                              {sortedOwners.map((owner) => {
                                const isOwnerAdmin = owner.id === adminOwner?.id || (!owner.storeId && users.find(u => u.id === owner.userId)?.role === 'ADMIN');
                                const ownerCentral = isOwnerAdmin ? centralNetUsd : 0;
                                return (
                                  <td key={owner.id} className={`py-2.5 px-3 text-right font-semibold ${!isOwnerAdmin ? 'text-fg-subtle/40 font-normal' : ownerCentral >= 0 ? 'text-fg-muted' : 'text-danger'}`}>
                                    {isOwnerAdmin ? signedUsd(ownerCentral) : '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })()}

                        {/* Total Row */}
                        <tr className="border-t-2 border-border bg-surface-raised font-bold text-fg-muted">
                          <td className="py-2.5 px-3 uppercase text-[11px]">ИТОГО НАЧИСЛЕНО:</td>
                          <td className={`py-2.5 px-3 text-right ${data.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                            {signedUsd(data.netProfitUsd)}
                          </td>
                          {sortedOwners.map((owner) => {
                            const { periodAccruedUsd } = getOwnerPeriodTotal(owner, data);
                            return (
                              <td key={owner.id} className={`py-2.5 px-3 text-right ${periodAccruedUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                                {signedUsd(periodAccruedUsd)}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {data.topSuppliersByDebt.length > 0 && (
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
                <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5 text-danger" />
                  <span>Долг поставщикам: {usd(data.totalSupplierDebtUsd)}</span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] text-fg-subtle uppercase">
                        <th className="py-2 px-3">Поставщик</th>
                        <th className="py-2 px-3 text-right">Закуплено</th>
                        <th className="py-2 px-3 text-right">Оплачено</th>
                        <th className="py-2 px-3 text-right">Долг</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.topSuppliersByDebt.map((s) => (
                        <tr key={s.id}>
                          <td className="py-2 px-3 font-bold text-fg-muted">{s.name}</td>
                          <td className="py-2 px-3 text-right text-fg-subtle">{usd(s.totalPurchasedUsd)}</td>
                          <td className="py-2 px-3 text-right text-fg-muted">{usd(s.totalPaidUsd)}</td>
                          <td className="py-2 px-3 text-right font-bold text-danger">{usd(s.totalDebtUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.modelCounts.length > 0 && (
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
                <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-accent" />
                  <span>Самые прибыльные модели</span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] text-fg-subtle uppercase">
                        <th className="py-2 px-3">Модель</th>
                        <th className="py-2 px-3 text-center">Шт</th>
                        <th className="py-2 px-3 text-right">Выручка</th>
                        <th className="py-2 px-3 text-right">Себестоимость</th>
                        <th className="py-2 px-3 text-right">Прибыль</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.modelCounts.slice(0, 10).map((m) => (
                        <tr key={m.name}>
                          <td className="py-2 px-3 font-bold text-fg-muted">{m.name}</td>
                          <td className="py-2 px-3 text-center text-fg-muted font-bold">{m.count}</td>
                          <td className="py-2 px-3 text-right text-fg-muted">{usd(m.revenueUsd)}</td>
                          <td className="py-2 px-3 text-right text-fg-subtle">{usd(m.cogsUsd)}</td>
                          <td className={`py-2 px-3 text-right font-bold ${m.profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(m.profitUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-border shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-accent shrink-0" />
                <span className="text-fg-subtle">Общий капитал: <strong className="text-fg font-bold">{usd(totalCapitalInvested)}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-info shrink-0" />
                <span className="text-fg-subtle">В товаре на складах: <strong className="text-info font-bold">{usd(totalStockCostUsd)}</strong> ({totalStockCount} шт)</span>
              </div>
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-accent shrink-0" />
                <span className="text-fg-subtle">Наличными в кассах: <strong className="text-accent font-bold">{usd(totalCashInRegistersUsd)}</strong></span>
              </div>
            </div>

            <p className="text-xs text-fg-subtle px-0.5">Отчёт за {periodLabel}. Нажмите на магазин, чтобы увидеть расходы по статьям и лучшие модели.</p>

            {data.storeBreakdown.map((store) => {
              const expanded = expandedStoreId === store.storeId;
              return (
                <div key={store.storeId} className="rounded-xl bg-surface border border-border overflow-hidden transition-all duration-200 hover:border-accent/40 shadow-xs">
                  <div
                    onClick={() => setExpandedStoreId(expanded ? null : store.storeId)}
                    className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-surface-raised/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 text-accent shrink-0">
                        <StoreIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-xs sm:text-sm text-fg truncate">{formatStoreName(store.storeName)}</h4>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-raised border border-border text-fg-subtle font-semibold shrink-0">
                            {store.salesCount} чеков
                          </span>
                        </div>
                        <p className="text-[11px] text-fg-subtle truncate">
                          Выручка: {usd(store.revenueUsd)} · Касса: {usd(store.cashUsd)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <span className={`text-xs sm:text-sm font-bold block ${store.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                          {signedUsd(store.netProfitUsd)}
                        </span>
                        <span className="text-[10px] text-fg-subtle block">
                          {tjs(store.netProfitTjs)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedStoreId(expanded ? null : store.storeId);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-accent/15 hover:text-accent border border-border hover:border-accent/30 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span className="hidden sm:inline">{expanded ? 'Свернуть' : 'Детали'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="px-3.5 pb-3.5 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                      <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Выручка</p>
                      <p className="text-xs sm:text-sm font-bold text-fg mt-0.5">{usd(store.revenueUsd)}</p>
                      <p className="text-[10px] text-fg-subtle">{tjs(store.revenueTjs)}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                      <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Себестоимость</p>
                      <p className="text-xs sm:text-sm font-bold text-fg mt-0.5">{usd(store.cogsUsd)}</p>
                      <p className="text-[10px] text-fg-subtle">{store.unitsSold} шт продано</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                      <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Прибыль с продаж</p>
                      <p className={`text-xs sm:text-sm font-bold mt-0.5 ${store.profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(store.profitUsd)}</p>
                      <p className="text-[10px] text-fg-subtle">до вычета расходов</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                      <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Расходы точки</p>
                      <p className="text-xs sm:text-sm font-bold text-danger mt-0.5">−{usd(store.expensesUsd)}</p>
                      <p className="text-[10px] text-fg-subtle">
                        {store.unpaidExpensesTjs > 0 ? `не оплачено ${tjs(store.unpaidExpensesTjs)}` : tjs(store.expensesTjs)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                      <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Чистая прибыль</p>
                      <p className={`text-xs sm:text-sm font-bold mt-0.5 ${store.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(store.netProfitUsd)}</p>
                      <p className="text-[10px] text-fg-subtle">{tjs(store.netProfitTjs)}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                      <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Касса сейчас</p>
                      <p className="text-xs sm:text-sm font-bold text-fg mt-0.5">{usd(store.cashUsd)}</p>
                      <p className="text-[10px] text-fg-subtle">{tjs(store.cashTjs)}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                      <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Товар на складе</p>
                      <p className="text-xs sm:text-sm font-bold text-fg mt-0.5">{store.stockCount} шт</p>
                      <p className="text-[10px] text-fg-subtle">{usd(store.stockCostUsd)}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                      <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Удержано возвратов</p>
                      <p className="text-xs sm:text-sm font-bold text-fg mt-0.5">
                        {store.refundPenaltiesUsd > 0 ? `+${usd(store.refundPenaltiesUsd)}` : '$0.00'}
                      </p>
                      <p className="text-[10px] text-fg-subtle">штрафы / комиссии</p>
                    </div>
                  </div>

                  {/* Partner / Admin profit allocation for this store */}
                  {(() => {
                    const storePartner = getStorePartner(store.storeId);
                    const storeOwners = storePartner && storePartner.id !== adminOwner?.id
                      ? [adminOwner, storePartner].filter(Boolean)
                      : [adminOwner].filter(Boolean);

                    if (storeOwners.length === 0) return null;

                    return (
                      <div className="px-3.5 pb-3.5 pt-2.5 border-t border-border">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-accent" />
                            <span>Распределение чистой прибыли:</span>
                          </span>
                          {!storePartner && (
                            <span className="text-[10px] text-fg-subtle italic">
                              100% администратору
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {storeOwners.map((owner) => {
                            const share = getOwnerShareForStore(owner, store.storeId);
                            const ownerStoreNet = share > 0 ? splitStoreAmount(store.storeId, store.netProfitUsd)[owner.id] ?? 0 : 0;
                            const ownerStoreNetTjs = share > 0 ? splitStoreAmount(store.storeId, store.netProfitTjs)[owner.id] ?? 0 : 0;
                            return (
                              <div key={owner.id} className="p-2.5 rounded-xl bg-surface-raised/60 border border-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold shrink-0">
                                    {owner.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-semibold text-xs text-fg truncate">{owner.name}</span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border text-fg-subtle font-semibold shrink-0">
                                    {share}%
                                  </span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`font-bold text-xs block ${ownerStoreNet >= 0 ? 'text-accent' : 'text-danger'}`}>
                                    {signedUsd(ownerStoreNet)}
                                  </span>
                                  <span className="text-[10px] text-fg-subtle block">{tjs(ownerStoreNetTjs)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {expanded && (
                    <div className="animate-in fade-in-50 duration-200 px-3.5 pb-3.5 pt-3 border-t border-border grid sm:grid-cols-2 gap-4">
                      <div>
                        <h5 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2">Расходы по статьям</h5>
                        <ExpenseCategoryList data={store} />
                      </div>
                      <div>
                        <h5 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2">Что продавали больше всего</h5>
                        {store.topModels.length === 0 ? (
                          <p className="text-xs text-fg-subtle">Продаж за период нет</p>
                        ) : (
                          <div className="rounded-lg border border-border overflow-hidden">
                            {store.topModels.map((m) => (
                              <div key={m.name} className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border last:border-0 text-xs">
                                <span className="text-fg-muted truncate">{m.name} <span className="text-fg-subtle">× {m.count}</span></span>
                                <span className={`font-semibold shrink-0 ${m.profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(m.profitUsd)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {mainWarehouse && (
              <div className="rounded-xl bg-surface border border-border overflow-hidden shadow-xs">
                <div
                  onClick={() => setExpandedStoreId(expandedStoreId === 'MAIN' ? null : 'MAIN')}
                  className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-surface-raised/60 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500 shrink-0">
                      <Warehouse className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs sm:text-sm text-fg truncate">{formatStoreName(mainWarehouse.name)}</h4>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-500 font-semibold shrink-0">
                          ГЛАВНЫЙ СКЛАД
                        </span>
                      </div>
                      <p className="text-[11px] text-fg-subtle truncate">
                        Товар на складе: {data.mainWarehouseStockCount} шт ({usd(data.mainWarehouseStockCostUsd)})
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedStoreId(expandedStoreId === 'MAIN' ? null : 'MAIN');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-amber-500/15 hover:text-amber-500 border border-border hover:border-amber-500/30 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <span className="hidden sm:inline">{expandedStoreId === 'MAIN' ? 'Свернуть' : 'Детали'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedStoreId === 'MAIN' ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                <div className="px-3.5 pb-3.5 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                    <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Товар на складе</p>
                    <p className="text-xs sm:text-sm font-bold text-fg mt-0.5">{data.mainWarehouseStockCount} шт</p>
                    <p className="text-[10px] text-fg-subtle">{usd(data.mainWarehouseStockCostUsd)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                    <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Касса сейчас</p>
                    <p className="text-xs sm:text-sm font-bold text-fg mt-0.5">{usd(data.mainWarehouseCashUsd)}</p>
                    <p className="text-[10px] text-fg-subtle">{tjs(data.mainWarehouseCashTjs)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                    <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Общие расходы</p>
                    <p className="text-xs sm:text-sm font-bold text-danger mt-0.5">−{usd(data.mainWarehouseExpenses.expensesUsd)}</p>
                    <p className="text-[10px] text-fg-subtle">
                      {data.mainWarehouseExpenses.unpaidExpensesTjs > 0
                        ? `не оплачено ${tjs(data.mainWarehouseExpenses.unpaidExpensesTjs)}`
                        : 'не привязаны к магазину'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-raised/40 border border-border/80">
                    <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">Долг поставщикам</p>
                    <p className={`text-xs sm:text-sm font-bold mt-0.5 ${data.totalSupplierDebtUsd > 0 ? 'text-danger' : 'text-fg'}`}>
                      {usd(data.totalSupplierDebtUsd)}
                    </p>
                    <p className="text-[10px] text-fg-subtle">
                      {data.totalSupplierDebtUsd > 0 ? 'требует погашения' : 'задолженностей нет'}
                    </p>
                  </div>
                </div>

                {expandedStoreId === 'MAIN' && (
                  <div className="px-3.5 pb-3.5 pt-3 border-t border-border animate-in fade-in-50 duration-200">
                    <h5 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2">Общие расходы по статьям</h5>
                    <ExpenseCategoryList data={data.mainWarehouseExpenses} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ReportPreviewModal
        open={salesReportStoreId !== null}
        onClose={() => setSalesReportStoreId(null)}
        title={`Финансовый отчёт — ${salesReportStoreName}`}
        subtitle={reportDataError || `${periodLabel} • Excel: продажи, расходы и итого`}
        table={salesReportTable}
        loading={reportDataLoading}
        onDownload={() => void downloadFinancialReport()}
        downloadLabel="Скачать Excel"
        downloading={reportDownloading}
        canDownload={!!summary && !reportDataLoading && !reportDataError}
      />
    </div>
  );
};
