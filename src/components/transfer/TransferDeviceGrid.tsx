import React from 'react';
import {
  Search,
  X,
  Scan,
  Check,
  ArrowLeftRight
} from 'lucide-react';
import { formatMoney } from '../../utils/money';
import { LoadingState } from '../ui/Skeleton';
import { cn } from '../../utils/cn';
import { TransferDeviceGridProps } from './types';

export const TransferDeviceGrid: React.FC<TransferDeviceGridProps> = ({
  availableDevices,
  selectedDeviceIds,
  searchQuery,
  setSearchQuery,
  onToggleSelectDevice,
  onSelectAllFiltered,
  onClearSelection,
  onDeviceCode,
  onScanDevice,
  isInitialLoading,
  fromStoreName,
}) => {
  return (
    <>
      {/* Device search & actions bar */}
      <div className="p-2 sm:p-2.5 bg-surface border-b border-border shrink-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
          <input
            type="text"
            value={searchQuery ?? ''}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onDeviceCode(searchQuery, 'enter');
              }
            }}
            enterKeyHint="search"
            placeholder="Поиск устройства в этой точке (модель, IMEI)..."
            className="w-full h-9 rounded-xl bg-surface-raised border border-border pl-8 pr-8 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
              title="Очистить"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onScanDevice}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-accent hover:text-accent-strong p-0.5 transition-colors cursor-pointer"
              title="Сканировать IMEI или штрихкод"
            >
              <Scan className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Devices Toolbar */}
      <div className="flex items-center justify-between text-xs px-2.5 sm:px-3 py-1.5 border-b border-border/60 bg-surface/50 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-fg-muted text-[11px]">Доступные товары</span>
          <span className="px-1.5 py-0.2 rounded-full bg-surface-raised border border-border/80 text-[10px] font-bold text-fg-subtle">
            {availableDevices.length}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {availableDevices.length > 0 && (
            <button
              type="button"
              onClick={onSelectAllFiltered}
              className="text-[11px] text-accent hover:underline font-bold cursor-pointer"
            >
              Выбрать все
            </button>
          )}
          {selectedDeviceIds.length > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[11px] text-fg-subtle hover:text-danger hover:underline cursor-pointer"
            >
              Сбросить ({selectedDeviceIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Devices Checklist */}
      <div className="flex-1 overflow-y-auto bg-bg p-2 sm:p-2.5 space-y-2 pb-24 flex flex-col">
        {isInitialLoading ? (
          <LoadingState label="Загрузка устройств…" />
        ) : availableDevices.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto min-h-[260px]">
            <div className="w-13 h-13 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 shadow-xs">
              <ArrowLeftRight className="w-6 h-6" />
            </div>

            <h3 className="text-sm sm:text-base font-bold text-fg">
              {searchQuery ? 'Устройства не найдены' : 'Нет доступных устройств'}
            </h3>

            <p className="text-xs text-fg-subtle mt-1.5 max-w-xs leading-relaxed">
              {searchQuery
                ? `По запросу «${searchQuery}» устройства не найдены в этой точке.`
                : `В локации «${fromStoreName}» сейчас нет товаров на балансе для перемещения.`}
            </p>

            <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="h-8.5 px-3.5 rounded-xl bg-surface-raised border border-border text-fg text-xs font-semibold hover:border-accent hover:text-accent transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Сбросить поиск</span>
                </button>
              )}
              <button
                type="button"
                onClick={onScanDevice}
                className="h-8.5 px-3.5 rounded-xl bg-surface-raised border border-border text-accent text-xs font-semibold hover:border-accent hover:bg-accent/10 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Сканировать IMEI</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
            {availableDevices.map((dev) => {
              const isChecked = selectedDeviceIds.includes(dev.id);

              return (
                <button
                  type="button"
                  key={dev.id}
                  onClick={() => onToggleSelectDevice(dev.id)}
                  aria-pressed={isChecked}
                  className={cn(
                    'w-full text-left p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2.5 cursor-pointer transition-all shadow-2xs',
                    isChecked
                      ? 'bg-accent/10 border-accent/40 shadow-xs'
                      : 'bg-surface hover:bg-surface-raised/70 border-border/80'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      aria-hidden="true"
                      className={cn(
                        'w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors',
                        isChecked
                          ? 'bg-accent border-accent text-accent-fg'
                          : 'border-border bg-surface-raised'
                      )}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5 stroke-3" />}
                    </div>

                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-fg truncate">
                        {dev.brand} {dev.model}
                      </span>
                      <span className="block text-[11px] text-fg-muted truncate">
                        {dev.ram ? `${dev.ram} • ` : ''}{dev.storage} • {dev.color}
                      </span>
                      <span className="block text-[10px] text-fg-subtle font-mono truncate">
                        IMEI: {dev.imei}
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-accent font-mono shrink-0">
                    {(dev.retailPriceTjs ?? 0) > 0 ? `${formatMoney(dev.retailPriceTjs)} TJS` : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
