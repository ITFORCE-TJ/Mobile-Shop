import React, { useState } from 'react';
import { Device, Store as StoreType } from '../../types';
import { formatMoney, formatUsd } from '../../utils/money';
import {
  Smartphone,
  Warehouse,
  Store,
  Sparkles,
  Cpu,
  Edit2,
  HardDrive,
  Palette,
  X,
  QrCode,
  Check,
  Copy,
  DollarSign,
  History,
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { approxTjs, formatTimelineDate, getTimelineBadge, STATUS_LABELS, STATUS_TONE } from './types';

interface DeviceDetailsModalProps {
  device: Device | null;
  stores: StoreType[];
  rate?: number;
  isAdmin?: boolean;
  isAdminOrPartner?: boolean;
  onClose: () => void;
  onUpdateRam: (deviceId: string, ram: string) => Promise<{ success: boolean; device?: Device; message?: string }>;
  onNotify?: (msg: { tone: 'info' | 'warning' | 'error' | 'success'; text: string }) => void;
}

export const DeviceDetailsModal: React.FC<DeviceDetailsModalProps> = ({
  device: initialDevice,
  stores,
  rate,
  isAdmin,
  isAdminOrPartner,
  onClose,
  onUpdateRam,
  onNotify,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isEditingRam, setIsEditingRam] = useState(false);
  const [editRamValue, setEditRamValue] = useState('');
  const [isSavingRam, setIsSavingRam] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(initialDevice);

  // Sync internal device state with prop updates
  React.useEffect(() => {
    setCurrentDevice(initialDevice);
    if (!initialDevice) {
      setIsEditingRam(false);
    }
  }, [initialDevice]);

  if (!currentDevice) return null;

  const handleCopy = async (text: string, key: string) => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      onNotify?.({ tone: 'warning', text: `Не удалось скопировать автоматически. IMEI: ${text}` });
    }
  };

  const handleStartEditRam = (currentRam?: string) => {
    setEditRamValue(currentRam || '');
    setIsEditingRam(true);
  };

  const handleSaveRam = async () => {
    if (!currentDevice || !editRamValue.trim()) return;
    setIsSavingRam(true);
    try {
      const res = await onUpdateRam(currentDevice.id, editRamValue.trim());
      if (res.success && res.device) {
        setCurrentDevice(res.device);
        setIsEditingRam(false);
      } else {
        onNotify?.({ tone: 'error', text: res.message || 'Не удалось сохранить объём памяти' });
      }
    } finally {
      setIsSavingRam(false);
    }
  };

  const store = stores.find(s => s.id === currentDevice.locationId);
  const isWh = store?.isMainWarehouse || currentDevice.status === 'MAIN_WAREHOUSE';
  const formattedRam = currentDevice.ram
    ? (currentDevice.ram.toUpperCase().includes('GB') ? currentDevice.ram : `${currentDevice.ram} GB`)
    : null;

  return (
    <Dialog
      open={!!currentDevice}
      onClose={() => {
        setIsEditingRam(false);
        onClose();
      }}
      title={`${currentDevice.brand} ${currentDevice.model}`}
      subtitle="Карточка устройства"
      maxWidth="lg"
      footer={
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setIsEditingRam(false);
            onClose();
          }}
        >
          Закрыть
        </Button>
      }
    >
      <div className="space-y-3.5">
        {/* Device Quick Hero Banner */}
        <div className="p-3.5 rounded-2xl bg-linear-to-r from-surface to-surface-raised border border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0 shadow-xs">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-fg truncate">
                {currentDevice.brand} {currentDevice.model}
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <Badge tone={STATUS_TONE[currentDevice.status]}>
                  {STATUS_LABELS[currentDevice.status] || currentDevice.status}
                </Badge>
                {currentDevice.isBonus && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    <Sparkles className="w-3 h-3" />
                    Бонус поставщика
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                isWh
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  : 'bg-accent/10 text-accent border-accent/30'
              }`}
            >
              {isWh ? (
                <Warehouse className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <Store className="w-3.5 h-3.5 text-accent shrink-0" />
              )}
              <span className="truncate max-w-40">
                {isWh ? 'Центральный склад' : currentDevice.locationName || store?.name || 'Магазин'}
              </span>
            </span>
          </div>
        </div>

        {/* Hardware Specifications Grid */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-fg-subtle tracking-wider flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-accent" />
              Характеристики устройства
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* RAM SPEC */}
            <div
              className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                formattedRam
                  ? 'bg-accent/10 border-accent/30 shadow-xs'
                  : 'bg-surface-raised border-border'
              }`}
            >
              <div className="flex items-center justify-between text-fg-subtle mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-accent">ОЗУ (RAM)</span>
                <Cpu className="w-3.5 h-3.5 text-accent" />
              </div>
              <div>
                {formattedRam ? (
                  <span className="text-sm sm:text-base font-extrabold text-accent font-mono block">
                    {formattedRam}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-fg-subtle italic block">
                    — не указана
                  </span>
                )}
              </div>
              {isAdminOrPartner && (
                <button
                  type="button"
                  onClick={() => handleStartEditRam(currentDevice.ram)}
                  className="mt-2 text-[10px] font-bold text-accent hover:underline flex items-center gap-1 self-start cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{formattedRam ? 'Изменить' : '+ Указать RAM'}</span>
                </button>
              )}
            </div>

            {/* STORAGE SPEC */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-fg-subtle mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Память (ROM)</span>
                <HardDrive className="w-3.5 h-3.5 text-fg-subtle" />
              </div>
              <div>
                <span className="text-sm sm:text-base font-extrabold text-fg font-mono block">
                  {currentDevice.storage}
                </span>
              </div>
              <span className="text-[10px] text-fg-subtle mt-2 block">Встроенная память</span>
            </div>

            {/* COLOR SPEC */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-fg-subtle mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Цвет</span>
                <Palette className="w-3.5 h-3.5 text-fg-subtle" />
              </div>
              <div>
                <span className="text-sm sm:text-base font-extrabold text-fg truncate block">
                  {currentDevice.color}
                </span>
              </div>
              <span className="text-[10px] text-fg-subtle mt-2 block">Цвет корпуса</span>
            </div>

            {/* LOCATION SPEC */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between text-fg-subtle mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider">Локация</span>
                {isWh ? (
                  <Warehouse className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Store className="w-3.5 h-3.5 text-accent" />
                )}
              </div>
              <div>
                <span
                  className={`text-xs font-bold truncate block ${
                    isWh ? 'text-amber-500' : 'text-accent'
                  }`}
                >
                  {isWh ? 'Центральный склад' : currentDevice.locationName || store?.name || 'Магазин'}
                </span>
              </div>
              <span className="text-[10px] text-fg-subtle mt-2 block">Текущий склад</span>
            </div>
          </div>

          {/* Inline RAM Editor Drawer */}
          {isEditingRam && (
            <div className="p-3 rounded-xl bg-surface border border-accent/40 shadow-xs space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-accent" />
                  Укажите объём оперативной памяти (RAM):
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingRam(false)}
                  aria-label="Отменить изменение памяти"
                  className="p-1 rounded-md text-fg-subtle hover:text-fg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setEditRamValue(preset)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      editRamValue === preset
                        ? 'bg-accent text-accent-fg border-accent'
                        : 'bg-surface-raised hover:bg-surface border-border text-fg-muted'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={editRamValue}
                  onChange={(e) => setEditRamValue(e.target.value)}
                  placeholder="Например: 8 GB"
                  className="flex-1 rounded-xl bg-surface-raised border border-border px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isSavingRam || !editRamValue.trim()}
                  onClick={handleSaveRam}
                  className="px-3 py-1.5 rounded-xl bg-accent text-accent-fg hover:bg-accent-strong text-xs font-bold transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {isSavingRam ? 'Сохранение…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  disabled={isSavingRam}
                  onClick={() => setIsEditingRam(false)}
                  className="px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-raised border border-border text-fg-muted hover:text-fg text-xs font-bold transition-colors shrink-0 cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>

        {/* IMEI Identifiers with 1-click copy */}
        <div className="p-3.5 rounded-xl bg-surface-raised border border-border space-y-2.5">
          <span className="text-[10px] uppercase font-bold text-fg-subtle tracking-wider flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5 text-accent" />
            Идентификаторы устройства
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* IMEI 1 */}
            <div className="p-2.5 rounded-xl bg-surface border border-border flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-fg-subtle block">IMEI 1</span>
                <span className="font-mono font-bold text-fg select-all text-xs tracking-wider truncate block mt-0.5">
                  {currentDevice.imei}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(currentDevice.imei, 'imei1')}
                className="p-1.5 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-accent transition-colors shrink-0 cursor-pointer"
                title="Скопировать IMEI 1"
              >
                {copiedKey === 'imei1' ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* IMEI 2 */}
            <div className="p-2.5 rounded-xl bg-surface border border-border flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-fg-subtle block">
                  IMEI 2 (Второй слот)
                </span>
                <span
                  className={`font-mono text-xs tracking-wider truncate block mt-0.5 ${
                    currentDevice.imei2 ? 'font-bold text-fg select-all' : 'text-fg-subtle font-normal'
                  }`}
                >
                  {currentDevice.imei2 || '— не указан'}
                </span>
              </div>
              {currentDevice.imei2 && (
                <button
                  type="button"
                  onClick={() => handleCopy(currentDevice.imei2!, 'imei2')}
                  className="p-1.5 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-accent transition-colors shrink-0 cursor-pointer"
                  title="Скопировать IMEI 2"
                >
                  {copiedKey === 'imei2' ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Financial Audit for Admin Only */}
        {isAdmin && (
          <div className="p-3.5 rounded-xl bg-surface-raised border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-fg-subtle flex items-center gap-1.5 tracking-wider">
                <DollarSign className="w-3.5 h-3.5 text-accent" />
                Финансовый аудит
              </span>
              {currentDevice.isBonus ? (
                <Badge tone="accent">Бонус</Badge>
              ) : (
                <span className="text-[10px] text-fg-subtle font-mono">
                  {rate ? `Курс: $1 = ${formatMoney(rate)} TJS` : 'Курс на сегодня не задан'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-surface border border-border">
                <span className="text-[10px] text-fg-subtle uppercase block font-bold">Поставщик</span>
                <span
                  className="font-bold text-fg truncate block mt-0.5"
                  title={currentDevice.supplierName || '—'}
                >
                  {currentDevice.supplierName || '—'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface border border-border">
                <span className="text-[10px] text-fg-subtle uppercase block font-bold">Накладная</span>
                <span className="font-bold text-fg font-mono truncate block mt-0.5">
                  {currentDevice.invoiceNumber || '—'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface border border-border">
                <span className="text-[10px] text-fg-subtle uppercase block font-bold">Цена закупки</span>
                <span className="font-extrabold text-accent font-mono block mt-0.5">
                  {formatUsd(currentDevice.purchaseCostUsd)}
                </span>
                {approxTjs(currentDevice.purchaseCostUsd, rate) && (
                  <span className="text-[10px] text-fg-subtle block font-mono">
                    {approxTjs(currentDevice.purchaseCostUsd, rate)}
                  </span>
                )}
              </div>
              <div className="p-2.5 rounded-xl bg-surface border border-border">
                <span className="text-[10px] text-fg-subtle uppercase block font-bold">Себестоимость</span>
                <span className="font-extrabold text-fg font-mono block mt-0.5">
                  {formatUsd(currentDevice.costBasisUsd)}
                </span>
                {approxTjs(currentDevice.costBasisUsd, rate) && (
                  <span className="text-[10px] text-fg-subtle block font-mono">
                    {approxTjs(currentDevice.costBasisUsd, rate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Movement & Event Timeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-fg-subtle tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-accent" />
              История перемещений и событий
            </span>
            <span className="text-[10px] text-fg-subtle">
              {currentDevice.timeline?.length || 0}{' '}
              {currentDevice.timeline?.length === 1 ? 'запись' : 'записей'}
            </span>
          </div>

          <div className="border border-border rounded-xl bg-surface-raised p-3.5 max-h-56 overflow-y-auto space-y-3">
            {currentDevice.timeline && currentDevice.timeline.length > 0 ? (
              currentDevice.timeline.map((event, idx) => {
                const badge = getTimelineBadge(event.type);
                return (
                  <div
                    key={event.id || idx}
                    className="relative pl-5 before:absolute before:left-1.5 before:top-2 before:bottom-0 before:w-px before:bg-border last:before:hidden"
                  >
                    <div
                      className={`absolute left-0 top-1.5 w-3 h-3 rounded-full border-2 border-surface ${badge.dot}`}
                    />
                    <div className="text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-md text-[10px] uppercase font-mono tracking-wider border ${badge.tone}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-[11px] text-fg-subtle font-mono">
                          {formatTimelineDate(event.date)}
                        </span>
                      </div>
                      <p className="text-fg text-xs font-semibold leading-relaxed">
                        {event.description}
                      </p>
                      {event.user && (
                        <p className="text-[11px] text-fg-subtle">
                          Оператор: <span className="font-semibold text-fg-muted">{event.user}</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-fg-subtle text-center py-2">История событий пуста</p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
