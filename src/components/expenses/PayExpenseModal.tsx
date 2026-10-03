import React from 'react';
import { Landmark } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { formatMoney } from '../../utils/money';
import { PayExpenseModalProps, getCategoryLabel } from './types';

export const PayExpenseModal: React.FC<PayExpenseModalProps> = ({
  payingExpense,
  onClose,
  isSubmitting,
  centralCashStore,
  rate,
  customCategories,
  onConfirmPay,
}) => {
  const isInsufficientFunds = payingExpense && (centralCashStore?.cashBalanceUsd ?? 0) < (payingExpense.amountUsd ?? (payingExpense.amountTjs ?? 0) / rate);

  return (
    <Dialog
      open={!!payingExpense}
      onClose={onClose}
      title="Оплатить расход"
      maxWidth="sm"
      footer={
        <>
          <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={onClose}>Отмена</Button>
          <Button
            variant="primary"
            fullWidth
            loading={isSubmitting}
            disabled={Boolean(isInsufficientFunds)}
            onClick={onConfirmPay}
          >
            Оплатить из Центральной кассы
          </Button>
        </>
      }
    >
      {payingExpense && (
        <div className="space-y-3.5">
          <p className="text-sm text-fg-muted">
            {getCategoryLabel(payingExpense.category, customCategories)}: <span className="font-semibold text-danger">{formatMoney(payingExpense.amountTjs)} TJS</span>
          </p>
          <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-accent/15 text-accent shrink-0">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-fg-muted">Центральная касса</p>
                <p className="text-[11px] text-fg-subtle">
                  {payingExpense.storeName ? `Филиал: ${payingExpense.storeName}` : 'Общий расход компании'}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-bold text-accent">
                ${formatMoney(centralCashStore?.cashBalanceUsd)}
              </span>
              <p className="text-[10px] text-fg-subtle">Остаток в кассе</p>
            </div>
          </div>

          {(centralCashStore?.cashBalanceUsd ?? 0) < (payingExpense.amountUsd ?? payingExpense.amountTjs / rate) && (
            <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-[11px] text-danger">
              Внимание: в Центральной кассе недостаточно средств (Остаток: ${formatMoney(centralCashStore?.cashBalanceUsd)}, требуется: ${formatMoney(payingExpense.amountUsd ?? payingExpense.amountTjs / rate)}).
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
};
