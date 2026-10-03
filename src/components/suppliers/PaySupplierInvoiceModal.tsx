import React, { useState, useEffect } from 'react';
import { SupplierInvoice, Store } from '../../types';
import { formatMoney } from '../../utils/money';
import { Landmark, Loader2 } from 'lucide-react';

interface PaySupplierInvoiceModalProps {
  open: boolean;
  invoice: SupplierInvoice | null;
  centralCashStore: Store | null;
  rateNumber: number;
  onClose: () => void;
  onPay: (data: { invoiceId: string; amountUsd: number; sourceAccountId: string }) => Promise<{ success: boolean; message?: string }>;
  onError: (msg: string) => void;
}

export const PaySupplierInvoiceModal: React.FC<PaySupplierInvoiceModalProps> = ({
  open,
  invoice,
  centralCashStore,
  rateNumber,
  onClose,
  onPay,
  onError,
}) => {
  const [payInvoiceAmountUsd, setPayInvoiceAmountUsd] = useState('');
  const [payInvoiceSourceAccountId, setPayInvoiceSourceAccountId] = useState(centralCashStore?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (invoice) {
      setPayInvoiceAmountUsd(invoice.remainingAmountUsd.toString());
      setPayInvoiceSourceAccountId(centralCashStore?.id || '');
    }
  }, [invoice, centralCashStore]);

  if (!open || !invoice) return null;

  const handleExecuteInvoicePayment = async () => {
    if (isSubmitting) return;
    const amt = parseFloat(payInvoiceAmountUsd) || 0;
    if (amt <= 0) {
      onError('Укажите положительную сумму оплаты');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onPay({
        invoiceId: invoice.id,
        amountUsd: amt,
        sourceAccountId: payInvoiceSourceAccountId,
      });

      if (res.success) {
        onClose();
      } else {
        onError(res.message || 'Ошибка оплаты');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedAmount = parseFloat(payInvoiceAmountUsd) || 0;
  const cashBalance = centralCashStore?.cashBalanceUsd ?? 0;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl">
        <h4 className="text-sm font-bold text-fg-muted mb-1">Оплата по накладной {invoice.invoiceNumber}</h4>
        <p className="text-xs text-fg-subtle mb-4">Остаток по накладной: ${invoice.remainingAmountUsd}</p>

        <div className="space-y-3 text-xs mb-4">
          <div>
            <label className="block text-fg-subtle mb-1">Сумма оплаты ($ USD):</label>
            <div className="relative">
              <input
                step="0.01"
                type="number"
                min="0.01"
                max={invoice.remainingAmountUsd}
                value={payInvoiceAmountUsd ?? ''}
                onChange={(e) => setPayInvoiceAmountUsd(e.target.value)}
                className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none"
              />
              <span className="absolute right-3 top-2 text-fg-subtle">$</span>
            </div>
          </div>

          <div>
            <label className="block text-fg-subtle mb-1">Касса списания:</label>
            <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-accent/15 text-accent shrink-0">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-fg-muted">Центральная касса</p>
                  <p className="text-[11px] text-fg-subtle">Оплата накладной производится исключительно из центральной кассы</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-bold text-accent">
                  ${formatMoney(centralCashStore?.cashBalanceUsd)}
                </span>
                <p className="text-[10px] text-fg-subtle">Остаток в кассе</p>
              </div>
            </div>
          </div>

          {rateNumber > 0 && parsedAmount > 0 && (
            <div className="flex items-center justify-between text-[11px] px-1 text-fg-subtle">
              <span>Сумма к списанию (курс {rateNumber.toFixed(2)}):</span>
              <span className="font-semibold text-fg-muted">
                ≈ {formatMoney(parsedAmount * rateNumber)} TJS
              </span>
            </div>
          )}

          {parsedAmount > 0 && parsedAmount > cashBalance && (
            <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-[11px] text-danger">
              Внимание: в Центральной кассе недостаточно средств (Остаток: ${formatMoney(cashBalance)}, требуется: ${formatMoney(parsedAmount)}).
            </div>
          )}

          <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/30 text-[11px] text-accent">
            Оплата будет применена только к этой накладной, независимо от других долгов поставщика.
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleExecuteInvoicePayment}
            className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'Оплата…' : 'Оплатить'}
          </button>
        </div>
      </div>
    </div>
  );
};
