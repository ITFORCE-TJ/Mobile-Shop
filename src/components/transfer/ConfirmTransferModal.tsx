import React from 'react';
import {
  Loader2,
  Send,
  Warehouse,
  Store as StoreIcon,
  ArrowRight,
  Smartphone,
  Check
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { getPhoneColorHex, formatRam } from '../../utils/phoneSpecs';
import { ConfirmTransferModalProps } from './types';

export const ConfirmTransferModal: React.FC<ConfirmTransferModalProps> = ({
  open,
  onClose,
  isStoreScoped,
  selectedDevices,
  fromStore,
  toStore,
  fromStoreName,
  toStoreName,
  isSubmittingTransfer,
  onConfirm,
}) => {
  return (
    <Dialog
      open={open}
      onClose={() => { if (!isSubmittingTransfer) onClose(); }}
      title={isStoreScoped ? 'Отправка на главный склад' : 'Подтверждение перемещения'}
      subtitle={`Проверьте маршрут передачи и список устройств (${selectedDevices.length} шт.)`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <button
            type="button"
            onClick={() => { if (!isSubmittingTransfer) onClose(); }}
            disabled={isSubmittingTransfer}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-colors cursor-pointer min-h-[38px] disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmittingTransfer}
            className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer min-h-[38px] disabled:opacity-50"
          >
            {isSubmittingTransfer ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Перемещение...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{isStoreScoped ? 'Отправить на склад' : 'Подтвердить перемещение'}</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {/* Visual Route Card */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-surface-raised/70 border border-border space-y-2 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-fg-subtle px-1">
            <span>Склад отправления</span>
            <span className="text-accent flex items-center gap-1 font-semibold">
              <ArrowRight className="w-3 h-3" />
              Маршрут
            </span>
            <span>Склад назначения</span>
          </div>

          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 sm:gap-3 bg-surface p-2.5 sm:p-3 rounded-xl border border-border">
            {/* Origin */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center shrink-0">
                  {fromStore?.isMainWarehouse ? <Warehouse className="w-4 h-4 text-warning" /> : <StoreIcon className="w-4 h-4 text-accent" />}
                </div>
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-fg block truncate">
                    {fromStoreName}
                  </span>
                  <span className="text-[10px] text-fg-subtle block">
                    {fromStore?.isMainWarehouse ? 'Центральный склад' : 'Магазин'}
                  </span>
                </div>
              </div>
            </div>

            {/* Transfer Arrow Center Badge */}
            <div className="flex flex-col items-center justify-center px-1 shrink-0">
              <div className="w-7 h-7 rounded-full bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shadow-xs">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Destination */}
            <div className="min-w-0 text-right">
              <div className="flex items-center justify-end gap-2">
                <div className="min-w-0 text-right">
                  <span className="text-xs sm:text-sm font-extrabold text-accent block truncate">
                    {toStoreName}
                  </span>
                  <span className="text-[10px] text-fg-subtle block">
                    {toStore?.isMainWarehouse ? 'Центральный склад' : 'Магазин'}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
                  {toStore?.isMainWarehouse ? <Warehouse className="w-4 h-4 text-warning" /> : <StoreIcon className="w-4 h-4 text-accent" />}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Devices List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-bold text-fg-muted uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-accent" />
              <span>Устройства к перемещению</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25 text-accent font-bold font-mono text-[11px]">
              {selectedDevices.length} шт.
            </span>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1.5 p-1 rounded-xl bg-surface-raised/30 border border-border/70 overscroll-contain">
            {selectedDevices.map((dev) => {
              const colorHex = getPhoneColorHex(dev.color);
              const formattedRam = formatRam(dev.ram);
              return (
                <div
                  key={dev.id}
                  className="p-2.5 rounded-xl bg-surface border border-border/80 flex items-center justify-between gap-3 text-xs shadow-2xs hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center shrink-0 text-accent">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-fg text-xs sm:text-sm truncate">
                          {dev.brand} {dev.model}
                        </span>
                        {dev.storage && (
                          <span className="px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-[10px] font-black font-mono text-fg shrink-0">
                            {dev.storage}
                          </span>
                        )}
                        {formattedRam && !dev.storage.toLowerCase().includes(formattedRam.toLowerCase()) && (
                          <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent shrink-0">
                            ОЗУ {formattedRam}
                          </span>
                        )}
                        {dev.color && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface-raised/60 border border-border/60 text-[10px] text-fg-muted shrink-0">
                            {colorHex && (
                              <span
                                className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                style={{ backgroundColor: colorHex }}
                              />
                            )}
                            <span className="truncate">{dev.color}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-fg-subtle mt-1 font-mono">
                        <span className="bg-surface-raised px-1.5 py-0.2 rounded border border-border/60">
                          IMEI: <span className="text-fg font-semibold">{dev.imei}</span>
                        </span>
                        {dev.imei2 && (
                          <span className="opacity-70">
                            / {dev.imei2}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Flow note */}
        <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20 flex items-start gap-2.5 text-xs">
          <div className="p-1 rounded-md bg-accent/20 text-accent shrink-0 mt-0.5">
            <Check className="w-3.5 h-3.5" />
          </div>
          <p className="text-[11px] text-fg-muted leading-relaxed">
            {isStoreScoped
              ? 'После отправки устройства перейдут в статус «Ожидает приёмки» и будут зачислены на главный склад после подтверждения администратором.'
              : 'После подтверждения устройства будут сразу привязаны к выбранному объекту назначения.'}
          </p>
        </div>
      </div>
    </Dialog>
  );
};
