import React, { useEffect, useMemo, useState } from 'react';
import { Download, PiggyBank, Printer, Receipt, ShoppingCart, Smartphone, TrendingUp, UserCheck, Wallet } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { isStoreScoped } from '../../utils/roles';
import { MonthPicker } from '../ui/MonthPicker';
import { StatCard } from '../ui/StatCard';
import { Select } from '../ui/Input';
import { exportReportSheets, printReportSheets, type ReportSheet } from '../../utils/exportReports';
import { expenseCategoryLabel } from '../../utils/expenseCategories';
import { ExpenseCategoryList, Metric } from './ProfitReport';
import { DailySalesChart } from './DailySalesChart';
import { CashCollectionPanel } from './CashCollectionPanel';
import { type ReportsSummary, type StoreBreakdown, monthLabel, pct, signedUsd, tjs, usd, useReportsSummary } from './reportTypes';

function buildStoreSheets(store: StoreBreakdown, summary: ReportsSummary): ReportSheet[] {
  const money = (header: string) => ({ header, money: true });
  return [
    {
      name: 'Итоги точки',
      title: `P&L — ${store.storeName}`,
      columns: [{ header: 'Показатель', width: 36 }, money('USD'), money('TJS')],
      rows: [
        ['Выручка', store.revenueUsd, store.revenueTjs],
        ['Себестоимость проданного', -store.cogsUsd, -store.cogsTjs],
        ['Валовая прибыль (с учётом возвратов)', store.profitUsd, store.profitTjs],
        ['Расходы точки', -store.expensesUsd, -store.expensesTjs],
        ['Чистая прибыль точки', store.netProfitUsd, store.netProfitTjs],
        ['Средний чек', store.avgCheckUsd, store.avgCheckTjs],
        ['Касса сейчас', '', store.cashTjs],
        ['Инкассировано за период', '', store.cashCollectedTjs],
        ['Товар на складе (себестоимость)', store.stockCostUsd, store.stockCostTjs],
      ],
    },
    {
      name: 'По дням',
      title: 'Динамика продаж по дням',
      columns: [{ header: 'Дата', width: 14 }, { header: 'Чеки' }, money('Выручка, $'), money('Прибыль, $')],
      rows: summary.daily.map((d) => [d.date, d.salesCount, d.revenueUsd, d.profitUsd]),
    },
    {
      name: 'Продавцы',
      title: 'Рейтинг продавцов',
      columns: [{ header: 'Продавец', width: 26 }, { header: 'Чеки' }, { header: 'Продано, шт' }, money('Выручка, $'), money('Прибыль, $')],
      rows: store.sellers.map((p) => [p.sellerName, p.salesCount, p.unitsSold, p.revenueUsd, p.profitUsd]),
    },
    {
      name: 'Модели',
      title: 'Топ продаваемых моделей',
      columns: [{ header: 'Модель', width: 30 }, { header: 'Продано, шт' }, money('Выручка, $'), money('Прибыль, $')],
      rows: store.topModels.map((m) => [m.name, m.count, m.revenueUsd, m.profitUsd]),
    },
    {
      name: 'Расходы',
      title: 'Расходы точки по статьям',
      columns: [{ header: 'Статья', width: 30 }, money('USD'), money('TJS')],
      rows: store.expensesByCategory.map((c) => [expenseCategoryLabel(c.category), c.amountUsd, c.amountTjs]),
      totalsRow: ['ИТОГО', store.expensesUsd, store.expensesTjs],
    },
  ];
}

interface StoreDashboardProps {
  month: string;
  onMonthChange: (month: string) => void;
}

/**
 * «Отчёт по точке» — one store's personal dashboard: P&L, day-by-day sales, seller
 * ranking, best-selling models, expenses by category and cash collections. A store
 * manager lands here pinned to their own store; owners follow the TopBar store switcher.
 */
