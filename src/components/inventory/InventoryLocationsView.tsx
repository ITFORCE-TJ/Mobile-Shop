import React, { useState } from 'react';
import { Device, Store as StoreType } from '../../types';
import { decimal, formatUsd, moneyNumber } from '../../utils/money';
import {
  Building2,
  Warehouse,
  Store,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import { approxTjs, IN_STOCK_STATUSES } from './types';

interface InventoryLocationsViewProps {
  devices: Device[];
  mainWarehouse?: StoreType;
  retailStores: StoreType[];
  storeStats: Map<string, { unitCount: number; valueUsd: number }>;
  selectedLocationId: string;
  isAdmin: boolean;
  rate?: number;
  onSelectLocationAndSwitch: (storeId: string) => void;
}

export const InventoryLocationsView: React.FC<InventoryLocationsViewProps> = ({
  devices,
  mainWarehouse,
  retailStores,
  storeStats,
  selectedLocationId,
  isAdmin,
  rate,
  onSelectLocationAndSwitch,
}) => {
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);

  const renderLocationExpandedDetails = (targetStore: StoreType) => {
    const locDevices = devices.filter(
      d => d.locationId === targetStore.id && IN_STOCK_STATUSES.includes(d.status)
    );

    const stat = storeStats.get(targetStore.id) || { unitCount: locDevices.length, valueUsd: 0 };

    // Group by Brand & Model
    const modelMap = new Map<
      string,
      { brand: string; model: string; count: number; valueUsd: number; storages: { storage: string; count: number }[] }
    >();
    locDevices.forEach(d => {
      const key = `${d.brand} ${d.model}`.trim();
      const existing = modelMap.get(key);
      const storageStr = (d.storage || '').trim();
      if (existing) {
        existing.count++;
        existing.valueUsd = moneyNumber(decimal(existing.valueUsd).plus(d.purchaseCostUsd || 0));
        if (storageStr) {
          const sEntry = existing.storages.find(s => s.storage === storageStr);
          if (sEntry) sEntry.count++;
          else existing.storages.push({ storage: storageStr, count: 1 });
        }
      } else {
        modelMap.set(key, {
          brand: d.brand,
          model: d.model,
          count: 1,
          valueUsd: d.purchaseCostUsd || 0,
          storages: storageStr ? [{ storage: storageStr, count: 1 }] : [],
        });
      }
    });

    const modelsList = Array.from(modelMap.values()).sort((a, b) => b.count - a.count);

    return (
      <div className="p-3.5 sm:p-4 border-t border-border bg-surface-raised/40 space-y-3 animate-in fade-in-50 duration-200">
        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-surface border border-border">
            <span className="text-[10px] text-fg-subtle uppercase font-semibold block">В наличии</span>
            <span className="font-bold text-fg text-sm sm:text-base mt-0.5 block">{stat.unitCount} шт.</span>
          </div>
          {isAdmin && (
            <div className="p-2.5 rounded-xl bg-surface border border-border">
              <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Себестоимость</span>
              <span className="font-bold text-fg text-sm sm:text-base mt-0.5 block">{formatUsd(stat.valueUsd)}</span>
              {approxTjs(stat.valueUsd, rate) && (
                <span className="text-[10px] text-fg-subtle block">{approxTjs(stat.valueUsd, rate)}</span>
              )}
            </div>
          )}
          <div className="p-2.5 rounded-xl bg-surface border border-border">
            <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Моделей в наличии</span>
            <span className="font-bold text-fg text-sm sm:text-base mt-0.5 block">{modelsList.length}</span>
          </div>
          {!targetStore.isMainWarehouse && (
            <div className="p-2.5 rounded-xl bg-surface border border-border">
              <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Касса точки</span>
              <span className="font-bold text-accent text-sm sm:text-base mt-0.5 block">
                {formatUsd(targetStore.cashBalanceUsd)}
              </span>
            </div>
          )}
        </div>

        {/* Models in stock */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-xs font-semibold text-fg-subtle">
              Модели в наличии: {modelsList.length}
            </span>
          </div>

          {modelsList.length === 0 ? (
            <div className="p-4 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-fg-subtle">
              Здесь сейчас нет телефонов в наличии
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface overflow-hidden max-h-56 overflow-y-auto divide-y divide-border">
              {modelsList.map(m => (
                <div
                  key={`${m.brand}_${m.model}`}
                  className="px-3 py-2 flex items-center justify-between text-xs gap-2 hover:bg-surface-raised/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-fg truncate block">
                      {m.brand} {m.model}
                    </span>
                    {m.storages.length > 0 && (
                      <span className="text-[10px] text-fg-subtle block">
                        {m.storages.map(s => `${s.storage} (${s.count} шт.)`).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-fg block text-xs">{m.count} шт.</span>
                    {isAdmin && (
                      <span className="text-[10px] text-fg-subtle block">{formatUsd(m.valueUsd)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => onSelectLocationAndSwitch(targetStore.id)}
            className="px-3 py-1.5 rounded-lg bg-accent text-accent-fg hover:bg-accent-strong font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <span>Показать в списке ({stat.unitCount} шт.)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const totalInStock = devices.filter(d => IN_STOCK_STATUSES.includes(d.status)).length;

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <span className="text-sm font-bold text-fg-muted flex items-center gap-2">
          <Building2 className="w-4 h-4 text-accent" />
          <span>Склад и магазины</span>
        </span>
        <span className="text-xs text-fg-subtle">
          Всего в компании: <strong>{totalInStock}</strong> шт.
        </span>
      </div>

      {/* Central Warehouse Block */}
      {mainWarehouse && (() => {
        const stat = storeStats.get(mainWarehouse.id) || { unitCount: 0, valueUsd: 0 };
        const isSelected = selectedLocationId === mainWarehouse.id;
        const isExpanded = expandedLocationId === mainWarehouse.id;
        return (
          <div
            className={`rounded-xl border overflow-hidden transition-all ${
              isSelected
                ? 'bg-amber-500/10 border-amber-500'
                : 'bg-surface border-amber-500/30 hover:border-amber-500/60'
            }`}
          >
            <div
              onClick={() => setExpandedLocationId(isExpanded ? null : mainWarehouse.id)}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
            >
              <div className="flex items-start space-x-3">
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 shrink-0">
                  <Warehouse className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-fg-muted">Центральный склад ({mainWarehouse.name})</h4>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <div className="text-right mr-1">
                  <span className="text-sm font-bold text-amber-400 block">{stat.unitCount} шт.</span>
                  {isAdmin && (
                    <span className="text-[11px] text-fg-subtle block">
                      {formatUsd(stat.valueUsd)}
                      {approxTjs(stat.valueUsd, rate) ? ` · ${approxTjs(stat.valueUsd, rate)}` : ''}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedLocationId(isExpanded ? null : mainWarehouse.id);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{isExpanded ? 'Свернуть' : 'Детали склада'}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLocationAndSwitch(mainWarehouse.id);
                  }}
                  className="p-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition-colors cursor-pointer shadow-xs"
                  title="Открыть товары склада в общем списке"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Expanded Detail Panel */}
            {isExpanded && renderLocationExpandedDetails(mainWarehouse)}
          </div>
        );
      })()}

      {/* Retail Stores List */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between text-xs text-fg-subtle px-1">
          <span className="font-bold text-fg-muted flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-accent" />
            <span>Магазины ({retailStores.length})</span>
          </span>
        </div>

        {retailStores.length === 0 ? (
          <div className="p-8 text-center text-fg-subtle text-xs border border-dashed border-border rounded-xl">
            Нет добавленных магазинов. Добавьте магазин в настройках.
          </div>
        ) : (
          <div className="space-y-2">
            {retailStores.map(store => {
              const stat = storeStats.get(store.id) || { unitCount: 0, valueUsd: 0 };
              const isSelected = selectedLocationId === store.id;
              const isExpanded = expandedLocationId === store.id;
              return (
                <div
                  key={store.id}
                  className={`rounded-xl border overflow-hidden transition-all ${
                    isSelected
                      ? 'bg-accent/10 border-accent/40'
                      : 'bg-surface border-border hover:border-fg-subtle/40'
                  }`}
                >
                  <div
                    onClick={() => setExpandedLocationId(isExpanded ? null : store.id)}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="p-2 rounded-xl bg-accent/10 border border-accent/25 text-accent shrink-0">
                        <Store className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-xs sm:text-sm text-fg-muted truncate">
                            {store.name}
                          </h5>
                        </div>
                        <p className="text-[11px] text-fg-subtle truncate">
                          Касса: {formatUsd(store.cashBalanceUsd)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <div className="text-right mr-1">
                        <span className="text-xs sm:text-sm font-bold text-fg-muted block">
                          {stat.unitCount} шт.
                        </span>
                        {isAdmin && (
                          <span className="text-[11px] text-fg-subtle block">
                            {formatUsd(stat.valueUsd)}
                            {approxTjs(stat.valueUsd, rate) ? ` · ${approxTjs(stat.valueUsd, rate)}` : ''}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedLocationId(isExpanded ? null : store.id);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{isExpanded ? 'Свернуть' : 'Детали товаров'}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLocationAndSwitch(store.id);
                        }}
                        className="p-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 font-bold text-xs transition-colors cursor-pointer"
                        title="Открыть товары магазина в общем списке"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && renderLocationExpandedDetails(store)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
