import React from 'react';
import { SupplierInvoice } from '../../types';
import { AlertCircle, Loader2 } from 'lucide-react';

interface DeleteSupplierInvoiceModalProps {
  invoice: SupplierInvoice | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
}

export const DeleteSupplierInvoiceModal: React.FC<DeleteSupplierInvoiceModalProps> = ({
  invoice,
  onClose,
  onConfirm,
  isSubmitting,
}) => {
  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-danger/40 p-5 shadow-2xl text-fg-muted space-y-4">
        <div className="flex items-center space-x-3 text-danger">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <h3 className="text-sm font-bold text-fg-muted">Удаление накладной</h3>
        </div>
        <p className="text-xs text-fg-muted leading-relaxed">
          Вы действительно хотите удалить накладную <strong className="text-fg-muted">#{invoice.invoiceNumber}</strong>? Все привязанные к этой накладной устройства и расчеты будут удалены из системы.
        </p>
        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="px-4 py-2.5 rounded-xl bg-danger hover:opacity-90 text-xs font-bold text-white uppercase shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'Удаление…' : 'Удалить накладную'}
          </button>
        </div>
      </div>
    </div>
  );
};
