import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Printer, Trophy } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { MonthPicker } from '../ui/MonthPicker';
import { StatCard } from '../ui/StatCard';
import { exportReportSheets, printReportSheets, type ReportSheet } from '../../utils/exportReports';
import { type StoreBreakdown, type ReportsSummary, monthLabel, pct, signedUsd, tjs, usd, useReportsSummary } from './reportTypes';

type SortKey = 'storeName' | 'salesCount' | 'avgCheckUsd' | 'revenueUsd' | 'profitUsd' | 'grossMarginPercent' | 'expensesUsd' | 'netProfitUsd' | 'cashTjs' | 'stockCostUsd';

const COLUMNS: { key: SortKey; label: string; hint?: string }[] = [
  { key: 'storeName', label: 'Магазин' },
  { key: 'salesCount', label: 'Чеки' },
  { key: 'avgCheckUsd', label: 'Средний чек' },
  { key: 'revenueUsd', label: 'Выручка' },
  { key: 'profitUsd', label: 'Валовая прибыль' },
  { key: 'grossMarginPercent', label: 'Маржа' },
  { key: 'expensesUsd', label: 'Расходы точки' },
  { key: 'netProfitUsd', label: 'Чистая прибыль' },
  { key: 'cashTjs', label: 'Касса сейчас' },
  { key: 'stockCostUsd', label: 'Товар на складе' },
];

/** Builds the comparison sheets shared by the Excel export and the print view. */
export function buildRankingSheets(data: ReportsSummary, rows: StoreBreakdown[]): ReportSheet[] {
  const money = (header: string) => ({ header, money: true });
  const networkExpensesUsd = data.mainWarehouseExpenses.expensesUsd;
  return [
    {
      name: 'Рейтинг филиалов',
      title: 'Сравнение филиалов',
      columns: [
        { header: 'Место', width: 8 }, { header: 'Магазин', width: 24 }, { header: 'Чеки' }, { header: 'Продано, шт' },
        money('Средний чек, $'), money('Выручка, $'), money('Выручка, TJS'), money('Себестоимость, $'), money('Валовая прибыль, $'),
        { header: 'Маржа, %', percent: true }, money('Расходы точки, $'), money('Чистая прибыль, $'), money('Касса сейчас, TJS'),
        money('Инкассировано, TJS'), { header: 'Товар, шт' }, money('Товар на складе, $'),
      ],
      rows: rows.map((s, i) => [
        i + 1, s.storeName, s.salesCount, s.unitsSold, s.avgCheckUsd, s.revenueUsd, s.revenueTjs, s.cogsUsd, s.profitUsd,
        s.grossMarginPercent, s.expensesUsd, s.netProfitUsd, s.cashTjs, s.cashCollectedTjs, s.stockCount, s.stockCostUsd,
      ]),
      totalsRow: [
        '', 'ИТОГО по точкам', sum(rows, 'salesCount'), sum(rows, 'unitsSold'),
        sum(rows, 'salesCount') ? +(sum(rows, 'revenueUsd') / sum(rows, 'salesCount')).toFixed(2) : 0,
        sum(rows, 'revenueUsd'), sum(rows, 'revenueTjs'), sum(rows, 'cogsUsd'), sum(rows, 'profitUsd'),
        sum(rows, 'revenueUsd') ? +((sum(rows, 'profitUsd') / sum(rows, 'revenueUsd')) * 100).toFixed(1) : 0,
        sum(rows, 'expensesUsd'), sum(rows, 'netProfitUsd'), sum(rows, 'cashTjs'), sum(rows, 'cashCollectedTjs'),
        sum(rows, 'stockCount'), sum(rows, 'stockCostUsd'),
      ],
    },
    {
      name: 'Итог сети',
      title: 'Прибыль сети с учётом общесетевых расходов',
      columns: [{ header: 'Показатель', width: 40 }, money('Сумма, $')],
      rows: [
        ['Чистая прибыль всех точек', sum(rows, 'netProfitUsd')],
        ['Общесетевые расходы (реклама, бухгалтер, склад…)', -networkExpensesUsd],
        ['Бонусы поставщиков', data.periodCashBonusesUsd],
      ],
      totalsRow: ['Чистая прибыль сети', data.netProfitUsd],
    },
    {
      name: 'Продавцы',
      title: 'Продавцы по точкам',
      columns: [{ header: 'Магазин', width: 24 }, { header: 'Продавец', width: 24 }, { header: 'Чеки' }, { header: 'Продано, шт' }, money('Выручка, $'), money('Прибыль, $')],
      rows: rows.flatMap((s) => s.sellers.map((p) => [s.storeName, p.sellerName, p.salesCount, p.unitsSold, p.revenueUsd, p.profitUsd])),
    },
    {
      name: 'Модели',
      title: 'Топ моделей по точкам',
      columns: [{ header: 'Магазин', width: 24 }, { header: 'Модель', width: 30 }, { header: 'Продано, шт' }, money('Выручка, $'), money('Прибыль, $')],
      rows: rows.flatMap((s) => s.topModels.map((m) => [s.storeName, m.name, m.count, m.revenueUsd, m.profitUsd])),
    },
  ];
}

