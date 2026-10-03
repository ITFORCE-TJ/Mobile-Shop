import React from 'react';
import { Device, Store as StoreType } from '../../types';
import { formatUsd } from '../../utils/money';
import { Smartphone, Sparkles, Warehouse, Store } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { useVirtualRows } from '../../hooks/useVirtualRows';
import { DeviceRow } from './DeviceRow';
import { approxTjs, STATUS_LABELS, STATUS_TONE } from './types';

interface FlatDevicesTableProps {
  isMobileLayout: boolean;
  filteredDevices: Device[];
  flatRows: ReturnType<typeof useVirtualRows<HTMLElement>>;
  stores: StoreType[];
  selectedLocationId: string;
  isAdmin: boolean;
  rate?: number;
  onSelectDevice: (device: Device) => void;
}

export const FlatDevicesTable: React.FC<FlatDevicesTableProps> = ({
  isMobileLayout,
  filteredDevices,
  flatRows,
  stores,
  selectedLocationId,
  isAdmin,
  rate,
  onSelectDevice,
}) => {
  if (isMobileLayout) {
    return (
      <div
        ref={flatRows.listRef as React.RefObject<HTMLDivElement | null>}
        className="p-2 sm:p-3 space-y-1.5"
      >
        {flatRows.padTop > 0 && <div aria-hidden="true" style={{ height: flatRows.padTop }} />}
        {filteredDevices.slice(flatRows.from, flatRows.to).map((dev, i) => {
          const index = flatRows.from + i;
          const store = stores.find(s => s.id === dev.locationId);
          const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
          const storeName = isWh ? 'Центральный склад' : dev.locationName || store?.name || 'Магазин';
          return (
            <DeviceRow
              key={dev.id}
              ref={flatRows.measure(index)}
              device={dev}
              isAdmin={isAdmin}
              storeName={selectedLocationId === 'ALL' ? storeName : undefined}
              isMainWarehouse={isWh}
              rate={rate}
              onClick={() => onSelectDevice(dev)}
            />
          );
        })}
        {flatRows.padBottom > 0 && <div aria-hidden="true" style={{ height: flatRows.padBottom }} />}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs" aria-rowcount={filteredDevices.length + 1}>
        <thead className="bg-surface text-[11px] text-fg-subtle border-b border-border sticky top-0 z-10 backdrop-blur-xs">
          <tr aria-rowindex={1}>
            <th className="p-3 w-12 text-center">#</th>
            <th className="p-3">Товар</th>
            <th className="p-3">Память / цвет</th>
            <th className="p-3">IMEI</th>
            <th className="p-3">Локация</th>
            {isAdmin && <th className="p-3 text-right">Себестоимость</th>}
            <th className="p-3">Статус</th>
            <th className="p-3 text-center">Действие</th>
          </tr>
        </thead>
        <tbody
          ref={flatRows.listRef as React.RefObject<HTMLTableSectionElement | null>}
          className="divide-y divide-border text-xs"
        >
          {flatRows.padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={isAdmin ? 8 : 7} style={{ height: flatRows.padTop, padding: 0 }} />
            </tr>
          )}
          {filteredDevices.slice(flatRows.from, flatRows.to).map((dev, i) => {
            const index = flatRows.from + i;
            const store = stores.find(s => s.id === dev.locationId);
            const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
            return (
              <tr
                key={dev.id}
                ref={flatRows.measure(index)}
                aria-rowindex={index + 2}
                onClick={() => onSelectDevice(dev)}
                className="hover:bg-surface-raised/70 active:bg-surface-raised cursor-pointer transition-colors"
              >
                <td className="p-3 text-center text-fg-subtle text-[11px] font-mono">
                  {index + 1}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-surface border border-border text-accent shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-fg-muted block text-xs truncate">
                        {dev.brand} {dev.model}
                      </span>
                      {dev.isBonus && (
                        <span className="text-[10px] text-accent font-semibold inline-flex items-center gap-0.5">
                          <Sparkles className="w-3 h-3" /> Бонус
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {dev.ram && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/15 text-accent border border-accent/30 font-mono">
                        {dev.ram.toUpperCase().includes('GB') ? dev.ram : `${dev.ram} GB`}
                      </span>
                    )}
                    <Badge tone="neutral">{dev.storage}</Badge>
                    <Badge tone="neutral">{dev.color}</Badge>
                  </div>
                </td>
                <td className="p-3">
                  <span className="font-mono text-xs font-semibold text-fg-muted block select-all">
                    {dev.imei}
                  </span>
                  {dev.imei2 && (
                    <span className="font-mono text-[10px] text-fg-subtle block select-all">
                      2: {dev.imei2}
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      isWh
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                        : 'bg-accent/10 text-accent border-accent/30'
                    }`}
                  >
                    {isWh ? (
                      <Warehouse className="w-3 h-3 text-amber-500 shrink-0" />
                    ) : (
                      <Store className="w-3 h-3 text-accent shrink-0" />
                    )}
                    <span>{isWh ? 'Центральный склад' : dev.locationName || store?.name || 'Магазин'}</span>
                  </span>
                </td>
                {isAdmin && (
                  <td className="p-3 text-right">
                    {dev.purchaseCostUsd === 0 || dev.isBonus ? (
                      <Badge tone="accent">Бонус</Badge>
                    ) : (
                      <div>
                        <span className="font-bold text-fg-muted block text-xs">
                          {formatUsd(dev.purchaseCostUsd)}
                        </span>
                        {approxTjs(dev.purchaseCostUsd, rate) && (
                          <span className="text-[10px] text-fg-subtle block">
                            {approxTjs(dev.purchaseCostUsd, rate)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                )}
                <td className="p-3">
                  <Badge tone={STATUS_TONE[dev.status]}>
                    {STATUS_LABELS[dev.status] || dev.status}
                  </Badge>
                </td>
                <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onSelectDevice(dev)}
                    className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-raised border border-border text-[11px] font-semibold text-fg-muted transition-colors cursor-pointer"
                  >
                    Инфо
                  </button>
                </td>
              </tr>
            );
          })}
          {flatRows.padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={isAdmin ? 8 : 7} style={{ height: flatRows.padBottom, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
