import React from 'react';
import { User, Store } from '../../types';
import { MonthPicker } from '../ui/MonthPicker';
import { Briefcase, X, Receipt, Download } from 'lucide-react';

interface PayrollReportModalProps {
  open: boolean;
  onClose: () => void;
  selectedPayrollMonth: string;
  onMonthChange: (m: string) => void;
  users: User[];
  stores: Store[];
  employeePayrollStatsByMonthAndId: Map<string, { salesRev: number; advances: number; paidSalary: number }>;
  onExportCSV: () => void;
  onSelectEmployeeHistory: (u: User, month: string) => void;
}

export const PayrollReportModal: React.FC<PayrollReportModalProps> = ({
  open,
  onClose,
  selectedPayrollMonth,
  onMonthChange,
  users,
  stores,
  employeePayrollStatsByMonthAndId,
  onExportCSV,
  onSelectEmployeeHistory,
}) => {
  if (!open) return null;

  const activeSellers = users.filter((u) => (u.isActive ?? u.active) && u.role === 'SELLER');
  const sellerPayrollData = activeSellers.map((u) => {
    const stats = employeePayrollStatsByMonthAndId.get(u.id) ?? { salesRev: 0, advances: 0, paidSalary: 0 };
    const { salesRev, advances, paidSalary } = stats;
    const baseSal = u.baseSalaryTjs || 0;
    const commPct = u.salesCommissionPercent || 0;
    const commAmt = Math.round(salesRev * (commPct / 100));
    const grossAccrued = baseSal + commAmt;
    const netPayable = Math.max(0, grossAccrued - advances - paidSalary);
    const rawStoreName = u.storeName || (u.storeId ? stores.find((s) => s.id === u.storeId)?.name : undefined);
    const storeName = rawStoreName ? rawStoreName.replace(/^Магазин\s*[«"']?|["'»]$/g, '').trim() : 'Без привязки';
    return {
      user: u,
      salesRev,
      advances,
      paidSalary,
      baseSal,
      commPct,
      commAmt,
      grossAccrued,
      netPayable,
      storeName,
    };
  });

  const totals = sellerPayrollData.reduce(
    (acc, row) => ({
      baseSal: acc.baseSal + row.baseSal,
      salesRev: acc.salesRev + row.salesRev,
      commAmt: acc.commAmt + row.commAmt,
      grossAccrued: acc.grossAccrued + row.grossAccrued,
      advances: acc.advances + row.advances,
      paidSalary: acc.paidSalary + row.paidSalary,
      netPayable: acc.netPayable + row.netPayable,
    }),
    { baseSal: 0, salesRev: 0, commAmt: 0, grossAccrued: 0, advances: 0, paidSalary: 0, netPayable: 0 }
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-2xl bg-surface border border-border p-3.5 sm:p-4 text-fg shadow-2xl space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-warning/15 text-warning flex items-center justify-center shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <h3 className="text-sm font-bold text-fg truncate">Зарплатная ведомость продавцов</h3>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-surface-raised border border-border text-fg-subtle shrink-0">
                {activeSellers.length} чел.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month Selector + KPI Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-raised/80 border border-border rounded-xl px-3 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-fg-subtle">Период:</span>
            <MonthPicker
              value={selectedPayrollMonth}
              onChange={onMonthChange}
              className="rounded-lg bg-surface border border-border px-2.5 py-1 text-xs text-warning font-bold focus:border-warning focus:outline-none"
            />
          </div>

          {/* KPI Pill Indicators */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface border border-border text-[11px]">
              <span className="text-fg-subtle">Начислено:</span>
              <span className="font-bold text-fg">{totals.grossAccrued.toLocaleString()} TJS</span>
            </div>
            {totals.advances > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-warning/10 border border-warning/20 text-[11px]">
                <span className="text-warning">Авансы:</span>
                <span className="font-bold text-warning">-{totals.advances.toLocaleString()} TJS</span>
              </div>
            )}
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-accent/15 border border-accent/30 text-[11px]">
              <span className="text-accent font-medium">К выдаче:</span>
              <span className="font-bold text-accent">{totals.netPayable.toLocaleString()} TJS</span>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 rounded-xl border border-border bg-bg/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface text-[10.5px] font-semibold text-fg-subtle border-b border-border sticky top-0 z-10 shadow-xs">
              <tr>
                <th className="py-2 px-2.5">Сотрудник</th>
                <th className="py-2 px-2 text-right">Оклад</th>
                <th className="py-2 px-2 text-right">Продажи</th>
                <th className="py-2 px-2 text-right">Бонус</th>
                <th className="py-2 px-2 text-right">Начислено</th>
                <th className="py-2 px-2 text-right text-warning">Авансы</th>
                <th className="py-2 px-2 text-right text-info">Выплачено</th>
                <th className="py-2 px-2.5 text-right text-accent font-bold">К выдаче</th>
                <th className="py-2 px-2 text-center">Операции</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[11px]">
              {sellerPayrollData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-xs text-fg-subtle">
                    Нет активных продавцов за выбранный период
                  </td>
                </tr>
              ) : (
                sellerPayrollData.map(
                  ({ user: u, salesRev, advances, paidSalary, baseSal, commPct, commAmt, grossAccrued, netPayable, storeName }) => (
                    <tr
                      key={u.id}
                      onClick={() => onSelectEmployeeHistory(u, selectedPayrollMonth)}
                      className="hover:bg-surface-raised cursor-pointer transition-colors group"
                      title="Нажмите, чтобы открыть подробные операции сотрудника"
                    >
                      <td className="py-2 px-2.5">
                        <div className="font-semibold text-fg group-hover:text-accent transition-colors leading-tight">
                          {u.name}
                        </div>
                        <div className="text-[10px] text-fg-subtle truncate max-w-[130px]">{storeName}</div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-fg-muted">{baseSal.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-fg-muted font-medium">
                        {salesRev > 0 ? salesRev.toLocaleString() : '—'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {commAmt > 0 ? (
                          <span className="text-warning font-semibold">
                            +{commAmt.toLocaleString()} <span className="text-[10px] text-warning/80">({commPct}%)</span>
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold text-fg">
                        {grossAccrued.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {advances > 0 ? (
                          <span className="text-warning font-semibold">-{advances.toLocaleString()}</span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {paidSalary > 0 ? (
                          <span className="text-info font-semibold">{paidSalary.toLocaleString()}</span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-right tabular-nums whitespace-nowrap">
                        <span className="font-bold text-accent px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/20">
                          {netPayable.toLocaleString()} TJS
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface border border-border text-[10px] font-semibold text-fg-muted group-hover:border-accent group-hover:text-accent transition-colors">
                          <Receipt className="w-3 h-3 text-info" />
                          <span className="hidden sm:inline">Операции</span>
                        </span>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
            {sellerPayrollData.length > 0 && (
              <tfoot className="bg-surface-raised font-semibold text-[11px] border-t-2 border-border text-fg sticky bottom-0 z-10 shadow-xs">
                <tr>
                  <td className="py-2 px-2.5 text-fg-subtle">Итого ({sellerPayrollData.length}):</td>
                  <td className="py-2 px-2 text-right tabular-nums">{totals.baseSal.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{totals.salesRev.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-warning">{totals.commAmt.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold text-fg">
                    {totals.grossAccrued.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-warning">
                    {totals.advances > 0 ? `-${totals.advances.toLocaleString()}` : '0'}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-info">{totals.paidSalary.toLocaleString()}</td>
                  <td className="py-2 px-2.5 text-right tabular-nums font-bold text-accent whitespace-nowrap">
                    {totals.netPayable.toLocaleString()} TJS
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onExportCSV}
            className="h-8 px-3 rounded-lg bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg flex items-center gap-1.5 transition-colors active:scale-95 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            <span>Экспорт CSV</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg bg-accent hover:bg-accent-strong text-xs font-semibold text-accent-fg transition-colors active:scale-95 shadow-xs cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
