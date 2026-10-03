import React from 'react';
import { Device } from '../../types';
import { formatTjs, formatUsd } from '../../utils/money';
import {
  Smartphone,
  ChevronRight,
  Sparkles,
  Warehouse,
  Store,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { approxTjs, getPhoneColorHex, STATUS_LABELS, STATUS_TONE } from './types';

export interface DeviceRowProps {
  device: Device;
  isAdmin?: boolean;
  storeName?: string;
  isMainWarehouse?: boolean;
  rate?: number;
  hideModelName?: boolean;
  onClick: () => void;
}

export const DeviceRow = React.forwardRef<HTMLButtonElement, DeviceRowProps>(
  ({ device, isAdmin, storeName, isMainWarehouse, rate, hideModelName, onClick }, ref) => {
    const isSpecialStatus = device.status !== 'STORE_STOCK' && device.status !== 'MAIN_WAREHOUSE';
    const showStatusBadge = isSpecialStatus || !storeName;
    const colorHex = getPhoneColorHex(device.color);
    const formattedRam = device.ram
      ? (device.ram.toUpperCase().includes('GB') ? device.ram : `${device.ram} GB`)
      : null;

    const storageStr = (device.storage || '').trim();
    const ramClean = (device.ram || '').trim().toUpperCase().replace(/GB/gi, '').trim();
    const isRamInStorage = Boolean(
      formattedRam && storageStr && (
        storageStr.toLowerCase().includes(formattedRam.toLowerCase()) ||
        (ramClean && (
          storageStr.toUpperCase().includes(`${ramClean} GB`) ||
          storageStr.toUpperCase().includes(`${ramClean}GB`) ||
          storageStr.toUpperCase().includes(`${ramClean}/`) ||
          storageStr.toUpperCase().includes(`/${ramClean}`) ||
          storageStr.toUpperCase().startsWith(`${ramClean} /`)
        ))
      )
    );
    const showRamBadge = Boolean(formattedRam && !isRamInStorage);

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className="group w-full text-left p-2.5 sm:p-3 rounded-xl bg-surface border border-border/80 hover:border-accent/40 active:bg-surface-raised flex items-center justify-between gap-3 transition-all hover:shadow-2xs cursor-pointer"
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          {/* Left: Device icon / visual anchor */}
          <div className="w-9 h-9 rounded-xl bg-surface-raised border border-border/80 flex items-center justify-center shrink-0 text-fg-subtle group-hover:text-accent group-hover:border-accent/30 group-hover:bg-accent/10 transition-colors shadow-2xs">
            <Smartphone className="w-4.5 h-4.5" />
          </div>

          <div className="min-w-0 flex-1">
            {/* Line 1: Model (if visible) + Specs (Storage, RAM, Color) */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {!hideModelName && (
                <span className="text-xs sm:text-sm font-extrabold text-fg truncate mr-1">
                  {device.brand} {device.model}
                </span>
              )}

              {device.storage && (
                <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-xs font-black font-mono text-fg shadow-2xs shrink-0">
                  {device.storage}
                </span>
              )}

              {showRamBadge && (
                <span className="px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent shrink-0">
                  ОЗУ {formattedRam}
                </span>
              )}

              {device.color && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-raised/60 border border-border/60 text-[11px] font-medium text-fg-muted shrink-0 max-w-36 truncate">
                  {colorHex && (
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: colorHex }}
                    />
                  )}
                  <span className="truncate">{device.color}</span>
                </span>
              )}

              {device.isBonus && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-accent/15 text-accent border border-accent/25 shrink-0">
                  <Sparkles className="w-3 h-3" />
                  Бонус
                </span>
              )}
            </div>

            {/* Line 2: Monospace IMEI + Location + Special Status */}
            <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] sm:text-[11px] bg-surface-raised/80 px-2 py-0.5 rounded-md border border-border/60 text-fg-muted">
                <span className="text-[9px] font-bold text-fg-subtle uppercase tracking-wider">IMEI</span>
                <span className="font-semibold text-fg tracking-wide">{device.imei}</span>
                {device.imei2 && <span className="opacity-60 text-[10px]">/{device.imei2}</span>}
              </span>

              {storeName && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                  isMainWarehouse
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/25'
                    : 'bg-accent/10 text-accent border-accent/25'
                }`}>
                  {isMainWarehouse ? <Warehouse className="w-3 h-3 shrink-0" /> : <Store className="w-3 h-3 shrink-0" />}
                  <span className="truncate max-w-36">{storeName}</span>
                </span>
              )}

              {showStatusBadge && (
                <Badge tone={STATUS_TONE[device.status] || 'neutral'}>
                  {STATUS_LABELS[device.status] || device.status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Right: Price & Chevron */}
        <div className="text-right shrink-0 flex items-center gap-2">
          {device.isBonus || (isAdmin && device.purchaseCostUsd === 0) ? (
            <span className="text-xs font-black text-accent font-mono px-2 py-0.5 rounded-lg bg-accent/10 border border-accent/20">
              Бонус ($0)
            </span>
          ) : isAdmin && device.purchaseCostUsd > 0 ? (
            <div className="text-right">
              <span className="text-xs sm:text-sm font-extrabold text-fg font-mono block leading-tight">
                {formatUsd(device.purchaseCostUsd)}
              </span>
              {approxTjs(device.purchaseCostUsd, rate) && (
                <span className="text-[10px] text-fg-subtle font-mono block leading-none mt-0.5 font-medium">
                  {approxTjs(device.purchaseCostUsd, rate)}
                </span>
              )}
            </div>
          ) : !isAdmin && (device.retailPriceTjs ?? 0) > 0 ? (
            <span className="text-xs sm:text-sm font-extrabold font-mono text-accent whitespace-nowrap">
              {formatTjs(device.retailPriceTjs)}
            </span>
          ) : null}

          <div className="w-6 h-6 rounded-lg bg-surface-raised flex items-center justify-center text-fg-subtle group-hover:text-accent group-hover:bg-accent/10 transition-colors">
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </button>
    );
  }
);
DeviceRow.displayName = 'DeviceRow';
