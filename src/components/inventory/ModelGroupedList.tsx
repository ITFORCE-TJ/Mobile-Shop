import React from 'react';
import { Device, Store as StoreType } from '../../types';
import { Smartphone, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { DeviceRow } from './DeviceRow';
import { useGroupedDevices } from '../../hooks/useGroupedDevices';

type DeviceGroup = ReturnType<typeof useGroupedDevices>[number];

interface ModelGroupedListProps {
  groups: DeviceGroup[];
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  stores: StoreType[];
  selectedLocationId: string;
  isAdmin: boolean;
  rate?: number;
  onSelectDevice: (device: Device) => void;
}

export const ModelGroupedList: React.FC<ModelGroupedListProps> = ({
  groups,
  expandedGroups,
  onToggleGroup,
  stores,
  selectedLocationId,
  isAdmin,
  rate,
  onSelectDevice,
}) => {
  return (
    <div className="divide-y divide-border">
      {groups.map((group) => {
        const isExpanded = expandedGroups[group.key];
        const allDevices = group.storageGroups.flatMap(sg => sg.colorGroups.flatMap(cg => cg.devices));

        return (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => onToggleGroup(group.key)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2.5 active:bg-surface-raised transition-colors hover:bg-surface-raised/40 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs sm:text-sm font-extrabold text-fg truncate">
                    {group.brand} {group.model}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-accent/10 text-accent border border-accent/20">
                  {group.count} шт.
                </span>
                <div
                  className={`p-1 rounded-md text-fg-subtle transition-transform duration-200 ${
                    isExpanded ? 'rotate-180 text-accent' : ''
                  }`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="bg-surface/30 border-t border-border p-2 sm:p-3 space-y-2">
                {/* Specs bar when expanded */}
                {group.storageGroups.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-raised/60 border border-border/80 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-fg-subtle flex items-center gap-1 uppercase tracking-wider">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
                        Память:
                      </span>
                      {group.storageGroups.map((sg) => (
                        <span
                          key={sg.key}
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-surface border border-border text-fg font-mono shadow-2xs"
                        >
                          {sg.storage}
                          <span className="text-accent ml-1 font-bold">({sg.count} шт.)</span>
                        </span>
                      ))}
                    </div>
                    <div className="text-[11px] text-fg-subtle font-mono">
                      Всего: <strong className="text-fg font-bold">{group.count} шт.</strong>
                    </div>
                  </div>
                )}

                {allDevices.map((dev) => {
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
  );
};
