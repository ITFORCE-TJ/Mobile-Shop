import React from 'react';
import { User } from '../../types';
import { Trash2, Loader2 } from 'lucide-react';

interface DeleteEmployeeConfirmModalProps {
  user: User | null;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export const DeleteEmployeeConfirmModal: React.FC<DeleteEmployeeConfirmModalProps> = ({
  user,
  onClose,
  onConfirm,
  isSubmitting,
}) => {
  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-danger/40 p-5 shadow-2xl space-y-4 text-fg-muted">
        <div className="flex items-center space-x-3 text-danger border-b border-border pb-3">
          <div className="p-2 rounded-lg bg-danger/15 text-danger shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase text-fg-muted">УДАЛЕНИЕ СОТРУДНИКА</h3>
            <p className="text-[11px] text-fg-subtle mt-0.5">{user.name} ({user.login})</p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-bg border border-border text-xs space-y-2">
          <p className="text-fg-muted font-semibold">
            Вы действительно хотите навсегда удалить учетную запись сотрудника «<span className="text-danger">{user.name}</span>»?
          </p>
          <p className="text-[11px] text-fg-subtle">
            Логин для входа: <strong className="text-fg-muted">{user.login}</strong>
          </p>
        </div>

        <div className="flex space-x-2 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase transition-colors disabled:opacity-50"
          >
            ОТМЕНА
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-danger hover:opacity-90 active:opacity-80 text-xs font-bold uppercase text-white shadow-xs transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'УДАЛЕНИЕ…' : 'УДАЛИТЬ СОТРУДНИКА'}
          </button>
        </div>
      </div>
    </div>
  );
};
