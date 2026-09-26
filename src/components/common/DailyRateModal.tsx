import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (isOpen) {
      setRateInput(todayRate?.rate ? todayRate.rate.toString() : '');
      setError(null);
    }
  }, [isOpen, todayRate]);

  const handleSubmit = async () => {
    const val = parseFloat(rateInput.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      setError('Введите корректный курс (например, 9.50)');
      return;
    }
    setIsSaving(true);
    const res = await setDailyRate(val);
    setIsSaving(false);
    if (res.success) {
      onClose?.();
    } else {
      setError(res.message || 'Не удалось установить курс');
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
      dismissable={!isMandatory}
      title={isMandatory ? 'Курс доллара на сегодня' : 'Изменение курса доллара'}
      subtitle={isMandatory ? 'Установите курс на новый день' : todayRate?.rate ? `Текущий курс: ${Number(todayRate.rate).toFixed(2)} TJS` : undefined}
      maxWidth="sm"
      footer={
        <>
          {!isMandatory && onClose && (
            <Button variant="secondary" onClick={onClose}>
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
        <FormField label="1 USD =" required error={error ?? undefined}>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0.1"
              value={rateInput}
              onChange={(e) => {
                setRateInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
              placeholder="например, 9.50"
              className="w-full h-14 rounded-lg bg-bg border border-accent/50 px-4 text-xl font-bold text-accent focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-fg-subtle uppercase">TJS</span>
          </div>
        </FormField>
      </div>
    </Dialog>
  );
};
