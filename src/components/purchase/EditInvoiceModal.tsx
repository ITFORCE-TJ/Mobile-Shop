import React, { useState, useEffect } from 'react';
import { SupplierInvoice } from '../../types';
import { Receipt, X, Hash, Calendar, DollarSign, Check, Loader2 } from 'lucide-react';

interface EditInvoiceModalProps {
  invoice: SupplierInvoice | null;
  onClose: () => void;
  onSave: (id: string, data: { invoiceNumber: string; date: string; totalAmountUsd: number }) => Promise<{ success: boolean; message?: string }>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({
  invoice,
  onClose,
  onSave,
  onSuccess,
  onError,
}) => {
  const [editInvoiceNum, setEditInvoiceNum] = useState('');
  const [editInvoiceDateStr, setEditInvoiceDateStr] = useState('');
  const [editInvoiceAmountUsd, setEditInvoiceAmountUsd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (invoice) {
      setEditInvoiceNum(invoice.invoiceNumber);
      setEditInvoiceDateStr(invoice.date ? invoice.date.split('T')[0] : '');
      setEditInvoiceAmountUsd((invoice.totalAmountUsd || 0).toString());
    }
  }, [invoice]);

  if (!invoice) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await onSave(invoice.id, {
        invoiceNumber: editInvoiceNum.trim(),
        date: editInvoiceDateStr,
        totalAmountUsd: parseFloat(editInvoiceAmountUsd) || 0,
      });
      if (res.success) {
        onSuccess('Накладная успешно обновлена!');
        onClose();
      } else {
        onError(res.message || 'Ошибка обновления накладной');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border/80 p-5 sm:p-6 text-fg-muted shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0 shadow-2xs">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-fg">
                Редактировать накладную
              </h3>
              <p className="text-[11px] text-fg-subtle">
                Изменение номера, даты и суммы закупки
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Context Card */}
        <div className="p-3 rounded-xl bg-surface-raised/60 border border-border/80 flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              Накладная
            </div>
            <div className="font-bold font-mono text-fg truncate">
              #{invoice.invoiceNumber}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              Устройств в партии
            </div>
            <div className="font-bold font-mono text-accent">
              {invoice.devicesCount || 0} шт.
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Invoice Number */}
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1.5 flex items-center justify-between">
              <span>Номер накладной</span>
              <span className="text-[10px] text-accent font-semibold font-mono">Обязательно</span>
            </label>
            <div className="relative">
              <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                <Hash className="w-4 h-4 text-accent" />
              </div>
              <input
                type="text"
                required
                value={editInvoiceNum}
                onChange={(e) => setEditInvoiceNum(e.target.value)}
                placeholder="Например, INV-0022"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-raised border border-border text-xs sm:text-sm font-bold font-mono text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
              />
            </div>
          </div>

          {/* Invoice Date */}
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1.5 flex items-center justify-between">
              <span>Дата накладной</span>
              <span className="text-[10px] text-fg-subtle font-mono">ГГГГ-ММ-ДД</span>
            </label>
            <div className="relative">
              <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                <Calendar className="w-4 h-4 text-accent" />
              </div>
              <input
                type="date"
                required
                value={editInvoiceDateStr}
                onChange={(e) => setEditInvoiceDateStr(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-raised border border-border text-xs sm:text-sm font-semibold text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
              />
            </div>
          </div>

          {/* Invoice Amount */}
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1.5 flex items-center justify-between">
              <span>Сумма накладной ($ USD)</span>
              <span className="text-[10px] text-fg-subtle font-mono">USD</span>
            </label>
            <div className="relative">
              <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                <DollarSign className="w-4 h-4 text-accent" />
              </div>
              <input
                type="number"
                step="0.01"
                required
                min="0"
                value={editInvoiceAmountUsd}
                onChange={(e) => setEditInvoiceAmountUsd(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-14 py-2.5 rounded-xl bg-surface-raised border border-border text-sm sm:text-base font-bold font-mono text-accent focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md bg-surface border border-border text-[10px] font-bold font-mono text-fg-subtle pointer-events-none">
                USD
              </div>
            </div>
          </div>

          {/* Actions Footer */}
          <div className="pt-2 flex items-center gap-2.5 border-t border-border/70">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted hover:text-fg transition-all cursor-pointer min-h-[40px] disabled:opacity-50 flex items-center justify-center"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg shadow-xs hover:shadow-md transition-all cursor-pointer min-h-[40px] disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Сохранение…</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Сохранить</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