function sum(rows: StoreBreakdown[], key: keyof StoreBreakdown): number {
  return +rows.reduce((total, row) => total + (Number(row[key]) || 0), 0).toFixed(2);
}

interface StoreRankingProps {
  month: string;
  onMonthChange: (month: string) => void;
  /** Opens the per-store dashboard for the clicked store. */
  onOpenStore: (storeId: string) => void;
}

/** «Рейтинг филиалов» — every retail store side by side for the month, sortable by any column. */
export const StoreRanking: React.FC<StoreRankingProps> = ({ month, onMonthChange, onOpenStore }) => {
  const { currentUser } = useAppFields('currentUser');
  const { summary, loading, error, reload } = useReportsSummary(month, 'all');
  const [sortKey, setSortKey] = useState<SortKey>('revenueUsd');
  const [sortAsc, setSortAsc] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => {
    const list = [...(summary?.storeBreakdown ?? [])];
    list.sort((a, b) => {
      const cmp = sortKey === 'storeName' ? a.storeName.localeCompare(b.storeName, 'ru') : (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [summary, sortKey, sortAsc]);

  // Leaders for the headline tiles — what the owner wants to know in five seconds.
  const leaders = useMemo(() => {
    const list = summary?.storeBreakdown ?? [];
    const top = (key: keyof StoreBreakdown) => list.reduce<StoreBreakdown | null>((best, s) => (!best || (s[key] as number) > (best[key] as number) ? s : best), null);
    const withSales = list.filter((s) => s.salesCount > 0);
    const lowestMargin = withSales.reduce<StoreBreakdown | null>((worst, s) => (!worst || s.grossMarginPercent < worst.grossMarginPercent ? s : worst), null);
    const heaviestExpenses = list.reduce<StoreBreakdown | null>((worst, s) => {
      const share = s.revenueUsd > 0 ? s.expensesUsd / s.revenueUsd : 0;
      const worstShare = worst && worst.revenueUsd > 0 ? worst.expensesUsd / worst.revenueUsd : -1;
      return share > worstShare ? s : worst;
    }, null);
    return { revenue: top('revenueUsd'), net: top('netProfitUsd'), lowestMargin, heaviestExpenses };
  }, [summary]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(key === 'storeName'); }
  };

  const periodLabel = monthLabel(month);
  const subtitle = `Период: ${periodLabel} • Сформировано: ${new Date().toLocaleString('ru-RU')}${currentUser ? ` • ${currentUser.name}` : ''}`;

  const exportExcel = async () => {
    if (!summary) return;
    setExporting(true);
    try {
      await exportReportSheets({ fileBaseName: `reiting_filialov_${month}`, subtitle, sheets: buildRankingSheets(summary, rows), generatedBy: currentUser?.name });
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

  if (error) return <div className="p-4 space-y-3" role="alert">{monthPicker}<p>{error}</p><button type="button" onClick={reload}>Повторить загрузку</button></div>;
  if (!summary) return <div className="p-4" role="status">{monthPicker}<p>Загрузка рейтинга филиалов…</p></div>;

  const cell = 'py-2 px-2.5 text-right tabular-nums whitespace-nowrap';
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 border-b border-border bg-surface flex flex-wrap items-center gap-2">
        {monthPicker}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => printReportSheets({ title: `Рейтинг филиалов — ${periodLabel}`, subtitle, sheets: buildRankingSheets(summary, rows).slice(0, 2) })}
            className="h-9 px-3 rounded-lg border border-border bg-surface-raised text-fg-muted font-semibold text-xs flex items-center gap-1.5 hover:border-accent">
            <Printer className="w-3.5 h-3.5" /><span>Печать</span>
          </button>
          <button type="button" disabled={exporting} onClick={() => void exportExcel()}
            className="h-9 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-semibold text-xs flex items-center gap-1.5 disabled:opacity-60">
            <Download className="w-3.5 h-3.5" /><span>{exporting ? 'Формирование…' : 'Excel по всей сети'}</span>
          </button>
        </div>
      </div>

      <div className={`p-3 sm:p-4 space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <StatCard label="Лидер по выручке" value={leaders.revenue?.revenueUsd ? leaders.revenue.storeName : '—'} subvalue={leaders.revenue?.revenueUsd ? usd(leaders.revenue.revenueUsd) : 'продаж нет'} icon={Trophy} tone="accent" />
          <StatCard label="Лидер по прибыли" value={leaders.net && leaders.net.netProfitUsd > 0 ? leaders.net.storeName : '—'} subvalue={leaders.net ? signedUsd(leaders.net.netProfitUsd) : ''} icon={Trophy} tone="accent" />
          <StatCard label="Самая низкая маржа" value={leaders.lowestMargin?.storeName ?? '—'} subvalue={leaders.lowestMargin ? pct(leaders.lowestMargin.grossMarginPercent) : ''} icon={ArrowDown} tone="warning" />
          <StatCard label="Выше всех расходы" value={leaders.heaviestExpenses?.expensesUsd ? leaders.heaviestExpenses.storeName : '—'}
            subvalue={leaders.heaviestExpenses?.expensesUsd ? `${usd(leaders.heaviestExpenses.expensesUsd)}${leaders.heaviestExpenses.revenueUsd ? ` · ${pct((leaders.heaviestExpenses.expensesUsd / leaders.heaviestExpenses.revenueUsd) * 100)} выручки` : ''}` : ''}
            icon={ArrowUp} tone="danger" />
        </div>

        {/* Phones: one card per store, sorted by the chosen metric — a 10-column table
            doesn't fit a 375–430px screen without sideways scrolling. */}
        <div className="md:hidden space-y-2.5">
          <label className="flex items-center gap-2 text-xs text-fg-subtle">
            <span className="shrink-0">Сортировать:</span>
            <select
              value={`${sortKey}:${sortAsc ? 'asc' : 'desc'}`}
              onChange={(e) => { const [k, dir] = e.target.value.split(':'); setSortKey(k as SortKey); setSortAsc(dir === 'asc'); }}
              className="flex-1 h-10 rounded-lg bg-surface-raised border border-border px-2.5 text-fg-muted"
            >
              {COLUMNS.filter((c) => c.key !== 'storeName').map((c) => (
                <option key={c.key} value={`${c.key}:desc`}>{c.label} ↓</option>
              ))}
              <option value="storeName:asc">Название А→Я</option>
            </select>
          </label>
          {rows.map((s, i) => (
            <button key={s.storeId} type="button" onClick={() => onOpenStore(s.storeId)}
              className="w-full text-left p-3.5 rounded-xl bg-surface border border-border active:bg-surface-raised">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="font-bold text-sm text-fg-muted truncate">{s.storeName}</span>
                </span>
                <span className={`text-sm font-bold shrink-0 ${s.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(s.netProfitUsd)}</span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-x-2 gap-y-2 text-xs">
                {[
                  ['Выручка', usd(s.revenueUsd)],
                  ['Чеки', String(s.salesCount)],
                  ['Ср. чек', usd(s.avgCheckUsd)],
                  ['Вал. прибыль', signedUsd(s.profitUsd)],
                  ['Маржа', pct(s.grossMarginPercent)],
                  ['Расходы', s.expensesUsd ? `−${usd(s.expensesUsd)}` : '—'],
                  ['Касса', tjs(s.cashTjs)],
                  ['Товар', `${s.stockCount} шт`],
                  ['На сумму', usd(s.stockCostUsd)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-fg-subtle truncate">{label}</p>
                    <p className="font-semibold text-fg-muted truncate tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="hidden md:block rounded-xl bg-surface border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] text-fg-subtle uppercase">
                  <th className="py-2 px-2.5 text-left w-8">#</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={`py-2 px-2.5 ${c.key === 'storeName' ? 'text-left' : 'text-right'} whitespace-nowrap`}>
                      <button type="button" onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-0.5 uppercase hover:text-fg ${sortKey === c.key ? 'text-accent' : ''}`}>
                        {c.label}
                        {sortKey === c.key && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((s, i) => (
                  <tr key={s.storeId} onClick={() => onOpenStore(s.storeId)} className="cursor-pointer hover:bg-surface-raised" title="Открыть отчёт по точке">
                    <td className="py-2 px-2.5 text-fg-subtle tabular-nums">{i + 1}</td>
                    <td className="py-2 px-2.5 font-bold text-accent whitespace-nowrap">{s.storeName}</td>
                    <td className={cell}>{s.salesCount}{s.refundsCount ? <span className="text-fg-subtle"> / −{s.refundsCount}</span> : null}</td>
                    <td className={cell}>{usd(s.avgCheckUsd)}</td>
                    <td className={`${cell} font-semibold text-fg-muted`}>{usd(s.revenueUsd)}<div className="text-[10px] font-normal text-fg-subtle">{tjs(s.revenueTjs)}</div></td>
                    <td className={`${cell} ${s.profitUsd >= 0 ? 'text-fg-muted' : 'text-danger'}`}>{signedUsd(s.profitUsd)}</td>
                    <td className={cell}>{pct(s.grossMarginPercent)}</td>
                    <td className={`${cell} text-danger`}>{s.expensesUsd ? `−${usd(s.expensesUsd)}` : '—'}</td>
                    <td className={`${cell} font-bold ${s.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>{signedUsd(s.netProfitUsd)}</td>
                    <td className={cell}>{tjs(s.cashTjs)}</td>
                    <td className={cell}>{usd(s.stockCostUsd)}<div className="text-[10px] text-fg-subtle">{s.stockCount} шт</div></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-raised font-bold text-fg-muted">
                  <td />
                  <td className="py-2 px-2.5 whitespace-nowrap">Итого по точкам</td>
                  <td className={cell}>{sum(rows, 'salesCount')}</td>
                  <td className={cell}>{sum(rows, 'salesCount') ? usd(sum(rows, 'revenueUsd') / sum(rows, 'salesCount')) : '—'}</td>
                  <td className={cell}>{usd(sum(rows, 'revenueUsd'))}</td>
                  <td className={cell}>{signedUsd(sum(rows, 'profitUsd'))}</td>
                  <td className={cell}>{sum(rows, 'revenueUsd') ? pct((sum(rows, 'profitUsd') / sum(rows, 'revenueUsd')) * 100) : '—'}</td>
                  <td className={`${cell} text-danger`}>−{usd(sum(rows, 'expensesUsd'))}</td>
                  <td className={cell}>{signedUsd(sum(rows, 'netProfitUsd'))}</td>
                  <td className={cell}>{tjs(sum(rows, 'cashTjs'))}</td>
                  <td className={cell}>{usd(sum(rows, 'stockCostUsd'))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* From the sum of store results to the network's bottom line. */}
        <div className="p-3.5 rounded-xl bg-surface border border-border space-y-1.5 text-sm max-w-xl">
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-1">Итог сети за {periodLabel}</h4>
          {[
            { label: 'Чистая прибыль всех точек', value: signedUsd(sum(rows, 'netProfitUsd')) },
            { label: 'Общесетевые расходы (реклама, бухгалтер, склад…)', value: `−${usd(summary.mainWarehouseExpenses.expensesUsd)}` },
            ...(summary.periodCashBonusesUsd ? [{ label: 'Бонусы поставщиков', value: `+${usd(summary.periodCashBonusesUsd)}` }] : []),
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-fg-muted">
              <span>{row.label}</span><span className="font-semibold shrink-0">{row.value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border font-bold">
            <span>Чистая прибыль сети</span>
            <span className={summary.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'}>{signedUsd(summary.netProfitUsd)}</span>
          </div>
        </div>
        <p className="text-xs text-fg-subtle px-0.5">Нажмите на строку магазина, чтобы открыть его детальный отчёт: динамику продаж, продавцов, модели и расходы.</p>
      </div>
    </div>
  );
};
