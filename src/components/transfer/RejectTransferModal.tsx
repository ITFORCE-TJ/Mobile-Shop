import React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { RejectTransferModalProps } from './types';

export const RejectTransferModal: React.FC<RejectTransferModalProps> = ({
  rejectTarget,
  onClose,
  rejectReason,
  setRejectReason,
  processingTransferId,
  onReject,
}) => {
  return (
    <Dialog
      open={rejectTarget !== null}
      onClose={() => { if (!processingTransferId) onClose(); }}
      title="Отклонить перемещение?"
      subtitle="Устройства останутся на складе отправителя"
      maxWidth="sm"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <button
            type="button"
            onClick={() => { if (!processingTransferId) onClose(); }}
            disabled={Boolean(processingTransferId)}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-colors cursor-pointer min-h-[38px]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => { if (rejectTarget) void onReject(rejectTarget.id); }}
            disabled={Boolean(processingTransferId)}
            className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-danger hover:bg-danger/90 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer min-h-[38px] disabled:opacity-50"
          >
            {processingTransferId ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Отклонение...</span>
              </>
            ) : (
              <span>Отклонить</span>
            )}
          </button>
        </div>
      }
    >
      {rejectTarget && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-xs space-y-1">
            <div className="flex items-center justify-between font-bold text-fg">
              <span>{rejectTarget.fromLocationName} → {rejectTarget.toLocationName}</span>
              <span className="text-danger font-mono font-black">{(rejectTarget.deviceIds || []).length} шт.</span>
            </div>
            <p className="text-[11px] text-fg-subtle">
              Заявка будет отменена. Товары останутся на балансе исходного склада.
            </p>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-fg-subtle mb-1.5">Причина отклонения (необязательно)</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Например: повреждена упаковка или не доехал курьер..."
              className="w-full rounded-xl bg-surface-raised border border-border p-3 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent resize-none transition-colors"
            />
          </label>
        </div>
      )}
    </Dialog>
  );
};
