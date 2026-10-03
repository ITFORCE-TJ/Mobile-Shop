import React from 'react';
import { Supplier, Store } from '../../types';
import { PurchasePreviewData } from './types';
import { FileText, X, CheckCircle2, Loader2 } from 'lucide-react';

interface ReceiptPreviewModalProps {
  previewInvoice: PurchasePreviewData | null;
  suppliers: Supplier[];
  stores: Store[];
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export const ReceiptPreviewModal: React.FC<ReceiptPreviewModalProps> = ({
  previewInvoice,
  suppliers,
  stores,
  onClose,
  onConfirm,
  isSubmitting,
}) => {
  if (!previewInvoice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono">
      <div className="w-full max-w-lg rounded-2xl bg-surface border border-border shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-accent/15 text-accent border border-accent/30">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-fg-muted">Чек прихода — проверьте перед сохранением</h3>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="p-1 rounded text-fg-subtle hover:text-fg-muted disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto text-xs">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-raised border border-border">
            <div>
              <span className="block text-[10px] text-fg-subtle">Поставщик</span>
              <span className="font-bold text-fg-muted">{suppliers.find(s => s.id === previewInvoice.supplierId)?.name || '—'}</span>
            </div>
            <div>
              <span className="block text-[10px] text-fg-subtle">Накладная</span>
              <span className="font-bold text-fg-muted">{previewInvoice.invoiceNumber}</span>
            </div>
            <div>
              <span className="block text-[10px] text-fg-subtle">Дата</span>
              <span className="font-bold text-fg-muted">{previewInvoice.date}</span>
            </div>
            <div>
              <span className="block text-[10px] text-fg-subtle">Назначение</span>
              <span className="font-bold text-fg-muted">
                {previewInvoice.isStorePurchase
                  ? (stores.find(s => s.id === previewInvoice.storeId)?.name || 'Магазин')
                  : 'Главный склад'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {previewInvoice.groups.map((g, idx) => (
              <div key={idx} className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-fg-muted truncate">{g.brand} {g.model}</p>
                    {g.isBonus && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                        БОНУС (0$)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-fg-muted mt-0.5">{[g.ram, g.storage, g.color].filter(Boolean).join(' • ')}</p>
                  <p className="text-[10px] text-fg-subtle mt-0.5">
                    {g.items.length} шт. {g.isBonus ? '• Бесплатно (подарок)' : `× $${g.purchasePriceUsd}`}
                    {g.bonusCampaign ? ` • ${g.bonusCampaign}` : ''}
                  </p>
                </div>
                <span className="font-bold text-accent shrink-0">
                  {g.isBonus ? '$0' : `$${(g.items.length * g.purchasePriceUsd).toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border">
            <span className="text-fg-muted">
              Устройств: <strong className="text-fg-muted">{previewInvoice.groups.reduce((a, b) => a + b.items.length, 0)} шт.</strong>
            </span>
            <span className="text-sm font-bold text-accent">
              ${previewInvoice.groups.reduce((a, b) => a + b.items.length * b.purchasePriceUsd, 0).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex space-x-2 p-4 border-t border-border shrink-0">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg-muted font-bold disabled:opacity-50"
          >
            Изменить
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {isSubmitting ? 'СОХРАНЕНИЕ…' : 'ПОДТВЕРДИТЬ И СОХРАНИТЬ'}
          </button>
        </div>
      </div>
    </div>
  );
};
