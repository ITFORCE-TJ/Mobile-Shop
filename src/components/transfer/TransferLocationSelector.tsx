import React from 'react';
import { Store as StoreIcon, Warehouse } from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';
import { cn } from '../../utils/cn';
import { TransferLocationSelectorProps } from './types';

export const TransferLocationSelector: React.FC<TransferLocationSelectorProps> = ({
  stores,
  mainWarehouse,
  isStoreScoped,
  sellerStoreName,
  fromLocationId,
  toLocationId,
  onOriginChange,
  onDestinationChange,
}) => {
  return (
    <div className="p-2 sm:p-2.5 border-b border-border bg-surface shrink-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {/* Откуда */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-fg-subtle flex items-center gap-1">
              <StoreIcon className="w-3 h-3 text-accent" />
              Откуда (Отправитель):
            </span>
          </div>
          {isStoreScoped ? (
            <div className="h-8.5 px-2.5 rounded-lg bg-surface-raised border border-border text-fg font-semibold text-xs flex items-center gap-2 truncate">
              <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">{formatStoreName(sellerStoreName)}</span>
            </div>
          ) : (
            <select
              value={fromLocationId ?? ''}
              onChange={(e) => onOriginChange(e.target.value)}
              className="w-full h-8.5 rounded-lg bg-surface-raised border border-border px-2.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none cursor-pointer truncate"
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>
                  {s.isMainWarehouse ? `Центральный склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Куда */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-fg-subtle flex items-center gap-1">
              <Warehouse className="w-3 h-3 text-accent" />
              Куда (Получатель):
            </span>
            {!isStoreScoped && !toLocationId && (
              <span className="text-[10px] text-warning font-medium">выберите склад</span>
            )}
          </div>
          {isStoreScoped ? (
            <div className="h-8.5 px-2.5 rounded-lg bg-surface-raised border border-border text-fg font-semibold text-xs flex items-center gap-2 truncate">
              <Warehouse className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">
                {mainWarehouse
                  ? (mainWarehouse.isMainWarehouse && !mainWarehouse.name.toLowerCase().includes('центральн')
                      ? `Центральный склад (${formatStoreName(mainWarehouse.name)})`
                      : formatStoreName(mainWarehouse.name))
                  : 'Центральный склад'}
              </span>
            </div>
          ) : (
            <select
              value={toLocationId ?? ''}
              onChange={(e) => onDestinationChange(e.target.value)}
              className={cn(
                'w-full h-8.5 rounded-lg bg-surface-raised border px-2.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none transition-colors cursor-pointer truncate',
                !toLocationId ? 'border-warning/60 text-warning font-normal' : 'border-border'
              )}
            >
              <option value="">-- Выберите получателя --</option>
              {stores.filter(s => s.id !== fromLocationId).map(s => (
                <option key={s.id} value={s.id}>
                  {s.isMainWarehouse ? `Центральный склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
};
