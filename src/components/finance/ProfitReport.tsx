import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { MonthPicker } from '../ui/MonthPicker';
import { StatCard } from '../ui/StatCard';
import { Badge } from '../ui/Badge';
import {
  exportComprehensiveReport,
  buildSalesReportTable,
  type ComprehensiveReportSummary,
} from '../../utils/exportReports';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { expenseCategoryLabel } from '../../utils/expenseCategories';
import { ReportPreviewModal } from '../common/ReportPreviewModal';
import { type ExpenseBreakdown, EMPTY_SUMMARY, type ReportsSummary, monthLabel, signedUsd, tjs, usd, useReportsSummary } from './reportTypes';

export const Metric: React.FC<{ label: string; value: string; sub?: string; tone?: 'default' | 'success' | 'danger' | 'accent' }> = ({ label, value, sub, tone = 'default' }) => (
  <div className="min-w-0">
    <p className="text-[10px] text-fg-subtle uppercase tracking-wide truncate">{label}</p>
    <p className={`text-sm font-bold truncate ${tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-fg-muted'}`}>{value}</p>
    {sub && <p className="text-[11px] text-fg-subtle truncate">{sub}</p>}
  </div>
);

export const ExpenseCategoryList: React.FC<{ data: ExpenseBreakdown }> = ({ data }) => (
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
    setActivePage,
  } = useAppFields('currentUser', 'stores', 'users', 'todayRate', 'selectedStoreId', 'owners', 'setActivePage');

  const period = 'SPECIFIC_MONTH';
  // Summary view defaults to whichever store is active on the POS Terminal page (same
  // fallback SalePage uses); the per-store view always needs every store.
  const [selectedStore, setSelectedStore] = useState<string>(() => {
    const retail = stores.filter((s) => !s.isMainWarehouse);
    if (retail.some((s) => s.id === globalSelectedStoreId)) return globalSelectedStoreId;
    return 'all';
  });
  // Follow the global store switcher in the TopBar ('all' = consolidated network).
  useEffect(() => {
    setSelectedStore(stores.some((s) => !s.isMainWarehouse && s.id === globalSelectedStoreId) ? globalSelectedStoreId : 'all');
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

  // Period/store filtering happens on the server (/api/reports/summary), so what crosses the
  // network scales with the selected month, not with the business's entire history.
  const { summary, loading: summaryLoading, error: summaryError, reload } = useReportsSummary(month, scopeStoreId);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(v => v + 1);
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, []);

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

  const salesReportTable = useMemo(() => {
    if (!salesReportStoreId || reportDataLoading) return null;
    // Supplier cash bonuses aren't tied to a retail store — only the combined report shows them.
    return buildSalesReportTable(reportSales, rate, salesReportStoreId === 'all' ? data.periodCashBonusesUsd : 0);
  }, [salesReportStoreId, reportSales, reportDataLoading, rate, data.periodCashBonusesUsd]);

  const salesReportStoreName = salesReportStoreId === 'all'
    ? 'Все магазины'
    : (retailStores.find((s) => s.id === salesReportStoreId)?.name || '');

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
        profitTjs: data.profitTjs, profitUsd: data.profitUsd,
        cashBonusesTjs: data.periodCashBonusesTjs, cashBonusesUsd: data.periodCashBonusesUsd,
        expensesTjs: data.expensesTjs, expensesUsd: data.expensesUsd,
        netProfitTjs: data.netProfitTjs, netProfitUsd: data.netProfitUsd,
      };
    } else {
      const expensesTjs = reportExpenses.reduce((total, expense) => total + (expense.amountTjs || 0), 0);
      const expensesUsd = reportExpenses.reduce(
        (total, expense) => total + (expense.amountUsd ?? ((expense.amountTjs || 0) / (expense.exchangeRate || rate))),
        0,
      );
      const revenueTjs = breakdown?.revenueTjs ?? 0;
      const revenueUsd = breakdown?.revenueUsd ?? 0;
      const cogsTjs = breakdown?.cogsTjs ?? 0;
      const cogsUsd = breakdown?.cogsUsd ?? 0;
      const grossProfitTjs = revenueTjs - cogsTjs;
      const grossProfitUsd = revenueUsd - cogsUsd;
      const profitTjs = breakdown?.profitTjs ?? grossProfitTjs;
      const profitUsd = breakdown?.profitUsd ?? grossProfitUsd;

      reportSummary = {
        periodLabel, storeName: salesReportStoreName, exchangeRate: rate,
        unitsSold: breakdown?.unitsSold ?? 0,
        revenueTjs, revenueUsd, cogsTjs, cogsUsd, grossProfitTjs, grossProfitUsd,
        refundPenaltiesTjs: profitTjs - grossProfitTjs,
        refundPenaltiesUsd: profitUsd - grossProfitUsd,
        profitTjs, profitUsd,
        cashBonusesTjs: 0, cashBonusesUsd: 0,
        expensesTjs: +expensesTjs.toFixed(2),
        expensesUsd: +expensesUsd.toFixed(2),
        netProfitTjs: +(profitTjs - expensesTjs).toFixed(2),
        netProfitUsd: +(profitUsd - expensesUsd).toFixed(2),
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
    <p>{summaryError}</p><button type="button" onClick={reload}>Повторить загрузку</button>
  </div>;
  if (!summary) return <div className="p-4" role="status">{monthPicker}<p>Загрузка финансового отчёта…</p></div>;

  return (
    <div className="flex flex-col">
      {/* Filter bar */}
      <div className="px-3 py-2.5 border-b border-border bg-surface flex flex-wrap items-center gap-2">
        {monthPicker}
        {view === 'summary' && (
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="h-9 rounded-lg bg-surface-raised border border-border px-2.5 text-xs font-semibold text-fg-muted focus:outline-none focus:border-accent"
          >
            <option value="all">Все магазины</option>
            {retailStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                Итог за {periodLabel}{selectedStore !== 'all' ? ` — ${retailStores.find((s) => s.id === selectedStore)?.name ?? ''}` : ''}
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <StatCard label="Выручка" value={usd(data.revenueUsd)} subvalue={`${tjs(data.revenueTjs)} · ${data.salesCount} чеков${data.refundsCount ? ` · ${data.refundsCount} возвр.` : ''}`} icon={Receipt} tone="neutral" />
                <StatCard label="Прибыль с продаж" value={signedUsd(data.profitUsd)} subvalue="с учётом возвратов" icon={TrendingUp} tone={data.profitUsd >= 0 ? 'accent' : 'danger'} />
                <StatCard label="Расходы" value={`−${usd(data.expensesUsd)}`} subvalue={tjs(data.expensesTjs)} icon={Wallet} tone="danger" />
                <StatCard label="Чистая прибыль" value={signedUsd(data.netProfitUsd)} subvalue="после вычета расходов" icon={PiggyBank} tone={data.netProfitUsd >= 0 ? 'accent' : 'danger'} />
              </div>
            </div>

            {/* How net profit is built — the same numbers as the cards, laid out as a sum. */}
            <div className="p-3.5 rounded-xl bg-surface border border-border space-y-1.5 text-sm">
              <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-1">Как считается чистая прибыль</h4>
              {[
                ...(data.refundsCount
                  ? [
                      { label: 'Продажи и обмены', value: usd(data.revenueUsd + data.refundsRevenueUsd) },
                      { label: `Возвраты за период (${data.refundsCount})`, value: `−${usd(data.refundsRevenueUsd)}` },
                    ]
                  : [{ label: 'Выручка', value: usd(data.revenueUsd) }]),
                { label: 'Себестоимость проданного', value: `−${usd(data.cogsUsd)}` },
                ...(data.periodRefundPenaltiesUsd ? [{ label: 'Удержано при возвратах', value: `+${usd(data.periodRefundPenaltiesUsd)}` }] : []),
                ...(data.periodCashBonusesUsd ? [{ label: 'Бонусы поставщиков', value: `+${usd(data.periodCashBonusesUsd)}` }] : []),
                { label: 'Расходы', value: `−${usd(data.expensesUsd)}` },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-fg-muted">
                  <span>{row.label}</span>
                  <span className="font-semibold">{row.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border font-bold">
                <span>Чистая прибыль</span>
                <span className={data.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}>{signedUsd(data.netProfitUsd)}</span>
              </div>
            </div>

            {/* Distribution to partners */}
            {owners.length > 0 && (
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5 text-sm">
                <div className="flex items-center justify-between pb-1.5 border-b border-border">
                  <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-accent" />
                    <span>Партнёры: начисленный остаток</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                  {owners.map((owner) => {
                    return (
                      <div key={owner.id} className="p-2.5 rounded-lg bg-surface-raised border border-border flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-fg-muted truncate">{owner.name}</p>
                          <p className="text-[11px] text-fg-subtle truncate">
                            Начисления по операциям
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-fg-subtle uppercase">К выплате всего</p>
                          <p className="text-xs font-bold text-warning">${(owner.availableProfitUsd || 0).toLocaleString()} USD</p>
                        </div>
                      </div>
                    );
                  })}
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
            <p className="text-xs text-fg-subtle px-0.5">Отчёт за {periodLabel}. Нажмите на магазин, чтобы увидеть расходы по статьям и лучшие модели.</p>

            {data.storeBreakdown.map((store) => {
              const expanded = expandedStoreId === store.storeId;
              return (
                <div key={store.storeId} className="rounded-xl bg-surface border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedStoreId(expanded ? null : store.storeId)}
                    className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-surface-raised transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <StoreIcon className="w-4 h-4 text-accent shrink-0" />
                      <span className="font-bold text-sm text-fg-muted truncate">{store.storeName}</span>
                      <Badge tone="neutral">{store.salesCount} чеков</Badge>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-bold ${store.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(store.netProfitUsd)}</span>
                      <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  <div className="px-3.5 pb-3.5 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
                    <Metric label="Выручка" value={usd(store.revenueUsd)} sub={tjs(store.revenueTjs)} />
                    <Metric label="Себестоимость" value={usd(store.cogsUsd)} sub={`${store.unitsSold} шт продано`} />
                    <Metric label="Прибыль с продаж" value={signedUsd(store.profitUsd)} tone={store.profitUsd >= 0 ? 'accent' : 'danger'} />
                    <Metric
                      label="Расходы"
                      value={`−${usd(store.expensesUsd)}`}
                      sub={store.unpaidExpensesTjs > 0 ? `не оплачено ${tjs(store.unpaidExpensesTjs)}` : tjs(store.expensesTjs)}
                      tone="danger"
                    />
                    <Metric label="Чистая прибыль" value={signedUsd(store.netProfitUsd)} tone={store.netProfitUsd >= 0 ? 'accent' : 'danger'} />
                    <Metric label="Касса сейчас" value={tjs(store.cashTjs)} />
                    <Metric label="Товар на складе" value={`${store.stockCount} шт`} sub={usd(store.stockCostUsd)} />
                    {store.refundPenaltiesUsd > 0 && <Metric label="Удержано при возвратах" value={`+${usd(store.refundPenaltiesUsd)}`} />}
                  </div>

                  {expanded && (
                    <div className="px-3.5 pb-3.5 pt-3 border-t border-border grid sm:grid-cols-2 gap-4">
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
                      <button
                        type="button"
                        onClick={() => setSalesReportStoreId(store.storeId)}
                        className="sm:col-span-2 w-full py-2 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Продажи и расходы магазина — Excel</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {mainWarehouse && (
              <div className="rounded-xl bg-surface border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedStoreId(expandedStoreId === 'MAIN' ? null : 'MAIN')}
                  className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-surface-raised transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Warehouse className="w-4 h-4 text-accent shrink-0" />
                    <span className="font-bold text-sm text-fg-muted truncate">{mainWarehouse.name}</span>
                    <Badge tone="accent">Главный склад</Badge>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-fg-subtle shrink-0 transition-transform ${expandedStoreId === 'MAIN' ? 'rotate-180' : ''}`} />
                </button>
                <div className="px-3.5 pb-3.5 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
                  <Metric label="Товар на складе" value={`${data.mainWarehouseStockCount} шт`} sub={usd(data.mainWarehouseStockCostUsd)} />
                  <Metric label="Касса сейчас" value={usd(data.mainWarehouseCashUsd)} sub={tjs(data.mainWarehouseCashTjs)} />
                  <Metric
                    label="Общие расходы"
                    value={`−${usd(data.mainWarehouseExpenses.expensesUsd)}`}
                    sub={data.mainWarehouseExpenses.unpaidExpensesTjs > 0 ? `не оплачено ${tjs(data.mainWarehouseExpenses.unpaidExpensesTjs)}` : 'не привязаны к магазину'}
                    tone="danger"
                  />
                  <Metric label="Долг поставщикам" value={usd(data.totalSupplierDebtUsd)} tone={data.totalSupplierDebtUsd > 0 ? 'danger' : 'default'} />
                </div>
                {expandedStoreId === 'MAIN' && (
                  <div className="px-3.5 pb-3.5 pt-3 border-t border-border">
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
