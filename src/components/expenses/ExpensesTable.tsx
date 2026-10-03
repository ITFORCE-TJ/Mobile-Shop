import React from 'react';
import {
  Store as StoreIcon,
  Banknote,
  Edit2,
  Trash2,
} from 'lucide-react';
import { ActionMenu } from '../ui/ActionMenu';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { ExpensesTableProps, getCategoryIcon, getCategoryLabel } from './types';

export const ExpensesTable: React.FC<ExpensesTableProps> = ({
  filteredExpenses,
  isStoreScoped,
  customCategories,
  rate,
  isAdmin,
  isPartner,
  onStartPay,
  onStartEdit,
  onConfirmDeleteId,
}) => {
  return (
    <div className="hidden md:block rounded-xl border border-border bg-surface shadow-2xs overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface-raised text-[10px] font-bold text-fg-subtle border-b border-border sticky top-0 z-10 uppercase tracking-wider select-none">
          <tr>
            <th className="py-2.5 px-3.5 whitespace-nowrap">Дата</th>
            <th className="py-2.5 px-3">Категория</th>
            <th className="py-2.5 px-3">Описание / Назначение</th>
            {!isStoreScoped && <th className="py-2.5 px-3 whitespace-nowrap">Точка</th>}
            <th className="py-2.5 px-3 whitespace-nowrap">Источник списания</th>
            <th className="py-2.5 px-3 whitespace-nowrap">Сотрудник</th>
            <th className="py-2.5 px-3 whitespace-nowrap text-center">Статус</th>
            <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Сумма</th>
            <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/80">
          {filteredExpenses.map((exp) => {
            const Icon = getCategoryIcon(exp.category);
            const label = getCategoryLabel(exp.category, customCategories);
            const formattedDate = exp.date ? new Date(exp.date).toLocaleDateString('ru-RU') : '—';
            const costUsd = exp.amountUsd ?? +(exp.amountTjs / (exp.exchangeRate || rate)).toFixed(2);
            const storeCleanName = formatStoreName(exp.storeName);

            return (
              <tr key={exp.id} className="hover:bg-surface-raised/40 transition-colors">
                <td className="py-3 px-3.5 whitespace-nowrap font-mono text-[11px] text-fg-subtle">
                  {formattedDate}
                </td>
                <td className="py-3 px-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 font-bold text-fg">
                    <span className="w-6 h-6 rounded-md bg-surface-raised border border-border/80 text-fg-subtle flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span>{label}</span>
                  </span>
                </td>
                <td className="py-3 px-3 text-fg-muted max-w-xs truncate" title={exp.comment || exp.description || 'Операционный расход'}>
                  {exp.comment || exp.description || 'Операционный расход'}
                </td>
                {!isStoreScoped && (
                  <td className="py-3 px-3 whitespace-nowrap text-fg-muted">
                    {storeCleanName ? (
                      <span className="inline-flex items-center gap-1 text-[11px]">
                        <StoreIcon className="w-3 h-3 text-accent shrink-0" />
                        <span>{storeCleanName}</span>
                      </span>
                    ) : (
                      <span className="text-fg-subtle opacity-60">—</span>
                    )}
                  </td>
                )}
                <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                  {exp.status === 'PAID' && exp.sourceAccount?.toLowerCase().includes('касса') ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-surface-raised text-fg-muted border border-border/80">
                      {exp.sourceAccount === 'Центральная касса' ? 'Центральная касса' : 'Из кассы'}
                    </span>
                  ) : (
                    <span className="text-fg-subtle opacity-60">—</span>
                  )}
                </td>
                <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                  {exp.employeeName ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20">
                      {exp.employeeName}
                    </span>
                  ) : exp.createdByName ? (
                    <span className="text-fg-subtle">{exp.createdByName}</span>
                  ) : (
                    <span className="text-fg-subtle opacity-60">—</span>
                  )}
                </td>
                <td className="py-3 px-3 whitespace-nowrap text-center">
                  {exp.status === 'UNPAID' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/15 text-warning border border-warning/30">
                      Не оплачено
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/25">
                      Оплачено
                    </span>
                  )}
                </td>
                <td className="py-3 px-3.5 whitespace-nowrap text-right font-mono">
                  <span className="font-black text-danger text-xs sm:text-sm block">
                    -{formatMoney(exp.amountTjs)} TJS
                  </span>
                  <span className="text-[10px] text-fg-subtle block">
                    ≈ -${formatMoney(costUsd)}
                  </span>
                </td>
                <td className="py-3 px-3.5 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin && exp.status === 'UNPAID' && (
                      <button
                        type="button"
                        onClick={() => onStartPay(exp)}
                        className="px-2 py-1 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent border border-accent/25 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Оплатить расход"
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        <span>Оплатить</span>
                      </button>
                    )}
                    {(isAdmin || isPartner) && (
                      <ActionMenu
                        label="Действия с расходом"
                        subtitle={exp.category || 'Расход'}
                        actions={[
                          { label: 'Редактировать расход', description: 'Изменить категорию, сумму или описание', icon: Edit2, onSelect: () => onStartEdit(exp) },
                          { label: 'Удалить расход', description: 'Удалить запись из истории расходов', icon: Trash2, danger: true, onSelect: () => onConfirmDeleteId(exp.id) },
                        ]}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
