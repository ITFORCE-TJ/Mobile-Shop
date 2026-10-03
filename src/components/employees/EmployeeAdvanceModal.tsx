import React, { useState, useEffect } from 'react';
import { User, Store } from '../../types';
import { MonthPicker } from '../ui/MonthPicker';
import { getBusinessDateKey } from '../../utils/businessDate';
import { Plus, X, Loader2 } from 'lucide-react';

interface EmployeeAdvanceModalProps {
  user: User | null;
  stores: Store[];
  onClose: () => void;
  onIssueAdvance: (data: { amount: number; payrollMonth: string; note: string }) => Promise<void>;
  onError: (msg: string) => void;
  isSubmitting: boolean;
}

export const EmployeeAdvanceModal: React.FC<EmployeeAdvanceModalProps> = ({
  user,
  stores,
  onClose,
  onIssueAdvance,
  onError,
  isSubmitting,
}) => {
  const [advanceAmountInput, setAdvanceAmountInput] = useState('');
  const [advanceNoteInput, setAdvanceNoteInput] = useState('');
  const [advancePayrollMonth, setAdvancePayrollMonth] = useState<string>(getBusinessDateKey().substring(0, 7));

  useEffect(() => {
    if (user) {
      setAdvanceAmountInput('');
      setAdvanceNoteInput('');
      setAdvancePayrollMonth(getBusinessDateKey().substring(0, 7));
    }
  }, [user]);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const val = parseFloat(advanceAmountInput) || 0;
    if (val <= 0) {
      onError('Укажите правильную сумму аванса');
      return;
    }

    await onIssueAdvance({
      amount: val,
      payrollMonth: advancePayrollMonth,
      note: advanceNoteInput.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-surface border border-warning/40 p-5 text-fg-muted shadow-2xl space-y-3.5">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h4 className="text-xs font-bold text-warning uppercase tracking-wider flex items-center space-x-2">
            <Plus className="w-4 h-4 text-warning" />
            <span>ВЫДАЧА АВАНСА / РАСХОДА</span>
          </h4>
          <button type="button" onClick={onClose} className="text-fg-subtle hover:text-fg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs space-y-3">
          <div className="p-2.5 rounded-lg bg-bg border border-border space-y-1">
            <span className="text-[10px] text-fg-subtle uppercase block">Сотрудник:</span>
            <strong className="text-sm text-fg-muted">{user.name}</strong>
            <p className="text-[10px] text-fg-subtle">
              {user.storeName || (user.storeId ? stores.find((s) => s.id === user.storeId)?.name : undefined) || 'Магазин'}
            </p>
            <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-border">
              <span className="text-fg-subtle uppercase font-semibold">Источник списания:</span>
              <span className="text-accent font-bold">Центральная касса</span>
            </div>
          </div>

          <div>
            <label className="block text-warning text-[10px] uppercase mb-1 font-bold">СУММА АВАНСА (TJS) *</label>
            <div className="relative">
              <input
                step="0.01"
                type="number"
                min="0.01"
                required
                value={advanceAmountInput}
                onChange={(e) => setAdvanceAmountInput(e.target.value)}
                placeholder="300"
                className="w-full rounded-lg bg-bg border border-warning/40 px-3 py-2 text-warning text-sm font-bold focus:border-warning focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-fg-subtle text-xs">TJS</span>
            </div>
          </div>

          <div>
            <label className="block text-fg-subtle text-[10px] uppercase mb-1 font-bold">В СЧЁТ ЗАРПЛАТЫ ЗА МЕСЯЦ *</label>
            <MonthPicker
              value={advancePayrollMonth}
              onChange={setAdvancePayrollMonth}
              className="w-full h-9 px-3 rounded-lg bg-bg border border-border text-fg-muted text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-fg-subtle text-[10px] uppercase mb-1 font-bold">ПРИМЕЧАНИЕ / НА ЧТО ВЫДАНО</label>
            <input
              type="text"
              value={advanceNoteInput}
              onChange={(e) => setAdvanceNoteInput(e.target.value)}
              placeholder="В счет зарплаты / На личные расходы"
              className="w-full rounded-lg bg-bg border border-border px-3 py-2 text-fg-muted text-xs focus:border-warning focus:outline-none"
            />
          </div>

          <p className="text-[9px] text-fg-subtle italic">
            ★ Сумма будет списана из Центральной кассы и учтена как удержанный аванс при расчёте зарплаты.
          </p>
        </div>

        <div className="flex space-x-2 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
          >
            ОТМЕНА
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-warning hover:opacity-90 text-xs font-bold uppercase text-black shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'ВЫДАЧА…' : 'ВЫДАТЬ АВАНС'}
          </button>
        </div>
      </form>
    </div>
  );
};
