import React, { useState, useMemo } from 'react';
import { formatMoney } from '../../utils/money';
import { Navigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { Store as StoreType } from '../../types';
import {
  Settings as SettingsIcon,
  Store,
  DollarSign,
  Plus,
  CheckCircle2,
  AlertCircle,
  Building,
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
  Warehouse
} from 'lucide-react';

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
          text: `Магазин «${sourceName}» объединён с «${targetName}»: касса и вся история перенесены.`
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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <SettingsIcon className="w-4 h-4 text-accent" />
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-3 p-3 rounded-xl text-xs flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-danger/15 text-danger border border-danger/30'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Symmetrical Content Container */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-5">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Row 1: Symmetrical 2-Column Grid (Theme + Exchange Rate) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
            {/* 1. Theme Configuration Card */}
            <div className="p-4 rounded-xl bg-surface border border-border space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 pb-2 border-b border-border mb-3">
                  <Sparkles className="w-4 h-4 text-accent" />
                  <h4 className="text-xs sm:text-sm font-bold text-fg-muted uppercase">РЕЖИМ ОФОРМЛЕНИЯ</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Light mode */}
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`p-3 rounded-xl border text-left flex items-start space-x-2.5 transition-all ${
                      theme === 'light'
                        ? 'border-accent bg-accent/10 font-semibold'
                        : 'border-border bg-surface-raised hover:border-fg-subtle'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${theme === 'light' ? 'bg-accent/20 text-accent' : 'bg-surface text-fg-subtle'}`}>
                      <Sun className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-fg-muted uppercase">СВЕТЛЫЙ</span>
                        {theme === 'light' && (
                          <Check className="w-3 h-3 text-accent" />
                        )}
                      </div>
                      <p className="text-[10px] text-fg-muted mt-0.5">
                        Дневной режим
                      </p>
                    </div>
                  </button>

                  {/* Dark mode */}
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`p-3 rounded-xl border text-left flex items-start space-x-2.5 transition-all ${
                      theme === 'dark'
                        ? 'border-accent bg-accent/10 font-semibold'
                        : 'border-border bg-surface-raised hover:border-fg-subtle'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${theme === 'dark' ? 'bg-accent/20 text-accent' : 'bg-surface text-fg-subtle'}`}>
                      <Moon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-fg-muted uppercase">ТЁМНЫЙ</span>
                        {theme === 'dark' && (
                          <Check className="w-3 h-3 text-accent" />
                        )}
                      </div>
                      <p className="text-[10px] text-fg-muted mt-0.5">
                        Тёмный режим
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Exchange Rate Card */}
            <div className="p-4 rounded-xl bg-surface border border-border space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-border mb-3">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-4 h-4 text-accent" />
                    <h4 className="text-xs sm:text-sm font-bold text-fg-muted uppercase">КУРС ВАЛЮТ (TJS / USD)</h4>
                  </div>
                  <button
                    type="button"
                    onClick={openDailyRateModal}
                    className="px-3 py-1 rounded-lg bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase transition-colors shadow-xs"
                  >
                    ИЗМЕНИТЬ КУРС
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-fg-subtle uppercase block">ТЕКУЩИЙ КУРС</span>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="text-xl font-bold text-accent">
                        {(todayRate?.rate ?? 9.5).toFixed(2)} TJS
                      </span>
                      <span className="text-xs text-fg-muted">за $1 USD</span>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <span className="text-[10px] text-fg-subtle uppercase block">ОБНОВЛЕНИЕ</span>
                    <span className="text-fg-muted font-bold mt-0.5 block text-[11px]">
                      {todayRate?.date}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-fg-muted pt-1">
                Курс применяется при расчете розничных цен в сомони и контроле маржи.
              </p>
            </div>
          </div>

          {/* Row 2: Full-Width Symmetrical Stores List */}
          <div className="p-4 rounded-xl bg-surface border border-border space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center space-x-2">
                <Store className="w-4 h-4 text-accent" />
                <h4 className="text-xs sm:text-sm font-bold text-fg-muted uppercase">
                  {isAdmin ? `ЦЕНТРАЛЬНЫЙ СКЛАД И МАГАЗИНЫ (${visibleStores.length})` : `МОЙ МАГАЗИН`}
                </h4>
              </div>

              {isAdmin && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsAddStoreOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-xs font-bold text-accent flex items-center space-x-1.5 border border-border transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ДОБАВИТЬ МАГАЗИН</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleStores.map((s: StoreType) => (
                <div key={s.id} className="p-3.5 rounded-xl bg-surface-raised border border-border flex flex-col justify-between space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-2">
                        {s.isMainWarehouse ? <Warehouse className="w-4 h-4 text-warning shrink-0" /> : <Store className="w-4 h-4 text-accent shrink-0" />}
                        <span className="text-xs font-bold text-fg-muted uppercase truncate">{s.name}</span>
                      </div>
                      {s.address && (
                        <p className="text-[11px] text-fg-muted flex items-center space-x-1 mt-1 pl-5 truncate">
                          <MapPin className="w-3 h-3 text-fg-subtle shrink-0" />
                          <span className="truncate">{s.address}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      {s.isMainWarehouse ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-warning/15 text-warning border border-warning/30 uppercase">
                          ЦЕНТРАЛЬНЫЙ СКЛАД
                        </span>
                      ) : (
                        <>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30 uppercase mr-1">
                            МАГАЗИН
                          </span>
                          {isAdmin && (
                            <>
                              {visibleStores.length > 2 && (
                                <button
                                  onClick={() => handleOpenMerge(s)}
                                  className="p-1.5 rounded-lg hover:bg-accent/10 text-fg-subtle hover:text-accent transition-colors"
                                  title="Объединить с другим магазином"
                                >
                                  <Combine className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteStore(s)}
                                className="p-1.5 rounded-lg hover:bg-danger/10 text-fg-subtle hover:text-danger transition-colors"
                                title="Удалить магазин"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                      {(isAdmin || (currentUser?.role === 'PARTNER' && s.id === currentUser?.storeId)) && (
                        <>
                          <button
                            onClick={() => handleOpenAdjust(s)}
                            className="p-1.5 rounded-lg hover:bg-warning/10 text-fg-subtle hover:text-warning transition-colors"
                            title="Скорректировать кассу"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEditStore(s)}
                            className="p-1.5 rounded-lg hover:bg-surface text-fg-subtle hover:text-fg-muted transition-colors"
                            title="Редактировать филиал"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex justify-between items-baseline text-xs">
                    <span className="text-fg-subtle text-[11px] uppercase">Остаток в кассе:</span>
                    <span className="font-bold text-accent">
                      ${formatMoney(s.cashBalanceUsd)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Account & Session Section with Logout */}
          <div className="p-4 rounded-xl bg-surface border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-fg-muted uppercase">АККАУНТ И СЕССИЯ</h4>
              <p className="text-[11px] text-fg-muted mt-0.5">
                Вы вошли как <strong className="text-fg-muted">{currentUser?.name}</strong> ({currentUser?.role === 'ADMIN' ? 'Администратор' : currentUser?.role})
                {(() => {
                  const sName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;
                  return sName ? <span className="text-accent font-medium"> • Магазин: {sName}</span> : null;
                })()}
              </p>
            </div>

            <button
              onClick={logout}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-danger/10 hover:bg-danger/15 active:bg-danger/20 text-danger border border-danger/30 text-xs font-bold flex items-center justify-center space-x-2 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>ВЫЙТИ ИЗ СИСТЕМЫ</span>
            </button>
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
                <span>Магазин «{mergingStore.name}» будет удалён после переноса. Действие необратимо.</span>
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
