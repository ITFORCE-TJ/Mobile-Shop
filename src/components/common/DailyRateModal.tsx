import React, { useState, useEffect, useRef } from 'react';
import { useAppFields } from '../../context/AppContext';
import { DollarSign, Clock, AlertCircle } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { hasCurrentDailyRate } from '../../utils/dailyRatePrompt';
import { formatRateOrInput } from '../../utils/money';
import { cn } from '../../utils/cn';

interface DailyRateModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const DailyRateModal: React.FC<DailyRateModalProps> = ({ isOpen, onClose }) => {
  const { todayRate, setDailyRate, currentUser } = useAppFields('todayRate', 'setDailyRate', 'currentUser');
  const hasRate = !!(todayRate && Number(todayRate.rate) > 0);
  // Only ADMIN/PARTNER can actually set the rate (server-enforced) — a SELLER can't act
  // on this, so blocking them behind a non-dismissable modal would be a dead end.
  const canSetRate = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';
  const isMandatory = !hasCurrentDailyRate(todayRate) && canSetRate;

  const [rateInput, setRateInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setRateInput(formatRateOrInput(todayRate?.rate));
      setError(null);
    }
  }, [isOpen, todayRate]);

  const handleBlur = () => {
    const formatted = formatRateOrInput(rateInput);
    if (formatted) {
      setRateInput(formatted);
    }
  };

  const handleSubmit = async () => {
    if (savingRef.current) return;
    const val = Number(rateInput.trim().replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0) {
      setError('Введите корректный курс (например, 10.50)');
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      const res = await setDailyRate(val);
      if (res.success) onClose?.();
      else setError(res.message || 'Не удалось установить курс');
    } catch {
      setError('Не удалось сохранить курс. Проверьте соединение и повторите.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  if (!hasRate && !canSetRate) {
    // A SELLER can't set the rate — show a dismissable notice instead of a dead-end modal.
    return (
      <Dialog
        open={isOpen}
        onClose={() => onClose?.()}
        dismissable
        title="Курс доллара ещё не задан"
        subtitle="Первоначальная настройка"
        maxWidth="sm"
        footer={
          onClose && (
            <Button variant="primary" fullWidth onClick={onClose}>
              Понятно
            </Button>
          )
        }
      >
        <div className="flex items-start gap-3 text-sm text-fg-muted">
          <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <p>Администратор или партнёр ещё не установил базовый курс USD/TJS. Обратитесь к администратору для первоначальной настройки курса.</p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onClose={() => onClose?.()}
      dismissable={!isMandatory && !isSaving}
      title={isMandatory ? 'Курс доллара на сегодня' : 'Изменение курса доллара'}
      subtitle={isMandatory ? 'Установите курс на новый день' : todayRate?.rate ? `Текущий курс: ${Number(todayRate.rate).toFixed(2)} TJS` : undefined}
      maxWidth="sm"
      footer={
        <>
          {!isMandatory && onClose && (
            <Button variant="secondary" className="flex-1" disabled={isSaving} onClick={onClose}>
              Отмена
            </Button>
          )}
          <Button
            variant="primary"
            className={!isMandatory && onClose ? 'flex-1' : undefined}
            fullWidth={isMandatory || !onClose}
            loading={isSaving}
            onClick={handleSubmit}
          >
            Сохранить курс
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Compact Currency Exchange Card */}
        <div
          className={cn(
            'rounded-2xl border transition-all duration-200 overflow-hidden bg-bg/60',
            error
              ? 'border-danger/60 ring-2 ring-danger/20'
              : 'border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 hover:border-border/80'
          )}
        >
          {/* Card Header: Currency pair & optional current rate preset button */}
          <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-fg">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/15 text-accent font-bold text-[11px]">
                <DollarSign className="w-3.5 h-3.5" />
              </span>
              <span>1 USD =</span>
            </div>
            {todayRate?.rate ? (
              <button
                type="button"
                onClick={() => {
                  setRateInput(formatRateOrInput(todayRate.rate));
                  setError(null);
                }}
                className="text-[11px] text-fg-subtle hover:text-accent font-medium transition-colors cursor-pointer select-none"
                title="Подставить текущий курс"
              >
                Текущий: <span className="font-semibold text-fg-muted">{Number(todayRate.rate).toFixed(2)} TJS</span>
              </button>
            ) : (
              <span className="text-[11px] text-fg-subtle font-medium">USD → TJS</span>
            )}
          </div>

          {/* Rate Input Field */}
          <div className="flex items-center px-3.5 pb-2.5 pt-0.5">
            <input
              type="text"
              inputMode="decimal"
              disabled={isSaving}
              aria-invalid={!!error}
              value={rateInput}
              onChange={(e) => {
                setRateInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              onFocus={(e) => e.target.select()}
              autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
              onBlur={handleBlur}
              placeholder="10.50"
              className="w-full bg-transparent text-2xl sm:text-3xl font-bold tabular-nums text-fg focus:outline-none placeholder:text-fg-subtle/30"
            />
            <span className="shrink-0 text-xs font-bold text-fg-subtle uppercase px-2 py-1 rounded-md bg-surface border border-border select-none">
              TJS
            </span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-xs text-danger font-medium px-1 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {/* Subtle hint */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-fg-subtle text-center pt-0.5 select-none">
          <Clock className="w-3.5 h-3.5 shrink-0 text-fg-subtle/70" />
          <span>После сохранения курс можно изменить в Настройках</span>
        </div>
      </div>
    </Dialog>
  );
};
