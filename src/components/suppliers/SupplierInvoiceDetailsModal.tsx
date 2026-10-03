import React, { useState } from 'react';
import { Supplier, SupplierInvoice, Device } from '../../types';
import { formatMoney } from '../../utils/money';
import { formatDateStr } from './types';
import { getPhoneColorHex, formatRam, formatStorage } from '../../utils/phoneSpecs';
import {
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  X,
  DollarSign,
  Package,
  Smartphone,
  Sparkles,
  MapPin,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';

interface SupplierInvoiceDetailsModalProps {
  invoice: SupplierInvoice | null;
  suppliers: Supplier[];
  devices: Device[];
  onClose: () => void;
  onOpenPay: (invoice: SupplierInvoice) => void;
}

export const SupplierInvoiceDetailsModal: React.FC<SupplierInvoiceDetailsModalProps> = ({
  invoice,
  suppliers,
  devices,
  onClose,
  onOpenPay,
}) => {
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [expandedDeviceGroups, setExpandedDeviceGroups] = useState<Record<string, boolean>>({});

  if (!invoice) return null;

  const handleCopyText = (text: string) => {
    if (!text || text === '—') return;
    navigator.clipboard?.writeText(text);
    setCopiedImei(text);
    setTimeout(() => {
      setCopiedImei(prev => (prev === text ? null : prev));
    }, 2000);
  };

  const supplier = suppliers.find(s => s.id === invoice.supplierId);

  const containedDevices = devices.filter(d =>
    d.purchaseInvoiceId === invoice.id ||
    d.invoiceNumber === invoice.invoiceNumber
  );

  const renderDeviceRow = (dev: Device, idx: number) => {
    const colorHex = getPhoneColorHex(dev.color);
    const formattedR = formatRam(dev.ram);
    const formattedS = formatStorage(dev.storage);

    return (
      <div
        key={dev.id}
        className="p-2.5 sm:p-3 rounded-xl bg-surface border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs hover:border-accent/40 transition-colors shadow-2xs"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-fg-subtle text-[10px] font-bold font-mono">#{idx + 1}</span>
            <strong className="text-fg font-bold text-xs">{dev.brand} {dev.model}</strong>
            {formattedS && (
              <span className="px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-[10px] font-bold font-mono text-fg">
                {formattedS}
              </span>
            )}
            {formattedR && (
              <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent">
                ОЗУ {formattedR}
              </span>
            )}
            {dev.color && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/60 text-[10px] text-fg-muted">
                {colorHex && (
                  <span
                    className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                    style={{ backgroundColor: colorHex }}
                  />
                )}
                <span>{dev.color}</span>
              </span>
            )}
            {(dev.purchaseCostUsd === 0 || dev.isBonus) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-highlight/20 text-highlight border border-highlight/40 font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Подарок ($0)
              </span>
            )}
          </div>

          {/* IMEI & Location Info */}
          <div className="text-[11px] text-fg-subtle mt-1.5 flex flex-wrap items-center gap-2">
            {/* IMEI with copy */}
            <button
              type="button"
              onClick={() => handleCopyText(dev.imei)}
              title="Скопировать IMEI"
              className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-raised border border-border/80 hover:border-accent/50 text-[10px] font-mono text-fg-muted hover:text-fg transition-all cursor-pointer"
            >
              <span className="text-[9px] text-fg-subtle font-sans">IMEI:</span>
              <span className="font-bold text-fg">{dev.imei}</span>
              {copiedImei === dev.imei ? (
                <span className="text-accent flex items-center gap-0.5 text-[9px] font-sans font-bold">
                  <Check className="w-2.5 h-2.5" />
                  <span>Скопировано</span>
                </span>
              ) : (
                <Copy className="w-2.5 h-2.5 text-fg-subtle group-hover:text-accent transition-colors opacity-70 group-hover:opacity-100" />
              )}
            </button>

            {dev.imei2 && (
              <button
                type="button"
                onClick={() => handleCopyText(dev.imei2!)}
                title="Скопировать IMEI 2"
                className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-raised border border-border/80 hover:border-accent/50 text-[10px] font-mono text-fg-muted hover:text-fg transition-all cursor-pointer"
              >
                <span className="text-[9px] text-fg-subtle font-sans">IMEI 2:</span>
                <span className="font-bold text-fg">{dev.imei2}</span>
                {copiedImei === dev.imei2 ? (
                  <span className="text-accent flex items-center gap-0.5 text-[9px] font-sans font-bold">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                ) : (
                  <Copy className="w-2.5 h-2.5 text-fg-subtle group-hover:text-accent transition-colors opacity-70 group-hover:opacity-100" />
                )}
              </button>
            )}

            <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle bg-surface-raised px-2 py-0.5 rounded-md border border-border/60">
              <MapPin className="w-2.5 h-2.5 text-accent" />
              <span>{dev.locationName}</span>
            </span>
          </div>

          {dev.bonusCampaign && (
            <p className="text-[10px] text-highlight mt-1 font-medium">
              {dev.bonusCampaign}
            </p>
          )}
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/50">
          <span className={`text-xs font-bold font-mono ${dev.purchaseCostUsd === 0 ? 'text-highlight' : 'text-accent'}`}>
            {dev.purchaseCostUsd === 0 ? '$0 (Подарок)' : `$${formatMoney(dev.purchaseCostUsd)}`}
          </span>
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${
            dev.status === 'SOLD'
              ? 'bg-warning/15 text-warning border-warning/30'
              : 'bg-accent/15 text-accent border-accent/30'
          }`}>
            {dev.status === 'SOLD' ? 'Продан' : 'На складе'}
          </span>
        </div>
      </div>
    );
  };

  const hasGroups = Array.isArray(invoice.groups) && invoice.groups.length > 0;
  const variantGroups = new Map<string, { brand: string; model: string; ram?: string; storage: string; color: string; devices: typeof containedDevices }>();
  if (hasGroups) {
    for (const dev of containedDevices) {
      const key = `${dev.brand}|${dev.model}|${dev.ram || ''}|${dev.storage}|${dev.color}`;
      let g = variantGroups.get(key);
      if (!g) {
        g = { brand: dev.brand, model: dev.model, ram: dev.ram, storage: dev.storage, color: dev.color, devices: [] };
        variantGroups.set(key, g);
      }
      g.devices.push(dev);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-3xl rounded-2xl bg-surface border border-border/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border/70 bg-surface flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0 shadow-2xs">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-fg flex items-center gap-2">
                  <span>Накладная #{invoice.invoiceNumber}</span>
                </h3>
                {(invoice.totalAmountUsd === 0 || invoice.invoiceNumber.includes('BONUS')) ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-highlight/20 text-highlight border border-highlight/40 font-bold">
                    🎯 Target Bonus ($0)
                  </span>
                ) : invoice.remainingAmountUsd === 0 ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Оплачена
                  </span>
                ) : invoice.paidAmountUsd > 0 ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30 font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Частично
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Не оплачена
                  </span>
                )}
              </div>
              <p className="text-xs text-fg-subtle mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>Поставщик: <strong className="text-fg font-semibold">{supplier?.name || 'Поставщик'}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-fg-subtle" />
                  {formatDateStr(invoice.date)}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-surface-raised hover:bg-surface text-fg-subtle hover:text-fg border border-border transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Financial Breakdown Cards */}
        <div className="p-3.5 sm:p-4 bg-surface-raised/40 border-b border-border/70 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
          {/* Total Card */}
          <div className="p-3 rounded-xl bg-surface border border-border/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                Сумма накладной
              </span>
              <strong className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${invoice.totalAmountUsd === 0 ? "text-highlight" : "text-fg"}`}>
                {invoice.totalAmountUsd === 0 ? '$0.00 (БОНУС)' : `$${formatMoney(invoice.totalAmountUsd)}`}
              </strong>
            </div>
            <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-fg-subtle shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>

          {/* Paid Card */}
          <div className="p-3 rounded-xl bg-surface border border-border/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                Оплачено
              </span>
              <strong className="text-sm sm:text-base font-bold font-mono text-accent mt-0.5 block">
                ${formatMoney(invoice.paidAmountUsd)}
              </strong>
            </div>
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-center text-accent shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          {/* Debt Card */}
          <div className="p-3 rounded-xl bg-surface border border-border/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                Остаток долга
              </span>
              <strong className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${invoice.remainingAmountUsd > 0 ? "text-danger" : "text-fg-subtle"}`}>
                ${formatMoney(invoice.remainingAmountUsd)}
              </strong>
            </div>
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
              invoice.remainingAmountUsd > 0 ? "bg-danger/10 border-danger/25 text-danger" : "bg-surface-raised border-border text-fg-subtle"
            }`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Pay Button if remaining debt exists */}
        {invoice.remainingAmountUsd > 0 && (
          <div className="px-3.5 pb-3 sm:px-4 sm:pb-4 bg-surface-raised/40 border-b border-border/70 shrink-0">
            <button
              type="button"
              onClick={() => onOpenPay(invoice)}
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <DollarSign className="w-4 h-4" />
              <span>Оплатить накладную (${formatMoney(invoice.remainingAmountUsd)})</span>
            </button>
          </div>
        )}

        {/* Invoice Groups (Summary of positions) */}
        {invoice.groups && invoice.groups.length > 0 && (
          <div className="p-3.5 sm:p-4 bg-surface-raised/30 border-b border-border/70 space-y-2 shrink-0">
            <div className="flex items-center justify-between text-xs font-bold text-fg-muted">
              <span className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-accent" />
                <span>Позиции по накладной</span>
              </span>
              <span className="text-[11px] font-mono text-fg-subtle">
                Всего: {invoice.groups.reduce((acc: number, g: any) => acc + (g.quantity || 0), 0)} шт.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {invoice.groups.map((grp: any, gIdx: number) => {
                const colorHex = getPhoneColorHex(grp.color);
                const formattedR = formatRam(grp.ram);
                const formattedS = formatStorage(grp.storage);
                return (
                  <div
                    key={gIdx}
                    className="p-3 rounded-xl bg-surface border border-border/80 shadow-2xs hover:border-accent/40 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-accent shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-fg text-xs truncate">
                          {grp.brand} {grp.model}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {formattedS && (
                            <span className="px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-[10px] font-bold font-mono text-fg">
                              {formattedS}
                            </span>
                          )}
                          {formattedR && (
                            <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent">
                              ОЗУ {formattedR}
                            </span>
                          )}
                          {grp.color && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/60 text-[10px] text-fg-muted">
                              {colorHex && (
                                <span
                                  className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: colorHex }}
                                />
                              )}
                              <span>{grp.color}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold font-mono text-accent text-xs block">
                        {grp.quantity} шт.
                      </span>
                      <span className="text-[10px] font-mono text-fg-subtle block">
                        ${formatMoney(grp.purchasePriceUsd)} / шт.
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Contained Devices List */}
        <div className="p-3 sm:p-3.5 bg-surface-raised/50 border-b border-border/70 flex items-center justify-between text-xs font-bold text-fg-muted shrink-0">
          <span className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-accent" />
            <span>Устройства в накладной</span>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-surface border border-border font-bold font-mono text-accent text-xs">
            {containedDevices.length} шт.
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 bg-surface-raised/20">
          {containedDevices.length === 0 ? (
            <div className="p-8 text-center text-fg-subtle text-xs">
              Нет детальных записей устройств для этой накладной
            </div>
          ) : hasGroups && variantGroups.size > 0 ? (
            Array.from(variantGroups.entries()).map(([key, group]) => {
              const isExpanded = expandedDeviceGroups[key] ?? false;
              const soldCount = group.devices.filter(d => d.status === 'SOLD').length;
              const colorHex = getPhoneColorHex(group.color);
              const formattedR = formatRam(group.ram);
              const formattedS = formatStorage(group.storage);

              return (
                <div key={key} className="rounded-xl border border-border/80 bg-surface overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setExpandedDeviceGroups(prev => ({ ...prev, [key]: !isExpanded }))}
                    className="w-full p-3 flex items-center justify-between text-xs hover:bg-surface-raised/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 text-left min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-accent shrink-0">
                        <Smartphone className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <strong className="text-fg font-bold text-xs">{group.brand} {group.model}</strong>
                          {formattedS && (
                            <span className="px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-[10px] font-bold font-mono text-fg">
                              {formattedS}
                            </span>
                          )}
                          {formattedR && (
                            <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent">
                              ОЗУ {formattedR}
                            </span>
                          )}
                          {group.color && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/60 text-[10px] text-fg-muted">
                              {colorHex && (
                                <span
                                  className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: colorHex }}
                                />
                              )}
                              <span>{group.color}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 ml-2">
                      <span className="text-accent font-bold font-mono text-xs">{group.devices.length} шт.</span>
                      {soldCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-warning/15 text-warning font-semibold">
                          {soldCount} продано
                        </span>
                      )}
                      <div className={`p-1 rounded-md text-fg-subtle transition-transform duration-200 ${isExpanded ? 'rotate-90 text-accent' : ''}`}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="p-3 pt-0 space-y-2 border-t border-border/60 bg-surface-raised/40">
                      {group.devices.map((dev, idx) => renderDeviceRow(dev, idx))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            containedDevices.map((dev, idx) => renderDeviceRow(dev, idx))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-surface border-t border-border/70 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted hover:text-fg transition-all cursor-pointer min-h-[38px]"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
