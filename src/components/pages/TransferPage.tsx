import React, { useState, useMemo, useEffect } from 'react';
import { formatMoney } from '../../utils/money';
import { useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { TransferRequest } from '../../types';
import {
  ArrowLeftRight,
  AlertCircle,
  Store as StoreIcon,
  Warehouse,
  Send,
  Check,
  Loader2,
  Clock,
  Search,
  X,
  Scan,
  Smartphone,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Copy,
  Building2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Dialog } from '../ui/Dialog';
import { LoadingState } from '../ui/Skeleton';
import { DEVICE_STATUS_LABELS, findDeviceByCode, looksLikeDeviceCode, normalizeScanCode } from '../../utils/scanLookup';
import { useStoreContext, formatStoreName } from '../../utils/storeContext';
import { getPhoneColorHex, formatRam } from '../../utils/phoneSpecs';
import { cn } from '../../utils/cn';

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
  // Admin inside a store sees only that store; Central Cash shows every store.
  const storeCtx = useStoreContext();
  const sellerStoreName = currentUser?.storeName || (currentUser?.storeId ? stores.find(s => s.id === currentUser.storeId)?.name : undefined) || 'Мой магазин';
  const mainWarehouse = stores.find(s => s.isMainWarehouse);
  // Store staff send only their own store's stock to the central warehouse.
  const defaultFromId = isStoreScoped
    ? (currentUser?.storeId || '')
    : ((storeCtx.mode === 'STORE' && storeCtx.storeId) ? storeCtx.storeId : (stores[0]?.id || ''));
  const defaultToId = isStoreScoped ? (mainWarehouse?.id || '') : '';

  const [fromLocationId, setFromLocationId] = useState<string>(defaultFromId);
  const [toLocationId, setToLocationId] = useState<string>(defaultToId);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // Automatically sync fromLocationId when stores or currentUser load
  useEffect(() => {
    if (isStoreScoped) {
      if (currentUser?.storeId && fromLocationId !== currentUser.storeId) {
        setFromLocationId(currentUser.storeId);
      }
    } else if (!fromLocationId && stores.length > 0) {
      const preferred = (storeCtx.mode === 'STORE' && storeCtx.storeId) ? storeCtx.storeId : stores[0].id;
      setFromLocationId(preferred);
    }
  }, [isStoreScoped, currentUser?.storeId, stores, storeCtx.mode, storeCtx.storeId, fromLocationId]);

  // Automatically ensure destination is set to the central warehouse for store staff
  useEffect(() => {
    if (isStoreScoped && mainWarehouse?.id && toLocationId !== mainWarehouse.id) {
      setToLocationId(mainWarehouse.id);
    }
  }, [isStoreScoped, mainWarehouse?.id, toLocationId]);

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
  const [historyFilterChoice, setHistoryFilterStoreId] = useState<string>(
    globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : 'ALL'
  );
  const historyFilterStoreId = !isStoreScoped && storeCtx.mode === 'STORE' ? storeCtx.storeId : historyFilterChoice;
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [expandedTransferIds, setExpandedTransferIds] = useState<Set<string>>(new Set());

  const handleCopyText = (text: string) => {
    if (!text || text === '—') return;
    navigator.clipboard?.writeText(text);
    setCopiedImei(text);
    setTimeout(() => {
      setCopiedImei(prev => (prev === text ? null : prev));
    }, 2000);
  };

  const toggleExpandTransfer = (id: string) => {
    setExpandedTransferIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const devicesById = useMemo(() => {
    const map = new Map<string, (typeof devices)[0]>();
    for (const d of devices || []) {
      map.set(d.id, d);
    }
    return map;
  }, [devices]);

  const devicesByImei = useMemo(() => {
    const map = new Map<string, (typeof devices)[0]>();
    for (const d of devices || []) {
      if (d.imei) map.set(d.imei, d);
      if (d.imei2) map.set(d.imei2, d);
    }
    return map;
  }, [devices]);

  const isLocationWarehouse = (id?: string, name?: string) => {
    if (id && mainWarehouse?.id === id) return true;
    if (name && (name.toLowerCase().includes('склад') || name.toLowerCase().includes('warehouse'))) return true;
    const s = stores.find(st => st.id === id);
    return Boolean(s?.isMainWarehouse);
  };
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
    ? (fromStore.isMainWarehouse ? `Центральный склад (${formatStoreName(fromStore.name)})` : formatStoreName(fromStore.name))
    : 'Исходный склад';

  const toStore = stores.find(s => s.id === toLocationId);
  const toStoreName = toStore
    ? (toStore.isMainWarehouse ? `Центральный склад (${formatStoreName(toStore.name)})` : formatStoreName(toStore.name))
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

  const selectedDevices = useMemo(() => {
    return devices.filter(d => selectedDeviceIds.includes(d.id));
  }, [devices, selectedDeviceIds]);

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
    const effectiveToId = isStoreScoped ? (mainWarehouse?.id || toLocationId) : toLocationId;
    const effectiveFromId = isStoreScoped ? (currentUser?.storeId || fromLocationId) : fromLocationId;
    if (!effectiveFromId) {
      setStatusMessage({ type: 'error', text: 'Пожалуйста, выберите склад отправления' });
      return;
    }
    if (!effectiveToId) {
      setStatusMessage({ type: 'error', text: 'Пожалуйста, выберите куда отправлять товар (пункт назначения)' });
      return;
    }
    if (selectedDeviceIds.length === 0) {
      setStatusMessage({ type: 'error', text: 'Выберите хотя бы одно устройство для перемещения' });
      return;
    }
    if (effectiveFromId === effectiveToId) {
      setStatusMessage({ type: 'error', text: 'Исходный склад и склад назначения не могут совпадать' });
      return;
    }
    setConfirmTransferModal(true);
  };

  const handleExecuteTransfer = async () => {
    const effectiveToId = isStoreScoped ? (mainWarehouse?.id || toLocationId) : toLocationId;
    const effectiveFromId = isStoreScoped ? (currentUser?.storeId || fromLocationId) : fromLocationId;
    if (!effectiveFromId) {
      setStatusMessage({ type: 'error', text: 'Пожалуйста, выберите склад отправления' });
      return;
    }
    if (!effectiveToId) {
      setStatusMessage({ type: 'error', text: 'Пожалуйста, выберите куда отправлять товар (пункт назначения)' });
      return;
    }
    if (effectiveFromId === effectiveToId) {
      setStatusMessage({ type: 'error', text: 'Исходный склад и склад назначения не могут совпадать' });
      return;
    }
    if (isSubmittingTransfer) return;
    setIsSubmittingTransfer(true);
    try {
      const res = await createTransferRequest({
        fromLocationId: effectiveFromId,
        toLocationId: effectiveToId,
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
        setToLocationId(isStoreScoped ? (mainWarehouse?.id || '') : '');
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

  const statusCounts = useMemo(() => {
    const counts = { ALL: visibleTransfers.length, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const tr of visibleTransfers) {
      if (tr.status === 'PENDING_APPROVAL') counts.PENDING++;
      else if (tr.status === 'APPROVED') counts.APPROVED++;
      else if (tr.status === 'REJECTED') counts.REJECTED++;
    }
    return counts;
  }, [visibleTransfers]);

  const filteredTransfers = useMemo(() => {
    return visibleTransfers.filter(tr => {
      if (historyStatusFilter === 'PENDING' && tr.status !== 'PENDING_APPROVAL') return false;
      if (historyStatusFilter === 'APPROVED' && tr.status !== 'APPROVED') return false;
      if (historyStatusFilter === 'REJECTED' && tr.status !== 'REJECTED') return false;

      if (historySearchQuery.trim()) {
        const q = historySearchQuery.toLowerCase().trim();
        const matchesId = (tr.transferNumber || '').toLowerCase().includes(q) || tr.id.toLowerCase().includes(q);
        const matchesFrom = (tr.fromLocationName || '').toLowerCase().includes(q);
        const matchesTo = (tr.toLocationName || '').toLowerCase().includes(q);
        const matchesModel = (tr.deviceModels || []).some(m => m.toLowerCase().includes(q));
        const matchesBrand = (tr.deviceBrands || []).some(b => b.toLowerCase().includes(q));
        const matchesImei = (tr.deviceImeis || []).some(im => im.toLowerCase().includes(q));
        const matchesRequestedBy = (tr.requestedBy || '').toLowerCase().includes(q);
        if (!matchesId && !matchesFrom && !matchesTo && !matchesModel && !matchesBrand && !matchesImei && !matchesRequestedBy) {
          return false;
        }
      }
      return true;
    });
  }, [visibleTransfers, historyStatusFilter, historySearchQuery]);

  const pendingCount = statusCounts.PENDING;

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />


      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border bg-surface px-2.5 sm:px-3 py-1.5 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={cn(
            'h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
            activeTab === 'create'
              ? 'bg-accent text-accent-fg shadow-xs font-bold'
              : 'bg-surface-raised border border-border/80 text-fg-muted hover:text-fg hover:bg-surface'
          )}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>{isStoreScoped ? 'Новая отправка' : 'Новое перемещение'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={cn(
            'h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
            activeTab === 'list'
              ? 'bg-accent text-accent-fg shadow-xs font-bold'
              : 'bg-surface-raised border border-border/80 text-fg-muted hover:text-fg hover:bg-surface'
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{isStoreScoped ? 'История отправок' : 'История и заявки'}</span>
          {pendingCount > 0 && (
            <span className="bg-warning text-black px-1.5 py-0.2 rounded-full font-bold text-[10px] leading-tight">
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
            <div className="p-2 sm:p-2.5 border-b border-border bg-surface shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Откуда */}
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-fg-subtle flex items-center gap-1">
                      <StoreIcon className="w-3 h-3 text-accent" />
                      Откуда (Отправитель):
                    </span>
                  </div>
                  {isStoreScoped ? (
                    <div className="h-8.5 px-2.5 rounded-lg bg-surface-raised border border-border text-fg font-semibold text-xs flex items-center gap-2 truncate">
                      <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="truncate">{formatStoreName(sellerStoreName)}</span>
                    </div>
                  ) : (
                    <select
                      value={fromLocationId ?? ''}
                      onChange={(e) => {
                        setFromLocationId(e.target.value);
                        setSelectedDeviceIds([]);
                        setToLocationId('');
                      }}
                      className="w-full h-8.5 rounded-lg bg-surface-raised border border-border px-2.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none cursor-pointer truncate"
                    >
                      {stores.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.isMainWarehouse ? `Центральный склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Куда */}
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-fg-subtle flex items-center gap-1">
                      <Warehouse className="w-3 h-3 text-accent" />
                      Куда (Получатель):
                    </span>
                    {!isStoreScoped && !toLocationId && (
                      <span className="text-[10px] text-warning font-medium">выберите склад</span>
                    )}
                  </div>
                  {isStoreScoped ? (
                    <div className="h-8.5 px-2.5 rounded-lg bg-surface-raised border border-border text-fg font-semibold text-xs flex items-center gap-2 truncate">
                      <Warehouse className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="truncate">
                        {mainWarehouse
                          ? (mainWarehouse.isMainWarehouse && !mainWarehouse.name.toLowerCase().includes('центральн')
                              ? `Центральный склад (${formatStoreName(mainWarehouse.name)})`
                              : formatStoreName(mainWarehouse.name))
                          : 'Центральный склад'}
                      </span>
                    </div>
                  ) : (
                    <select
                      value={toLocationId ?? ''}
                      onChange={(e) => setToLocationId(e.target.value)}
                      className={cn(
                        'w-full h-8.5 rounded-lg bg-surface-raised border px-2.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none transition-colors cursor-pointer truncate',
                        !toLocationId ? 'border-warning/60 text-warning font-normal' : 'border-border'
                      )}
                    >
                      <option value="">-- Выберите получателя --</option>
                      {stores.filter(s => s.id !== fromLocationId).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.isMainWarehouse ? `Центральный склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Device search & actions bar */}
            <div className="p-2 sm:p-2.5 bg-surface border-b border-border shrink-0">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
                <input
                  type="text"
                  value={searchQuery ?? ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleDeviceCode(searchQuery, 'enter');
                    }
                  }}
                  enterKeyHint="search"
                  placeholder="Поиск устройства в этой точке (модель, IMEI)..."
                  className="w-full h-9 rounded-xl bg-surface-raised border border-border pl-8 pr-8 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                    title="Очистить"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleScanDevice}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-accent hover:text-accent-strong p-0.5 transition-colors cursor-pointer"
                    title="Сканировать IMEI или штрихкод"
                  >
                    <Scan className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Devices Toolbar */}
            <div className="flex items-center justify-between text-xs px-2.5 sm:px-3 py-1.5 border-b border-border/60 bg-surface/50 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-fg-muted text-[11px]">Доступные товары</span>
                <span className="px-1.5 py-0.2 rounded-full bg-surface-raised border border-border/80 text-[10px] font-bold text-fg-subtle">
                  {availableDevicesAtFromLocation.length}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                {availableDevicesAtFromLocation.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-[11px] text-accent hover:underline font-bold cursor-pointer"
                  >
                    Выбрать все
                  </button>
                )}
                {selectedDeviceIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="text-[11px] text-fg-subtle hover:text-danger hover:underline cursor-pointer"
                  >
                    Сбросить ({selectedDeviceIds.length})
                  </button>
                )}
              </div>
            </div>

            {/* Devices Checklist */}
            <div className="flex-1 overflow-y-auto bg-bg p-2 sm:p-2.5 space-y-2 pb-24 flex flex-col">
              {isInitialLoading ? (
                <LoadingState label="Загрузка устройств…" />
              ) : availableDevicesAtFromLocation.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto min-h-[260px]">
                  <div className="w-13 h-13 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 shadow-xs">
                    <ArrowLeftRight className="w-6 h-6" />
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-fg">
                    {searchQuery ? 'Устройства не найдены' : 'Нет доступных устройств'}
                  </h3>

                  <p className="text-xs text-fg-subtle mt-1.5 max-w-xs leading-relaxed">
                    {searchQuery
                      ? `По запросу «${searchQuery}» устройства не найдены в этой точке.`
                      : `В локации «${fromStoreName}» сейчас нет товаров на балансе для перемещения.`}
                  </p>

                  <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="h-8.5 px-3.5 rounded-xl bg-surface-raised border border-border text-fg text-xs font-semibold hover:border-accent hover:text-accent transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Сбросить поиск</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleScanDevice}
                      className="h-8.5 px-3.5 rounded-xl bg-surface-raised border border-border text-accent text-xs font-semibold hover:border-accent hover:bg-accent/10 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Scan className="w-3.5 h-3.5" />
                      <span>Сканировать IMEI</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                  {availableDevicesAtFromLocation.map((dev) => {
                    const isChecked = selectedDeviceIds.includes(dev.id);

                    return (
                      <button
                        type="button"
                        key={dev.id}
                        onClick={() => handleToggleSelectDevice(dev.id)}
                        aria-pressed={isChecked}
                        className={cn(
                          'w-full text-left p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2.5 cursor-pointer transition-all shadow-2xs',
                          isChecked
                            ? 'bg-accent/10 border-accent/40 shadow-xs'
                            : 'bg-surface hover:bg-surface-raised/70 border-border/80'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            aria-hidden="true"
                            className={cn(
                              'w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors',
                              isChecked
                                ? 'bg-accent border-accent text-accent-fg'
                                : 'border-border bg-surface-raised'
                            )}
                          >
                            {isChecked && <Check className="w-3.5 h-3.5 stroke-3" />}
                          </div>

                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-fg truncate">
                              {dev.brand} {dev.model}
                            </span>
                            <span className="block text-[11px] text-fg-muted truncate">
                              {dev.ram ? `${dev.ram} • ` : ''}{dev.storage} • {dev.color}
                            </span>
                            <span className="block text-[10px] text-fg-subtle font-mono truncate">
                              IMEI: {dev.imei}
                            </span>
                          </div>
                        </div>

                        <span className="text-xs font-bold text-accent font-mono shrink-0">
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
              <div className="absolute bottom-2.5 inset-x-2.5 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl z-30 pointer-events-none">
                <div className={cn(
                  'pointer-events-auto p-2.5 sm:p-3 rounded-2xl bg-surface/95 border shadow-2xl flex items-center justify-between gap-2.5 backdrop-blur-md transition-all',
                  !toLocationId ? 'border-warning/60 shadow-warning/5' : 'border-accent/40'
                )}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-accent text-accent-fg flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                      {selectedDeviceIds.length}
                    </div>
                    <div className="min-w-0 truncate">
                      <p className="text-xs font-bold text-fg truncate">
                        Выбрано: {selectedDeviceIds.length} шт.
                      </p>
                      <p className="text-[11px] text-fg-muted truncate">
                        {fromStoreName} →{' '}
                        {toLocationId ? (
                          <span className="font-semibold text-accent">{toStoreName}</span>
                        ) : (
                          <span className="font-bold text-warning underline decoration-warning/50">Укажите получателя</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenConfirmModal}
                    className={cn(
                      'h-9 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer',
                      !toLocationId
                        ? 'bg-warning hover:bg-warning/90 text-black'
                        : 'bg-accent hover:bg-accent-strong text-accent-fg'
                    )}
                  >
                    <span>{toLocationId ? (isStoreScoped ? 'Отправить' : 'Переместить') : 'Куда'}</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* HISTORY & APPROVALS TAB */
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 lg:p-6 space-y-4 bg-bg flex flex-col max-w-4xl xl:max-w-5xl mx-auto w-full">
            {/* Header Toolbar: Search + Location Filter + Quick Status Tabs */}
            <div className="space-y-3 pb-2 border-b border-border/70 shrink-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Поиск по номеру, IMEI, модели или точке..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface border border-border text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
                  />
                  {historySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setHistorySearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Location Filter Dropdown (if central / multi-store) */}
                {!isStoreScoped && storeCtx.mode === 'CENTRAL' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative flex items-center w-full sm:w-auto">
                      <Building2 className="w-3.5 h-3.5 text-accent absolute left-2.5 pointer-events-none" />
                      <select
                        value={historyFilterChoice}
                        onChange={(e) => setHistoryFilterStoreId(e.target.value)}
                        className="w-full sm:w-auto pl-8 pr-7 py-2 rounded-xl bg-surface border border-border text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer appearance-none transition-colors"
                      >
                        <option value="ALL">Все локации (склад и магазины)</option>
                        {stores.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.isMainWarehouse ? `Центральный склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-fg-subtle absolute right-2 pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
                <button
                  type="button"
                  onClick={() => setHistoryStatusFilter('ALL')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
                    historyStatusFilter === 'ALL'
                      ? 'bg-accent text-accent-fg shadow-2xs'
                      : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
                  )}
                >
                  <span>Все</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/10 text-[10px] font-mono">
                    {statusCounts.ALL}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryStatusFilter('PENDING')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
                    historyStatusFilter === 'PENDING'
                      ? 'bg-warning text-black shadow-2xs font-black'
                      : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
                  )}
                >
                  <Clock className="w-3 h-3 text-warning" />
                  <span>Ожидают приёмки</span>
                  {statusCounts.PENDING > 0 && (
                    <span className="px-1.5 py-0.2 rounded-md bg-warning/20 text-warning-fg text-[10px] font-mono font-bold">
                      {statusCounts.PENDING}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryStatusFilter('APPROVED')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
                    historyStatusFilter === 'APPROVED'
                      ? 'bg-accent text-accent-fg shadow-2xs'
                      : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
                  )}
                >
                  <CheckCircle2 className="w-3 h-3 text-accent" />
                  <span>Выполнены</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/10 text-[10px] font-mono">
                    {statusCounts.APPROVED}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryStatusFilter('REJECTED')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5',
                    historyStatusFilter === 'REJECTED'
                      ? 'bg-danger text-white shadow-2xs'
                      : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
                  )}
                >
                  <XCircle className="w-3 h-3 text-danger" />
                  <span>Отклонены</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-black/10 dark:bg-white/10 text-[10px] font-mono">
                    {statusCounts.REJECTED}
                  </span>
                </button>
              </div>
            </div>

            {/* Empty State when no transfers exist at all */}
            {visibleTransfers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[260px]">
                <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle mb-3 shadow-xs">
                  <Clock className="w-7 h-7" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-fg">
                  История перемещений пуста
                </h3>
                <p className="text-xs text-fg-subtle mt-1.5 max-w-xs leading-relaxed">
                  Здесь будут отображаться созданные перемещения между складами и магазинами, а также их статусы.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="mt-4 h-9 px-4 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>{isStoreScoped ? 'Создать отправку' : 'Создать перемещение'}</span>
                </button>
              </div>
            ) : filteredTransfers.length === 0 ? (
              /* Empty Search / Filter State */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[240px]">
                <div className="w-12 h-12 rounded-2xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle mb-3">
                  <Search className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-fg">Ничего не найдено</h4>
                <p className="text-xs text-fg-subtle mt-1 max-w-xs">
                  По выбранным критериям и фильтрам перемещения отсутствуют.
                </p>
                <button
                  type="button"
                  onClick={() => { setHistorySearchQuery(''); setHistoryStatusFilter('ALL'); }}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-semibold text-accent hover:bg-surface-raised transition-colors cursor-pointer"
                >
                  Сбросить фильтры
                </button>
              </div>
            ) : (
              /* Transfers List */
              <div className="space-y-3.5">
                {filteredTransfers.map((tr: TransferRequest) => {
                  const isExpanded = expandedTransferIds.has(tr.id);
                  const deviceCount = (tr.deviceIds || []).length;
                  const rawModels = tr.deviceModels || [];
                  const displayModels = isExpanded || rawModels.length <= 3 ? rawModels : rawModels.slice(0, 3);

                  return (
                    <div
                      key={tr.id}
                      className={cn(
                        'p-3.5 sm:p-4 rounded-2xl bg-surface border transition-all duration-200 space-y-3 shadow-2xs hover:shadow-xs',
                        tr.status === 'PENDING_APPROVAL'
                          ? 'border-warning/50 hover:border-warning/70'
                          : tr.status === 'REJECTED'
                          ? 'border-danger/30 hover:border-danger/50'
                          : 'border-border/90 hover:border-border-strong'
                      )}
                    >
                      {/* Card Header: Number, Status, Creator, Date */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/70 pb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="w-7 h-7 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-accent shrink-0">
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="font-bold font-mono text-fg text-xs sm:text-sm">
                              Перемещение #{tr.transferNumber || tr.id.slice(-6)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyText(tr.transferNumber || tr.id.slice(-6))}
                              title="Скопировать номер"
                              className="text-fg-subtle hover:text-accent p-0.5 rounded transition-colors cursor-pointer"
                            >
                              {copiedImei === (tr.transferNumber || tr.id.slice(-6)) ? (
                                <Check className="w-3 h-3 text-accent" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {/* Status Badge */}
                          <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                            tr.status === 'APPROVED' ? 'bg-accent/15 text-accent border-accent/30' :
                            tr.status === 'PENDING_APPROVAL' ? 'bg-warning/15 text-warning border-warning/30' :
                            'bg-danger/15 text-danger border-danger/30'
                          }`}>
                            {tr.status === 'APPROVED' && <CheckCircle2 className="w-3 h-3" />}
                            {tr.status === 'PENDING_APPROVAL' && <Clock className="w-3 h-3 animate-pulse" />}
                            {tr.status === 'REJECTED' && <XCircle className="w-3 h-3" />}
                            <span>
                              {tr.status === 'APPROVED' ? 'Выполнено' : tr.status === 'PENDING_APPROVAL' ? 'Ожидает подтверждения' : 'Отклонено'}
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 text-fg-subtle text-[11px] font-medium ml-auto sm:ml-0">
                          {tr.requestedBy && (
                            <span className="hidden sm:inline">
                              Создал: <strong className="text-fg-muted font-semibold">{tr.requestedBy}</strong>
                            </span>
                          )}
                          {tr.requestedAt && (
                            <span className="flex items-center gap-1 bg-surface-raised/70 px-2 py-0.5 rounded-md border border-border/60">
                              <Clock className="w-3 h-3 text-fg-subtle" />
                              <span>{new Date(tr.requestedAt).toLocaleString('ru-RU')}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Route Visualizer Card */}
                      <div className="p-3 rounded-xl bg-surface-raised/50 border border-border/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
                        {/* Origin */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 text-accent shadow-2xs">
                            {isLocationWarehouse(tr.fromLocationId, tr.fromLocationName) ? (
                              <Warehouse className="w-4 h-4" />
                            ) : (
                              <StoreIcon className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                              Откуда (Отправитель)
                            </div>
                            <div className="text-xs sm:text-sm font-bold text-fg truncate">
                              {tr.fromLocationName}
                            </div>
                          </div>
                        </div>

                        {/* Direction Arrow Connector */}
                        <div className="flex items-center justify-center shrink-0 self-center">
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-accent shadow-2xs">
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold font-mono text-fg">
                              {deviceCount} шт.
                            </span>
                          </div>
                        </div>

                        {/* Destination */}
                        <div className="flex items-center sm:justify-end gap-2.5 min-w-0 flex-1 sm:text-right">
                          <div className="min-w-0 order-2 sm:order-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                              Куда (Получатель)
                            </div>
                            <div className="text-xs sm:text-sm font-bold text-fg truncate">
                              {tr.toLocationName}
                            </div>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 text-accent shadow-2xs order-1 sm:order-2">
                            {isLocationWarehouse(tr.toLocationId, tr.toLocationName) ? (
                              <Warehouse className="w-4 h-4" />
                            ) : (
                              <StoreIcon className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Devices Box */}
                      <div className="rounded-xl bg-surface-raised/40 border border-border/80 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-surface-raised/80 border-b border-border/70 text-xs">
                          <div className="flex items-center gap-2">
                            <Smartphone className="w-3.5 h-3.5 text-accent" />
                            <span className="font-bold text-fg text-xs">
                              Передаваемые устройства
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-surface border border-border font-bold font-mono text-fg-muted">
                              {deviceCount} шт.
                            </span>
                          </div>

                          {rawModels.length > 3 && (
                            <button
                              type="button"
                              onClick={() => toggleExpandTransfer(tr.id)}
                              className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isExpanded ? 'Свернуть' : `Показать все (${rawModels.length})`}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>

                        <div className="divide-y divide-border/60">
                          {displayModels.map((mod, idx) => {
                            const deviceId = tr.deviceIds?.[idx];
                            const imei = tr.deviceImeis?.[idx] || '—';
                            const foundDevice = (deviceId ? devicesById.get(deviceId) : null) || (imei !== '—' ? devicesByImei.get(imei) : null);
                            const brand = tr.deviceBrands?.[idx] || foundDevice?.brand || '';
                            const fullName = brand ? `${brand} ${mod}` : (foundDevice ? `${foundDevice.brand} ${foundDevice.model}` : mod);
                            const color = foundDevice?.color;
                            const colorHex = getPhoneColorHex(color);
                            const storage = foundDevice?.storage;
                            const rawRam = formatRam(foundDevice?.ram);
                            const ram = rawRam && storage && !storage.toLowerCase().includes(rawRam.toLowerCase()) ? rawRam : null;

                            return (
                              <div
                                key={idx}
                                className="p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-surface-raised/60 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0 text-accent/80">
                                    <Smartphone className="w-3.5 h-3.5" />
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-fg text-xs truncate">
                                        {fullName}
                                      </span>
                                      {storage && (
                                        <span className="px-1.5 py-0.2 rounded-md bg-surface border border-border text-[10px] font-bold font-mono text-fg shrink-0">
                                          {storage}
                                        </span>
                                      )}
                                      {ram && (
                                        <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent shrink-0">
                                          ОЗУ {ram}
                                        </span>
                                      )}
                                      {color && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface border border-border/60 text-[10px] text-fg-muted shrink-0">
                                          {colorHex && (
                                            <span
                                              className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                              style={{ backgroundColor: colorHex }}
                                            />
                                          )}
                                          <span>{color}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* IMEI chip with copy button */}
                                <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(imei)}
                                    title="Скопировать IMEI"
                                    className="group flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface border border-border/80 hover:border-accent/50 text-[11px] font-mono text-fg-muted hover:text-fg transition-all cursor-pointer"
                                  >
                                    <span className="text-[10px] text-fg-subtle font-sans">IMEI:</span>
                                    <span className="font-bold text-fg">{imei}</span>
                                    {copiedImei === imei ? (
                                      <span className="text-accent flex items-center gap-0.5 text-[10px] font-sans font-bold">
                                        <Check className="w-3 h-3" />
                                        <span className="hidden sm:inline">Скопировано</span>
                                      </span>
                                    ) : (
                                      <Copy className="w-3 h-3 text-fg-subtle group-hover:text-accent transition-colors opacity-70 group-hover:opacity-100" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Rejected Reason Banner */}
                      {tr.status === 'REJECTED' && tr.rejectedReason && (
                        <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/25 text-xs text-danger flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-bold block">Причина отклонения:</span>
                            <span className="text-[11px] text-danger/90">{tr.rejectedReason}</span>
                          </div>
                        </div>
                      )}

                      {/* Pending Actions */}
                      {tr.status === 'PENDING_APPROVAL' && (() => {
                        const isToWarehouse = tr.toLocationId === mainWarehouse?.id || tr.toLocationName?.toLowerCase().includes('склад');
                        const isFromWarehouse = tr.fromLocationId === mainWarehouse?.id || tr.fromLocationName?.toLowerCase().includes('склад');
                        const involvesWarehouse = isToWarehouse || isFromWarehouse;
                        const canApprove = currentUser?.role === 'ADMIN' ||
                          (currentUser?.role === 'PARTNER' && !involvesWarehouse && currentUser.storeId === tr.toLocationId);

                        if (canApprove) {
                          return (
                            <div className="pt-2 border-t border-border/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-2 text-warning text-xs font-semibold">
                                <Clock className="w-4 h-4 text-warning shrink-0" />
                                <span>Требуется подтверждение приёмки</span>
                              </div>
                              <div className="flex items-center justify-end gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => { setRejectReason(''); setRejectTarget(tr); }}
                                  disabled={processingTransferId === tr.id}
                                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-danger/10 hover:bg-danger/15 text-danger border border-danger/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Отклонить</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApprove(tr.id)}
                                  disabled={processingTransferId === tr.id}
                                  className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                  {processingTransferId === tr.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  <span>{processingTransferId === tr.id ? 'Обработка…' : 'Подтвердить и принять'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="pt-2 border-t border-border/70 flex items-center gap-2 text-xs text-warning bg-warning/10 p-2.5 rounded-xl border border-warning/20">
                            <Clock className="w-4 h-4 shrink-0" />
                            <span className="font-medium">
                              {isToWarehouse
                                ? 'Ожидает приёмки администратором на главном складе'
                                : 'Ожидает подтверждения принимающей стороной в магазине'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BEAUTIFUL TRANSFER CONFIRMATION MODAL */}
      <Dialog
        open={confirmTransferModal}
        onClose={() => { if (!isSubmittingTransfer) setConfirmTransferModal(false); }}
        title={isStoreScoped ? 'Отправка на главный склад' : 'Подтверждение перемещения'}
        subtitle={`Проверьте маршрут передачи и список устройств (${selectedDevices.length} шт.)`}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => { if (!isSubmittingTransfer) setConfirmTransferModal(false); }}
              disabled={isSubmittingTransfer}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-colors cursor-pointer min-h-[38px] disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleExecuteTransfer}
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

      {/* REJECT CONFIRMATION */}
      <Dialog
        open={rejectTarget !== null}
        onClose={() => { if (!processingTransferId) setRejectTarget(null); }}
        title="Отклонить перемещение?"
        subtitle="Устройства останутся на складе отправителя"
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => { if (!processingTransferId) setRejectTarget(null); }}
              disabled={Boolean(processingTransferId)}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-colors cursor-pointer min-h-[38px]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => { if (rejectTarget) void handleReject(rejectTarget.id); }}
              disabled={Boolean(processingTransferId)}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-danger hover:bg-danger/90 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer min-h-[38px] disabled:opacity-50"
            >
              {processingTransferId ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Отклонение...</span>
                </>
              ) : (
                <span>Отклонить</span>
              )}
            </button>
          </div>
        }
      >
        {rejectTarget && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold text-fg">
                <span>{rejectTarget.fromLocationName} → {rejectTarget.toLocationName}</span>
                <span className="text-danger font-mono font-black">{(rejectTarget.deviceIds || []).length} шт.</span>
              </div>
              <p className="text-[11px] text-fg-subtle">
                Заявка будет отменена. Товары останутся на балансе исходного склада.
              </p>
            </div>

            <label className="block">
              <span className="block text-xs font-semibold text-fg-subtle mb-1.5">Причина отклонения (необязательно)</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={200}
                placeholder="Например: повреждена упаковка или не доехал курьер..."
                className="w-full rounded-xl bg-surface-raised border border-border p-3 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent resize-none transition-colors"
              />
            </label>
          </div>
        )}
      </Dialog>
    </div>
  );
};
