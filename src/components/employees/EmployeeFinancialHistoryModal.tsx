import React, { useState } from 'react';
import { User, Store, Expense, Sale } from '../../types';
import { MonthPicker } from '../ui/MonthPicker';
import { Receipt, X, Calendar } from 'lucide-react';

interface EmployeeFinancialHistoryModalProps {
  user: User | null;
  stores: Store[];
  expenses: Expense[];
  sales: Sale[];
  onClose: () => void;
}

export const EmployeeFinancialHistoryModal: React.FC<EmployeeFinancialHistoryModalProps> = ({
  user,
  stores,
  expenses,
  sales,
  onClose,
}) => {
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>('ALL');

  if (!user) return null;

  const resolvedStoreName =
    user.storeName ||
    (user.storeId ? stores.find((s) => s.id === user.storeId)?.name : undefined) ||
    (user.role === 'SELLER' ? 'Магазин не привязан' : 'Все филиалы');

  const allEmpExpenses = expenses.filter(
    (e) => e.employeeId === user.id || (e.isEmployeeAdvance && e.employeeName === user.name)
  );
  const allEmpSales = sales.filter((s) => s.sellerId === user.id && s.status !== 'REFUNDED');

  const datesSet = new Set<string>();
  allEmpExpenses.forEach((e) => datesSet.add(e.date.substring(0, 7)));
  allEmpSales.forEach((s) => datesSet.add(s.date.substring(0, 7)));
  const availableMonths = Array.from(datesSet).sort().reverse();

  const filteredExpenses =
    selectedHistoryMonth === 'ALL'
      ? allEmpExpenses
      : allEmpExpenses.filter((e) => e.date.startsWith(selectedHistoryMonth));

  const filteredSales =
    selectedHistoryMonth === 'ALL'
      ? allEmpSales
      : allEmpSales.filter((s) => s.date.startsWith(selectedHistoryMonth));

  const salaryExpenses = filteredExpenses.filter((e) => e.category === 'SALARY');
  const advanceExpenses = filteredExpenses.filter((e) => e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance);

  const totalSalaryPaid = salaryExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
  const totalAdvancesTaken = advanceExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
  const totalSalesRev = filteredSales.reduce((sum, s) => sum + s.totalTjs, 0);

  const combinedOperations = [
    ...filteredExpenses.map((e) => ({ kind: 'expense' as const, date: e.date, data: e })),
    ...filteredSales.map((s) => ({ kind: 'sale' as const, date: s.date, data: s })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const baseSal = user.baseSalaryTjs || 0;
  const commPct = user.salesCommissionPercent || 0;
  const commAmount = Math.round(totalSalesRev * (commPct / 100));
  const grossAccrued = baseSal + commAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-2xl bg-surface border border-info/40 p-5 text-fg-muted shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-info uppercase tracking-wider flex items-center space-x-2">
              <Receipt className="w-4 h-4 text-info" />
              <span>ФИНАНСОВАЯ ИСТОРИЯ И ОПЕРАЦИИ: {user.name}</span>
            </h4>
            <span className="text-[10px] text-fg-subtle">{resolvedStoreName}</span>
          </div>
          <button type="button" onClick={onClose} className="text-fg-subtle hover:text-fg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Month Selector Bar */}
        <div className="bg-bg p-3 rounded-lg border border-border space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-fg-muted uppercase flex items-center space-x-1.5">
              <Calendar className="w-4 h-4 text-warning" />
              <span>ФИЛЬТР ПО МЕСЯЦУ:</span>
            </label>
            <div className="flex items-center space-x-2">
              <MonthPicker
                value={selectedHistoryMonth === 'ALL' ? '' : selectedHistoryMonth}
                onChange={setSelectedHistoryMonth}
                className="rounded-lg bg-surface border border-border px-3 py-1 text-xs text-warning font-bold focus:border-warning focus:outline-none"
              />
              {selectedHistoryMonth !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedHistoryMonth('ALL')}
                  className="px-2 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-[10px] text-fg-muted font-bold cursor-pointer"
                >
                  СБРОСИТЬ ФИЛЬТР
                </button>
              )}
            </div>
          </div>

          {/* Month Quick Filter Chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setSelectedHistoryMonth('ALL')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                selectedHistoryMonth === 'ALL'
                  ? 'bg-warning text-black'
                  : 'bg-surface-raised text-fg-muted hover:bg-surface hover:text-fg-muted border border-border'
              }`}
            >
              🌐 ВСЕ МЕСЯЦЫ
            </button>
            {availableMonths.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedHistoryMonth(m)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                  selectedHistoryMonth === m
                    ? 'bg-warning text-black'
                    : 'bg-surface-raised text-fg-muted hover:bg-surface hover:text-fg-muted border border-border'
                }`}
              >
                📅 {m}
              </button>
            ))}
          </div>
        </div>

        {/* Calculations & Breakdown for Selected Month / All */}
        <div className="space-y-3">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-bg p-3 rounded-lg border border-border text-xs">
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block">ВЫРУЧКА ПРОДАЖ:</span>
              <strong className="text-fg-muted text-xs font-bold">
                {totalSalesRev.toLocaleString()} TJS ({filteredSales.length} шт)
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block">НАЧИСЛЕНО (ОКЛАД+PROFIT):</span>
              <strong className="text-accent text-xs font-bold">{grossAccrued.toLocaleString()} TJS</strong>
            </div>
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block">ВЫДАНО АВАНСОВ:</span>
              <strong className="text-warning text-xs font-bold">{totalAdvancesTaken.toLocaleString()} TJS</strong>
            </div>
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block">ВЫПЛАЧЕНО ЗАРПЛАТЫ:</span>
              <strong className="text-info text-xs font-bold">{totalSalaryPaid.toLocaleString()} TJS</strong>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-fg-muted uppercase">
                Все операции за {selectedHistoryMonth === 'ALL' ? 'весь период' : `месяц ${selectedHistoryMonth}`} (
                {filteredExpenses.length + filteredSales.length}):
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-bg">
              {filteredExpenses.length === 0 && filteredSales.length === 0 ? (
                <div className="p-4 text-center text-fg-subtle text-xs">Операций за выбранный месяц не найдено</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                    <tr>
                      <th className="p-2">Дата</th>
                      <th className="p-2">Тип операции</th>
                      <th className="p-2">Детали / Описание</th>
                      <th className="p-2 text-right">Сумма (TJS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[11px]">
                    {combinedOperations.map((op) =>
                      op.kind === 'expense' ? (
                        <tr key={`e-${op.data.id}`} className="hover:bg-surface-raised">
                          <td className="p-2 text-fg-subtle whitespace-nowrap">
                            {new Date(op.data.date).toLocaleDateString()}
                          </td>
                          <td className="p-2">
                            {op.data.category === 'SALARY' ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/30 text-[10px] font-bold">
                                ЗАРПЛАТА
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-md bg-warning/10 text-warning border border-warning/30 text-[10px] font-bold">
                                АВАНС
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-fg-muted truncate max-w-55">
                            {op.data.description || op.data.comment || '-'}
                          </td>
                          <td
                            className={`p-2 text-right font-bold ${
                              op.data.category === 'SALARY' ? 'text-accent' : 'text-warning'
                            }`}
                          >
                            {op.data.amountTjs.toLocaleString()} TJS
                          </td>
                        </tr>
                      ) : (
                        <tr key={`s-${op.data.id}`} className="hover:bg-surface-raised">
                          <td className="p-2 text-fg-subtle whitespace-nowrap">
                            {new Date(op.data.date).toLocaleDateString()}
                          </td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 rounded-md bg-info/10 text-info border border-info/30 text-[10px] font-bold">
                              ПРОДАЖА #{op.data.receiptNumber}
                            </span>
                          </td>
                          <td className="p-2 text-fg-muted truncate max-w-55">
                            {op.data.items.map((i) => `${i.brand} ${i.model}`).join(', ')} (
                            {op.data.customerName || 'Покупатель'})
                          </td>
                          <td className="p-2 text-right font-bold text-fg-muted">
                            +{op.data.totalTjs.toLocaleString()} TJS
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted cursor-pointer"
          >
            ЗАКРЫТЬ
          </button>
        </div>
      </div>
    </div>
  );
};
