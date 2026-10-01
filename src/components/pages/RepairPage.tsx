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
  Scan
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Skeleton';
import { MonthPicker } from '../ui/MonthPicker';

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
        return { label: 'Готов к выдаче', color: 'bg-accent/15 text-accent border-accent/30' };
      case 'ISSUED':
        return { label: 'Выдан клиенту', color: 'bg-surface-raised text-fg-subtle border-border' };
      default:
        return { label: status, color: 'bg-surface-raised text-fg-subtle border-border' };
    }
  };

  return (
    <div className="work-screen flex-1 flex flex-col h-full min-w-0 max-w-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />

      {/* Row 1: Header Tabs Bar */}
      <div className="p-2.5 sm:p-3 border-b border-border bg-surface flex items-center justify-between shrink-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center space-x-1.5 bg-surface-raised p-1 rounded-xl border border-border shrink-0">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
              activeTab === 'list'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            Журнал ремонтов ({filteredRepairs.length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all shrink-0 ${
              activeTab === 'create'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Прием в ремонт</span>
          </button>
        </div>

        {!isStoreScoped && (
          <div className="hidden sm:flex items-center space-x-2 text-xs font-medium text-fg-muted shrink-0">
            <Wrench className="w-4 h-4 text-accent shrink-0" />
            <span className="truncate">{currentStoreName}</span>
          </div>
        )}
      </div>

      {/* Row 2: Dedicated Filter & Search Bar */}
      {activeTab === 'list' && (
        <div className="p-3 border-b border-border bg-bg flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
          <div className="relative w-full md:w-80 lg:w-96">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
            <input
              type="text"
              value={searchQuery ?? ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Квитанция / ФИО / IMEI..."
              className="w-full rounded-xl bg-surface border border-border pl-9 pr-3 py-2 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 text-xs overflow-x-auto scrollbar-none">
            {!isStoreScoped && (
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="shrink-0 bg-surface border border-border text-fg-muted text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent"
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
              className="px-3 py-1.5 rounded-xl border border-border text-fg-muted text-xs font-semibold transition-colors bg-surface focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bg p-3 sm:p-4 min-w-0 max-w-full">
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
          <div className="space-y-3">
            {/* Summary Bar */}
            <div className="p-3.5 bg-surface border border-border rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="text-fg-muted font-medium">
                ПЕРИОД: <strong className="text-accent uppercase font-bold">{selectedMonth === 'ALL' ? 'Все время' : selectedMonth}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
                <span>Всего ремонтов: <strong className="text-fg-muted font-bold">{totalRepairsCount}</strong></span>
                <span>Отремонтировано / Готово: <strong className="text-accent font-bold">{readyRepairsCount}</strong></span>
                <span>Затраты (Расходы): <strong className="text-accent font-bold">{formatMoney(totalExpensesTjs)} TJS</strong></span>
              </div>
            </div>

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
              <div className="space-y-2.5">
                {filteredRepairs.map((ticket: RepairTicket) => {
                  const conf = getStatusBadge(ticket.status);

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => setViewingTicket(ticket)}
                      className="p-4 rounded-xl bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition-colors hover:border-fg-subtle cursor-pointer"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-accent">Кв. #{ticket.ticketNumber}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${conf.color}`}>
                            {conf.label}
                          </span>
                          <span className="text-[11px] text-fg-subtle">
                            • {new Date(ticket.createdAt).toLocaleDateString('ru-RU')}{isStoreScoped ? '' : ` (${ticket.storeName || 'Магазин'})`}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-fg-muted">{ticket.deviceModel || `${ticket.brand || ''} ${ticket.model || ''}`}</h4>
                          <p className="text-xs text-fg-muted mt-0.5">
                            Клиент: <strong className="text-fg-muted">{ticket.customerName || 'Клиент'}</strong> ({ticket.customerPhone || 'телефон не указан'})
                          </p>
                          <p className="text-xs text-danger/90 mt-0.5">
                            Дефект: {ticket.problemDescription}
                          </p>
                        </div>
                      </div>

                        <div className="flex flex-col md:items-end justify-between shrink-0 space-y-2">
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-fg-subtle uppercase block">
                            {ticket.status === 'ISSUED' ? 'Расход на ремонт' : 'Расход'}
                          </span>
                          <span className="text-xs font-bold text-accent">
                            {ticket.status === 'ISSUED'
                              ? `${formatMoney(ticket.finalCostTjs)} TJS`
                              : 'Задаётся при выдаче'}
                          </span>
                          {ticket.prepaymentTjs ? (
                            <span className="text-[10px] text-fg-subtle block">Предоплата: {formatMoney(ticket.prepaymentTjs)} TJS</span>
                          ) : null}
                        </div>

                        {/* Quick action buttons depending on status */}
                        <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          {ticket.status === 'ACCEPTED' && (
                            <button
                              type="button"
                              onClick={() => { void handleUpdateStatusQuick(ticket.id, 'IN_PROGRESS'); }}
                              disabled={updatingTicketId !== null}
                              className="px-3 py-1 rounded-lg bg-warning/15 hover:bg-warning/25 border border-warning/30 text-xs font-bold text-warning transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {updatingTicketId === ticket.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              В работу
                            </button>
                          )}
                          {ticket.status === 'IN_PROGRESS' && (
                            <button
                              type="button"
                              onClick={() => { void handleUpdateStatusQuick(ticket.id, 'READY'); }}
                              disabled={updatingTicketId !== null}
                              className="px-3 py-1 rounded-lg bg-accent/20 hover:bg-accent/30 border border-accent/30 text-xs font-bold text-accent transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {updatingTicketId === ticket.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Готов
                            </button>
                          )}
                          {ticket.status !== 'ISSUED' && (
                            <button
                              type="button"
                              onClick={() => handleOpenIssueModal(ticket)}
                              disabled={updatingTicketId === ticket.id}
                              className="px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                            >
                              Выдать клиенту
                            </button>
                          )}
                        </div>
                      </div>
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