export const StoreDashboard: React.FC<StoreDashboardProps> = ({ month, onMonthChange }) => {
  const { currentUser, stores, selectedStoreId, setSelectedStoreId } = useAppFields('currentUser', 'stores', 'selectedStoreId', 'setSelectedStoreId');
  const scoped = isStoreScoped(currentUser);
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse), [stores]);

  const pickDefault = () => {
    if (scoped) return currentUser?.storeId || '';
    if (retailStores.some((s) => s.id === selectedStoreId)) return selectedStoreId;
    return retailStores[0]?.id || '';
  };
  const [storeId, setStoreId] = useState(pickDefault);
  useEffect(() => { setStoreId(pickDefault()); }, [selectedStoreId, stores, currentUser?.storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { summary, loading, error, reload } = useReportsSummary(month, storeId || 'all');
  const store = summary?.storeBreakdown.find((s) => s.storeId === storeId);
  const [exporting, setExporting] = useState(false);

  const periodLabel = monthLabel(month);
  const subtitle = `Магазин: ${store?.storeName ?? ''} • Период: ${periodLabel} • Сформировано: ${new Date().toLocaleString('ru-RU')}`;

  const exportExcel = async () => {
    if (!store || !summary) return;
    setExporting(true);
    try {
      await exportReportSheets({ fileBaseName: `otchet_${store.storeName}_${month}`, subtitle, sheets: buildStoreSheets(store, summary), generatedBy: currentUser?.name });
    } catch (e) {
      console.error(e);
      window.alert('Не удалось сформировать Excel-отчёт. Попробуйте ещё раз.');
    } finally {
      setExporting(false);
    }
  };

  const monthPicker = (
    <MonthPicker value={month} onChange={onMonthChange} className="h-9 px-3 rounded-lg border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none" />
  );

  if (!storeId) return <div className="p-4 space-y-2">{monthPicker}<p className="text-sm text-fg-subtle">{scoped ? 'Ваш профиль не привязан к магазину.' : 'Розничных магазинов пока нет.'}</p></div>;
  if (error) return <div className="p-4 space-y-3" role="alert">{monthPicker}<p>{error}</p><button type="button" onClick={reload}>Повторить загрузку</button></div>;
  if (!summary || !store) return <div className="p-4" role="status">{monthPicker}<p>Загрузка отчёта магазина…</p></div>;

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 border-b border-border bg-surface flex flex-wrap items-center gap-2">
        {monthPicker}
        {!scoped && (
          <Select
            value={storeId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="h-9 px-3 pr-8 text-xs font-semibold w-auto"
            aria-label="Магазин"
          >
            {retailStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => printReportSheets({ title: `Отчёт — ${store.storeName}`, subtitle, sheets: buildStoreSheets(store, summary) })}
            className="h-9 px-3 rounded-lg border border-border bg-surface-raised text-fg-muted font-semibold text-xs flex items-center gap-1.5 hover:border-accent">
            <Printer className="w-3.5 h-3.5" /><span>Печать</span>
          </button>
          <button type="button" disabled={exporting} onClick={() => void exportExcel()}
            className="h-9 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-semibold text-xs flex items-center gap-1.5 disabled:opacity-60">
            <Download className="w-3.5 h-3.5" /><span>{exporting ? 'Формирование…' : 'Excel магазина'}</span>
          </button>
        </div>
      </div>

      <div className={`p-3 sm:p-4 space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <div>
          <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wide mb-2 px-0.5">{store.storeName} — {periodLabel}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <StatCard label="Выручка" value={usd(store.revenueUsd)} subvalue={`${tjs(store.revenueTjs)} · ${store.salesCount} чеков`} icon={Receipt} tone="neutral" />
            <StatCard label="Средний чек" value={usd(store.avgCheckUsd)} subvalue={tjs(store.avgCheckTjs)} icon={ShoppingCart} tone="neutral" />
            <StatCard label="Валовая прибыль" value={signedUsd(store.profitUsd)} subvalue={`маржа ${pct(store.grossMarginPercent)}`} icon={TrendingUp} tone={store.profitUsd >= 0 ? 'accent' : 'danger'} />
            <StatCard label="Чистая прибыль точки" value={signedUsd(store.netProfitUsd)} subvalue={`расходы −${usd(store.expensesUsd)}`} icon={PiggyBank} tone={store.netProfitUsd >= 0 ? 'accent' : 'danger'} />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-surface border border-border grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
          <Metric label="Касса сейчас" value={tjs(store.cashTjs)} />
          <Metric label="Инкассировано за месяц" value={tjs(store.cashCollectedTjs)} sub={`${store.cashCollectionsCount} операц.`} />
          <Metric label="Товар на складе" value={`${store.stockCount} шт`} sub={usd(store.stockCostUsd)} />
          <Metric label="Продано" value={`${store.unitsSold} шт`} sub={store.refundsCount ? `возвратов: ${store.refundsCount}` : undefined} />
        </div>

        <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2">
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">Выручка по дням, $</h4>
          <DailySalesChart month={month} daily={summary.daily} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
            <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-accent" /><span>Рейтинг продавцов</span>
            </h4>
            {store.sellers.length === 0 ? <p className="text-xs text-fg-subtle">Продаж за период нет</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] text-fg-subtle uppercase">
                      <th className="py-2 px-2 text-left">#</th><th className="py-2 px-2 text-left">Продавец</th>
                      <th className="py-2 px-2 text-right">Чеки</th><th className="py-2 px-2 text-right">Шт</th>
                      <th className="py-2 px-2 text-right">Выручка</th><th className="py-2 px-2 text-right">Прибыль</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {store.sellers.map((p, i) => (
                      <tr key={p.sellerId}>
                        <td className="py-2 px-2 text-fg-subtle">{i + 1}</td>
                        <td className="py-2 px-2 font-semibold text-fg-muted">{p.sellerName}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{p.salesCount}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{p.unitsSold}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-fg-muted">{usd(p.revenueUsd)}</td>
                        <td className={`py-2 px-2 text-right tabular-nums font-semibold ${p.profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(p.profitUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
            <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-accent" /><span>Топ моделей этой точки</span>
            </h4>
            {store.topModels.length === 0 ? <p className="text-xs text-fg-subtle">Продаж за период нет</p> : (
              <div className="rounded-lg border border-border overflow-hidden">
                {store.topModels.map((m) => (
                  <div key={m.name} className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border last:border-0 text-xs">
                    <span className="text-fg-muted truncate">{m.name} <span className="text-fg-subtle">× {m.count}</span></span>
                    <span className="shrink-0 text-right">
                      <span className="text-fg-subtle mr-2">{usd(m.revenueUsd)}</span>
                      <span className={`font-semibold ${m.profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(m.profitUsd)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-danger" /><span>Расходы точки по статьям</span>
            {store.unpaidExpensesTjs > 0 && <span className="normal-case font-semibold text-warning">· не оплачено {tjs(store.unpaidExpensesTjs)}</span>}
          </h4>
          <ExpenseCategoryList data={store} />
        </div>

        <CashCollectionPanel storeId={storeId} month={month} />
      </div>
    </div>
  );
};
