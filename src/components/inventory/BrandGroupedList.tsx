import React from 'react';
import { Device, Store as StoreType } from '../../types';
import { formatUsd } from '../../utils/money';
import { Sparkles, ChevronDown, Smartphone, SlidersHorizontal } from 'lucide-react';
import { DeviceRow } from './DeviceRow';
import { approxTjs, BrandGroupItem, getBrandBadgeStyle } from './types';

interface BrandGroupedListProps {
  brandGroups: BrandGroupItem[];
  expandedBrandKeys: Record<string, boolean>;
  onToggleBrandKey: (key: string) => void;
  onSetAllBrandKeys: (keys: Record<string, boolean>) => void;
  expandedModelKeys: Record<string, boolean>;
  onToggleModelKey: (key: string) => void;
  stores: StoreType[];
  selectedLocationId: string;
  activeStore: StoreType | null;
  isAdmin: boolean;
  rate?: number;
  totalFilteredDevicesCount: number;
  onSelectDevice: (device: Device) => void;
}

export const BrandGroupedList: React.FC<BrandGroupedListProps> = ({
  brandGroups,
  expandedBrandKeys,
  onToggleBrandKey,
  onSetAllBrandKeys,
  expandedModelKeys,
  onToggleModelKey,
  stores,
  selectedLocationId,
  activeStore,
  isAdmin,
  rate,
  totalFilteredDevicesCount,
  onSelectDevice,
}) => {
  const allExpanded = brandGroups.length > 0 && brandGroups.every(b => expandedBrandKeys[b.key]);

  const handleToggleAll = () => {
    const next: Record<string, boolean> = {};
    if (!allExpanded) {
      brandGroups.forEach(b => {
        next[b.key] = true;
      });
    }
    onSetAllBrandKeys(next);
  };

  return (
    <div className="divide-y divide-border">
      {/* Header controls: Expand/Collapse All */}
      <div className="py-1.5 px-3 sm:py-2 sm:px-4 bg-surface-raised/40 flex items-center justify-between gap-2 border-b border-border">
        <span className="text-xs font-semibold text-fg-subtle flex items-center gap-1.5 flex-wrap">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span>Брендов: <strong className="text-fg">{brandGroups.length}</strong></span>
          <span className="opacity-60">·</span>
          <span>Телефонов: <strong className="text-accent">{totalFilteredDevicesCount}</strong> шт.</span>
          {activeStore && (
            <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 text-[10px] font-bold">
              {activeStore.name}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={handleToggleAll}
          className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
        >
          <span className="sm:hidden">{allExpanded ? 'Свернуть' : 'Развернуть'}</span>
          <span className="hidden sm:inline">{allExpanded ? 'Свернуть все бренды' : 'Развернуть все бренды'}</span>
        </button>
      </div>

      {brandGroups.map((bGroup) => {
        const isBrandExpanded = !!expandedBrandKeys[bGroup.key];
        const brandBadgeStyle = getBrandBadgeStyle(bGroup.brand);

        return (
          <div key={bGroup.key} className="transition-colors">
            {/* Brand Row Button */}
            <div
              onClick={() => onToggleBrandKey(bGroup.key)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 active:bg-surface-raised transition-colors hover:bg-surface-raised/40 cursor-pointer select-none"
            >
              {/* Left: Brand name, badge, and model count */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 font-black text-xs tracking-wider shadow-2xs ${brandBadgeStyle.bg} ${brandBadgeStyle.border}`}
                >
                  <span className={brandBadgeStyle.text}>{bGroup.brand.substring(0, 2).toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-extrabold text-fg truncate">
                      {bGroup.brand}
                    </h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-raised text-fg-subtle border border-border">
                      {bGroup.distinctModelsCount}{' '}
                      {bGroup.distinctModelsCount === 1
                        ? 'модель'
                        : bGroup.distinctModelsCount < 5
                        ? 'модели'
                        : 'моделей'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Phone count & financial value */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="text-right">
                  <div className="flex items-baseline justify-end gap-1">
                    <span className="text-sm sm:text-base font-black text-accent font-mono">
                      {bGroup.totalCount}
                    </span>
                    <span className="text-xs text-fg-subtle font-medium">
                      {bGroup.totalCount === 1 ? 'телефон' : bGroup.totalCount < 5 ? 'телефона' : 'телефонов'}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="text-[11px] text-fg-subtle font-mono mt-0.5">
                      <span className="font-bold text-fg-muted">{formatUsd(bGroup.totalValueUsd)}</span>
                      {approxTjs(bGroup.totalValueUsd, rate) && (
                        <span className="hidden sm:inline"> · {approxTjs(bGroup.totalValueUsd, rate)}</span>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className={`w-7 h-7 rounded-xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle transition-transform duration-200 ${
                    isBrandExpanded ? 'rotate-180 text-accent border-accent/40' : ''
                  }`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Brand Models Accordion Body */}
            {isBrandExpanded && (
              <div className="bg-surface/30 border-t border-border px-2 sm:px-3 py-2 space-y-1.5">
                {bGroup.modelGroups.map((mGroup) => {
                  const isModelExpanded = !!expandedModelKeys[mGroup.key];
                  return (
                    <div key={mGroup.key} className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleModelKey(mGroup.key)}
                        className="w-full py-2.5 px-3 rounded-xl flex items-center justify-between gap-3 bg-surface-raised/50 hover:bg-surface-raised active:bg-surface-raised border border-border/70 hover:border-border transition-colors text-left cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent">
                              <Smartphone className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs sm:text-sm font-extrabold text-fg truncate">
                              {mGroup.model}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-accent/10 text-accent border border-accent/20">
                              {mGroup.count} шт.
                            </span>
                            {isAdmin && (
                              <span className="block text-[10px] text-fg-subtle font-mono leading-none mt-0.5 font-medium">
                                {formatUsd(mGroup.valueUsd)}
                              </span>
                            )}
                          </div>
                          <div
                            className={`p-1 rounded-md text-fg-subtle transition-transform duration-200 ${
                              isModelExpanded ? 'rotate-180 text-accent' : ''
                            }`}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </button>

                      {/* Specific Devices List for this Model */}
                      {isModelExpanded && (
                        <div className="space-y-2 pl-2 sm:pl-3 my-1">
                          {/* Model Specifications Header */}
                          {(mGroup.ramList.length > 0 || mGroup.storageList.length > 0) && (
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-raised/60 border border-border/80 text-xs">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-bold text-fg-subtle flex items-center gap-1 uppercase tracking-wider">
                                  <SlidersHorizontal className="w-3 h-3 text-accent" />
                                  Спецификации:
                                </span>

                                {/* RAM configs */}
                                {mGroup.ramList.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-fg-subtle font-medium">ОЗУ:</span>
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-accent/10 text-accent border border-accent/25 font-mono">
                                      {mGroup.ramList.map(r => r.toUpperCase().includes('GB') ? r : `${r} GB`).join(' / ')}
                                    </span>
                                  </div>
                                )}

                                {/* Storage configs */}
                                {mGroup.storageList.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] text-fg-subtle font-medium">Память:</span>
                                    {mGroup.storageList.map((sg) => (
                                      <span
                                        key={sg.storage}
                                        className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-surface border border-border text-fg font-mono shadow-2xs"
                                      >
                                        {sg.storage}
                                        <span className="text-accent ml-1 font-bold">({sg.count} шт.)</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="text-[11px] text-fg-subtle font-mono ml-auto">
                                Всего: <strong className="text-fg font-bold">{mGroup.count} шт.</strong>
                              </div>
                            </div>
                          )}

                          {mGroup.devices.map((dev) => {
                            const store = stores.find(s => s.id === dev.locationId);
                            const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
                            const storeName = isWh ? 'Центральный склад' : dev.locationName || store?.name || 'Магазин';
                            return (
                              <DeviceRow
                                key={dev.id}
                                device={dev}
                                isAdmin={isAdmin}
                                storeName={selectedLocationId === 'ALL' ? storeName : undefined}
                                isMainWarehouse={isWh}
                                rate={rate}
                                hideModelName
                                onClick={() => onSelectDevice(dev)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
