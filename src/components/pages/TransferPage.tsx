import React, { useState, useMemo, useEffect } from 'react';
import { formatMoney } from '../../utils/money';
import { useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { TransferRequest } from '../../types';
import {
  ArrowLeftRight,
  AlertCircle,
  Store as StoreIcon,
  Send,
  Check,
  Loader2
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SearchBar } from '../ui/SearchBar';
import { LoadingState } from '../ui/Skeleton';
import { DEVICE_STATUS_LABELS, findDeviceByCode, looksLikeDeviceCode, normalizeScanCode } from '../../utils/scanLookup';

export const TransferPage: React.FC = () => {
  const {
    currentUser,
    stores,
    devices,
    transfers,
    createTransferRequest,
    approveTransfer,
    rejectTransfer,
    openScanner,
    isInitialLoading,
    selectedStoreId: globalSelectedStoreId
  } = useAppFields('currentUser', 'stores', 'devices', 'transfers', 'createTransferRequest', 'approveTransfer', 'rejectTransfer', 'openScanner', 'isInitialLoading', 'selectedStoreId');

  const isSeller = currentUser?.role === 'SELLER';
  const isPartner = currentUser?.role === 'PARTNER';
  const isStoreScoped = isSeller || isPartner;
  const sellerStoreName = currentUser?.storeName || (currentUser?.storeId ? stores.find(s => s.id === currentUser.storeId)?.name : undefined) || 'Мой магазин';
  const mainWarehouse = stores.find(s => s.isMainWarehouse);
  // Store staff send only their own store's stock; phones from the main warehouse arrive through
  // «Приход товара» (IMEI scan), the main warehouse itself is ADMIN-only.
  const defaultFromId = isStoreScoped ? (currentUser?.storeId || '') : stores[0]?.id || '';

  const [fromLocationId, setFromLocationId] = useState<string>(defaultFromId);
  const [toLocationId, setToLocationId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // A notification click for a transfer request navigates here with { state: { tab: 'list' } }
  // so the admin lands directly on the approve/reject tab instead of "Новое перемещение".
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'create' | 'list'>(
    (location.state as { tab?: 'create' | 'list' } | null)?.tab === 'list' ? 'list' : 'create'
  );
  // Covers clicking a notification while TransferPage is already mounted — same route, so
  // it doesn't remount and the initial useState value above never re-runs.
  useEffect(() => {
    if ((location.state as { tab?: 'create' | 'list' } | null)?.tab === 'list') {
      setActiveTab('list');
    }
  }, [location.state]);
  // Defaults to whichever store is currently active on the POS Terminal page —
  // an admin picking a store there should see that same store here without
  // re-picking it; they can still switch it locally afterward.
  const [historyFilterStoreId, setHistoryFilterStoreId] = useState<string>(
    globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : 'ALL'
  );
  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);
  // One message system for the page (the inline second banner is gone).
  const setStatusMessage = (m: { type: 'success' | 'error'; text: string } | null) =>
    setStatusBanner(m ? { tone: m.type, text: m.text } : null);
  const [rejectTarget, setRejectTarget] = useState<TransferRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [confirmTransferModal, setConfirmTransferModal] = useState<boolean>(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);

  const fromStore = stores.find(s => s.id === fromLocationId);
  const fromStoreName = fromStore
    ? (fromStore.isMainWarehouse ? `Центральный склад (${fromStore.name})` : `Магазин «${fromStore.name}»`)
    : 'Исходный склад';

  const toStore = stores.find(s => s.id === toLocationId);
  const toStoreName = toStore
    ? (toStore.isMainWarehouse ? `Центральный склад (${toStore.name})` : `Магазин «${toStore.name}»`)
    : 'Не выбран';

  const availableDevicesAtFromLocation = useMemo(() => {
    return devices.filter(d => {
      if (d.locationId !== fromLocationId) return false;
      const isAvailable = d.status === 'STORE_STOCK' || d.status === 'MAIN_WAREHOUSE' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
      if (!isAvailable) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          d.imei.toLowerCase().includes(q) ||
          (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [devices, fromLocationId, searchQuery]);

  const handleToggleSelectDevice = (id: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = availableDevicesAtFromLocation.map(d => d.id);
    setSelectedDeviceIds(allFilteredIds);
  };

  const handleClearSelection = () => {
    setSelectedDeviceIds([]);
  };

  /** Camera scan or Enter from a USB/Bluetooth scanner: select the phone or say why not. */
  const handleDeviceCode = (rawCode: string, source: 'camera' | 'enter') => {
    const code = normalizeScanCode(rawCode);
    if (!code) return;
    const device = findDeviceByCode(devices, code);
    const isAvailableHere = device && device.locationId === fromLocationId &&
      (device.status === 'STORE_STOCK' || device.status === 'MAIN_WAREHOUSE' || device.status === 'IN_STOCK_AFTER_EXCHANGE');
    if (device && isAvailableHere) {
      if (source === 'enter') setSearchQuery('');
      if (selectedDeviceIds.includes(device.id)) {
        setStatusBanner({ tone: 'info', text: `${device.brand} ${device.model} уже выбран` });
      } else {
        setSelectedDeviceIds(prev => [...prev, device.id]);
        setStatusBanner({ tone: 'success', text: `Добавлено устройство: ${device.brand} ${device.model}` });
      }
      return;
    }
    if (source === 'enter' && !device && !looksLikeDeviceCode(code)) return;
    if (source === 'camera') setSearchQuery(code);
    if (!device) {
      setStatusBanner({ tone: 'error', text: `Устройство с IMEI ${code} не найдено` });
    } else if (device.locationId !== fromLocationId) {
      const where = stores.find(st => st.id === device.locationId)?.name || device.locationName || 'другой точке';
      setStatusBanner({ tone: 'warning', text: `${device.brand} ${device.model} числится в «${where}», а не в «${fromStore?.name || 'выбранной точке'}»` });
    } else {
      setStatusBanner({ tone: 'warning', text: `${device.brand} ${device.model} нельзя переместить: статус «${DEVICE_STATUS_LABELS[device.status] || device.status}»` });
    }
  };

  const handleScanDevice = () => {
    openScanner((scannedCode) => handleDeviceCode(scannedCode, 'camera'));
  };

  const handleOpenConfirmModal = () => {
    if (!toLocationId) {
      setStatusMessage({ type: 'error', text: 'Пожалуйста, выберите куда отправлять товар (пункт назначения)' });
      return;
    }
    if (selectedDeviceIds.length === 0) {
      setStatusMessage({ type: 'error', text: 'Выберите хотя бы одно устройство для перемещения' });
      return;
    }
    if (fromLocationId === toLocationId) {
      setStatusMessage({ type: 'error', text: 'Исходный склад и склад назначения не могут совпадать' });
      return;
    }
    setConfirmTransferModal(true);
  };

  const handleExecuteTransfer = async () => {
    if (!toLocationId) {
      setStatusMessage({ type: 'error', text: 'Пожалуйста, выберите куда отправлять товар (пункт назначения)' });
      return;
    }
    if (isSubmittingTransfer) return;
    setIsSubmittingTransfer(true);
    try {
      const res = await createTransferRequest({
        fromLocationId,
        toLocationId,
        deviceIds: selectedDeviceIds,
      });

      if (res.success) {
        setConfirmTransferModal(false);
        setStatusBanner({
          tone: 'success',
          text: isStoreScoped
            ? `Заявка на перемещение (${selectedDeviceIds.length} шт.) отправлена и ожидает подтверждения администратора.`
            : `Перемещение (${selectedDeviceIds.length} шт.) выполнено.`
        });
        setSelectedDeviceIds([]);
        setToLocationId('');
        setActiveTab('list');
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания перемещения' });
      }
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  const handleApprove = async (transferId: string) => {
    if (processingTransferId) return;
    setProcessingTransferId(transferId);
    try {
      const res = await approveTransfer(transferId);
      if (res.success) {
        setStatusBanner({ tone: 'success', text: 'Перемещение успешно подтверждено и принято на склад!' });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка подтверждения' });
      }
    } finally {
      setProcessingTransferId(null);
    }
  };

  const handleReject = async (transferId: string) => {
    if (processingTransferId) return;
    setProcessingTransferId(transferId);
    try {
      const res = await rejectTransfer(transferId, rejectReason.trim() || 'Отклонено пользователем');
      if (res.success) {
        setRejectTarget(null);
        setRejectReason('');
        setStatusBanner({ tone: 'success', text: 'Перемещение отклонено' });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка отклонения' });
      }
    } finally {
      setProcessingTransferId(null);
    }
  };

  const visibleTransfers = useMemo(() => {
    return (transfers || []).filter((t: TransferRequest) => {
      if (isStoreScoped) {
        return t.fromLocationId === currentUser.storeId || t.toLocationId === currentUser.storeId;
      }
      if (historyFilterStoreId !== 'ALL') {
        return t.fromLocationId === historyFilterStoreId || t.toLocationId === historyFilterStoreId;
      }
      return true;
    }).sort((a: TransferRequest, b: TransferRequest) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
  }, [transfers, isStoreScoped, currentUser, historyFilterStoreId]);

  const pendingCount = visibleTransfers.filter((t: TransferRequest) => t.status === 'PENDING_APPROVAL').length;

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />


      {/* Tabs */}
      <div className="flex border-b border-border bg-surface px-3 sm:px-4 pt-2 text-xs shrink-0">
        <button
          onClick={() => setActiveTab('create')}
          className={`pb-2.5 px-3 transition-colors border-b-2 font-bold tracking-wider bg-transparent ${
            activeTab === 'create'
              ? 'border-accent text-accent'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`}
        >
          Новое перемещение
        </button>

        <button
          onClick={() => setActiveTab('list')}
          className={`pb-2.5 px-3 transition-colors border-b-2 flex items-center space-x-2 font-bold tracking-wider ${
            activeTab === 'list'
              ? 'border-accent text-accent'
              : 'border-transparent text-fg-muted hover:text-fg'
          }`}
        >
          <span>История и подтверждения</span>
          {pendingCount > 0 && (
            <span className="bg-warning text-black px-1.5 py-0.2 rounded-full font-bold text-[10px]">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {activeTab === 'create' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Origin & Destination Selector Bar */}
            <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] font-bold">Откуда (Отправитель):</label>
                  {isStoreScoped ? (
                    <>
                      <div className="p-2.5 rounded-xl bg-surface-raised border border-border text-fg-muted font-bold flex items-center space-x-2">
                        <StoreIcon className="w-4 h-4 text-accent" />
                        <span>{sellerStoreName}</span>
                      </div>
                      <p className="text-[11px] text-fg-subtle mt-1">Телефоны с главного склада принимаются в разделе «Приход товара».</p>
                    </>
                  ) : (
                    <select
                      value={fromLocationId ?? ''}
                      onChange={(e) => {
                        setFromLocationId(e.target.value);
                        setSelectedDeviceIds([]);
                        setToLocationId('');
                      }}
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    >
                      {stores.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.isMainWarehouse ? `Центральный склад (${s.name})` : `Магазин «${s.name}»`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] font-bold">
                    Куда (Получатель): <span className="text-warning font-normal">* обязательно</span>
                  </label>
                  <select
                    value={toLocationId ?? ''}
                    onChange={(e) => setToLocationId(e.target.value)}
                    className={`w-full rounded-xl bg-surface-raised border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none transition-colors ${
                      !toLocationId ? 'border-warning/70 ring-1 ring-warning/30' : 'border-border'
                    }`}
                  >
                    <option value="">-- Выберите получателя (куда) * --</option>
                    {isStoreScoped ? (
                      stores
                        .filter(s => s.id !== fromLocationId && (s.id === currentUser?.storeId || s.id === mainWarehouse?.id))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.isMainWarehouse ? `Центральный склад (${s.name})` : `Магазин «${s.name}»`}
                          </option>
                        ))
                    ) : (
                      stores.filter(s => s.id !== fromLocationId).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.isMainWarehouse ? `Центральный склад (${s.name})` : `Магазин «${s.name}»`}
                        </option>
                      ))
                    )}
                  </select>
                  {!toLocationId && (
                    <p className="text-[10px] text-warning mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      Необходимо вручную выбрать куда отправлять
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Device search & actions bar */}
            <div className="p-3 bg-surface border-b border-border shrink-0">
              <SearchBar
                value={searchQuery ?? ''}
                onChange={setSearchQuery}
                onScan={handleScanDevice}
                onSubmit={(value) => handleDeviceCode(value, 'enter')}
                placeholder="Поиск устройства в этой точке (модель, IMEI)..."
              />
            </div>

            {/* Devices Checklist */}
            <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg p-3 space-y-3 pb-24">
              <div className="flex items-center justify-between text-xs text-fg-muted px-1">
                <span>Доступные товары ({availableDevicesAtFromLocation.length})</span>
                <div className="flex space-x-3 text-xs">
                  <button onClick={handleSelectAllFiltered} className="text-accent hover:underline font-bold">Выбрать все</button>
                  <button onClick={handleClearSelection} className="text-fg-subtle hover:underline">Сбросить</button>
                </div>
              </div>

              {isInitialLoading ? (
                <LoadingState label="Загрузка устройств…" />
              ) : availableDevicesAtFromLocation.length === 0 ? (
                <div className="p-12 text-center text-fg-muted text-xs tracking-wider">
                  Нет доступных устройств в локации «{fromStoreName}»
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {availableDevicesAtFromLocation.map((dev) => {
                    const isChecked = selectedDeviceIds.includes(dev.id);

                    return (
                      <button
                        type="button"
                        key={dev.id}
                        onClick={() => handleToggleSelectDevice(dev.id)}
                        aria-pressed={isChecked}
                        className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-accent/10 border-accent/40 shadow-xs'
                            : 'bg-surface hover:bg-surface-raised border-border'
                        }`}
                      >
                        <span className="flex items-center space-x-3 min-w-0">
                          <span aria-hidden="true" className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                            isChecked
                              ? 'bg-accent border-accent text-accent-fg'
                              : 'border-border bg-surface-raised'
                          }`}>
                            {isChecked && <Check className="w-3.5 h-3.5 stroke-3" />}
                          </span>

                          <span className="min-w-0 block">
                            <span className="block text-xs font-bold text-fg-muted truncate">{dev.brand} {dev.model}</span>
                            <span className="block text-[11px] text-fg-muted truncate">{dev.ram ? `${dev.ram} • ` : ''}{dev.storage} • {dev.color}</span>
                            <span className="block text-[11px] text-fg-subtle truncate">IMEI: {dev.imei}</span>
                          </span>
                        </span>

                        <span className="text-xs font-bold text-accent shrink-0">
                          {(dev.retailPriceTjs ?? 0) > 0 ? `${formatMoney(dev.retailPriceTjs)} TJS` : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Floating Bar */}
            {selectedDeviceIds.length > 0 && (
              <div className="absolute bottom-3 inset-x-3 z-30">
                <div className={`p-3.5 rounded-2xl bg-surface border shadow-2xl flex items-center justify-between gap-3 backdrop-blur-md transition-all ${
                  !toLocationId ? 'border-warning/60 shadow-warning/5' : 'border-accent/40'
                }`}>
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-accent text-accent-fg flex items-center justify-center font-bold text-sm shrink-0">
                      {selectedDeviceIds.length}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-fg-muted">
                        Выбрано: {selectedDeviceIds.length} устройств
                      </p>
                      <p className="text-[11px] text-fg-muted">
                        Из: <span className="font-semibold text-fg">{fromStoreName}</span> → В:{' '}
                        {toLocationId ? (
                          <span className="font-semibold text-accent">{toStoreName}</span>
                        ) : (
                          <span className="font-bold text-warning underline decoration-warning/50">Укажите получателя</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleOpenConfirmModal}
                    className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all shadow-xs ${
                      !toLocationId
                        ? 'bg-warning hover:bg-warning/90 text-black'
                        : 'bg-accent hover:bg-accent-strong text-accent-fg'
                    }`}
                  >
                    <span>{toLocationId ? 'Оформить' : 'Указать куда'}</span>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* HISTORY & APPROVALS TAB */
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-bg">
            {!isStoreScoped && (
              <div className="flex items-center justify-between pb-2 border-b border-border text-xs">
                <span className="text-fg-muted font-medium">Фильтр по локации:</span>
                <select
                  value={historyFilterStoreId}
                  onChange={(e) => setHistoryFilterStoreId(e.target.value)}
                  className="bg-surface border border-border text-fg-muted rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-accent"
                >
                  <option value="ALL">Все (склад и магазины)</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.isMainWarehouse ? `Центральный склад (${s.name})` : `Магазин «${s.name}»`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {visibleTransfers.length === 0 ? (
              <div className="p-12 text-center text-fg-muted text-xs tracking-wider">
                История перемещений пуста
              </div>
            ) : (
              <div className="space-y-3">
                {visibleTransfers.map((tr: TransferRequest) => (
                  <div key={tr.id} className="p-4 rounded-xl bg-surface border border-border space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-fg-muted">Перемещение #{tr.id.slice(-6)}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                          tr.status === 'APPROVED' ? 'bg-accent/15 text-accent border-accent/30' :
                          tr.status === 'PENDING_APPROVAL' ? 'bg-warning/15 text-warning border-warning/30' :
                          'bg-danger/15 text-danger border-danger/30'
                        }`}>
                          {tr.status === 'APPROVED' ? 'Выполнено' : tr.status === 'PENDING_APPROVAL' ? 'Ожидает подтверждения' : 'Отклонено'}
                        </span>
                      </div>
                      <span className="text-fg-subtle text-[11px]">
                        {tr.requestedAt ? new Date(tr.requestedAt).toLocaleString('ru-RU') : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-accent">
                      <span>{tr.fromLocationName}</span>
                      <ArrowLeftRight className="w-4 h-4 text-fg-subtle" />
                      <span>{tr.toLocationName}</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-surface-raised border border-border space-y-1">
                      <span className="text-[10px] text-fg-subtle block">Передаваемые устройства ({(tr.deviceIds || []).length} шт.):</span>
                      {(tr.deviceModels || []).map((mod, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs text-fg-muted">
                          <span>{tr.deviceBrands?.[idx] ? `${tr.deviceBrands[idx]} ${mod}` : mod}</span>
                          <span className="text-fg-subtle text-[11px]">IMEI: {tr.deviceImeis?.[idx] || '—'}</span>
                        </div>
                      ))}
                    </div>

                    {/* Pending Actions — approving/rejecting is ADMIN/PARTNER-only server-side */}
                    {tr.status === 'PENDING_APPROVAL' && !isSeller && (
                      <div className="pt-1 flex items-center justify-between sm:justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => { setRejectReason(''); setRejectTarget(tr); }}
                          disabled={processingTransferId === tr.id}
                          className="px-3 py-1.5 rounded-xl bg-danger/10 hover:bg-danger/15 text-danger border border-danger/30 text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          Отклонить
                        </button>
                        <button
                          onClick={() => handleApprove(tr.id)}
                          disabled={processingTransferId === tr.id}
                          className="px-4 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold shadow-xs transition-colors disabled:opacity-60 flex items-center gap-1.5"
                        >
                          {processingTransferId === tr.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {processingTransferId === tr.id ? 'Обработка…' : 'Подтвердить и принять'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL */}
      <ConfirmDialog
        open={confirmTransferModal}
        tone="default"
        title="Подтверждение перемещения"
        confirmLabel={isSeller ? 'Отправить заявку' : 'Переместить'}
        loading={isSubmittingTransfer}
        onConfirm={handleExecuteTransfer}
        onCancel={() => { if (!isSubmittingTransfer) setConfirmTransferModal(false); }}
        message={
          <div className="space-y-1">
            <p>Откуда: <strong className="text-accent">{fromStoreName}</strong></p>
            <p>Куда: <strong className="text-accent">{toStoreName}</strong></p>
            <p>Устройств к передаче: <strong className="text-fg">{selectedDeviceIds.length} шт.</strong></p>
          </div>
        }
      />

      {/* REJECT CONFIRMATION: a separate step with a reason, not a tap next to «Подтвердить» */}
      <ConfirmDialog
        open={rejectTarget !== null}
        title="Отклонить перемещение?"
        confirmLabel="Отклонить"
        loading={rejectTarget !== null && processingTransferId === rejectTarget.id}
        onConfirm={() => { if (rejectTarget) void handleReject(rejectTarget.id); }}
        onCancel={() => { if (!processingTransferId) setRejectTarget(null); }}
        message={rejectTarget && (
          <div className="space-y-2">
            <p>
              {rejectTarget.fromLocationName} → {rejectTarget.toLocationName}, {(rejectTarget.deviceIds || []).length} шт.
              Устройства останутся у отправителя.
            </p>
            <label className="block">
              <span className="block text-xs text-fg-subtle mb-1">Причина (необязательно)</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Например: телефон не пришёл"
                className="w-full rounded-lg bg-bg border border-border px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
              />
            </label>
          </div>
        )}
      />
    </div>
  );
};
