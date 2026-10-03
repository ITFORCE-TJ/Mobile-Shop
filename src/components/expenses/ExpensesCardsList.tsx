import React from 'react';
import {
  Calendar,
  Store as StoreIcon,
  Banknote,
  Edit2,
  Trash2,
} from 'lucide-react';
import { ActionMenu } from '../ui/ActionMenu';
import { IconButton } from '../ui/IconButton';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { ExpensesCardsListProps, getCategoryIcon, getCategoryLabel } from './types';

export const ExpensesCardsList: React.FC<ExpensesCardsListProps> = ({
  filteredExpenses,
  totalExpensesCount,
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
    <div className="md:hidden rounded-xl border border-border bg-surface divide-y divide-border/80 shadow-2xs overflow-hidden">
      {filteredExpenses.map((exp) => {
        const Icon = getCategoryIcon(exp.category);
        const label = getCategoryLabel(exp.category, customCategories);
        const formattedDate = exp.date ? new Date(exp.date).toLocaleDateString('ru-RU') : '—';
        const costUsd = exp.amountUsd ?? +(exp.amountTjs / (exp.exchangeRate || rate)).toFixed(2);
        const storeCleanName = formatStoreName(exp.storeName);

        return (
          <div key={exp.id} className="p-2.5 sm:p-3 flex items-center justify-between gap-2.5 hover:bg-surface-raised/40 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border/80 text-fg-subtle flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-bold text-fg truncate">{label}</span>
                  {exp.status === 'UNPAID' ? (
                    <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-warning/15 text-warning border border-warning/30">
                      Не оплачено
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-accent/15 text-accent border border-accent/25">
                      Оплачено
                    </span>
                  )}
                  {exp.status === 'PAID' && exp.sourceAccount?.toLowerCase().includes('касса') && (
                    <span className="px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-surface-raised text-fg-muted border border-border/80">
                      {exp.sourceAccount === 'Центральная касса' ? 'Центральная касса' : 'Из кассы'}
                    </span>
                  )}
                  {exp.employeeName && (
                    <span className="px-1.5 py-0.2 rounded-md text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20">
                      {exp.employeeName}
                    </span>
                  )}
                </div>

                <p className="text-[11px] sm:text-xs text-fg-muted mt-0.5 line-clamp-1">
                  {exp.comment || exp.description || 'Операционный расход'}
                </p>

                <div className="flex flex-wrap items-center gap-1 text-[10px] text-fg-subtle mt-0.5">
                  {!isStoreScoped && storeCleanName && (
                    <>
                      <StoreIcon className="w-2.5 h-2.5 opacity-70" />
                      <span>{storeCleanName}</span>
                      <span>•</span>
                    </>
                  )}
                  <Calendar className="w-2.5 h-2.5 opacity-70" />
                  <span>{formattedDate}</span>
                  {exp.createdByName && (
                    <>
                      <span>•</span>
                      <span>{exp.createdByName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <p className="text-xs sm:text-sm font-black text-danger font-mono tracking-tight">
                  -{formatMoney(exp.amountTjs)} TJS
                </p>
                <p className="text-[10px] text-fg-subtle font-mono">
                  ≈ -${formatMoney(costUsd)}
                </p>
              </div>

              <div className="flex items-center gap-0.5">
                {isAdmin && exp.status === 'UNPAID' && (
                  <IconButton icon={Banknote} tone="accent" size="sm" aria-label="Оплатить расход" onClick={() => onStartPay(exp)} />
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
            </div>
          </div>
        );
      })}

      {filteredExpenses.length > 0 && (
        <p className="text-center text-[10px] text-fg-subtle pt-2 pb-1">
          Показано {filteredExpenses.length} из {totalExpensesCount} записей
        </p>
      )}
    </div>
  );
};
