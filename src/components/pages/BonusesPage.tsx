import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { SupplierBonus } from '../../types';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { BonusQuarterCard } from '../finance/BonusQuarterCard';
import { BonusAccountCard } from '../finance/BonusAccountCard';
import { LegacyBonusAccrualsCard } from '../finance/LegacyBonusAccrualsCard';
import {
  Gift,
  Plus,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Award,
  ChevronRight,
  X,
  Scan,
  Edit,
  Trash2,
  Loader2
} from 'lucide-react';

export const BonusesPage: React.FC = () => {
  const {
    currentUser,
    supplierBonuses,
    suppliers,
    stores,
    devices,
    createSupplierBonus,
    updateSupplierBonus,
    deleteSupplierBonus,
    todayRate,
    openScanner
  } = useAppFields('currentUser', 'supplierBonuses', 'suppliers', 'stores', 'devices', 'createSupplierBonus', 'updateSupplierBonus', 'deleteSupplierBonus', 'todayRate', 'openScanner');

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBonus, setSelectedBonus] = useState<SupplierBonus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingBonus, setEditingBonus] = useState<SupplierBonus | null>(null);
  const [editCampaignTitle, setEditCampaignTitle] = useState('');
  const [editAmountUsd, setEditAmountUsd] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editStorage, setEditStorage] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editImei, setEditImei] = useState('');
  const [editImei2, setEditImei2] = useState('');

  const [deletingBonus, setDeletingBonus] = useState<SupplierBonus | null>(null);

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');

  // Suppliers load asynchronously — resync once they arrive.
  useEffect(() => {
    if (!supplierId && suppliers.length > 0) {
      setSupplierId(suppliers[0].id);
    }
  }, [suppliers, supplierId]);
  const [bonusType, setBonusType] = useState<'CASH_DISCOUNT' | 'FREE_DEVICES'>('FREE_DEVICES');
  const [amountUsd, setAmountUsd] = useState('');
  
  // Free device bonus spec
  const [bonusBrand, setBonusBrand] = useState('');
  const [bonusModel, setBonusModel] = useState('');
  const [bonusRam, setBonusRam] = useState('');
  const [bonusStorage, setBonusStorage] = useState('');
  const [bonusColor, setBonusColor] = useState('');
  const [bonusImei, setBonusImei] = useState('');
  const [bonusImei2, setBonusImei2] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('main-warehouse');

  // Autocomplete suggestion lists derived from database devices and standard presets —
  // same pattern as the purchase-intake form, so gift-device entry gets the same hints.
  const brandOptions = useMemo(() => {
    const set = new Set<string>(['Apple', 'Samsung', 'Xiaomi', 'Google', 'OnePlus', 'Honor', 'Realme', 'Huawei', 'Nothing']);
    (devices || []).forEach(d => { if (d.brand) set.add(d.brand.trim()); });
    return Array.from(set).sort();
  }, [devices]);

  const ramOptions = useMemo(() => {
    const set = new Set<string>(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB']);
    (devices || []).forEach(d => { if (d.ram) set.add(d.ram.trim()); });
    return Array.from(set).sort();
  }, [devices]);

  const getModelOptions = useCallback((selectedBrand: string) => {
    const set = new Set<string>();
    const brandLower = (selectedBrand || '').trim().toLowerCase();
    (devices || []).forEach(d => {
      if (d.model && (!brandLower || (d.brand && d.brand.toLowerCase() === brandLower))) {
        set.add(d.model.trim());
      }
    });
    return Array.from(set).sort();
  }, [devices]);

  const storageOptions = useMemo(() => {
    const set = new Set<string>(['64 GB', '128 GB', '256 GB', '512 GB', '1 TB']);
    (devices || []).forEach(d => { if (d.storage) set.add(d.storage.trim()); });
    return Array.from(set).sort();
  }, [devices]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>([
      'Black', 'White', 'Titanium', 'Natural Titanium', 'Black Titanium',
      'Desert Titanium', 'Midnight', 'Starlight', 'Silver', 'Gold',
      'Blue', 'Graphite', 'Purple', 'Green'
    ]);
    (devices || []).forEach(d => { if (d.color) set.add(d.color.trim()); });
    return Array.from(set).sort();
  }, [devices]);

  const handleScanBonusImei = () => {
    openScanner((code) => setBonusImei(code.trim()));
  };

  const handleScanBonusImei2 = () => {
    openScanner((code) => setBonusImei2(code.trim()));
  };

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const giftDevices = useMemo(() => {
    if (!selectedBonus) return [];

    // 1. If explicit freeDevices inside bonus object
    if (selectedBonus.freeDevices && selectedBonus.freeDevices.length > 0) {
      return selectedBonus.freeDevices.map(fd => {
        const liveDev = devices.find(d => d.imei === fd.imei);
        return {
          brand: fd.brand,
          model: fd.model,
          storage: fd.storage,
          color: fd.color,
          imei: fd.imei,
          costBasisUsd: fd.costBasisUsd ?? 0,
          status: liveDev?.status || 'MAIN_WAREHOUSE',
          locationName: liveDev?.locationName || 'Главный склад'
        };
      });
    }

    // 2. Otherwise search devices array matching supplier or campaign or bonus flag
    const matched = devices.filter(d => 
      (d.isBonus || d.purchaseCostUsd === 0) &&
      (d.supplierId === selectedBonus.supplierId || d.supplierName === selectedBonus.supplierName || (selectedBonus.campaignName && d.bonusCampaign?.includes(selectedBonus.campaignName)))
    );

    if (matched.length > 0) {
      return matched.map(d => ({
        brand: d.brand,
        model: d.model,
        storage: d.storage,
        color: d.color,
        imei: d.imei,
        costBasisUsd: d.costBasisUsd,
        status: d.status,
        locationName: d.locationName
      }));
    }

    // 3. Fallback single device if deviceId is specified
    if (selectedBonus.deviceId) {
      const singleDev = devices.find(d => d.id === selectedBonus.deviceId);
      if (singleDev) {
        return [{
          brand: singleDev.brand,
          model: singleDev.model,
          storage: singleDev.storage,
          color: singleDev.color,
          imei: singleDev.imei,
          costBasisUsd: singleDev.costBasisUsd,
          status: singleDev.status,
          locationName: singleDev.locationName
        }];
      }
    }

    return [];
  }, [selectedBonus, devices]);

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-fg-subtle">
        <p className="text-sm font-medium text-fg-muted">Доступ ограничен</p>
        <p className="text-xs mt-1">Раздел бонусов доступен только руководству</p>
      </div>
    );
  }

  const handleCreateBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setStatusMessage(null);

    if (bonusType === 'FREE_DEVICES' && (!bonusBrand.trim() || !bonusModel.trim())) {
      setStatusMessage({ type: 'error', text: 'Укажите бренд и модель подарочного устройства' });
      return;
    }

    if (bonusType === 'FREE_DEVICES' && !bonusRam.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите RAM (ОЗУ) подарочного устройства' });
      return;
    }

    if (bonusType === 'FREE_DEVICES' && !bonusStorage.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите память (ROM) подарочного устройства' });
      return;
    }

    if (bonusType === 'FREE_DEVICES' && !bonusImei.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите реальный IMEI подарочного устройства' });
      return;
    }

    const freeDevices = bonusType === 'FREE_DEVICES' ? [
      {
        brand: bonusBrand.trim(),
        model: bonusModel.trim(),
        ram: bonusRam.trim(),
        storage: bonusStorage.trim(),
        color: bonusColor.trim() || 'Стандарт',
        imei: bonusImei.trim(),
        imei2: bonusImei2.trim() || undefined,
        costBasisUsd: 0
      }
    ] : undefined;

    setIsSubmitting(true);
    try {
      const res = await createSupplierBonus({
        supplierId,
        bonusType,
        amountUsd: bonusType === 'CASH_DISCOUNT' ? (parseFloat(amountUsd) || 0) : undefined,
        freeDevices,
        destinationLocationId
      });

      if (res.success) {
        setIsModalOpen(false);
        setBonusBrand('');
        setBonusModel('');
        setBonusRam('');
        setBonusStorage('');
        setBonusColor('');
        setBonusImei('');
        setBonusImei2('');
        setStatusMessage({
          type: 'success',
          text: `Бонус успешно сохранен и оприходован на склад`
        });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка сохранения' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditBonus = (bonus: SupplierBonus) => {
    setEditCampaignTitle(bonus.campaignTitle || bonus.campaignName || '');
    setEditAmountUsd(bonus.amountUsd != null ? String(bonus.amountUsd) : '');
    const fd = bonus.freeDevices?.[0];
    setEditBrand(fd?.brand || bonus.brand || '');
    setEditModel(fd?.model || bonus.model || '');
    setEditStorage(fd?.storage || bonus.storage || '');
    setEditColor(fd?.color || bonus.color || '');
    setEditImei(fd?.imei || bonus.imei || '');
    setEditImei2('');
    setEditingBonus(bonus);
  };

  const handleSaveEditBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBonus || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await updateSupplierBonus(editingBonus.id, {
        campaignTitle: editCampaignTitle.trim() || undefined,
        amountUsd: editingBonus.bonusType === 'CASH_DISCOUNT' ? (parseFloat(editAmountUsd) || 0) : undefined,
        freeDevice: editingBonus.bonusType === 'FREE_DEVICES' ? {
          brand: editBrand.trim(),
          model: editModel.trim(),
          storage: editStorage.trim(),
          color: editColor.trim(),
          imei: editImei.trim(),
          imei2: editImei2.trim() || undefined,
        } : undefined,
      });

      if (res.success) {
        setEditingBonus(null);
        setSelectedBonus(null);
        setStatusMessage({ type: 'success', text: 'Бонус обновлён' });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления бонуса' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteBonus = async () => {
    if (!deletingBonus || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await deleteSupplierBonus(deletingBonus.id);
      setDeletingBonus(null);
      if (res.success) {
        setSelectedBonus(null);
        setStatusMessage({ type: 'success', text: 'Бонус удалён' });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления бонуса' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      {/* Header */}
      <div className="px-3 py-2 sm:px-4 sm:py-2.5 border-b border-border bg-surface flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
          <Gift className="w-4 h-4 text-accent" />
          <span>Кампании поставщиков</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent/15 text-accent font-bold">
            {supplierBonuses.length}
          </span>
        </span>
        <button
          onClick={() => setIsModalOpen(true)}
          className="h-8 px-2.5 sm:px-3 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg flex items-center gap-1.5 shrink-0 transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="sm:hidden">Бонус</span>
          <span className="hidden sm:inline">Зафиксировать бонус</span>
        </button>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-2.5 p-2 rounded-lg text-xs flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-danger/10 text-danger border border-danger/30'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* List of Bonuses */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 sm:space-y-3 bg-bg">
        {/* Bonuses are managed only here: the quarterly close zeroes them (admin) */}
        {currentUser?.role === 'ADMIN' && (
          <>
            <LegacyBonusAccrualsCard />
            <BonusAccountCard />
            <BonusQuarterCard />
          </>
        )}
        {supplierBonuses.length === 0 ? (
          <div className="p-8 text-center text-fg-subtle text-xs">
            Нет активных бонусных кампаний
          </div>
        ) : (
          [...supplierBonuses]
            .sort((a, b) => new Date(b.dateReceived || b.date || 0).getTime() - new Date(a.dateReceived || a.date || 0).getTime())
            .map((bonus) => (
            <div
              key={bonus.id}
              onClick={() => setSelectedBonus(bonus)}
              className="p-3 sm:p-3.5 rounded-xl bg-surface border border-border hover:border-accent/50 hover:bg-surface-raised cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 group"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-fg-muted">{bonus.campaignTitle || bonus.campaignName || `Бонус от ${bonus.supplierName}`}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                    bonus.bonusType === 'FREE_DEVICES' || bonus.deviceId
                      ? 'bg-warning/15 text-warning border border-warning/30'
                      : 'bg-accent/20 text-accent border border-accent/30'
                  }`}>
                    {bonus.bonusType === 'FREE_DEVICES' || bonus.deviceId ? 'Подарочные телефоны ($0)' : 'Денежная скидка'}
                  </span>
                </div>
                <p className="text-xs text-fg-muted">
                  Поставщик: <strong className="text-fg-muted">{bonus.supplierName}</strong> • {bonus.date || bonus.dateReceived || ''}
                </p>

                {bonus.freeDevices && (
                  <div className="pt-1 text-[11px] text-fg-muted flex items-center space-x-2">
                    <Smartphone className="w-3.5 h-3.5 text-warning shrink-0" />
                    <span className="truncate">
                      {bonus.freeDevices.map(d => `${d.brand} ${d.model} (${d.imei})${currentUser?.role === 'ADMIN' ? ` [Себестоимость: $${d.costBasisUsd}]` : ''}`).join(', ')}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-3 text-right shrink-0">
                <div>
                  {bonus.bonusType === 'CASH_DISCOUNT' ? (
                    <div>
                      <span className="text-sm font-bold text-accent block">+${bonus.amountUsd} USD</span>
                      <span className="text-[11px] text-accent font-bold block">≈ {Math.round((bonus.amountUsd || 0) * bonus.exchangeRate)} TJS · курс {bonus.exchangeRate}</span>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-warning block">
                      +{bonus.freeDevices?.length || 1} шт. бесплатно
                    </span>
                  )}
                  <span className="text-[10px] text-fg-subtle block mt-0.5">Нажмите для просмотра</span>
                </div>
                <ChevronRight className="w-4 h-4 text-fg-subtle group-hover:text-accent transition-colors" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL: Register Bonus */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateBonus} className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-4">
            <div>
              <h4 className="text-sm font-bold text-fg-muted flex items-center space-x-2">
                <Award className="w-4 h-4 text-warning" />
                <span>Регистрация бонуса от поставщика</span>
              </h4>
              <p className="text-[11px] text-accent font-semibold mt-0.5">
                ★ 100% любого бонуса учитывается в чистую прибыль
              </p>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-fg-subtle mb-1">Поставщик</label>
                <select
                  value={supplierId ?? ''}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-fg-subtle mb-1">Тип бонуса</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBonusType('FREE_DEVICES')}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium ${
                      bonusType === 'FREE_DEVICES' ? 'bg-warning/15 border-warning text-warning' : 'bg-surface-raised border-border text-fg-muted'
                    }`}
                  >
                    Бесплатный телефон ($0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBonusType('CASH_DISCOUNT')}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium ${
                      bonusType === 'CASH_DISCOUNT' ? 'bg-accent/15 border-accent text-accent' : 'bg-surface-raised border-border text-fg-muted'
                    }`}
                  >
                    Денежный бонус / Скидка
                  </button>
                </div>
              </div>

              {bonusType === 'FREE_DEVICES' ? (
                <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                  <div>
                    <label className="block text-fg-subtle mb-1">Куда оприходовать</label>
                    <select
                      value={destinationLocationId}
                      onChange={(e) => setDestinationLocationId(e.target.value)}
                      className="w-full rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    >
                      <option value="main-warehouse">Главный склад</option>
                      {stores.filter(s => !s.isMainWarehouse).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <span className="text-[11px] font-semibold text-fg-muted">Данные подарочного устройства:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      list="bonus-brand-suggestions"
                      value={bonusBrand ?? ''}
                      onChange={(e) => setBonusBrand(e.target.value)}
                      placeholder="Apple"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                    <datalist id="bonus-brand-suggestions">
                      {brandOptions.map(b => <option key={b} value={b} />)}
                    </datalist>
                    <input
                      type="text"
                      list="bonus-model-suggestions"
                      value={bonusModel ?? ''}
                      onChange={(e) => setBonusModel(e.target.value)}
                      placeholder="iPhone 16"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                    <datalist id="bonus-model-suggestions">
                      {getModelOptions(bonusBrand).map(m => <option key={m} value={m} />)}
                    </datalist>
                    <input
                      type="text"
                      required
                      list="bonus-ram-suggestions"
                      value={bonusRam ?? ''}
                      onChange={(e) => setBonusRam(e.target.value)}
                      placeholder="8 GB (ОЗУ) *"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                    <datalist id="bonus-ram-suggestions">
                      {ramOptions.map(r => <option key={r} value={r} />)}
                    </datalist>
                    <input
                      type="text"
                      list="bonus-storage-suggestions"
                      value={bonusStorage ?? ''}
                      onChange={(e) => setBonusStorage(e.target.value)}
                      placeholder="128 GB"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                    <datalist id="bonus-storage-suggestions">
                      {storageOptions.map(s => <option key={s} value={s} />)}
                    </datalist>
                    <input
                      type="text"
                      list="bonus-color-suggestions"
                      value={bonusColor ?? ''}
                      onChange={(e) => setBonusColor(e.target.value)}
                      placeholder="Black"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                    <datalist id="bonus-color-suggestions">
                      {colorOptions.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-border">
                    <div>
                      <label className="block text-fg-subtle text-[10px] uppercase font-bold mb-0.5">
                        IMEI 1 <span className="text-danger">*</span>
                      </label>
                      <div className="flex space-x-1.5">
                        <input
                          type="text"
                          required
                          value={bonusImei ?? ''}
                          onChange={(e) => setBonusImei(e.target.value)}
                          placeholder="351234567890123"
                          className="flex-1 rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleScanBonusImei}
                          className="px-2.5 py-1.5 bg-surface hover:bg-surface-raised text-accent rounded-lg border border-border transition-colors shrink-0"
                          title="Сканировать IMEI"
                        >
                          <Scan className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-fg-subtle text-[10px] uppercase font-bold mb-0.5">
                        IMEI 2 <span className="font-normal">(опционально / по желанию)</span>
                      </label>
                      <div className="flex space-x-1.5">
                        <input
                          type="text"
                          value={bonusImei2 ?? ''}
                          onChange={(e) => setBonusImei2(e.target.value)}
                          placeholder="351234567890124 (по желанию)"
                          className="flex-1 rounded-lg bg-surface border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleScanBonusImei2}
                          className="px-2.5 py-1.5 bg-surface hover:bg-surface-raised text-accent rounded-lg border border-border transition-colors shrink-0"
                          title="Сканировать IMEI 2"
                        >
                          <Scan className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-fg-subtle text-xs font-semibold">
                    Сумма бонуса — <span className="text-accent font-bold">100% в чистую прибыль</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[10px] text-fg-subtle mb-1 uppercase font-bold">В долларах ($ USD):</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-accent font-bold">$</span>
                        <input step="0.01"
                          type="number"
                          value={amountUsd ?? ''}
                          onChange={(e) => setAmountUsd(e.target.value)}
                          placeholder="250"
                          className="w-full rounded-lg bg-surface-raised border border-border pl-7 pr-2.5 py-1.5 text-xs font-bold text-accent focus:border-accent focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] text-fg-subtle mb-1 uppercase font-bold">В сомони (TJS):</span>
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-accent font-bold text-[11px]">SM</span>
                        <input step="0.01"
                          type="number"
                          value={amountUsd ? Math.round((parseFloat(amountUsd) || 0) * rate) : ''}
                          onChange={(e) => {
                            const valTjs = parseFloat(e.target.value);
                            if (!isNaN(valTjs)) {
                              setAmountUsd((valTjs / rate).toFixed(2));
                            } else {
                              setAmountUsd('');
                            }
                          }}
                          placeholder="2375"
                          className="w-full rounded-lg bg-surface-raised border border-border pl-8 pr-2.5 py-1.5 text-xs font-bold text-accent focus:border-accent focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  {amountUsd && parseFloat(amountUsd) > 0 && (
                    <p className="text-[11px] text-accent font-bold bg-accent/10 border border-accent/20 p-2 rounded-lg">
                      ★ Конвертация по курсу {rate} TJS/USD: ${amountUsd} USD = {Math.round((parseFloat(amountUsd) || 0) * rate)} TJS (100% в чистую прибыль учредителей)
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Сохранение…' : 'Сохранить бонус'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: View Gift Bonus Details */}
      {selectedBonus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-warning/15 text-warning border border-warning/30">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-fg-muted uppercase">
                    {selectedBonus.campaignTitle || selectedBonus.campaignName || `БОНУС ОТ ${selectedBonus.supplierName.toUpperCase()}`}
                  </h3>
                  <p className="text-[11px] text-fg-subtle mt-0.5">
                    Поставщик: <strong className="text-fg-muted">{selectedBonus.supplierName}</strong> • {selectedBonus.date || selectedBonus.dateReceived || ''}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedBonus(null)}
                className="p-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-fg-muted border border-border transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Gift Details Content */}
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between text-xs">
                <span className="text-fg-subtle uppercase text-[11px]">ТИП БОНУСА:</span>
                <span className="font-bold text-warning flex items-center space-x-1">
                  <span>🎁 ПОДАРОЧНЫЕ ТЕЛЕФОНЫ ($0)</span>
                </span>
              </div>

              <div className="text-xs font-bold text-fg-muted uppercase pt-1">
                ПОЛУЧЕНО В ПОДАРОК ({giftDevices.length || 1} шт.):
              </div>

              {giftDevices.length > 0 ? (
                giftDevices.map((dev, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <Smartphone className="w-4 h-4 text-accent" />
                        <strong className="text-fg-muted font-bold">{dev.brand} {dev.model}</strong>
                        <span className="text-fg-subtle text-[11px]">{dev.storage} • {dev.color}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-highlight/20 text-highlight border border-highlight/40 font-bold uppercase">
                        $0 ПОДАРОК
                      </span>
                    </div>

                    <div className="text-[11px] text-fg-subtle grid grid-cols-2 gap-2 pt-1 border-t border-border">
                      <div>IMEI: <strong className="text-fg-muted">{dev.imei || '358901200778899'}</strong></div>
                      <div>Локация: <strong className="text-fg-muted">{dev.locationName || 'Главный склад'}</strong></div>
                      <div>Себестоимость: <strong className="text-accent font-bold">$0.00 (БЕСПЛАТНО)</strong></div>
                      <div>Статус: <strong className={dev.status === 'SOLD' ? 'text-warning' : 'text-accent'}>{dev.status === 'SOLD' ? 'ПРОДАН' : 'НА СКЛАДЕ'}</strong></div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-xl bg-surface-raised border border-border text-xs text-fg-muted space-y-1">
                  <div className="flex items-center space-x-2">
                    <Smartphone className="w-4 h-4 text-accent" />
                    <strong className="text-fg-muted">{selectedBonus.brand || 'Apple'} {selectedBonus.model || 'iPhone 16'}</strong>
                    <span className="text-fg-subtle">({selectedBonus.storage || '128 GB'})</span>
                  </div>
                  <p className="text-[11px] text-fg-subtle">IMEI: {selectedBonus.imei || '316513218151383'}</p>
                  <p className="text-[11px] text-accent font-bold">Себестоимость: $0 (Бесплатный подарок по акции)</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleStartEditBonus(selectedBonus)}
                  className="px-3 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-muted font-bold text-xs uppercase flex items-center gap-1.5"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Редактировать
                </button>
                <button
                  onClick={() => setDeletingBonus(selectedBonus)}
                  className="px-3 py-2 rounded-xl bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger font-bold text-xs uppercase flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Удалить
                </button>
              </div>
              <button
                onClick={() => setSelectedBonus(null)}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs uppercase"
              >
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Bonus */}
      {editingBonus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveEditBonus} className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="text-sm font-bold text-fg-muted flex items-center space-x-2">
                <Edit className="w-4 h-4 text-accent" />
                <span>Редактировать бонус</span>
              </h4>
              <button type="button" onClick={() => setEditingBonus(null)} className="text-fg-subtle hover:text-fg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-fg-subtle mb-1">Название кампании (опционально)</label>
                <input
                  type="text"
                  value={editCampaignTitle}
                  onChange={(e) => setEditCampaignTitle(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              {editingBonus.bonusType === 'CASH_DISCOUNT' ? (
                <div>
                  <label className="block text-fg-subtle text-xs font-semibold mb-1">
                    Сумма бонуса ($ USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-accent font-bold">$</span>
                    <input step="0.01"
                      type="number"
                      value={editAmountUsd}
                      onChange={(e) => setEditAmountUsd(e.target.value)}
                      className="w-full rounded-lg bg-surface-raised border border-border pl-7 pr-2.5 py-1.5 text-xs font-bold text-accent focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                  <span className="text-[11px] font-semibold text-fg-muted">Данные подарочного устройства:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      list="bonus-brand-suggestions"
                      value={editBrand}
                      onChange={(e) => setEditBrand(e.target.value)}
                      placeholder="Apple"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      list="bonus-model-suggestions"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="iPhone 16"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      list="bonus-storage-suggestions"
                      value={editStorage}
                      onChange={(e) => setEditStorage(e.target.value)}
                      placeholder="128 GB"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      list="bonus-color-suggestions"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      placeholder="Black"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2 pt-1 border-t border-border">
                    <div>
                      <label className="block text-fg-subtle text-[10px] uppercase font-bold mb-0.5">IMEI 1</label>
                      <input
                        type="text"
                        required
                        value={editImei}
                        onChange={(e) => setEditImei(e.target.value)}
                        className="w-full rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-fg-subtle text-[10px] uppercase font-bold mb-0.5">
                        IMEI 2 <span className="font-normal">(если менялся)</span>
                      </label>
                      <input
                        type="text"
                        value={editImei2}
                        onChange={(e) => setEditImei2(e.target.value)}
                        placeholder="Оставьте пустым, если без изменений"
                        className="w-full rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-fg-subtle">
                    Редактирование недоступно, если устройство уже продано, перемещено или отправлено в ремонт.
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setEditingBonus(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Delete Bonus Confirmation */}
      {deletingBonus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-danger/40 p-5 shadow-2xl text-fg-muted space-y-4">
            <div className="flex items-center space-x-3 text-danger">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-fg-muted">Удаление бонуса</h3>
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              Вы действительно хотите удалить бонус от{' '}
              <strong className="text-fg-muted">{deletingBonus.supplierName}</strong>?
              {deletingBonus.bonusType === 'CASH_DISCOUNT'
                ? ' Начисленная от него прибыль владельцев будет отменена.'
                : ' Подарочное устройство будет удалено со склада (если оно ещё не продано и не перемещено).'}
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                disabled={isSubmitting}
                onClick={() => setDeletingBonus(null)}
                className="px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleConfirmDeleteBonus}
                className="px-4 py-2.5 rounded-xl bg-danger hover:opacity-90 text-xs font-bold text-white uppercase shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Удаление…' : 'Удалить бонус'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
