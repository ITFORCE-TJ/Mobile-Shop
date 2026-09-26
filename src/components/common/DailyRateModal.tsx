import React, { useState, useEffect, useRef } from 'react';
import { useAppFields } from '../../context/AppContext';
import { DollarSign, Clock } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { hasCurrentDailyRate } from '../../utils/dailyRatePrompt';

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
      setRateInput(todayRate?.rate ? todayRate.rate.toString() : '');
      setError(null);
    }
  }, [isOpen, todayRate]);

  const handleSubmit = async () => {
    if (savingRef.current) return;
    const val = Number(rateInput.trim().replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0) {
      setError('Введите корректный курс (например, 9.50)');
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
            <Button variant="secondary" disabled={isSaving} onClick={onClose}>
              Отмена
            </Button>
          )}
          <Button variant="primary" fullWidth leftIcon={DollarSign} loading={isSaving} onClick={handleSubmit}>
            Сохранить курс
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><DollarSign className="h-6 w-6" /></div>
          <div><p className="text-lg font-bold text-fg">1 доллар США</p><p className="text-xs text-fg-muted">Укажите стоимость в сомони</p></div>
        </div>
        <FormField label="Курс USD → TJS" required error={error ?? undefined}>
          <div className="relative">
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
              placeholder="например, 9.50"
              className="w-full h-16 rounded-xl bg-bg border border-accent/50 pl-4 pr-16 text-3xl font-bold tabular-nums text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-fg-subtle uppercase">TJS</span>
          </div>
        </FormField>
        <div className="flex items-start gap-2 rounded-xl bg-bg p-3 text-xs leading-relaxed text-fg-muted">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>После сохранения окно не появится до следующего дня. Изменить курс можно в настройках.</p>
        </div>
      </div>
    </Dialog>
  );
};
