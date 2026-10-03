import React from 'react';
import { Send } from 'lucide-react';
import { cn } from '../../utils/cn';
import { TransferBottomBarProps } from './types';

export const TransferBottomBar: React.FC<TransferBottomBarProps> = ({
  selectedCount,
  fromStoreName,
  toStoreName,
  toLocationId,
  isStoreScoped,
  onOpenConfirmModal,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="absolute bottom-2.5 inset-x-2.5 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl z-30 pointer-events-none">
      <div className={cn(
        'pointer-events-auto p-2.5 sm:p-3 rounded-2xl bg-surface/95 border shadow-2xl flex items-center justify-between gap-2.5 backdrop-blur-md transition-all',
        !toLocationId ? 'border-warning/60 shadow-warning/5' : 'border-accent/40'
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-accent text-accent-fg flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
            {selectedCount}
          </div>
          <div className="min-w-0 truncate">
            <p className="text-xs font-bold text-fg truncate">
              Выбрано: {selectedCount} шт.
            </p>
            <p className="text-[11px] text-fg-muted truncate">
              {fromStoreName} →{' '}
              {toLocationId ? (
                <span className="font-semibold text-accent">{toStoreName}</span>
              ) : (
                <span className="font-bold text-warning underline decoration-warning/50">Укажите получателя</span>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenConfirmModal}
          className={cn(
            'h-9 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer',
            !toLocationId
              ? 'bg-warning hover:bg-warning/90 text-black'
              : 'bg-accent hover:bg-accent-strong text-accent-fg'
          )}
        >
          <span>{toLocationId ? (isStoreScoped ? 'Отправить' : 'Переместить') : 'Куда'}</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
