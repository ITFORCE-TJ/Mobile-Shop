import React, { useState, useEffect, useMemo } from 'react';
import { Percent, X, Store, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { formatUserName } from '../../utils/formatUser';
import { Store as StoreType, Owner } from '../../types';

interface StoreSharesModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (storeId: string, partnerOwnerId: string, partnerSharePercent: number) => Promise<void>;
  retailStores: StoreType[];
  stores: StoreType[];
  adminOwner?: Owner;
  partnerForStore: (storeId: string) => Owner | undefined;
  storeProfitShares: { storeId: string; ownerId: string; sharePercent: number }[];
  initialStoreId?: string;
  isSubmitting: boolean;
}

export const StoreSharesModal: React.FC<StoreSharesModalProps> = ({
  open,
  onClose,
  onSave,
  retailStores,
  stores,
  adminOwner,
  partnerForStore,
  storeProfitShares,
  initialStoreId,
  isSubmitting,
}) => {
  const [selectedSharesStoreId, setSelectedSharesStoreId] = useState<string>('');
  const [adminShareVal, setAdminShareVal] = useState<string>('60');
  const [partnerShareVal, setPartnerShareVal] = useState<string>('40');

  const currentSharesStore = useMemo(() => {
    return stores.find(s => s.id === selectedSharesStoreId) || retailStores[0] || stores[0];
  }, [stores, selectedSharesStoreId, retailStores]);

  const currentStorePartner = useMemo(() => {
    if (!currentSharesStore) return undefined;
    return partnerForStore(currentSharesStore.id);
  }, [currentSharesStore, partnerForStore]);

  const loadSharesForStore = (storeId: string) => {
    setSelectedSharesStoreId(storeId);
    const pair = storeProfitShares.find(sh => sh.storeId === storeId);
    if (pair) {
      const pShare = pair.sharePercent;
      const aShare = Math.round((100 - pShare) * 100) / 100;
      setPartnerShareVal(String(pShare));
      setAdminShareVal(String(aShare));
    } else {
      setAdminShareVal('60');
      setPartnerShareVal('40');
    }
  };

  useEffect(() => {
    if (open) {
      const targetStoreId = initialStoreId || (retailStores[0]?.id || stores[0]?.id || '');
      loadSharesForStore(targetStoreId);
    }
  }, [open, initialStoreId, retailStores, stores]);

  if (!open) return null;

  const handleAdminShareInputChange = (val: string) => {
    setAdminShareVal(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setPartnerShareVal(String(Math.round((100 - num) * 100) / 100));
    }
  };

  const handlePartnerShareInputChange = (val: string) => {
    setPartnerShareVal(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setAdminShareVal(String(Math.round((100 - num) * 100) / 100));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSharesStore || !currentStorePartner || isSubmitting) return;

    const partnerNum = parseFloat(partnerShareVal) || 0;
    await onSave(currentSharesStore.id, currentStorePartner.id, partnerNum);
  };

  const aVal = Math.max(0, Math.min(100, parseFloat(adminShareVal) || 0));
  const pVal = Math.max(0, Math.min(100, parseFloat(partnerShareVal) || 0));
  const total = Math.round((aVal + pVal) * 100) / 100;
  const isValid = Math.abs(total - 100) < 0.001;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-4 sm:p-5 text-fg shadow-2xl space-y-3.5 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-accent" />
            <h4 className="text-sm font-bold text-fg uppercase">
              Настройка долей по магазинам
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg p-1 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Store Selector */}
        <div className="space-y-2">
          <label className="block text-fg-subtle text-[11px] uppercase font-semibold">
            Выберите магазин для настройки:
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {retailStores.map((store) => {
              const isSelected = (currentSharesStore?.id === store.id);
              const storePartner = partnerForStore(store.id);
              const pair = storeProfitShares.find(sh => sh.storeId === store.id);
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => loadSharesForStore(store.id)}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-accent/10 border-accent/40 shadow-xs'
                      : 'bg-surface-raised border-border hover:border-fg-subtle/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Store className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-accent' : 'text-fg-subtle'}`} />
                    <span className="font-bold text-xs truncate text-fg">{store.name}</span>
                  </div>
                  <div className="text-[10px] text-fg-subtle">
                    {storePartner ? (
                      <span>
                        {formatUserName(storePartner.name)}: <strong className={isSelected ? 'text-accent font-bold' : 'text-fg'}>{pair ? `${pair.sharePercent}%` : 'доля не задана'}</strong>
                      </span>
                    ) : (
                      <span className="text-warning font-semibold">Партнёр не прикреплён</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Partner separate indicator */}
          {currentStorePartner && (
            <div className="p-2.5 rounded-xl bg-surface-raised border border-border flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-info/10 text-info font-bold text-[10px] flex items-center justify-center shrink-0">
                  {formatUserName(currentStorePartner.name).substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-fg-subtle block">Партнёр магазина:</span>
                  <strong className="text-fg font-semibold text-xs truncate block">
                    {formatUserName(currentStorePartner.name)}
                  </strong>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-info/15 text-info border border-info/30 uppercase">
                Партнёр
              </span>
            </div>
          )}
        </div>

        {/* Form for selected store */}
        {currentStorePartner && adminOwner ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Admin and Partner Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Admin Card */}
              <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fg truncate">
                    {formatUserName(adminOwner.name || 'Администратор')}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent uppercase">
                    Админ
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    required
                    value={adminShareVal}
                    onChange={(e) => handleAdminShareInputChange(e.target.value)}
                    placeholder="60"
                    className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-base text-accent font-bold focus:border-accent focus:outline-none pr-8 font-mono"
                  />
                  <span className="absolute right-3 top-2.5 text-fg-subtle font-bold text-sm">%</span>
                </div>
                <span className="text-[10px] text-fg-subtle block">
                  Доля администратора
                </span>
              </div>

              {/* Partner Card */}
              <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fg truncate">
                    {formatUserName(currentStorePartner.name || 'Партнёр')}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-info/15 border border-info/30 text-info uppercase">
                    Партнёр
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    required
                    value={partnerShareVal}
                    onChange={(e) => handlePartnerShareInputChange(e.target.value)}
                    placeholder="40"
                    className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-base text-info font-bold focus:border-info focus:outline-none pr-8 font-mono"
                  />
                  <span className="absolute right-3 top-2.5 text-fg-subtle font-bold text-sm">%</span>
                </div>
                <span className="text-[10px] text-fg-subtle block">
                  Доля партнёра филиала
                </span>
              </div>
            </div>

            {/* Visual Ratio Bar */}
            <div className="space-y-1">
              <div className="w-full h-2.5 rounded-full bg-surface-raised border border-border overflow-hidden flex">
                <div
                  className="bg-accent h-full transition-all duration-300"
                  style={{ width: `${aVal}%` }}
                  title={`Администратор: ${aVal}%`}
                />
                <div
                  className="bg-info h-full transition-all duration-300"
                  style={{ width: `${pVal}%` }}
                  title={`Партнёр: ${pVal}%`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-fg-subtle font-medium font-mono">
                <span>{formatUserName(adminOwner.name)}: <strong className="text-accent">{aVal}%</strong></span>
                <span>{formatUserName(currentStorePartner.name)}: <strong className="text-info">{pVal}%</strong></span>
              </div>
            </div>

            {/* Sum validation status */}
            <div
              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                isValid
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : 'bg-danger/10 border-danger/30 text-danger'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {isValid ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>Сумма долей: {total}%</span>
              </span>
              <span className="text-[11px]">{!isValid ? 'требуется ровно 100%' : aVal <= 0 ? 'у администратора должна остаться доля' : '100% ✓ (Корректно)'}</span>
            </div>

            <p className="text-[10px] text-fg-subtle leading-snug">
              Новые доли применяются к прибыли с момента сохранения. Уже начисленная прибыль и возвраты
              прошлых продаж считаются по долям, действовавшим в момент продажи.
            </p>

            <div className="flex space-x-2 pt-1 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg border border-border uppercase disabled:opacity-50 transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !currentStorePartner || !isValid}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        ) : (
          /* No partner assigned to this store */
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 space-y-2 text-warning">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold">Партнёр не назначен</span>
              </div>
              <p className="text-[11px] text-fg leading-relaxed">
                Для магазина <strong>«{currentSharesStore?.name}»</strong> ещё не создан или не прикреплён партнёр.
              </p>
              <p className="text-[10px] text-fg-subtle">
                Перейдите во вкладку <strong>«Сотрудники»</strong>, создайте или отредактируйте сотрудника с ролью <strong>«Партнёр»</strong> и выберите этот магазин.
              </p>
            </div>
            <div className="flex justify-end pt-1 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg border border-border uppercase transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
