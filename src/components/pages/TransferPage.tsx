import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { TransferRequest } from '../../types';
import {
  ArrowLeftRight,
  Search,
  Scan,
  CheckCircle2,
  AlertCircle,
  Store as StoreIcon,
  Send,
  X,
  Check,
  Loader2
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { isStoreScoped } from '../../utils/roles';

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
    selectedStoreId: globalSelectedStoreId
  } = useAppFields('currentUser', 'stores', 'devices', 'transfers', 'createTransferRequest', 'approveTransfer', 'rejectTransfer', 'openScanner', 'selectedStoreId');

  const isSeller = isStoreScoped(currentUser);
  const sellerStoreName = currentUser?.storeName || (currentUser?.storeId ? stores.find(s => s.id === currentUser.storeId)?.name : undefined) || 'Мой магазин';
  const mainWarehouse = stores.find(s => s.isMainWarehouse);
  // A seller's default flow is pulling stock IN from the main warehouse into their own store
  // (the admin isn't always around to move it) — so that's the default, not sending stock out.
  const defaultFromId = isSeller ? (mainWarehouse?.id || currentUser?.storeId || stores[0]?.id || '') : stores[0]?.id || '';
  const defaultToId = isSeller
    ? (currentUser?.storeId || stores.find(s => s.id !== defaultFromId)?.id || '')
    : (stores.find(s => s.id !== defaultFromId)?.id || stores[1]?.id || '');

  const [fromLocationId, setFromLocationId] = useState<string>(defaultFromId);
  const [toLocationId, setToLocationId] = useState<string>(defaultToId);
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
  // Follow the global store switcher in the TopBar.
  useEffect(() => {
    setHistoryFilterStoreId(globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : 'ALL');
  }, [globalSelectedStoreId]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);

  const [confirmTransferModal, setConfirmTransferModal] = useState<boolean>(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);

  const fromStoreName = stores.find(s => s.id === fromLocationId)?.name || 'Исходный склад';
  const toStoreName = stores.find(s => s.id === toLocationId)?.name || 'Целевой склад';

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

  // A seller can also pull stock IN from the main warehouse (admin approval still required
  // before it actually moves) — switching to that source locks the destination to their own store.
  const handleSellerFromChange = (id: string) => {
    setFromLocationId(id);
    setSelectedDeviceIds([]);
    setToLocationId(mainWarehouse && id === mainWarehouse.id ? (currentUser?.storeId || '') : (stores.find(s => s.id !== id)?.id || ''));
  };

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

  const handleScanDevice = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const matched = availableDevicesAtFromLocation.find(d =>
        d.imei === code || d.imei2 === code
      );
      if (matched) {
        if (!selectedDeviceIds.includes(matched.id)) {
          setSelectedDeviceIds(prev => [...prev, matched.id]);
          setStatusMessage({ type: 'success', text: `Добавлено устройство: ${matched.brand} ${matched.model}` });
        }
      } else {
        setSearchQuery(code);
      }
    });
  };

  const handleOpenConfirmModal = () => {
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
          text: isSeller
            ? `Заявка на перемещение (${selectedDeviceIds.length} шт.) отправлена и ожидает подтверждения администратора.`
            : `Перемещение (${selectedDeviceIds.length} шт.) выполнено.`
        });
        setSelectedDeviceIds([]);
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
      const res = await rejectTransfer(transferId, 'Отклонено пользователем');
      if (res.success) {
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
      if (isSeller) {
        return t.fromLocationId === currentUser?.storeId || t.toLocationId === currentUser?.storeId;
      }
      if (historyFilterStoreId !== 'ALL') {
        return t.fromLocationId === historyFilterStoreId || t.toLocationId === historyFilterStoreId;
      }
      return true;
    }).sort((a: TransferRequest, b: TransferRequest) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
  }, [transfers, isSeller, currentUser, historyFilterStoreId]);

  const pendingCount = visibleTransfers.filter((t: TransferRequest) => t.status === 'PENDING_APPROVAL').length;

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />


      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-2.5 p-3 rounded-xl text-xs flex items-center justify-between shrink-0 ${
          statusMessage.type === 'success' ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-danger/15 text-danger border border-danger/30'
        }`}>
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-fg-subtle hover:text-fg-muted ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
                  {isSeller ? (
                    mainWarehouse && mainWarehouse.id !== currentUser?.storeId ? (
                      <select
                        value={fromLocationId ?? ''}
                        onChange={(e) => handleSellerFromChange(e.target.value)}
                        className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                      >
                        <option value={mainWarehouse.id}>{mainWarehouse.name}</option>
                        <option value={currentUser?.storeId || ''}>{sellerStoreName}</option>
                      </select>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-surface-raised border border-border text-fg-muted font-bold flex items-center space-x-2">
                        <StoreIcon className="w-4 h-4 text-accent" />
                        <span>{sellerStoreName}</span>
                      </div>
                    )
                  ) : (
                    <select
                      value={fromLocationId ?? ''}
                      onChange={(e) => {
                        setFromLocationId(e.target.value);
                        setSelectedDeviceIds([]);
                      }}
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    >
                      {stores.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] font-bold">Куда (Получатель):</label>
                  {isSeller && mainWarehouse && fromLocationId === mainWarehouse.id ? (
                    <div className="p-2.5 rounded-xl bg-surface-raised border border-border text-fg-muted font-bold flex items-center space-x-2">
                      <StoreIcon className="w-4 h-4 text-accent" />
                      <span>{sellerStoreName}</span>
                    </div>
                  ) : (
                  <select
                    value={toLocationId ?? ''}
                    onChange={(e) => setToLocationId(e.target.value)}
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                  >
                    {stores.filter(s => s.id !== fromLocationId).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  )}
                </div>
              </div>
            </div>

            {/* Device search & actions bar */}
            <div className="p-3 bg-surface border-b border-border flex items-center justify-between gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
                <input
                  type="text"
                  value={searchQuery ?? ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск устройства в этой точке (модель, IMEI)..."
                  className="w-full rounded-xl bg-surface-raised border border-border pl-9 pr-3 py-1.5 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleScanDevice}
                className="flex items-center justify-center p-2 bg-surface-raised hover:bg-surface text-accent text-xs font-bold rounded-xl border border-border shrink-0 transition-colors"
                title="Сканировать"
              >
                <Scan className="w-4 h-4" />
              </button>
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

              {availableDevicesAtFromLocation.length === 0 ? (
                <div className="p-12 text-center text-fg-muted text-xs tracking-wider">
                  Нет доступных устройств в локации «{fromStoreName}»
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {availableDevicesAtFromLocation.map((dev) => {
                    const isChecked = selectedDeviceIds.includes(dev.id);

                    return (
                      <div
                        key={dev.id}
                        onClick={() => handleToggleSelectDevice(dev.id)}
                        className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-accent/10 border-accent/40 shadow-xs'
                            : 'bg-surface hover:bg-surface-raised border-border'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            isChecked
                              ? 'bg-accent border-accent text-accent-fg'
                              : 'border-border bg-surface-raised'
                          }`}>
                            {isChecked && <Check className="w-3.5 h-3.5 stroke-3" />}
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-fg-muted truncate">{dev.brand} {dev.model}</h4>
                            <p className="text-[11px] text-fg-muted truncate">{dev.ram ? `${dev.ram} • ` : ''}{dev.storage} • {dev.color}</p>
                            <p className="text-[10px] text-fg-subtle truncate">IMEI: {dev.imei}</p>
                          </div>
                        </div>

                        <span className="text-xs font-bold text-accent shrink-0">
                          {(dev.retailPriceTjs || 0).toLocaleString()} TJS
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Floating Bar */}
            {selectedDeviceIds.length > 0 && (
              <div className="absolute bottom-3 inset-x-3 z-30">
                <div className="p-3.5 rounded-2xl bg-surface border border-accent/40 shadow-2xl flex items-center justify-between gap-3 backdrop-blur-md">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-accent text-accent-fg flex items-center justify-center font-bold text-sm shrink-0">
                      {selectedDeviceIds.length}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-fg-muted">
                        Выбрано: {selectedDeviceIds.length} устройств
                      </p>
                      <p className="text-[11px] text-fg-muted">
                        Из: {fromStoreName} → В: {toStoreName}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleOpenConfirmModal}
                    className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs tracking-wider flex items-center space-x-1.5 transition-all shadow-xs"
                  >
                    <span>Оформить</span>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* HISTORY & APPROVALS TAB */
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-bg">
            {!isSeller && (
              <div className="flex items-center justify-between pb-2 border-b border-border text-xs">
                <span className="text-fg-muted font-medium">Фильтр по складу:</span>
                <select
                  value={historyFilterStoreId}
                  onChange={(e) => setHistoryFilterStoreId(e.target.value)}
                  className="bg-surface border border-border text-fg-muted rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-accent"
                >
                  <option value="ALL">Все склады</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
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
                          {tr.status === 'APPROVED' ? 'ВЫПОЛНЕНО' : tr.status === 'PENDING_APPROVAL' ? 'ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ' : 'ОТКЛОНЕНО'}
                        </span>
                      </div>
                      <span className="text-fg-subtle text-[11px]">
                        {tr.requestedAt ? new Date(tr.requestedAt).toLocaleString() : ''}
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
                          <span className="text-fg-subtle text-[11px]">IMEI: {tr.deviceImeis?.[idx] || 'N/A'}</span>
                        </div>
                      ))}
                    </div>

                    {/* Pending Actions — approving/rejecting is ADMIN/PARTNER-only server-side */}
                    {tr.status === 'PENDING_APPROVAL' && !isSeller && (
                      <div className="pt-1 flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleReject(tr.id)}
                          disabled={processingTransferId === tr.id}
                          className="px-3 py-1.5 rounded-xl bg-danger/10 hover:bg-danger/15 text-danger border border-danger/30 text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {processingTransferId === tr.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          ОТКЛОНИТЬ
                        </button>
                        <button
                          onClick={() => handleApprove(tr.id)}
                          disabled={processingTransferId === tr.id}
                          className="px-4 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold shadow-xs transition-colors disabled:opacity-60 flex items-center gap-1.5"
                        >
                          {processingTransferId === tr.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {processingTransferId === tr.id ? 'ОБРАБОТКА…' : 'ПОДТВЕРДИТЬ И ПРИНЯТЬ'}
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
      {confirmTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-4 text-xs">
            <h3 className="text-sm font-bold text-fg-muted border-b border-border pb-3">Подтверждение перемещения</h3>

            <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-1">
              <p className="text-fg-muted">Откуда: <strong className="text-accent">{fromStoreName}</strong></p>
              <p className="text-fg-muted">Куда: <strong className="text-accent">{toStoreName}</strong></p>
              <p className="text-fg-muted">Устройств к передаче: <strong className="text-fg-muted">{selectedDeviceIds.length} шт.</strong></p>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                disabled={isSubmittingTransfer}
                onClick={() => setConfirmTransferModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmittingTransfer}
                onClick={handleExecuteTransfer}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmittingTransfer && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmittingTransfer ? 'ОФОРМЛЕНИЕ…' : 'ПОДТВЕРДИТЬ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
