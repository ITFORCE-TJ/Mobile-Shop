import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { sumMoney, formatMoney } from '../../utils/money';
import { getBusinessDateKey } from '../../utils/businessDate';
import { useAppFields } from '../../context/AppContext';
import { RepairTicket, RepairStatus, SaleItem } from '../../types';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useStoreContext } from '../../utils/storeContext';

import { getStatusBadge } from '../repair/types';
import { RepairTopBar } from '../repair/RepairTopBar';
import { RepairTicketsList } from '../repair/RepairTicketsList';
import { NewRepairForm } from '../repair/NewRepairForm';
import { IssueRepairModal } from '../repair/IssueRepairModal';
import { ViewRepairModal } from '../repair/ViewRepairModal';

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
  } = useAppFields(
    'currentUser',
    'repairs',
    'fetchRepairsRange',
    'sales',
    'fetchSalesRange',
    'devices',
    'findDeviceByImei',
    'stores',
    'createRepairTicket',
    'updateRepairStatus',
    'openScanner',
    'selectedStoreId'
  );

  const currentMonthKey = useMemo(() => getBusinessDateKey().substring(0, 7), []);
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [statusFilter, setStatusFilter] = useState<'ALL' | RepairStatus>('ALL');
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
  const setStatusMessage = (m: { type: 'success' | 'error'; text: string } | null) =>
    setStatusBanner(m ? { tone: m.type, text: m.text } : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [listLoad, setListLoad] = useState<'loading' | 'done' | 'error'>('loading');
  const [listLoadAttempt, setListLoadAttempt] = useState(0);

  // Retail stores only (Exclude Main Warehouse)
  const retailStores = useMemo(() => {
    return stores.filter(s => !s.isMainWarehouse);
  }, [stores]);

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
  const storeCtx = useStoreContext();

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

  const periodRepairs = useMemo(() => {
    return (repairs || []).filter((t: RepairTicket) => {
      if (t.storeId === 'store-main') return false;

      if (effectiveStoreId && effectiveStoreId !== 'ALL') {
        if (t.storeId && t.storeId !== effectiveStoreId) return false;
      }

      if (selectedMonth !== 'ALL' && t.createdAt) {
        const ticketMonth = t.createdAt.substring(0, 7);
        if (ticketMonth !== selectedMonth) return false;
      }

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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: periodRepairs.length,
      ACCEPTED: 0,
      IN_PROGRESS: 0,
      READY: 0,
      ISSUED: 0,
    };
    for (const t of periodRepairs) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [periodRepairs]);

  const filteredRepairs = useMemo(() => {
    if (statusFilter === 'ALL') return periodRepairs;
    return periodRepairs.filter((t: RepairTicket) => t.status === statusFilter);
  }, [periodRepairs, statusFilter]);

  const totalRepairsCount = periodRepairs.length;
  const readyRepairsCount = (statusCounts['READY'] || 0) + (statusCounts['ISSUED'] || 0);
  const totalExpensesTjs = sumMoney(periodRepairs.map(t => t.status === 'ISSUED' ? (t.finalCostTjs || 0) : 0));

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

  return (
    <div className="work-screen flex-1 flex flex-col h-full min-w-0 max-w-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />

      <RepairTopBar
        activeTab={activeTab}
        onNavigateToList={() => setActiveTab('list')}
        onNavigateToCreate={() => {
          setStatusMessage(null);
          setActiveTab('create');
        }}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onScanListSearch={handleScanListSearch}
        isStoreScoped={isStoreScoped}
        isStoreModeCentral={storeCtx.mode === 'CENTRAL'}
        selectedStoreId={selectedStoreId}
        setSelectedStoreId={setSelectedStoreId}
        retailStores={retailStores}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        currentMonthKey={currentMonthKey}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        onResetFilters={() => {
          setSearchQuery('');
          setSelectedMonth(currentMonthKey);
          setStatusFilter('ALL');
          if (!isStoreScoped) setSelectedStoreId('ALL');
        }}
        statusCounts={statusCounts}
        totalRepairsCount={totalRepairsCount}
        readyRepairsCount={readyRepairsCount}
        totalExpensesTjs={totalExpensesTjs}
      />

      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bg p-2.5 sm:p-4 min-w-0 max-w-full flex flex-col">
        {activeTab === 'create' ? (
          <NewRepairForm
            onSubmit={handleCreateTicket}
            isSubmitting={isSubmitting}
            receiptSearch={receiptSearch}
            setReceiptSearch={setReceiptSearch}
            onFindSoldDevice={handleFindSoldDevice}
            onScanTicket={handleScanTicket}
            isStoreScoped={isStoreScoped}
            createTicketStoreId={createTicketStoreId}
            setCreateTicketStoreId={setCreateTicketStoreId}
            retailStores={retailStores}
            clientName={clientName}
            setClientName={setClientName}
            clientPhone={clientPhone}
            setClientPhone={setClientPhone}
            deviceModel={deviceModel}
            setDeviceModel={setDeviceModel}
            imei={imei}
            setImei={setImei}
            imei2={imei2}
            setImei2={setImei2}
            defectDescription={defectDescription}
            setDefectDescription={setDefectDescription}
          />
        ) : (
          <RepairTicketsList
            listLoad={listLoad}
            filteredRepairs={filteredRepairs}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            selectedMonth={selectedMonth}
            onRetryLoad={() => setListLoadAttempt((n) => n + 1)}
            isStoreScoped={isStoreScoped}
            updatingTicketId={updatingTicketId}
            onViewTicket={(ticket) => setViewingTicket(ticket)}
            onUpdateStatusQuick={(id, status) => { void handleUpdateStatusQuick(id, status); }}
            onOpenIssueModal={handleOpenIssueModal}
          />
        )}
      </div>

      <IssueRepairModal
        selectedTicket={selectedTicket}
        onClose={() => { if (!isSubmitting) setSelectedTicket(null); }}
        isSubmitting={isSubmitting}
        issueFinalCost={issueFinalCost}
        setIssueFinalCost={setIssueFinalCost}
        onConfirmIssue={handleConfirmIssueTicket}
      />

      <ViewRepairModal
        viewingTicket={viewingTicket}
        onClose={() => setViewingTicket(null)}
        isStoreScoped={isStoreScoped}
        updatingTicketId={updatingTicketId}
        onUpdateStatusQuick={handleUpdateStatusQuick}
        onOpenIssueModal={handleOpenIssueModal}
      />
    </div>
  );
};
