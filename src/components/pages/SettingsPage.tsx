import React, { useState, useMemo } from 'react';
import { formatMoney } from '../../utils/money';
import { Navigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { Store as StoreType } from '../../types';
import { formatUserName } from '../../utils/formatUser';
import {
  Settings as SettingsIcon,
  Store,
  DollarSign,
  Plus,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
  Check,
  MapPin,
  Sparkles,
  Pencil,
  Trash2,
  LogOut,
  Combine,
  Wrench,
  Loader2,
  Warehouse,
  RefreshCw,
  Download,
  Smartphone,
  ShieldCheck
} from 'lucide-react';
import { usePWAUpdate } from '../../hooks/usePWAUpdate';
import { cn } from '../../utils/cn';

export const SettingsPage: React.FC = () => {
  const {
    currentUser,
    stores,
    todayRate,
    createStore,
    updateStore,
    deleteStore,
    mergeStores,
    adjustStoreCashBalance,
    openDailyRateModal,
    theme,
    setTheme,
    logout
  } = useAppFields('currentUser', 'stores', 'todayRate', 'createStore', 'updateStore', 'deleteStore', 'mergeStores', 'adjustStoreCashBalance', 'openDailyRateModal', 'theme', 'setTheme', 'logout');

  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddress, setNewStoreAddress] = useState('');
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);

  const [editingStore, setEditingStore] = useState<StoreType | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [deletingStoreConfirm, setDeletingStoreConfirm] = useState<StoreType | null>(null);

  const [mergingStore, setMergingStore] = useState<StoreType | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [isSubmittingMerge, setIsSubmittingMerge] = useState(false);

  const [adjustingStore, setAdjustingStore] = useState<StoreType | null>(null);
  const [adjustNewBalance, setAdjustNewBalance] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const pwa = usePWAUpdate();
  const [checkUpdateLoading, setCheckUpdateLoading] = useState(false);
  const [checkFeedback, setCheckFeedback] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'ADMIN';
  const visibleStores = useMemo<StoreType[]>(() => {
    if (isAdmin) return stores;
    return stores.filter((s: StoreType) => !s.isMainWarehouse && s.id === currentUser?.storeId);
  }, [stores, isAdmin, currentUser?.storeId]);

  if (currentUser?.role === 'SELLER') {
    return <Navigate to="/sale" replace />;
  }

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;

    const res = await createStore(newStoreName.trim(), newStoreAddress.trim());

    if (res.success) {
      setIsAddStoreOpen(false);
      setNewStoreName('');
      setNewStoreAddress('');
      setStatusMessage({ type: 'success', text: 'Новая торговая точка успешно добавлена' });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания филиала' });
    }
  };

  const handleEditStore = (store: StoreType) => {
    setEditingStore(store);
    setEditName(store.name);
    setEditAddress(store.address || '');
  };

  const handleSaveEditStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore) return;

    const res = await updateStore(editingStore.id, editName, editAddress);
    if (res.success) {
      setEditingStore(null);
      setStatusMessage({ type: 'success', text: `Филиал «${editName}» успешно обновлен` });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления филиала' });
    }
  };

  const handleDeleteStore = (store: StoreType) => {
    if (store.isMainWarehouse) {
      setStatusMessage({ type: 'error', text: 'Центральный (Главный) склад нельзя удалить. Он всегда остается в системе.' });
      return;
    }
    setDeletingStoreConfirm(store);
  };

  const handleConfirmDeleteStore = async () => {
    if (!deletingStoreConfirm) return;
    const targetName = deletingStoreConfirm.name;
    const res = await deleteStore(deletingStoreConfirm.id);
    setDeletingStoreConfirm(null);

    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: `Филиал «${targetName}» успешно удален. Все его товары автоматически перенесены на Главный склад.`
      });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления филиала' });
    }
  };

  const handleOpenMerge = (store: StoreType) => {
    if (store.isMainWarehouse) {
      setStatusMessage({ type: 'error', text: 'Главный склад нельзя объединить с другим магазином' });
      return;
    }
    setMergingStore(store);
    setMergeTargetId(stores.find(s => s.id !== store.id && !s.isMainWarehouse)?.id || '');
  };

  const handleConfirmMerge = async () => {
    if (!mergingStore || !mergeTargetId || isSubmittingMerge) return;
    const sourceName = mergingStore.name;
    const targetName = stores.find(s => s.id === mergeTargetId)?.name || '';
    setIsSubmittingMerge(true);
    try {
      const res = await mergeStores(mergingStore.id, mergeTargetId);
      if (res.success) {
        setMergingStore(null);
        setStatusMessage({
          type: 'success',
          text: `Магазин «${sourceName}» объединён с «${targetName}» и закрыт: касса переведена, продажи, товары, ремонты, расходы и инкассации перенесены.`
        });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка объединения магазинов' });
      }
    } finally {
      setIsSubmittingMerge(false);
    }
  };

  const handleOpenAdjust = (store: StoreType) => {
    setAdjustingStore(store);
    setAdjustNewBalance((store.cashBalanceUsd ?? 0).toFixed(2));
    setAdjustReason('');
  };

  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingStore || isSubmittingAdjust) return;
    if (!adjustReason.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите причину корректировки' });
      return;
    }
    const parsed = parseFloat(adjustNewBalance);
    if (!Number.isFinite(parsed)) {
      setStatusMessage({ type: 'error', text: 'Укажите корректную сумму' });
      return;
    }
    setIsSubmittingAdjust(true);
    try {
      const res = await adjustStoreCashBalance(adjustingStore.id, parsed, adjustReason.trim());
      if (res.success) {
        setAdjustingStore(null);
        setStatusMessage({ type: 'success', text: `Касса «${adjustingStore.name}» установлена: $${formatMoney(parsed)}` });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка корректировки кассы' });
      }
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      {/* Header Bar - visible on sm+ screens */}
      <div className="hidden sm:flex px-4 py-2 border-b border-border bg-surface items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <SettingsIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-fg leading-tight">Настройки системы</h1>
            <p className="text-[10px] text-fg-subtle truncate">Оформление, курс валют, филиалы и параметры приложения</p>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-2.5 p-2.5 rounded-xl text-xs flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-danger/15 text-danger border border-danger/30'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="text-[11px] sm:text-xs">{statusMessage.text}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 lg:p-6 space-y-4">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 items-start">
            {/* ============================================================== */}
            {/* Left Column: Stores & Parameters (lg:col-span-7 xl:col-span-8) */}
            {/* ============================================================== */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-3.5 sm:space-y-4">
              {/* Stores & Branches Section */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-border/60 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                      <Store className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide truncate">
                        {isAdmin ? `Склады и магазины` : `Мой магазин`}
                      </h3>
                      <p className="text-[10px] text-fg-subtle">
                        {isAdmin
                          ? `Всего торговых точек: ${visibleStores.length}`
                          : 'Торговая точка, привязанная к кассе и складу'}
                      </p>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsAddStoreOpen(true)}
                      className="px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-surface text-xs font-bold text-accent flex items-center gap-1 border border-border transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить</span>
                    </button>
                  )}
                </div>

                <div className={isAdmin ? "grid grid-cols-1 sm:grid-cols-2 gap-2.5" : "space-y-2.5"}>
                  {visibleStores.map((s: StoreType) => (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-xl bg-surface-raised border border-border/80 hover:border-accent/40 transition-all flex flex-col justify-between shadow-2xs",
                        isAdmin ? "p-3 gap-2" : "p-3.5 gap-2.5"
                      )}
                    >
                      {/* Top: Name + Badge */}
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {s.isMainWarehouse ? (
                              <Warehouse className="w-4 h-4 text-amber-500 shrink-0" />
                            ) : (
                              <Store className="w-4 h-4 text-accent shrink-0" />
                            )}
                            <span className="text-xs sm:text-sm font-bold text-fg truncate" title={s.name}>
                              {s.name}
                            </span>
                          </div>

                          {s.isMainWarehouse ? (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30 uppercase tracking-wider shrink-0">
                              Склад
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30 uppercase tracking-wider shrink-0">
                              Магазин
                            </span>
                          )}
                        </div>

                        {s.address ? (
                          <p className="text-[11px] text-fg-subtle flex items-center gap-1 mt-1 pl-6 truncate">
                            <MapPin className="w-3 h-3 text-fg-subtle shrink-0" />
                            <span className="truncate">{s.address}</span>
                          </p>
                        ) : (
                          <p className="text-[10px] text-fg-subtle/70 italic mt-0.5 pl-6">
                            Адрес не указан
                          </p>
                        )}
                      </div>

                      {/* Cash Balance Display & Actions */}
                      <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                          <span className="text-fg-subtle text-[10px] uppercase font-semibold">Касса:</span>
                          <span className="font-bold font-mono text-accent text-xs sm:text-sm">
                            ${formatMoney(s.cashBalanceUsd)}
                          </span>
                          {todayRate?.rate && (
                            <span className="text-[10px] text-fg-subtle font-mono truncate">
                              ≈ {formatMoney((s.cashBalanceUsd || 0) * todayRate.rate)} TJS
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Adjust balance */}
                          {(isAdmin || (currentUser?.role === 'PARTNER' && s.id === currentUser?.storeId)) && (
                            <button
                              type="button"
                              onClick={() => handleOpenAdjust(s)}
                              className="p-1.5 rounded-lg hover:bg-warning/10 text-fg-subtle hover:text-warning border border-transparent hover:border-warning/20 transition-colors cursor-pointer"
                              title="Скорректировать остаток кассы"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit */}
                          {(isAdmin || (currentUser?.role === 'PARTNER' && s.id === currentUser?.storeId)) && (
                            <button
                              type="button"
                              onClick={() => handleEditStore(s)}
                              className="p-1.5 rounded-lg hover:bg-surface text-fg-subtle hover:text-fg border border-transparent hover:border-border transition-colors cursor-pointer"
                              title="Редактировать филиал"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Merge & Delete (admin only, non-warehouse) */}
                          {!s.isMainWarehouse && isAdmin && (
                            <>
                              {visibleStores.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenMerge(s)}
                                  className="p-1.5 rounded-lg hover:bg-accent/10 text-fg-subtle hover:text-accent border border-transparent hover:border-accent/20 transition-colors cursor-pointer"
                                  title="Объединить с другим магазином"
                                >
                                  <Combine className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteStore(s)}
                                className="p-1.5 rounded-lg hover:bg-danger/10 text-fg-subtle hover:text-danger border border-transparent hover:border-danger/20 transition-colors cursor-pointer"
                                title="Удалить магазин"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Theme Switcher & Exchange Rate Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {/* 1. Theme Configuration Card */}
                <div className="p-3.5 rounded-2xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2.5">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-border/50">
                    <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
                    <h4 className="text-xs font-bold text-fg uppercase tracking-wide">Тема оформления</h4>
                  </div>

                  <div className="flex items-center bg-surface-raised p-1 rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs transition-all cursor-pointer ${
                        theme === 'light'
                          ? 'bg-surface text-accent shadow-xs border border-border/80 font-bold'
                          : 'text-fg-subtle hover:text-fg font-medium'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>Светлая</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs transition-all cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-surface text-accent shadow-xs border border-border/80 font-bold'
                          : 'text-fg-subtle hover:text-fg font-medium'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Тёмная</span>
                    </button>
                  </div>
                </div>

                {/* 2. Exchange Rate Card */}
                <div className="p-3.5 rounded-2xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-accent shrink-0" />
                      <h4 className="text-xs font-bold text-fg uppercase tracking-wide">Курс валют</h4>
                    </div>
                    <button
                      type="button"
                      onClick={openDailyRateModal}
                      className="px-2.5 py-1 rounded-lg bg-accent hover:bg-accent-strong text-[10px] font-bold text-accent-fg uppercase transition-colors shadow-2xs cursor-pointer"
                    >
                      Изменить
                    </button>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-surface-raised border border-border/70 flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base sm:text-lg font-bold font-mono text-accent">
                        {(todayRate?.rate ?? 9.5).toFixed(2)} TJS
                      </span>
                      <span className="text-[11px] text-fg-subtle">за $1 USD</span>
                    </div>

                    <div className="text-right">
                      <span className="text-fg font-mono font-medium text-[11px]">
                        {todayRate?.date}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* Right Column: User Profile & System Status (lg:col-span-5/4)   */}
            {/* ============================================================== */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-3.5 sm:space-y-4">
              {/* Account & Session Card */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-fg uppercase tracking-wide">
                    <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                    <span>Учётная запись</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" title="Активна" />
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-accent/15 border border-accent/30 text-accent font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
                    {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'СИС'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-fg truncate">{formatUserName(currentUser?.name)}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-accent/15 text-accent border border-accent/25 uppercase">
                        {currentUser?.role === 'ADMIN' ? 'Администратор' : currentUser?.role === 'PARTNER' ? 'Партнер' : 'Продавец'}
                      </span>
                    </div>
                    <p className="text-xs text-fg-subtle truncate mt-0.5">
                      Логин: <strong className="text-fg font-medium">@{currentUser?.login}</strong>
                    </p>
                    {(() => {
                      const sName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;
                      return sName ? (
                        <p className="text-[11px] text-accent font-medium truncate mt-0.5 flex items-center gap-1">
                          <Store className="w-3 h-3 shrink-0" />
                          <span>{sName}</span>
                        </p>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/60">
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-2 px-3 rounded-xl bg-danger/10 hover:bg-danger/15 active:bg-danger/20 text-danger border border-danger/25 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Выйти из аккаунта</span>
                  </button>
                </div>
              </div>

              {/* System Information & PWA Updates */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent shrink-0">
                      <Smartphone className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-fg uppercase tracking-wide truncate">Система и PWA</h4>
                      <p className="text-[10px] text-fg-subtle truncate">
                        {pwa.isStandalone ? 'Установлено как приложение (PWA)' : 'Запущено в веб-браузере'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        setCheckUpdateLoading(true);
                        setCheckFeedback(null);
                        const updateFound = await pwa.checkForUpdates(true);
                        setCheckUpdateLoading(false);
                        setCheckFeedback(updateFound ? 'Доступна новая версия!' : 'Установлена последняя версия');
                        setTimeout(() => setCheckFeedback(null), 5000);
                      }}
                      disabled={checkUpdateLoading || pwa.isUpdating}
                      className="px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${checkUpdateLoading ? 'animate-spin text-accent' : ''}`} />
                      <span>{checkUpdateLoading ? 'Проверка…' : 'Проверить обновления'}</span>
                    </button>
                  </div>
                </div>

                {pwa.hasUpdate && (
                  <div className="p-3 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <RefreshCw className={`w-4 h-4 text-accent shrink-0 ${pwa.isUpdating ? 'animate-spin' : ''}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-fg">Доступно обновление ПО</p>
                        <p className="text-[10px] text-fg-subtle truncate">
                          Новая сборка: {pwa.latestCommit ? pwa.latestCommit.slice(0, 7) : 'свежая версия'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => pwa.applyUpdate()}
                      disabled={pwa.isUpdating}
                      className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-strong active:scale-95 text-accent-fg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {pwa.isUpdating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Обновление…</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Обновить сейчас</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {checkFeedback && !pwa.hasUpdate && (
                  <div className="p-2 rounded-xl bg-surface-raised border border-accent/30 text-accent text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{checkFeedback}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-surface-raised border border-border/60">
                    <span className="text-[11px] text-fg-subtle">Состояние сети:</span>
                    <span className="text-[11px] font-semibold text-fg flex items-center gap-1.5">
                      {pwa.offline ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
                          Офлайн
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          Онлайн
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-surface-raised border border-border/60">
                    <span className="text-[11px] text-fg-subtle">Версия ПО:</span>
                    <span className="text-[11px] font-bold font-mono text-accent">
                      Mobile Shop v1.3.0 {pwa.currentCommit && pwa.currentCommit !== 'dev' ? `(${pwa.currentCommit.slice(0, 7)})` : ''}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Add Store */}
      {isAddStoreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleAddStore} className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-3">
            <h4 className="text-sm font-bold text-fg-muted mb-2 uppercase">НОВЫЙ МАГАЗИН</h4>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Название магазина *</label>
                <input
                  type="text"
                  required
                  value={newStoreName ?? ''}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="Магазин №3 Садбарг"
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Адрес магазина</label>
                <input
                  type="text"
                  value={newStoreAddress ?? ''}
                  onChange={(e) => setNewStoreAddress(e.target.value)}
                  placeholder="ул. Айни 48"
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddStoreOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase"
              >
                Создать магазин
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Edit Store */}
      {editingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveEditStore} className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-3">
            <h4 className="text-sm font-bold text-fg-muted mb-2 uppercase">РЕДАКТИРОВАТЬ МАГАЗИН</h4>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Название магазина *</label>
                <input
                  type="text"
                  required
                  value={editName ?? ''}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Адрес</label>
                <input
                  type="text"
                  value={editAddress ?? ''}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingStore(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DELETE STORE CONFIRMATION */}
      {deletingStoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-danger/40 p-5 shadow-2xl space-y-4 text-fg-muted">
            <div className="flex items-center space-x-3 text-danger border-b border-border pb-3">
              <div className="p-2 rounded-xl bg-danger/15 text-danger shrink-0 border border-danger/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase text-fg-muted">УДАЛЕНИЕ МАГАЗИНА</h3>
                <p className="text-[11px] text-fg-muted mt-0.5">{deletingStoreConfirm.name}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-raised border border-border text-xs space-y-2">
              <p className="text-fg-muted font-semibold">
                Вы действительно хотите удалить магазин «<span className="text-danger">{deletingStoreConfirm.name}</span>»?
              </p>
              <p className="text-[11px] text-accent flex items-start space-x-1.5 pt-1">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Все остатки товаров из этого магазина будут <strong>автоматически перенесены на Центральный склад</strong>.</span>
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingStoreConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase transition-colors"
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStore}
                className="flex-1 py-2.5 rounded-xl bg-danger hover:bg-danger/90 active:scale-95 text-xs font-bold uppercase text-white shadow-lg transition-colors"
              >
                УДАЛИТЬ МАГАЗИН
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MERGE STORES */}
      {mergingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-accent/40 p-5 shadow-2xl space-y-4 text-fg-muted">
            <div className="flex items-center space-x-3 text-accent border-b border-border pb-3">
              <div className="p-2 rounded-xl bg-accent/15 text-accent shrink-0 border border-accent/20">
                <Combine className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase text-fg-muted">ОБЪЕДИНЕНИЕ МАГАЗИНОВ</h3>
                <p className="text-[11px] text-fg-muted mt-0.5">{mergingStore.name}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-raised border border-border text-xs space-y-3">
              <p className="text-fg-muted">
                Все товары, продажи, ремонты, расходы, перемещения и касса магазина «<strong className="text-fg-muted">{mergingStore.name}</strong>» (${formatMoney(mergingStore.cashBalanceUsd)}) будут перенесены в:
              </p>
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="w-full rounded-lg bg-surface border border-border px-3 py-2 text-fg-muted focus:outline-none focus:border-accent"
              >
                {stores.filter(s => s.id !== mergingStore.id && !s.isMainWarehouse).map(s => (
                  <option key={s.id} value={s.id}>{s.name} (Остаток: ${formatMoney(s.cashBalanceUsd)})</option>
                ))}
              </select>
              <p className="text-[11px] text-danger flex items-start space-x-1.5 pt-1">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Магазин «{mergingStore.name}» будет закрыт после переноса: его касса переводится одной проводкой, история журнала сохраняется. Действие необратимо.</span>
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                disabled={isSubmittingMerge}
                onClick={() => setMergingStore(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase transition-colors disabled:opacity-50"
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                disabled={isSubmittingMerge || !mergeTargetId}
                onClick={handleConfirmMerge}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-xs font-bold uppercase text-accent-fg shadow-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmittingMerge && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmittingMerge ? 'ОБЪЕДИНЕНИЕ…' : 'ОБЪЕДИНИТЬ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADJUST CASH BALANCE */}
      {adjustingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleConfirmAdjust} className="w-full max-w-sm rounded-2xl bg-surface border border-warning/40 p-5 shadow-2xl space-y-4 text-fg-muted">
            <div className="flex items-center space-x-3 text-warning border-b border-border pb-3">
              <div className="p-2 rounded-xl bg-warning/15 text-warning shrink-0 border border-warning/20">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase text-fg-muted">КОРРЕКТИРОВКА КАССЫ</h3>
                <p className="text-[11px] text-fg-muted mt-0.5">{adjustingStore.name}</p>
              </div>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Текущий остаток</label>
                <p className="text-fg-muted">${formatMoney(adjustingStore.cashBalanceUsd)}</p>
              </div>
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Новый остаток (USD) *</label>
                <input step="0.01"
                  type="number"
                  value={adjustNewBalance}
                  onChange={(e) => setAdjustNewBalance(e.target.value)}
                  required
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted font-bold focus:outline-none focus:border-warning"
                />
              </div>
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] uppercase">Причина корректировки *</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Например: исправление исторической ошибки в остатке"
                  required
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:outline-none focus:border-warning"
                />
              </div>
              <p className="text-[11px] text-fg-subtle">
                Причина сохраняется в журнале аудита. Это прямая корректировка остатка, а не транзакция — в отчётах она не отражается как доход или расход.
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                disabled={isSubmittingAdjust}
                onClick={() => setAdjustingStore(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase transition-colors disabled:opacity-50"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                disabled={isSubmittingAdjust}
                className="flex-1 py-2.5 rounded-xl bg-warning hover:bg-warning/90 active:scale-95 text-xs font-bold uppercase text-black shadow-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmittingAdjust && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmittingAdjust ? 'СОХРАНЕНИЕ…' : 'СОХРАНИТЬ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
