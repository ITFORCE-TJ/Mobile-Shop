import React, { useState, useEffect } from 'react';
import { User, Store, Sale } from '../../types';
import { apiClient } from '../../api/client';
import { decimal, moneyNumber, sumMoney } from '../../utils/money';
import { getBusinessDateKey } from '../../utils/businessDate';
import { MonthPicker } from '../ui/MonthPicker';
import { DollarSign, X, Loader2 } from 'lucide-react';

interface SalaryPayoutModalProps {
  user: User | null;
  stores: Store[];
  sales: Sale[];
  initialMonth: string;
  initialGrossInput?: string;
  onClose: () => void;
  onPaySalary: (data: { employeeId: string; month: string; grossTjs: number; note?: string }) => Promise<{ success: boolean; message?: string; amountTjs?: number }>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const SalaryPayoutModal: React.FC<SalaryPayoutModalProps> = ({
  user,
  stores,
  sales,
  initialMonth,
  initialGrossInput = '',
  onClose,
  onPaySalary,
  onSuccess,
  onError,
}) => {
  const [payoutMonth, setPayoutMonth] = useState<string>(initialMonth);
  const [grossSalaryInput, setGrossSalaryInput] = useState<string>(initialGrossInput);
  const [payoutNote, setPayoutNote] = useState<string>('');
  const [payrollSummary, setPayrollSummary] = useState<{ paidSalaryTjs: number; paidAdvancesTjs: number } | null>(null);
  const [payrollSummaryError, setPayrollSummaryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setPayoutMonth(initialMonth);
    setGrossSalaryInput(initialGrossInput);
    setPayoutNote('');
  }, [user, initialMonth, initialGrossInput]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setPayrollSummary(null);
    setPayrollSummaryError(null);
    apiClient<{ paidSalaryTjs: number; paidAdvancesTjs: number }>(`/payroll/${user.id}?month=${payoutMonth}`)
      .then((summary) => {
        if (!cancelled) {
          setPayrollSummary({
            paidSalaryTjs: Number(summary.paidSalaryTjs) || 0,
            paidAdvancesTjs: Number(summary.paidAdvancesTjs) || 0,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPayrollSummaryError((err as Error).message || 'Не удалось загрузить выплаты за месяц');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, payoutMonth]);

  if (!user) return null;

  const thisMonth = payoutMonth;
  const totalAdvances = payrollSummary?.paidAdvancesTjs ?? 0;
  const paidSalary = payrollSummary?.paidSalaryTjs ?? 0;

  const empSales = sales.filter(
    (s) =>
      s.sellerId === user.id &&
      s.status !== 'REFUNDED' &&
      getBusinessDateKey(new Date(s.date)).startsWith(thisMonth)
  );
  const salesRevTjs = sumMoney(empSales.map((s) => s.totalTjs));
  const baseSal = user.baseSalaryTjs || 0;
  const commPct = user.salesCommissionPercent || 0;
  const commAmount = moneyNumber(decimal(salesRevTjs).mul(commPct).div(100));
  const autoGross = baseSal + commAmount;

  const grossVal = parseFloat(grossSalaryInput) || 0;
  const netPayout = Math.max(0, moneyNumber(decimal(grossVal).minus(paidSalary).minus(totalAdvances)));

  const handleExecuteSalaryPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (grossVal <= 0) {
      onError('Укажите сумму начисленной зарплаты');
      return;
    }

    if (!payrollSummary) {
      onError(payrollSummaryError || 'Дождитесь загрузки выплат за месяц');
      return;
    }

    if (netPayout <= 0) {
      onSuccess(
        `Начисленная зарплата ${user.name} за ${payoutMonth} (${grossVal} TJS) уже полностью выплачена с учётом авансов — доплата не требуется.`
      );
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onPaySalary({
        employeeId: user.id,
        month: payoutMonth,
        grossTjs: grossVal,
        note: payoutNote.trim() || undefined,
      });

      if (res.success) {
        onSuccess(
          `Зарплата ${user.name} за ${payoutMonth} выплачена из Центральной кассы: ${res.amountTjs ?? netPayout} TJS${
            payrollSummary.paidAdvancesTjs > 0 ? ` (удержано авансов: ${payrollSummary.paidAdvancesTjs} TJS)` : ''
          }`
        );
        onClose();
      } else {
        onError(res.message || 'Ошибка выплаты зарплаты');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <form onSubmit={handleExecuteSalaryPayout} className="w-full max-w-md rounded-2xl bg-surface border border-accent/40 p-5 text-fg-muted shadow-2xl space-y-3.5">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h4 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-accent" />
            <span>ВЫПЛАТА ЗАРПЛАТЫ СОТРУДНИКУ</span>
          </h4>
          <button type="button" onClick={onClose} className="text-fg-subtle hover:text-fg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-fg-subtle text-[10px] uppercase font-bold">Зарплата за месяц</span>
            <MonthPicker
              value={payoutMonth}
              onChange={setPayoutMonth}
              className="h-9 px-3 rounded-lg bg-bg border border-accent/40 text-accent text-xs font-semibold"
            />
          </div>
          {payrollSummaryError && (
            <p className="p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger">{payrollSummaryError}</p>
          )}
          <div className="p-3 rounded-lg bg-bg border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-sm text-fg-muted block">{user.name}</strong>
                <span className="text-[10px] text-fg-subtle">
                  {user.storeName || (user.storeId ? stores.find((s) => s.id === user.storeId)?.name : undefined) || 'Магазин'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-fg-subtle block uppercase">Авансы за {thisMonth}:</span>
                <strong className="text-warning">{payrollSummary ? `${totalAdvances.toLocaleString()} TJS` : '…'}</strong>
              </div>
            </div>

            <div className="pt-2 border-t border-border text-[11px] space-y-1">
              <div className="flex justify-between text-fg-subtle">
                <span>Оклад (фикс):</span>
                <span className="text-fg-muted">{baseSal.toLocaleString()} TJS</span>
              </div>
              <div className="flex justify-between text-fg-subtle">
                <span>Продажи ({salesRevTjs.toLocaleString()} TJS × {commPct}%):</span>
                <span className="text-warning">+{commAmount.toLocaleString()} TJS</span>
              </div>
              <div className="flex justify-between font-bold text-accent pt-1 border-t border-border">
                <span>Расчетное начисление:</span>
                <span>{autoGross.toLocaleString()} TJS</span>
              </div>
            </div>

            {autoGross > 0 && grossSalaryInput !== autoGross.toString() && (
              <button
                type="button"
                onClick={() => setGrossSalaryInput(autoGross.toString())}
                className="w-full py-1.5 px-2 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent text-[10px] font-bold border border-accent/40 flex items-center justify-center space-x-1 transition-colors cursor-pointer"
              >
                <span>⚡ Применить авторасчет ({autoGross.toLocaleString()} TJS)</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-accent text-[10px] uppercase mb-1 font-bold">НАЧИСЛЕНО ЗАРПЛАТЫ / БОНУСОВ (TJS) *</label>
            <div className="relative">
              <input
                step="0.01"
                type="number"
                min="0.01"
                required
                value={grossSalaryInput}
                onChange={(e) => setGrossSalaryInput(e.target.value)}
                placeholder="Например: 1500"
                className="w-full rounded-lg bg-bg border border-accent/40 px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-fg-subtle text-xs">TJS</span>
            </div>
          </div>

          {/* Summary Box */}
          <div className="p-3 rounded-lg bg-bg border border-border space-y-1.5">
            <div className="flex justify-between text-fg-subtle">
              <span>Начислено всего:</span>
              <span>{grossVal.toLocaleString()} TJS</span>
            </div>
            {paidSalary > 0 && (
              <div className="flex justify-between text-fg-subtle">
                <span>Уже выплачено зарплаты за месяц:</span>
                <span>-{paidSalary.toLocaleString()} TJS</span>
              </div>
            )}
            <div className="flex justify-between text-warning">
              <span>Удержано авансов за месяц:</span>
              <span>-{totalAdvances.toLocaleString()} TJS</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-border text-sm font-bold text-accent">
              <span>К выгрузке / на руки:</span>
              <span>{netPayout.toLocaleString()} TJS</span>
            </div>
          </div>

          <div>
            <label className="block text-fg-subtle text-[10px] uppercase mb-1 font-bold">ПРИМЕЧАНИЕ</label>
            <input
              type="text"
              value={payoutNote}
              onChange={(e) => setPayoutNote(e.target.value)}
              placeholder="Выплата за текущий месяц"
              className="w-full rounded-lg bg-bg border border-border px-3 py-2 text-fg-muted text-xs focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex justify-between items-center text-[10px] p-2.5 rounded-lg bg-bg border border-border">
            <span className="text-fg-subtle uppercase font-semibold">Источник выплаты:</span>
            <span className="text-accent font-bold">Центральная касса</span>
          </div>

          <p className="text-[9px] text-fg-subtle italic">
            ★ Выплата производится из Центральной кассы.
          </p>

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
              disabled={isSubmitting || !payrollSummary}
              className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold uppercase text-accent-fg shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSubmitting ? 'ВЫПЛАТА…' : 'ВЫПЛАТИТЬ ЗАРПЛАТУ'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
