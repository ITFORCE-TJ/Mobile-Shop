import React from 'react';
import { Wrench, Search, Scan, Loader2 } from 'lucide-react';
import { NewRepairFormProps } from './types';

export const NewRepairForm: React.FC<NewRepairFormProps> = ({
  onSubmit,
  isSubmitting,
  receiptSearch,
  setReceiptSearch,
  onFindSoldDevice,
  onScanTicket,
  isStoreScoped,
  createTicketStoreId,
  setCreateTicketStoreId,
  retailStores,
  clientName,
  setClientName,
  clientPhone,
  setClientPhone,
  deviceModel,
  setDeviceModel,
  imei,
  setImei,
  imei2,
  setImei2,
  defectDescription,
  setDefectDescription,
}) => {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-xl mx-auto space-y-3 min-w-0">
      <div className="border border-border rounded-xl bg-surface p-3.5 sm:p-4 space-y-3 shadow-2xs min-w-0">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-2">
            <Wrench className="w-4 h-4 text-accent shrink-0" />
            <span>Квитанция на гарантийный ремонт</span>
          </h3>
          <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
            Новый
          </span>
        </div>

        {/* Быстрый поиск по чеку или IMEI */}
        <div className="p-2.5 bg-surface-raised rounded-xl border border-border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg-muted flex items-center gap-1.5">
              <Search className="w-3 h-3 text-accent" />
              Поиск по номеру чека или IMEI
            </span>
            <span className="text-[10px] text-fg-subtle">автозаполнение</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={receiptSearch ?? ''}
                onChange={(e) => setReceiptSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); onFindSoldDevice(receiptSearch); }
                }}
                enterKeyHint="search"
                aria-label="Номер чека или IMEI"
                placeholder="Номер чека или IMEI..."
                className="w-full h-9 rounded-lg bg-surface border border-border px-3 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={() => onFindSoldDevice(receiptSearch)}
              disabled={!receiptSearch.trim()}
              className="h-9 px-3 bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 text-xs font-bold rounded-lg text-accent-fg transition-colors shrink-0 cursor-pointer"
            >
              Найти
            </button>
            <button
              type="button"
              onClick={onScanTicket}
              className="h-9 w-9 flex items-center justify-center bg-surface hover:bg-surface-raised active:scale-95 text-accent rounded-lg border border-border transition-colors shrink-0 cursor-pointer"
              title="Сканировать"
            >
              <Scan className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isStoreScoped && (
          <div className="min-w-0">
            <label className="block text-fg-subtle mb-1 text-[11px] font-semibold">Торговая точка *</label>
            <select
              value={createTicketStoreId}
              onChange={(e) => setCreateTicketStoreId(e.target.value)}
              className="w-full min-w-0 h-9 rounded-xl bg-surface-raised border border-border px-3 text-fg text-xs font-medium focus:border-accent focus:outline-none truncate cursor-pointer"
            >
              {retailStores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="min-w-0">
            <label className="block text-fg-subtle mb-1 text-[11px] font-semibold">ФИО клиента *</label>
            <input
              type="text"
              required
              value={clientName ?? ''}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Иван Иванов"
              className="w-full min-w-0 h-9 rounded-xl bg-surface-raised border border-border px-3 text-fg text-xs placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          <div className="min-w-0">
            <label className="block text-fg-subtle mb-1 text-[11px] font-semibold">Телефон *</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={clientPhone ?? ''}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="+992 900 000 000"
              className="w-full min-w-0 h-9 rounded-xl bg-surface-raised border border-border px-3 text-fg text-xs placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="min-w-0">
            <label className="block text-fg-subtle mb-1 text-[11px] font-semibold">Модель устройства *</label>
            <input
              type="text"
              required
              value={deviceModel ?? ''}
              onChange={(e) => setDeviceModel(e.target.value)}
              placeholder="iPhone 15 Pro Max 256GB"
              className="w-full min-w-0 h-9 rounded-xl bg-surface-raised border border-border px-3 text-fg text-xs placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block text-fg-subtle mb-1 text-[11px] font-semibold">IMEI 1</label>
              <input
                type="text"
                inputMode="numeric"
                value={imei ?? ''}
                onChange={(e) => setImei(e.target.value)}
                placeholder="354891100234561"
                className="w-full min-w-0 h-9 rounded-xl bg-surface-raised border border-border px-3 text-fg text-xs font-mono placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-fg-subtle mb-1 text-[11px] font-semibold">
                IMEI 2 <span className="text-[10px] text-fg-subtle font-normal">(опционально)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={imei2 ?? ''}
                onChange={(e) => setImei2(e.target.value)}
                placeholder="354891100234562"
                className="w-full min-w-0 h-9 rounded-xl bg-surface-raised border border-border px-3 text-fg text-xs font-mono placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="min-w-0">
            <label className="block text-fg-subtle mb-1 text-[11px] font-semibold">Описание неисправности *</label>
            <textarea
              required
              rows={2}
              value={defectDescription ?? ''}
              onChange={(e) => setDefectDescription(e.target.value)}
              placeholder="Не заряжается, разбито стекло дисплея..."
              className="w-full min-w-0 rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs placeholder:text-fg-subtle focus:border-accent focus:outline-none resize-none transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-10 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-xs sm:text-sm font-bold text-accent-fg transition-all shadow-xs mt-1 disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
          <span className="truncate">{isSubmitting ? 'Оформление…' : 'Оформить приём в ремонт'}</span>
        </button>
      </div>
    </form>
  );
};
