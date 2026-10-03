import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { TransferRequest } from '../../types';
import {
  ArrowLeftRight,
  Clock,
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { DEVICE_STATUS_LABELS, findDeviceByCode, looksLikeDeviceCode, normalizeScanCode } from '../../utils/scanLookup';
import { useStoreContext, formatStoreName } from '../../utils/storeContext';
import { cn } from '../../utils/cn';

import { TransferLocationSelector } from '../transfer/TransferLocationSelector';
import { TransferDeviceGrid } from '../transfer/TransferDeviceGrid';
import { TransferBottomBar } from '../transfer/TransferBottomBar';
import { TransferHistoryList } from '../transfer/TransferHistoryList';
import { ConfirmTransferModal } from '../transfer/ConfirmTransferModal';
import { RejectTransferModal } from '../transfer/RejectTransferModal';

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
  } = useAppFields(
    'currentUser',
    'stores',
    'devices',
    'transfers',
    'createTransferRequest',
    'approveTransfer',
    'rejectTransfer',
    'openScanner',
    'isInitialLoading',
    'selectedStoreId'
  );

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

  // Defaults to whichever store is currently active on the POS Terminal page
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

  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);
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
            <TransferLocationSelector
              stores={stores}
              mainWarehouse={mainWarehouse}
              isStoreScoped={isStoreScoped}
              sellerStoreName={sellerStoreName}
              fromLocationId={fromLocationId}
              toLocationId={toLocationId}
              onOriginChange={(id) => {
                setFromLocationId(id);
                setSelectedDeviceIds([]);
                setToLocationId('');
              }}
              onDestinationChange={(id) => setToLocationId(id)}
            />

            <TransferDeviceGrid
              availableDevices={availableDevicesAtFromLocation}
              selectedDeviceIds={selectedDeviceIds}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onToggleSelectDevice={handleToggleSelectDevice}
              onSelectAllFiltered={handleSelectAllFiltered}
              onClearSelection={handleClearSelection}
              onDeviceCode={handleDeviceCode}
              onScanDevice={handleScanDevice}
              isInitialLoading={isInitialLoading}
              fromStoreName={fromStoreName}
            />

            <TransferBottomBar
              selectedCount={selectedDeviceIds.length}
              fromStoreName={fromStoreName}
              toStoreName={toStoreName}
              toLocationId={toLocationId}
              isStoreScoped={isStoreScoped}
              onOpenConfirmModal={handleOpenConfirmModal}
            />
          </div>
        ) : (
          <TransferHistoryList
            visibleTransfers={visibleTransfers}
            filteredTransfers={filteredTransfers}
            statusCounts={statusCounts}
            historyStatusFilter={historyStatusFilter}
            setHistoryStatusFilter={setHistoryStatusFilter}
            historySearchQuery={historySearchQuery}
            setHistorySearchQuery={setHistorySearchQuery}
            isStoreScoped={isStoreScoped}
            isCentralMode={storeCtx.mode === 'CENTRAL'}
            stores={stores}
            mainWarehouse={mainWarehouse}
            historyFilterChoice={historyFilterChoice}
            setHistoryFilterChoice={setHistoryFilterStoreId}
            expandedTransferIds={expandedTransferIds}
            onToggleExpandTransfer={toggleExpandTransfer}
            copiedImei={copiedImei}
            onCopyText={handleCopyText}
            devicesById={devicesById}
            devicesByImei={devicesByImei}
            currentUser={currentUser}
            processingTransferId={processingTransferId}
            onApprove={handleApprove}
            onRequestReject={(tr) => {
              setRejectReason('');
              setRejectTarget(tr);
            }}
            onNavigateToCreate={() => setActiveTab('create')}
          />
        )}
      </div>

      <ConfirmTransferModal
        open={confirmTransferModal}
        onClose={() => { if (!isSubmittingTransfer) setConfirmTransferModal(false); }}
        isStoreScoped={isStoreScoped}
        selectedDevices={selectedDevices}
        fromStore={fromStore}
        toStore={toStore}
        fromStoreName={fromStoreName}
        toStoreName={toStoreName}
        isSubmittingTransfer={isSubmittingTransfer}
        onConfirm={handleExecuteTransfer}
      />

      <RejectTransferModal
        rejectTarget={rejectTarget}
        onClose={() => { if (!processingTransferId) setRejectTarget(null); }}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        processingTransferId={processingTransferId}
        onReject={handleReject}
      />
    </div>
  );
};
