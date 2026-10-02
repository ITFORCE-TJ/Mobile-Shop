import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { sumMoney, formatMoney } from '../../utils/money';
import { getBusinessDateKey } from '../../utils/businessDate';
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { RepairTicket, RepairStatus, SaleItem } from '../../types';
import {
  Wrench,
  Plus,
  Search,
  Loader2,
  Scan,
  ChevronRight,
  ArrowLeft,
  X
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Skeleton';
import { MonthPicker } from '../ui/MonthPicker';
import { useStoreContext } from '../../utils/storeContext';

export const RepairPage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const location = useLocation();
  const navigatedState = location.state as {
    saleReceiptNumber?: number;
    item?: SaleItem;
    customerName?: string;
    saleId?: string;
    saleStoreId?: string;
    saleStoreName?: string;
    saleDate?: string;
  } | null;

  const {
    currentUser,
    repairs,
    fetchRepairsRange,
    sales,
    fetchSalesRange,
    devices,
    findDeviceByImei,
    stores,
    createRepairTicket,
    updateRepairStatus,
    openScanner,
    selectedStoreId: globalSelectedStoreId
  } = useAppFields('currentUser', 'repairs', 'fetchRepairsRange', 'sales', 'fetchSalesRange', 'devices', 'findDeviceByImei', 'stores', 'createRepairTicket', 'updateRepairStatus', 'openScanner', 'selectedStoreId');

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const [searchQuery, setSearchQuery] = useState('');

  // Form states for NEW TICKET
  const [receiptSearch, setReceiptSearch] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [imei, setImei] = useState('');
  const [imei2, setImei2] = useState('');
  const [defectDescription, setDefectDescription] = useState('');
  const [estimatedCostTjs, setEstimatedCostTjs] = useState<string>('0');
  const [prepaymentTjs, setPrepaymentTjs] = useState<string>('0');
  const [masterNote, setMasterNote] = useState('');

  // Modal state for ISSUING REPAIR & SETTLEMENT
  const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(null);
  const [viewingTicket, setViewingTicket] = useState<RepairTicket | null>(null);
  const [issueFinalCost, setIssueFinalCost] = useState<string>('');

  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);
  // Errors go to the fixed toast: an inline message at the top of the scroll area was out of
  // sight while the user was at the bottom of the form.
  const setStatusMessage = (m: { type: 'success' | 'error'; text: string } | null) =>
    setStatusBanner(m ? { tone: m.type, text: m.text } : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The ticket whose status change is in flight: blocks a second tap on «В работу»/«Готов».
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [listLoad, setListLoad] = useState<'loading' | 'done' | 'error'>('loading');
  const [listLoadAttempt, setListLoadAttempt] = useState(0);

  // Retail stores only (Exclude Main Warehouse)
  const retailStores = useMemo(() => {
    return stores.filter(s => !s.isMainWarehouse);
  }, [stores]);

  // `repairs` from context only holds a recent bounded window by default — the current
  // month (this page's own default filter) is always inside it, but "весь период" ('ALL')
  // or an older month reaches further back, so fetch that exact range from the server and
  // merge it in. Guarded against a stale response overwriting a newer one on fast clicks.
  useEffect(() => {
    let cancelled = false;
    setListLoad('loading');
    fetchRepairsRange({
      period: selectedMonth === 'ALL' ? 'ALL' : 'SPECIFIC_MONTH',
      month: selectedMonth === 'ALL' ? undefined : selectedMonth,
    })
      .then(() => { if (!cancelled) setListLoad('done'); })
      .catch((e) => {
        if (cancelled) return;
        console.error('Failed to load repairs for period', e);
        setListLoad('error');
      });
    return () => { cancelled = true; };
  }, [selectedMonth, fetchRepairsRange, dataRefreshRevision, listLoadAttempt]);

  const isSeller = currentUser?.role === 'SELLER';
  const isPartner = currentUser?.role === 'PARTNER';
  const isStoreScoped = isSeller || isPartner;
  // Admin inside a store sees only that store; Central Cash shows every store.
  const storeCtx = useStoreContext();

  // Defaults to whichever store is currently active on the POS Terminal page —
  // an admin picking a store there should see that same store here without
  // re-picking it; they can still switch it locally afterward.
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => {
    if (isStoreScoped) return currentUser?.storeId || '';
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all') return globalSelectedStoreId;
    return 'ALL';
  });

  useEffect(() => {
    if (isStoreScoped) {
      if (currentUser?.storeId) setSelectedStoreId(currentUser.storeId);
      return;
    }
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all') {
      setSelectedStoreId(globalSelectedStoreId);
    } else {
      setSelectedStoreId('ALL');
    }
  }, [globalSelectedStoreId, isStoreScoped, currentUser?.storeId]);

  const [createTicketStoreId, setCreateTicketStoreId] = useState<string>(() => {
    if (isStoreScoped) return currentUser?.storeId || '';
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all') return globalSelectedStoreId;
    return '';
  });

  useEffect(() => {
    if (isStoreScoped) {
      if (currentUser?.storeId) setCreateTicketStoreId(currentUser.storeId);
      return;
    }
    if (!createTicketStoreId && retailStores.length > 0) {
      setCreateTicketStoreId(retailStores[0].id);
    }
  }, [retailStores, createTicketStoreId, isStoreScoped, currentUser?.storeId]);

  useEffect(() => {
    if (navigatedState?.item) {
      const item = navigatedState.item;
      setActiveTab('create');
      setDeviceModel(`${item.brand} ${item.model}${item.storage ? ' ' + item.storage : ''}`);
      setImei(item.imei || '');
      setImei2(item.imei2 || '');
      setClientName(navigatedState.customerName || '');
      setReceiptSearch(navigatedState.saleReceiptNumber ? String(navigatedState.saleReceiptNumber) : '');
      if (navigatedState.saleStoreId) {
        setCreateTicketStoreId(navigatedState.saleStoreId);
      }
      setStatusBanner({
        tone: 'info',
        text: `Оформление приёма в ремонт: ${item.brand} ${item.model} (Чек #${navigatedState.saleReceiptNumber || ''}). Опишите поломку и оформите приём.`
      });
      window.history.replaceState({}, document.title);
    }
  }, [navigatedState]);

  const effectiveStoreId = isStoreScoped ? (currentUser?.storeId || retailStores[0]?.id || '') : selectedStoreId;

  const currentStoreName = isStoreScoped
    ? (currentUser?.storeName || retailStores.find(s => s.id === currentUser?.storeId)?.name || 'Магазин')
    : (selectedStoreId === 'ALL' ? 'Все филиалы (Розница)' : retailStores.find(s => s.id === selectedStoreId)?.name || 'Магазин');

  const filteredRepairs = useMemo(() => {
    return (repairs || []).filter((t: RepairTicket) => {
      // Exclude Main Warehouse from repairs
      if (t.storeId === 'store-main') return false;

      // Filter by retail store
      if (effectiveStoreId && effectiveStoreId !== 'ALL') {
        if (t.storeId && t.storeId !== effectiveStoreId) return false;
      }

      // Month filter
      if (selectedMonth !== 'ALL' && t.createdAt) {
        const ticketMonth = t.createdAt.substring(0, 7);
        if (ticketMonth !== selectedMonth) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          t.ticketNumber.toString().includes(q) ||
          (t.customerName && t.customerName.toLowerCase().includes(q)) ||
          (t.customerPhone && t.customerPhone.toLowerCase().includes(q)) ||
          (t.deviceModel && t.deviceModel.toLowerCase().includes(q)) ||
          (t.model && t.model.toLowerCase().includes(q)) ||
          (t.imei && t.imei.toLowerCase().includes(q)) ||
          (t.imei2 && t.imei2.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    }).sort((a: RepairTicket, b: RepairTicket) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [repairs, effectiveStoreId, selectedMonth, searchQuery]);

  // Statistics for selected month
  const totalRepairsCount = filteredRepairs.length;
  const readyRepairsCount = filteredRepairs.filter((t: RepairTicket) => t.status === 'READY' || t.status === 'ISSUED').length;
  const totalExpensesTjs = sumMoney(filteredRepairs.map(t => t.status === 'ISSUED' ? (t.finalCostTjs || 0) : 0));

  // Returns true (and fills the form) if a matching sale was found in the given list.
  const applySoldDeviceMatch = (list: typeof sales, q: string): boolean => {
    for (const sale of list) {
      if (sale.receiptNumber.toString() === q) {
        const item = sale.items[0];
        if (item) {
          setDeviceModel(`${item.brand} ${item.model} ${item.storage}`);
          if (item.imei) setImei(item.imei);
          setImei2(item.imei2 || '');
          if (sale.customerName) setClientName(sale.customerName);
          setStatusMessage({ type: 'success', text: `Найдена покупка по чеку #${sale.receiptNumber}` });
          return true;
        }
      }
      for (const item of sale.items) {
        if (item.imei.toLowerCase() === q || (item.imei2 && item.imei2.toLowerCase() === q)) {
          setDeviceModel(`${item.brand} ${item.model} ${item.storage}`);
          if (item.imei) setImei(item.imei);
          setImei2(item.imei2 || '');
          if (sale.customerName) setClientName(sale.customerName);
          setStatusMessage({ type: 'success', text: `Найдено устройство по IMEI` });
          return true;
        }
      }
    }
    return false;
  };

  const handleScanListSearch = () => {
    openScanner((scannedCode) => {
      setSearchQuery(scannedCode.trim());
    });
  };

  const handleScanTicket = () => {
    openScanner(async (scannedCode) => {
      const code = scannedCode.trim();
      const q = code.toLowerCase();
      if (applySoldDeviceMatch(sales, q)) return;

      const devMatch = devices.find(d => d.imei === code || d.imei2 === code);
      if (devMatch) {
        setDeviceModel(`${devMatch.brand} ${devMatch.model} ${devMatch.storage}`);
        if (devMatch.imei) setImei(devMatch.imei);
        setImei2(devMatch.imei2 || '');
        setStatusMessage({ type: 'success', text: `Данные устройства ${devMatch.brand} ${devMatch.model} подставлены` });
        return;
      }

      // Not in the locally-loaded (recent) sales, nor in the (SOLD-excluded) device list —
      // an older receipt or an already-sold device still resolves via a targeted server
      // search before giving up and just dropping the code into IMEI.
      try {
        const found = await fetchSalesRange({ search: code });
        if (applySoldDeviceMatch(found, q)) return;
      } catch {
        // fall through
      }
      try {
        const [devFound] = await findDeviceByImei(code);
        if (devFound) {
          setDeviceModel(`${devFound.brand} ${devFound.model} ${devFound.storage}`);
          if (devFound.imei) setImei(devFound.imei);
          setImei2(devFound.imei2 || '');
          setStatusMessage({ type: 'success', text: `Данные устройства ${devFound.brand} ${devFound.model} подставлены` });
          return;
        }
      } catch {
        // fall through
      }

      setImei(code);
      setImei2('');
    });
  };

  const handleFindSoldDevice = async (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    if (applySoldDeviceMatch(sales, q)) return;

    try {
      const found = await fetchSalesRange({ search: query.trim() });
      if (applySoldDeviceMatch(found, q)) return;
    } catch {
      // fall through to the device/not-found checks below
    }

    const devMatch = devices.find(d => d.imei.toLowerCase() === q || (d.imei2 && d.imei2.toLowerCase() === q));
    if (devMatch) {
      setDeviceModel(`${devMatch.brand} ${devMatch.model} ${devMatch.storage}`);
      if (devMatch.imei) setImei(devMatch.imei);
      setImei2(devMatch.imei2 || '');
      setStatusMessage({ type: 'success', text: `Устройство найдено в каталоге` });
      return;
    }

    try {
      const [devFound] = await findDeviceByImei(query.trim());
      if (devFound) {
        setDeviceModel(`${devFound.brand} ${devFound.model} ${devFound.storage}`);
        if (devFound.imei) setImei(devFound.imei);
        setImei2(devFound.imei2 || '');
        setStatusMessage({ type: 'success', text: `Устройство найдено в каталоге` });
        return;
      }
    } catch {
      // fall through to not-found
    }

    setStatusMessage({ type: 'error', text: `Устройство или чек "${query}" не найдено` });
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!clientName.trim() || !clientPhone.trim() || !deviceModel.trim() || !defectDescription.trim()) {
      setStatusMessage({ type: 'error', text: 'Заполните обязательные поля (ФИО клиента, Телефон, Модель, Описание поломки)' });
      return;
    }

    const modelParts = deviceModel.trim().split(' ');
    const brand = modelParts[0] || 'Unknown';
    const model = modelParts.slice(1).join(' ') || 'Device';

    setIsSubmitting(true);
    try {
      const res = await createRepairTicket({
        imei: imei.trim() || 'N/A',
        imei2: imei2.trim() || undefined,
        brand,
        model,
        storage: 'N/A',
        color: 'N/A',
        customerName: clientName.trim(),
        customerPhone: clientPhone.trim(),
        problemDescription: defectDescription.trim(),
        comment: masterNote.trim() || undefined,
        estimatedCostTjs: parseFloat(estimatedCostTjs) || 0,
        prepaymentTjs: parseFloat(prepaymentTjs) || 0,
        storeId: isStoreScoped ? (currentUser?.storeId || undefined) : (createTicketStoreId || undefined),
      });

      if (res.success) {
        setStatusBanner({ tone: 'success', text: `Прием в ремонт успешно оформлен! Квитанция #${res.ticketNumber || ''}` });
        setActiveTab('list');
        setClientName('');
        setClientPhone('');
        setDeviceModel('');
        setImei('');
        setImei2('');
        setDefectDescription('');
        setEstimatedCostTjs('0');
        setPrepaymentTjs('0');
        setMasterNote('');
        setReceiptSearch('');
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания квитанции' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatusQuick = async (ticketId: string, status: RepairStatus): Promise<boolean> => {
    if (updatingTicketId) return false;
    setUpdatingTicketId(ticketId);
    try {
      const res = await updateRepairStatus(ticketId, status);
      if (res.success) {
        setStatusBanner({ tone: 'success', text: 'Статус ремонта обновлён' });
        return true;
      }
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка обновления статуса' });
      return false;
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const handleOpenIssueModal = (ticket: RepairTicket) => {
    setSelectedTicket(ticket);
    setIssueFinalCost('');
  };

  const handleConfirmIssueTicket = async () => {
    if (!selectedTicket || isSubmitting) return;
    const finalCost = parseFloat(issueFinalCost) || 0;

    setIsSubmitting(true);
    try {
      if (selectedTicket.status !== 'READY') {
        const prepRes = await updateRepairStatus(selectedTicket.id, 'READY', 'Готов к выдаче');
        if (!prepRes.success) {
          setStatusBanner({ tone: 'error', text: prepRes.message || 'Ошибка подготовки к выдаче' });
          return;
        }
      }
      const res = await updateRepairStatus(selectedTicket.id, 'ISSUED', 'Выдано клиенту', finalCost);

      setSelectedTicket(null);
      if (res.success) {
        setStatusBanner({ tone: 'success', text: finalCost > 0
          ? `Ремонт #${selectedTicket.ticketNumber} выдан клиенту. Расход на ремонт ${formatMoney(finalCost)} TJS списан с кассы магазина.`
          : `Ремонт #${selectedTicket.ticketNumber} выдан клиенту без расхода.` });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка выдачи ремонта' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: RepairStatus) => {
    switch (status) {
      case 'ACCEPTED':
        return { label: 'Принят', color: 'bg-info/15 text-info border-info/30' };
      case 'IN_PROGRESS':
        return { label: 'В работе', color: 'bg-warning/15 text-warning border-warning/30' };
      case 'READY':
        return { label: 'Готов', color: 'bg-accent/15 text-accent border-accent/30' };
      case 'ISSUED':
        return { label: 'Выдан', color: 'bg-surface-raised text-fg-subtle border-border' };
      default:
        return { label: status, color: 'bg-surface-raised text-fg-subtle border-border' };
    }
  };

  return (
    <div className="work-screen flex-1 flex flex-col h-full min-w-0 max-w-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />

      {/* Top Search & Filter Bar */}
      <div className="p-2.5 sm:p-3 border-b border-border bg-surface shrink-0 space-y-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {activeTab === 'create' ? (
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 min-h-[32px] sm:min-h-[34px]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>К журналу ремонтов</span>
            </button>
          ) : (
            <>
              {/* Compact Search Bar with Scanner inside right corner */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
                <input
                  type="text"
                  value={searchQuery ?? ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Квитанция / ФИО / IMEI..."
                  className="w-full rounded-xl bg-surface-raised border border-border pl-8 pr-8 py-1.5 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
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
                    onClick={handleScanListSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-accent hover:text-accent-strong p-0.5 transition-colors cursor-pointer"
                    title="Сканировать IMEI или квитанцию"
                  >
                    <Scan className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Action Button: + Прием */}
              <button
                type="button"
                onClick={() => {
                  setStatusMessage(null);
                  setActiveTab('create');
                }}
                className="shrink-0 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-accent-fg font-semibold text-xs flex items-center gap-1 transition-all shadow-xs whitespace-nowrap min-h-[32px] sm:min-h-[34px] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span><span className="hidden sm:inline">Прием в </span>ремонт</span>
              </button>
            </>
          )}
        </div>

        {/* Row 2 (if list): Store & Period Filters + KPI Metrics Strip */}
        {activeTab === 'list' && (
          <div className="flex items-center justify-between gap-1.5 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {!isStoreScoped && storeCtx.mode === 'CENTRAL' && (
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="h-7 bg-surface-raised border border-border text-fg text-xs font-semibold rounded-xl px-2.5 py-0.5 focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="ALL">Все магазины</option>
                  {retailStores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}

              <MonthPicker
                value={selectedMonth}
                onChange={setSelectedMonth}
                className="h-7 px-2.5 rounded-xl border border-accent text-accent text-xs font-semibold bg-surface-raised focus:outline-none cursor-pointer"
              />

              {(searchQuery || (selectedStoreId !== 'ALL' && !isStoreScoped && storeCtx.mode === 'CENTRAL')) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    if (!isStoreScoped) setSelectedStoreId('ALL');
                  }}
                  className="p-1 text-fg-subtle hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer"
                  title="Сбросить фильтры"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Metrics Strip */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] text-fg-subtle font-mono shrink-0">
              <span>{totalRepairsCount} рем.</span>
              <span>·</span>
              <span className="text-accent font-bold">{readyRepairsCount} готово</span>
              <span>·</span>
              <span className="font-bold text-fg">
                {formatMoney(totalExpensesTjs)} TJS
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bg p-2.5 sm:p-4 min-w-0 max-w-full">
        {activeTab === 'create' ? (
          <form onSubmit={handleCreateTicket} className="w-full max-w-xl mx-auto space-y-4 min-w-0">
            <div className="border border-border rounded-xl bg-surface p-3.5 sm:p-5 space-y-4 shadow-xs min-w-0">
              <h3 className="text-xs md:text-sm font-bold uppercase tracking-wide text-fg-muted flex items-center gap-2 border-b border-border pb-3 flex-wrap sm:flex-nowrap">
                <Wrench className="w-4 h-4 text-accent shrink-0" />
                <span className="min-w-0 wrap-break-word">ОФОРМЛЕНИЕ ПРИЕМА НА ГАРАНТИЙНЫЙ РЕМОНТ</span>
              </h3>

              {/* RECEIPT / IMEI SEARCH BAR */}
              <div className="p-3 bg-surface-raised rounded-xl border border-accent/40 space-y-2 min-w-0">
                <label className="block text-[10px] uppercase font-bold text-accent truncate">
                  ПОИСК В БАЗЕ ПРОДАЖ ПО НОМЕРУ ЧЕКА ИЛИ IMEI:
                </label>
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <input
                    type="text"
                    value={receiptSearch ?? ''}
                    onChange={(e) => setReceiptSearch(e.target.value)}
                    onKeyDown={(e) => {
                      // A USB/Bluetooth scanner types the code and presses Enter.
                      if (e.key === 'Enter') { e.preventDefault(); handleFindSoldDevice(receiptSearch); }
                    }}
                    enterKeyHint="search"
                    aria-label="Номер чека или IMEI"
                    placeholder="Номер чека или IMEI..."
                    className="flex-1 min-w-0 w-full rounded-lg bg-surface border border-border px-2.5 sm:px-3 py-1.5 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleFindSoldDevice(receiptSearch)}
                    className="shrink-0 px-2.5 sm:px-3 py-1.5 bg-accent hover:bg-accent-strong active:scale-95 text-xs font-bold rounded-lg text-accent-fg transition-all"
                  >
                    Найти
                  </button>
                  <button
                    type="button"
                    onClick={handleScanTicket}
                    className="shrink-0 p-1.5 sm:px-3 sm:py-1.5 bg-surface hover:bg-surface-raised active:scale-95 text-accent rounded-lg border border-border transition-all"
                    title="Сканировать"
                  >
                    <Scan className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </div>

              {!isStoreScoped && (
                <div className="min-w-0">
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase font-bold truncate">Торговая точка (Где было продано / принято) *</label>
                  <select
                    value={createTicketStoreId}
                    onChange={(e) => setCreateTicketStoreId(e.target.value)}
                    className="w-full min-w-0 max-w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted text-xs font-semibold focus:border-accent focus:outline-none truncate"
                  >
                    {retailStores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="min-w-0">
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase truncate">ФИО клиента *</label>
                  <input
                    type="text"
                    required
                    value={clientName ?? ''}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Иван Иванов"
                    className="w-full min-w-0 rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="min-w-0">
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase truncate">Телефон *</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    value={clientPhone ?? ''}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+992 900 000 000"
                    className="w-full min-w-0 rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="min-w-0">
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase truncate">Модель устройства *</label>
                  <input
                    type="text"
                    required
                    value={deviceModel ?? ''}
                    onChange={(e) => setDeviceModel(e.target.value)}
                    placeholder="iPhone 15 Pro Max 256GB"
                    className="w-full min-w-0 rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <label className="block text-fg-subtle mb-1 text-[11px] uppercase truncate">IMEI 1</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={imei ?? ''}
                      onChange={(e) => setImei(e.target.value)}
                      placeholder="354891100234561"
                      className="w-full min-w-0 rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-fg-subtle mb-1 text-[11px] uppercase truncate">IMEI 2 (опционально / по желанию)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={imei2 ?? ''}
                      onChange={(e) => setImei2(e.target.value)}
                      placeholder="354891100234562 (по желанию)"
                      className="w-full min-w-0 rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <label className="block text-fg-subtle mb-1 text-[11px] uppercase truncate">Описание дефекта / Неисправности *</label>
                  <textarea
                    required
                    rows={3}
                    value={defectDescription ?? ''}
                    onChange={(e) => setDefectDescription(e.target.value)}
                    placeholder="Не заряжается, разбито стекло дисплея..."
                    className="w-full min-w-0 rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-sm font-bold text-accent-fg transition-all shadow-xs mt-2 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                <span className="truncate">{isSubmitting ? 'Оформление…' : 'Оформить приём в ремонт'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            {/* List of Tickets */}
            {listLoad === 'loading' && filteredRepairs.length === 0 ? (
              <LoadingState label="Загрузка ремонтов…" />
            ) : listLoad === 'error' && filteredRepairs.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-fg-muted">Не удалось загрузить ремонты за период. Проверьте подключение к интернету.</p>
                <Button onClick={() => setListLoadAttempt((n) => n + 1)}>Повторить</Button>
              </div>
            ) : filteredRepairs.length === 0 ? (
              <div className="p-12 text-center text-fg-muted text-xs uppercase tracking-wider">
                Квитанции на ремонт не найдены
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRepairs.map((ticket: RepairTicket) => {
                  const conf = getStatusBadge(ticket.status);
                  const isAccepted = ticket.status === 'ACCEPTED';
                  const isInProgress = ticket.status === 'IN_PROGRESS';
                  const isIssued = ticket.status === 'ISSUED';

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => setViewingTicket(ticket)}
                      className="p-2.5 sm:p-3 rounded-xl bg-surface border border-border hover:border-border-strong hover:bg-surface-raised/40 transition-all flex flex-col gap-1.5 cursor-pointer shadow-2xs"
                    >
                      {/* Line 1: Ticket #, Status Badge, Date, Expense & Chevron */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs sm:text-sm font-bold text-accent font-mono shrink-0">
                            Кв. #{ticket.ticketNumber}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold border shrink-0 ${conf.color}`}>
                            {conf.label}
                          </span>
                          <span className="text-[11px] text-fg-subtle shrink-0">
                            • {new Date(ticket.createdAt).toLocaleDateString('ru-RU')}
                          </span>
                        </div>

                        {/* Right: Expense & Chevron */}
                        <div className="text-right shrink-0 flex items-center gap-1.5">
                          <div className="flex flex-col items-end">
                            {isIssued ? (
                              <>
                                <span className="text-xs sm:text-sm font-bold font-mono text-accent leading-tight">
                                  {formatMoney(ticket.finalCostTjs)} TJS
                                </span>
                                <span className="text-[10px] text-fg-subtle font-mono">расход</span>
                              </>
                            ) : (
                              <span className="text-[10px] text-fg-subtle font-mono">
                                расход при выдаче
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
                        </div>
                      </div>

                      {/* Line 2: Device Model */}
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-fg truncate">
                          {ticket.deviceModel || `${ticket.brand || ''} ${ticket.model || ''}`}
                        </h4>
                      </div>

                      {/* Line 3: Client & Store & Defect */}
                      <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle min-w-0 truncate">
                        <span className="text-fg-muted font-medium shrink-0">
                          {ticket.customerName || 'Клиент'}
                        </span>
                        {ticket.customerPhone && (
                          <span className="shrink-0 text-fg-subtle">
                            ({ticket.customerPhone})
                          </span>
                        )}
                        {!isStoreScoped && ticket.storeName && (
                          <>
                            <span>•</span>
                            <span className="text-fg-muted font-medium shrink-0">
                              {ticket.storeName}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-danger font-medium truncate">
                          Дефект: {ticket.problemDescription}
                        </span>
                      </div>

                      {/* Line 4 (if not issued): Actions & Prepayment */}
                      {!isIssued && (
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs" onClick={(e) => e.stopPropagation()}>
                          <div>
                            {ticket.prepaymentTjs ? (
                              <span className="text-[10px] text-fg-subtle font-mono">
                                Предоплата: <strong className="text-fg font-semibold">{formatMoney(ticket.prepaymentTjs)} TJS</strong>
                              </span>
                            ) : <div />}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isAccepted && (
                              <button
                                type="button"
                                onClick={() => { void handleUpdateStatusQuick(ticket.id, 'IN_PROGRESS'); }}
                                disabled={updatingTicketId !== null}
                                className="h-7 px-2.5 rounded-lg bg-warning/15 hover:bg-warning/25 border border-warning/30 text-xs font-semibold text-warning transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                              >
                                {updatingTicketId === ticket.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                <span>В работу</span>
                              </button>
                            )}
                            {isInProgress && (
                              <button
                                type="button"
                                onClick={() => { void handleUpdateStatusQuick(ticket.id, 'READY'); }}
                                disabled={updatingTicketId !== null}
                                className="h-7 px-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 border border-accent/30 text-xs font-semibold text-accent transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                              >
                                {updatingTicketId === ticket.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                <span>Готов</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenIssueModal(ticket)}
                              disabled={updatingTicketId === ticket.id}
                              className="h-7 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                            >
                              <span>Выдать клиенту</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: ISSUE REPAIR TICKET */}
      <Dialog
        open={selectedTicket !== null}
        onClose={() => { if (!isSubmitting) setSelectedTicket(null); }}
        title="Выдача ремонта клиенту"
        subtitle={selectedTicket ? `Квитанция #${selectedTicket.ticketNumber}` : undefined}
        footer={
          <div className="w-full grid grid-cols-2 gap-2">
            <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={() => setSelectedTicket(null)}>Отмена</Button>
            <Button fullWidth loading={isSubmitting} onClick={handleConfirmIssueTicket}>
              {isSubmitting ? 'Выдача…' : (parseFloat(issueFinalCost) || 0) > 0 ? 'Подтвердить выдачу' : 'Выдать без расхода'}
            </Button>
          </div>
        }
      >
        {selectedTicket && (
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-1">
              <p className="font-semibold text-fg-muted">{selectedTicket.deviceModel || selectedTicket.model}</p>
              <p className="text-xs text-fg-subtle">Клиент: {selectedTicket.customerName} ({selectedTicket.customerPhone || 'телефон не указан'})</p>
            </div>
            <label className="block">
              <span className="block text-fg-subtle mb-1 text-xs font-semibold">Расход на ремонт (запчасти / работа мастера), TJS</span>
              <input
                step="0.01"
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="0.00"
                value={issueFinalCost}
                onChange={(e) => setIssueFinalCost(e.target.value)}
                className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent font-bold focus:border-accent focus:outline-none"
              />
            </label>
            {selectedTicket.prepaymentTjs ? (
              <div className="p-2.5 rounded-xl bg-surface-raised border border-border flex justify-between items-center text-xs">
                <span className="text-fg-subtle">Предоплата по квитанции (справочно)</span>
                <span className="font-semibold text-fg-muted">{formatMoney(selectedTicket.prepaymentTjs)} TJS</span>
              </div>
            ) : null}
            <p className="text-xs text-fg-subtle">
              {(parseFloat(issueFinalCost) || 0) > 0
                ? 'Сумма будет списана с кассы магазина как расход на запчасти и ремонт.'
                : 'Расход не указан: ремонт будет выдан без списания с кассы.'}
            </p>
          </div>
        )}
      </Dialog>

      {/* MODAL: VIEW REPAIR CARD DETAILS */}
      <Dialog
        open={viewingTicket !== null}
        onClose={() => setViewingTicket(null)}
        title={viewingTicket ? `Квитанция на ремонт #${viewingTicket.ticketNumber}` : 'Квитанция на ремонт'}
        subtitle={viewingTicket ? getStatusBadge(viewingTicket.status).label : undefined}
        maxWidth="lg"
        footer={viewingTicket && viewingTicket.status !== 'ISSUED' ? (
          <div className="w-full flex gap-2">
            {viewingTicket.status === 'ACCEPTED' && (
              <Button
                variant="secondary"
                fullWidth
                loading={updatingTicketId === viewingTicket.id}
                disabled={updatingTicketId !== null}
                onClick={async () => { if (await handleUpdateStatusQuick(viewingTicket.id, 'IN_PROGRESS')) setViewingTicket(null); }}
              >
                В работу
              </Button>
            )}
            {viewingTicket.status === 'IN_PROGRESS' && (
              <Button
                variant="secondary"
                fullWidth
                loading={updatingTicketId === viewingTicket.id}
                disabled={updatingTicketId !== null}
                onClick={async () => { if (await handleUpdateStatusQuick(viewingTicket.id, 'READY')) setViewingTicket(null); }}
              >
                Готов
              </Button>
            )}
            <Button
              fullWidth
              disabled={updatingTicketId !== null}
              onClick={() => {
                const ticketToIssue = viewingTicket;
                setViewingTicket(null);
                handleOpenIssueModal(ticketToIssue);
              }}
            >
              Выдать клиенту
            </Button>
          </div>
        ) : undefined}
      >
        {viewingTicket && (
          <div className="space-y-4 text-xs text-fg-muted">
            {/* Device Info */}
            <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-fg-muted text-sm">{viewingTicket.deviceModel || `${viewingTicket.brand || ''} ${viewingTicket.model || ''}`}</span>
                <span className="text-fg-subtle text-[11px]">{new Date(viewingTicket.createdAt).toLocaleString('ru-RU')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-fg-muted text-xs">
                <div>
                  <span className="text-fg-subtle block text-[10px] uppercase font-semibold">IMEI</span>
                  <span className="font-mono text-fg-muted">{viewingTicket.imei || '—'}</span>
                </div>
                {!isStoreScoped && (
                  <div>
                    <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Магазин / Точка</span>
                    <span className="text-fg-muted">{viewingTicket.storeName || 'Магазин'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Details */}
            <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-1">
              <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Данные клиента</span>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-fg-muted">{viewingTicket.customerName || 'Не указано'}</span>
                <span className="text-accent font-semibold">{viewingTicket.customerPhone || 'не указан'}</span>
              </div>
            </div>

            {/* Problem / Defect Description */}
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl space-y-1">
              <span className="text-danger font-semibold block text-[10px] uppercase">Заявленная неисправность</span>
              <p className="text-fg-muted text-xs font-medium leading-relaxed">{viewingTicket.problemDescription}</p>
            </div>

            {/* Visual Condition, Equipment & Note */}
            {(viewingTicket.visualCondition || viewingTicket.equipmentPackage || viewingTicket.comment) && (
              <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-2">
                {viewingTicket.visualCondition && (
                  <div>
                    <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Внешнее состояние</span>
                    <span className="text-fg-muted">{viewingTicket.visualCondition}</span>
                  </div>
                )}
                {viewingTicket.equipmentPackage && (
                  <div>
                    <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Комплектация</span>
                    <span className="text-fg-muted">{viewingTicket.equipmentPackage}</span>
                  </div>
                )}
                {viewingTicket.comment && (
                  <div>
                    <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Примечание мастера</span>
                    <span className="text-fg-muted">{viewingTicket.comment}</span>
                  </div>
                )}
              </div>
            )}

            {/* Financial Details */}
            <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-2">
              <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Расход на ремонт</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-fg-subtle block text-[10px]">Расход на запчасти / работу:</span>
                  <span className="font-bold text-accent">
                    {viewingTicket.finalCostTjs ? `${formatMoney(viewingTicket.finalCostTjs)} TJS` : 'Задаётся при выдаче'}
                  </span>
                </div>
                {viewingTicket.prepaymentTjs ? (
                  <div>
                    <span className="text-fg-subtle block text-[10px]">Предоплата (справочно):</span>
                    <span className="font-bold text-fg-muted">{formatMoney(viewingTicket.prepaymentTjs)} TJS</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
