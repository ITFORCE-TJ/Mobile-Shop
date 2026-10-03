import { getBusinessDateKey } from '../../utils/businessDate';
import { decimal, formatMoney, formatUsd, moneyNumber } from '../../utils/money';
import { formatUserName } from '../../utils/formatUser';
import { capitalByLocation } from '../../utils/ownerCapital';
import React, { useState, useMemo, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import {
  Plus,
  PieChart,
  Percent,
  X,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Users,
  Search,
  Briefcase,
  CreditCard,
  Coins,
  Package,
  Banknote,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Store,
  Warehouse,
  FileText
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { MonthPicker } from '../ui/MonthPicker';
import { useStoreContext, formatStoreName } from '../../utils/storeContext';

function ownerCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'учредитель';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'учредителя';
  return 'учредителей';
}

function formatTxDateTime(isoStr?: string): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}


export const OwnersPage: React.FC = () => {
  const {
    currentUser,
    owners,
    storeProfitShares,
    users,
    stores,
    devices,
    ownerTransactions,
    todayRate,
    createOwnerTransaction,
    setStoreProfitShares,
    closeQuarterPeriod,
    initializeOwners
  } = useAppFields(
    'currentUser',
    'owners',
    'storeProfitShares',
    'users',
    'stores',
    'devices',
    'ownerTransactions',
    'todayRate',
    'createOwnerTransaction',
    'setStoreProfitShares',
    'closeQuarterPeriod',
    'initializeOwners'
  );

  const [isInitializing, setIsInitializing] = useState(false);
  const handleInitializeOwners = async () => {
    setIsInitializing(true);
    const res = await initializeOwners();
    setIsInitializing(false);
    if (res.success) {
      setStatusBanner({ tone: 'success', text: 'Владельцы успешно инициализированы (50% / 50%)' });
    } else {
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка инициализации владельцев' });
    }
  };

  const ownerRoleRank = (role?: string) => (role === 'ADMIN' ? 0 : role === 'PARTNER' ? 1 : 2);
  // Admin inside a store sees the admin and that store's partners; Central Cash shows everyone.
  const storeCtx = useStoreContext();
  const displayOwners = useMemo(() => {
    const inStore = storeCtx.mode === 'STORE'
      ? owners.filter((o) => {
          const role = o.userId ? users.find(u => u.id === o.userId)?.role : undefined;
          return role === 'ADMIN' || o.storeId === storeCtx.storeId || storeProfitShares.some((sh) => sh.ownerId === o.id && sh.storeId === storeCtx.storeId);
        })
      : owners;
    return [...inStore].sort((a, b) => {
      const roleA = a.userId ? users.find(u => u.id === a.userId)?.role : undefined;
      const roleB = b.userId ? users.find(u => u.id === b.userId)?.role : undefined;
      return ownerRoleRank(roleA) - ownerRoleRank(roleB);
    });
  }, [owners, users, storeCtx, storeProfitShares]);

  const getOwnerDetails = (owner: { id: string; name?: string; userId?: string }) => {
    const linkedUser = owner.userId ? users.find(u => u.id === owner.userId) : undefined;
    const rawName = owner.name || linkedUser?.name;
    if (linkedUser?.role === 'ADMIN') {
      return { name: formatUserName(rawName, 'Администратор'), roleTag: 'Администратор', roleSub: 'Владелец & Управляющий' };
    }
    if (linkedUser?.role === 'PARTNER') {
      return { name: formatUserName(rawName, 'Партнер'), roleTag: 'Партнер', roleSub: 'Соучредитель бизнеса' };
    }
    return { name: formatUserName(rawName, 'Владелец'), roleTag: 'Владелец', roleSub: 'Совладелец бизнеса' };
  };

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isSharesModalOpen, setIsSharesModalOpen] = useState(false);
  const [isQuarterModalOpen, setIsQuarterModalOpen] = useState(false);

  // Quarter Report state
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [selectedQuarterYear, setSelectedQuarterYear] = useState<number>(2026);
  const [transferRemainingToCapital, setTransferRemainingToCapital] = useState(true);

  // Shares edit state (per-store partner shares)
  const [selectedSharesStoreId, setSelectedSharesStoreId] = useState<string>('');
  const [adminShareVal, setAdminShareVal] = useState<string>('60');
  const [partnerShareVal, setPartnerShareVal] = useState<string>('40');

  // Tx state
  const [selectedOwnerId, setSelectedOwnerId] = useState(owners[0]?.id || '');

  useEffect(() => {
    if (!selectedOwnerId && owners.length > 0) {
      setSelectedOwnerId(owners[0].id);
    }
  }, [owners, selectedOwnerId]);

  // Owners only invest or withdraw capital here. Profit is never paid out from this page: it
  // becomes capital at the quarterly close.
  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL'>('INVESTMENT');
  const [amountUsd, setAmountUsd] = useState('');
  const [note, setNote] = useState('');
  const [selectedTxStoreId, setSelectedTxStoreId] = useState<string>('');

  const mainWarehouse = useMemo(() => stores.find(s => s.isMainWarehouse), [stores]);
  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);

  const adminOwner = useMemo(() => {
    return owners.find(o => !o.storeId || users.find(u => u.id === o.userId)?.role === 'ADMIN') || owners[0];
  }, [owners, users]);

  const currentSharesStore = useMemo(() => {
    return stores.find(s => s.id === selectedSharesStoreId) || retailStores[0] || stores[0];
  }, [stores, selectedSharesStoreId, retailStores]);

  // A partner's share is stored per store (the admin always gets the rest of that store's profit).
  const sharePairOf = (storeId: string) => storeProfitShares.find(sh => sh.storeId === storeId);
  const partnerForStore = (storeId: string) => {
    const pair = sharePairOf(storeId);
    return (pair && owners.find(o => o.id === pair.ownerId))
      || owners.find(o => o.storeId === storeId && o.id !== adminOwner?.id);
  };
  const ownerShareLabel = (ownerId: string) => {
    if (ownerId === adminOwner?.id) return 'остаток прибыли магазинов';
    const pairs = storeProfitShares.filter(sh => sh.ownerId === ownerId);
    if (!pairs.length) return 'доля не задана';
    return pairs.map(sh => `${stores.find(st => st.id === sh.storeId)?.name || 'Магазин'} ${sh.sharePercent}%`).join(', ');
  };

  const currentStorePartner = useMemo(() => {
    if (!currentSharesStore) return undefined;
    return partnerForStore(currentSharesStore.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, currentSharesStore, storeProfitShares, adminOwner]);

  useEffect(() => {
    if (!selectedTxStoreId && stores.length > 0) {
      const defaultStore = stores.find(s => !s.isMainWarehouse) || stores[0];
      setSelectedTxStoreId(defaultStore.id);
    }
  }, [stores, selectedTxStoreId]);

  // History filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PROFIT_PAYOUT' | 'INVESTMENT' | 'WITHDRAWAL' | 'REINVEST'>('ALL');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('ALL');
  const [storeFilterChoice, setSelectedStoreFilter] = useState<string>('ALL');
  const selectedStoreFilter = storeCtx.mode === 'STORE' ? storeCtx.storeId : storeFilterChoice;
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'SPECIFIC_MONTH'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const TRANSACTIONS_PAGE_SIZE = 12;
  const [transactionsPage, setTransactionsPage] = useState(1);

  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  // Track invested capital separately for each store and owner (used in owner cards)
  const storeInvestmentsByOwner = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    owners.forEach(owner => {
      result[owner.id] = capitalByLocation({
        capitalUsd: owner.capitalBalanceUsd || 0,
        transactions: ownerTransactions.filter(tx => tx.ownerId === owner.id),
        stores,
      });
    });
    return result;
  }, [owners, stores, ownerTransactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return ownerTransactions.filter((tx) => {
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }
      if (selectedOwnerFilter !== 'ALL' && tx.ownerId !== selectedOwnerFilter) {
        return false;
      }
      if (selectedStoreFilter !== 'ALL') {
        const targetStore = stores.find(s => s.id === selectedStoreFilter);
        const storeName = targetStore?.name || selectedStoreFilter;
        if (tx.sourceOrDestination !== storeName && tx.sourceOrDestination !== selectedStoreFilter) {
          return false;
        }
      }
      if (periodFilter === 'SPECIFIC_MONTH' && !getBusinessDateKey(new Date(tx.date)).startsWith(selectedMonth)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesOwner = (tx.ownerName || '').toLowerCase().includes(q);
        const matchesNote = (tx.note || '').toLowerCase().includes(q);
        const matchesOperator = (tx.createdByName || '').toLowerCase().includes(q);
        const matchesStore = (tx.sourceOrDestination || '').toLowerCase().includes(q);
        const matchesAmount = (tx.amountUsd?.toString() || '').includes(q);
        if (!matchesOwner && !matchesNote && !matchesOperator && !matchesStore && !matchesAmount) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [ownerTransactions, typeFilter, selectedOwnerFilter, selectedStoreFilter, periodFilter, selectedMonth, searchQuery, stores]);

  useEffect(() => {
    setTransactionsPage(1);
  }, [typeFilter, selectedOwnerFilter, selectedStoreFilter, periodFilter, selectedMonth, searchQuery]);

  const totalTransactionsPages = Math.max(1, Math.ceil(filteredTransactions.length / TRANSACTIONS_PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (transactionsPage - 1) * TRANSACTIONS_PAGE_SIZE;
    return filteredTransactions.slice(start, start + TRANSACTIONS_PAGE_SIZE);
  }, [filteredTransactions, transactionsPage]);

  const totalCapitalInvested = useMemo(() => owners.reduce((acc, o) => acc + (o.capitalBalanceUsd ?? 0), 0), [owners]);
  const totalAvailableProfit = useMemo(() => owners.reduce((acc, o) => acc + (o.availableProfitUsd ?? 0), 0), [owners]);

  // Devices currently in stock across warehouses and stores
  const inStockDevices = useMemo(() => {
    return (devices || []).filter(d =>
      d.status === 'MAIN_WAREHOUSE' || d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE'
    );
  }, [devices]);

  // Total cost value of stock on hand (сколько на товар)
  const totalStockCostUsd = useMemo(() => {
    return inStockDevices.reduce((sum, d) => sum + (d.costBasisUsd ?? d.purchaseCostUsd ?? 0), 0);
  }, [inStockDevices]);

  // Total cash in all store registers and main warehouse (сколько налами лежит)
  const totalCashInRegistersUsd = useMemo(() => {
    return (stores || []).reduce((sum, s) => sum + (s.cashBalanceUsd || 0), 0);
  }, [stores]);

  // Total active assets (goods in stock + cash on hand)
  const totalAssetsSumUsd = useMemo(() => {
    return totalStockCostUsd + totalCashInRegistersUsd;
  }, [totalStockCostUsd, totalCashInRegistersUsd]);

  const stockRatioPercent = useMemo(() => {
    if (totalAssetsSumUsd <= 0) return 0;
    return Math.round((totalStockCostUsd / totalAssetsSumUsd) * 1000) / 10;
  }, [totalStockCostUsd, totalAssetsSumUsd]);

  const cashRatioPercent = useMemo(() => {
    if (totalAssetsSumUsd <= 0) return 0;
    return Math.round((totalCashInRegistersUsd / totalAssetsSumUsd) * 1000) / 10;
  }, [totalCashInRegistersUsd, totalAssetsSumUsd]);

  // Breakdown of stock and cash per store / warehouse
  const storeAssetsBreakdown = useMemo(() => {
    return stores.map(store => {
      const storeDevs = inStockDevices.filter(d =>
        d.locationId === store.id ||
        (d as any).storeId === store.id ||
        (store.isMainWarehouse && (d.status === 'MAIN_WAREHOUSE' || d.locationId === 'main_warehouse'))
      );
      const stockCost = storeDevs.reduce((sum, d) => sum + (d.costBasisUsd ?? d.purchaseCostUsd ?? 0), 0);
      const cash = store.cashBalanceUsd || 0;
      return {
        id: store.id,
        name: store.name,
        isMainWarehouse: Boolean(store.isMainWarehouse),
        stockCount: storeDevs.length,
        stockCostUsd: stockCost,
        cashUsd: cash,
        totalUsd: stockCost + cash,
      };
    });
  }, [stores, inStockDevices]);

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-fg-muted text-xs">
        <p className="font-bold uppercase tracking-wider">Доступ ограничен</p>
        <p className="mt-1 text-fg-subtle">Раздел собственников доступен только администраторам и партнерам</p>
      </div>
    );
  }

  if (owners.length === 0) {
    return (
      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center text-xs bg-bg">
        <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />
        <div className="max-w-md w-full p-6 rounded-2xl bg-surface border border-border shadow-xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-warning/15 text-warning border border-warning/30 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-fg text-sm">Владельцы не настроены</h3>
            <p className="mt-1 text-fg-subtle text-xs leading-relaxed">
              Инициализируйте владельцев бизнеса для раздельного учета капитала и автоматического распределения прибыли.
            </p>
          </div>
          <button
            onClick={handleInitializeOwners}
            disabled={isInitializing}
            className="w-full py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-50 text-accent-fg font-bold text-xs uppercase tracking-wider transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isInitializing ? 'ИНИЦИАЛИЗАЦИЯ...' : 'ИНИЦИАЛИЗИРОВАТЬ (50% / 50%)'}</span>
          </button>
        </div>
      </div>
    );
  }

  const loadStoreShareInputs = (storeId: string) => {
    const partnerShare = sharePairOf(storeId)?.sharePercent ?? 0;
    setPartnerShareVal(partnerShare.toString());
    setAdminShareVal((Math.round((100 - partnerShare) * 10000) / 10000).toString());
  };

  const openSharesModal = (targetStoreIdOrOwnerId?: string) => {
    let targetStore = retailStores[0] || stores[0];
    if (targetStoreIdOrOwnerId) {
      const byStore = stores.find(s => s.id === targetStoreIdOrOwnerId);
      if (byStore) {
        targetStore = byStore;
      } else {
        const ownerStoreId = storeProfitShares.find(sh => sh.ownerId === targetStoreIdOrOwnerId)?.storeId
          || owners.find(o => o.id === targetStoreIdOrOwnerId)?.storeId;
        const matched = ownerStoreId ? stores.find(s => s.id === ownerStoreId) : undefined;
        if (matched) targetStore = matched;
      }
    }
    if (targetStore?.isMainWarehouse) targetStore = retailStores[0] || targetStore;
    const storeId = targetStore?.id || '';
    setSelectedSharesStoreId(storeId);
    loadStoreShareInputs(storeId);
    setStatusBanner(null);
    setIsSharesModalOpen(true);
  };

  const handleSharesStoreChange = (newStoreId: string) => {
    setSelectedSharesStoreId(newStoreId);
    loadStoreShareInputs(newStoreId);
  };

  const handlePartnerShareInputChange = (valStr: string) => {
    setPartnerShareVal(valStr);
    const num = parseFloat(valStr);
    if (!isNaN(num)) {
      const complement = Math.max(0, Math.min(100, Math.round((100 - num) * 10000) / 10000));
      setAdminShareVal(complement.toString());
    } else if (valStr === '') {
      setAdminShareVal('');
    }
  };

  const handleAdminShareInputChange = (valStr: string) => {
    setAdminShareVal(valStr);
    const num = parseFloat(valStr);
    if (!isNaN(num)) {
      const complement = Math.max(0, Math.min(100, Math.round((100 - num) * 10000) / 10000));
      setPartnerShareVal(complement.toString());
    } else if (valStr === '') {
      setPartnerShareVal('');
    }
  };

  const openTxModalForOwner = (
    ownerId: string,
    defaultType: 'INVESTMENT' | 'WITHDRAWAL',
    targetStoreId?: string
  ) => {
    setSelectedOwnerId(ownerId);
    setTxType(defaultType);
    // The admin chooses which register the money goes through; a partner's store link never
    // decides it. Preselect the main warehouse, which holds the partners' equity.
    setSelectedTxStoreId(targetStoreId || mainWarehouse?.id || stores[0]?.id || '');
    setAmountUsd('');
    setNote('');
    setStatusBanner(null);
    setIsTxModalOpen(true);
  };

  const handleSaveShares = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!adminOwner) {
      setStatusBanner({ tone: 'error', text: 'Администратор не найден в списке учредителей' });
      return;
    }

    if (!currentStorePartner) {
      setStatusBanner({
        tone: 'error',
        text: `Для магазина «${currentSharesStore?.name || ''}» ещё не назначен партнёр. Создайте сотрудника с ролью «Партнёр» в разделе «Сотрудники».`
      });
      return;
    }

    const adminNum = parseFloat(adminShareVal);
    const partnerNum = parseFloat(partnerShareVal);

    if (isNaN(adminNum) || isNaN(partnerNum)) {
      setStatusBanner({ tone: 'error', text: 'Укажите числовые значения долей' });
      return;
    }

    if (adminNum <= 0 || adminNum > 100 || partnerNum < 0 || partnerNum >= 100) {
      setStatusBanner({ tone: 'error', text: 'Администратор всегда получает часть прибыли магазина: доля партнёра от 0% до 100% (не включая 100)' });
      return;
    }

    const sum = Math.round((adminNum + partnerNum) * 10000) / 10000;
    if (Math.abs(sum - 100) > 0.0001) {
      setStatusBanner({
        tone: 'error',
        text: `Сумма долей должна быть строго 100% (сейчас ${sum}%)`
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Only this store's pair changes; other stores keep their own shares. A 0% share
      // removes the partner from the store (the admin then gets all of its profit).
      const res = await setStoreProfitShares(currentSharesStore!.id, [{ ownerId: currentStorePartner.id, sharePercent: partnerNum }]);
      if (res.success) {
        setIsSharesModalOpen(false);
        setStatusBanner({
          tone: 'success',
          text: `Доли магазина «${currentSharesStore?.name || ''}» сохранены: ${formatUserName(adminOwner.name)} ${adminNum}%, ${formatUserName(currentStorePartner.name)} ${partnerNum}%. Действуют для прибыли с этого момента.`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка сохранения долей' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setStatusBanner(null);

    const val = parseFloat(amountUsd) || 0;
    if (val <= 0) {
      setStatusBanner({ tone: 'error', text: 'Укажите корректную сумму ($ USD)' });
      return;
    }

    const targetStore = stores.find(s => s.id === selectedTxStoreId);
    if (!targetStore) {
      setStatusBanner({ tone: 'error', text: 'Выберите кассу: магазин или центральный склад' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createOwnerTransaction({
        ownerId: selectedOwnerId,
        type: txType,
        amountUsd: val,
        storeId: targetStore?.id,
        destination: targetStore?.name,
        source: targetStore?.name,
        note: note.trim() || undefined
      });

      if (res.success) {
        setIsTxModalOpen(false);
        setAmountUsd('');
        setNote('');
        const typeText = txType === 'INVESTMENT' ? 'Внесение капитала' : 'Изъятие капитала';
        setStatusBanner({
          tone: 'success',
          text: `Операция «${typeText}» на сумму $${val.toLocaleString()} успешно проведена`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка транзакции' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCloseQuarter = async () => {
    if (isSubmitting) return;
    const quarterName = `${selectedQuarter} ${selectedQuarterYear}`;
    setIsSubmitting(true);
    try {
      const res = await closeQuarterPeriod({
        quarterName,
        transferRemainingToCapital
      });

      if (res.success) {
        setIsQuarterModalOpen(false);
        setStatusBanner({
          tone: 'success',
          text: `Финансовый период «${quarterName}» успешно закрыт`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка закрытия квартала' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />

      {/* Top Header Bar */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border bg-surface shrink-0">
        <div className="max-w-6xl xl:max-w-7xl mx-auto w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
              <PieChart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-bold text-fg leading-tight">Партнеры и капитал</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-fg-subtle">
                  {owners.length} {ownerCountLabel(owners.length)}
                </span>
              </div>
              <p className="text-[10px] text-fg-subtle hidden sm:block truncate">
                Учет долей, инвестиций и распределение прибыли
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => openTxModalForOwner(displayOwners[0]?.id || '', 'INVESTMENT')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold transition-all shadow-xs cursor-pointer min-h-[32px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Капитал</span>
            </button>

            <button
              type="button"
              onClick={() => openSharesModal()}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold transition-colors cursor-pointer min-h-[32px]"
            >
              <Percent className="w-3.5 h-3.5 text-accent" />
              <span>Доли</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusBanner(null);
                setIsQuarterModalOpen(true);
              }}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg text-xs font-semibold transition-colors cursor-pointer min-h-[32px]"
            >
              <FileText className="w-3.5 h-3.5 text-warning" />
              <span className="hidden sm:inline">Квартальный отчет</span>
              <span className="sm:hidden">Квартал</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 lg:p-6 bg-bg">
        <div className="max-w-6xl xl:max-w-7xl mx-auto w-full space-y-3 sm:space-y-4">
        {/* Top 4 Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {/* Total Capital */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border flex flex-col justify-between space-y-1 shadow-2xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-fg-subtle uppercase truncate">Общий капитал</span>
              <div className="w-5 h-5 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <Briefcase className="w-2.5 h-2.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm sm:text-base lg:text-lg font-black font-mono text-fg truncate">
                  ${formatMoney(totalCapitalInvested)}
                </span>
                <span className="text-[9px] font-bold text-fg-subtle">USD</span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-fg-subtle block font-mono truncate">
                ≈ {formatMoney(moneyNumber(decimal(totalCapitalInvested).mul(rate)))} TJS
              </span>
            </div>
            <div className="pt-1 border-t border-border/60 flex items-center justify-between text-[9px] sm:text-[10px] text-fg-subtle">
              <span>Товар: <strong className="text-info font-bold">${formatMoney(totalStockCostUsd)}</strong></span>
              <span>Нал: <strong className="text-accent font-bold">${formatMoney(totalCashInRegistersUsd)}</strong></span>
            </div>
          </div>

          {/* Stock on Hand */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border flex flex-col justify-between space-y-1 shadow-2xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-fg-subtle uppercase truncate">В товаре</span>
              <div className="w-5 h-5 rounded-md bg-info/10 border border-info/20 flex items-center justify-center text-info shrink-0">
                <Package className="w-2.5 h-2.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm sm:text-base lg:text-lg font-black font-mono text-info truncate">
                  ${formatMoney(totalStockCostUsd)}
                </span>
                <span className="text-[9px] font-bold text-fg-subtle">USD</span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-fg-subtle block font-mono truncate">
                ≈ {formatMoney(totalStockCostUsd * rate)} TJS · {inStockDevices.length} шт
              </span>
            </div>
            <div className="pt-1 border-t border-border/60 text-[9px] sm:text-[10px] text-fg-subtle truncate">
              Себестоимость ({stockRatioPercent}% активов)
            </div>
          </div>

          {/* Cash in Registers */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border flex flex-col justify-between space-y-1 shadow-2xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-fg-subtle uppercase truncate">В кассах</span>
              <div className="w-5 h-5 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <Banknote className="w-2.5 h-2.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm sm:text-base lg:text-lg font-black font-mono text-accent truncate">
                  ${formatMoney(totalCashInRegistersUsd)}
                </span>
                <span className="text-[9px] font-bold text-fg-subtle">USD</span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-fg-subtle block font-mono truncate">
                ≈ {formatMoney(totalCashInRegistersUsd * rate)} TJS · {stores.length} касс
              </span>
            </div>
            <div className="pt-1 border-t border-border/60 text-[9px] sm:text-[10px] text-fg-subtle truncate">
              Кассовый остаток ({cashRatioPercent}% активов)
            </div>
          </div>

          {/* Available Profit */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border flex flex-col justify-between space-y-1 shadow-2xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-fg-subtle uppercase truncate">Прибыль</span>
              <div className="w-5 h-5 rounded-md bg-warning/10 border border-warning/20 flex items-center justify-center text-warning shrink-0">
                <Wallet className="w-2.5 h-2.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm sm:text-base lg:text-lg font-black font-mono text-warning truncate">
                  ${formatMoney(totalAvailableProfit)}
                </span>
                <span className="text-[9px] font-bold text-fg-subtle">USD</span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-fg-subtle block font-mono truncate">
                ≈ {formatMoney(moneyNumber(decimal(totalAvailableProfit).mul(rate)))} TJS
              </span>
            </div>
            <div className="pt-1 border-t border-border/60 text-[9px] sm:text-[10px] text-fg-subtle truncate">
              До закрытия квартала
            </div>
          </div>
        </div>

        {/* Section: Capital Allocation Breakdown (Goods vs Cash) */}
        <div className="p-2.5 sm:p-3.5 rounded-xl bg-surface border border-border shadow-xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1.5 border-b border-border">
            <div className="flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-accent" />
              <h2 className="text-xs font-bold text-fg uppercase tracking-wide">
                Структура активов: товар и кассы
              </h2>
            </div>
            <div className="text-[10px] sm:text-[11px] text-fg-subtle flex items-center gap-2 flex-wrap">
              <span>Всего активов: <strong className="text-fg font-bold font-mono">${formatMoney(totalAssetsSumUsd)}</strong></span>
              <span>·</span>
              <span>Курс: <strong className="text-accent font-semibold">{rate} TJS</strong></span>
            </div>
          </div>

          {/* Visual Split Ratio Progress Bar */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] sm:text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-info" />
                <span className="text-fg-muted font-medium">В товаре:</span>
                <span className="font-bold text-fg font-mono">${formatMoney(totalStockCostUsd)}</span>
                <span className="text-fg-subtle">({stockRatioPercent}% · {inStockDevices.length} шт)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-fg-muted font-medium">Наличными:</span>
                <span className="font-bold text-fg font-mono">${formatMoney(totalCashInRegistersUsd)}</span>
                <span className="text-fg-subtle">({cashRatioPercent}% · {stores.length} касс)</span>
              </div>
            </div>

            <div className="w-full h-1.5 sm:h-2 bg-surface-raised rounded-full overflow-hidden flex border border-border">
              <div
                className="bg-info h-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, stockRatioPercent))}%` }}
                title={`В товаре: $${formatMoney(totalStockCostUsd)} (${stockRatioPercent}%)`}
              />
              <div
                className="bg-accent h-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, cashRatioPercent))}%` }}
                title={`Наличными: $${formatMoney(totalCashInRegistersUsd)} (${cashRatioPercent}%)`}
              />
            </div>
          </div>

          {/* Per-Store / Warehouse Breakdown Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2 pt-0.5">
            {storeAssetsBreakdown.map(item => (
              <div
                key={item.id}
                className="p-2 sm:p-2.5 rounded-xl bg-surface-raised border border-border flex flex-col justify-between space-y-1.5 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {item.isMainWarehouse ? (
                      <Warehouse className="w-3.5 h-3.5 text-warning shrink-0" />
                    ) : (
                      <Store className="w-3.5 h-3.5 text-accent shrink-0" />
                    )}
                    <span className="font-bold text-xs text-fg truncate">{item.name}</span>
                  </div>
                  {item.isMainWarehouse && (
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-warning/10 text-warning border border-warning/20 shrink-0">
                      Склад
                    </span>
                  )}
                </div>

                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center justify-between text-fg-muted">
                    <span className="text-[10px] sm:text-[11px] text-fg-subtle flex items-center gap-1">
                      <Package className="w-3 h-3 text-info shrink-0" />
                      Товар ({item.stockCount}):
                    </span>
                    <span className="font-bold text-fg font-mono text-[11px] sm:text-xs">${formatMoney(item.stockCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between text-fg-muted">
                    <span className="text-[10px] sm:text-[11px] text-fg-subtle flex items-center gap-1">
                      <Banknote className="w-3 h-3 text-accent shrink-0" />
                      Касса:
                    </span>
                    <span className="font-bold text-accent font-mono text-[11px] sm:text-xs">${formatMoney(item.cashUsd)}</span>
                  </div>
                </div>

                <div className="pt-1 border-t border-border flex items-center justify-between text-[10px] sm:text-[11px]">
                  <span className="text-fg-subtle font-medium">Итого:</span>
                  <span className="font-bold text-fg font-mono">${formatMoney(item.totalUsd)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Partner Cards (Core Section) */}
        <div className="space-y-2 sm:space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
              <h2 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide">
                Соучредители бизнеса
              </h2>
            </div>
            <button
              type="button"
              onClick={() => openSharesModal()}
              className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Изменить доли</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
            {displayOwners.map((owner) => {
              const info = getOwnerDetails(owner);
              const ownerPairs = storeProfitShares.filter(sh => sh.ownerId === owner.id);
              const share = owner.id === adminOwner?.id ? null : ownerPairs.reduce((max, sh) => Math.max(max, sh.sharePercent), 0);
              const capUsd = owner.capitalBalanceUsd ?? 0;
              const capTjs = moneyNumber(decimal(capUsd).mul(rate));
              const profitUsd = owner.availableProfitUsd ?? 0;
              const profitTjs = moneyNumber(decimal(profitUsd).mul(rate));
              const ownerStoreId = owner.storeId;
              const ownerStore = ownerStoreId ? stores.find(s => s.id === ownerStoreId) : null;
              const partnerStoreAssets = ownerStoreId ? storeAssetsBreakdown.find(s => s.id === ownerStoreId) : null;
              const activeStores = stores.filter(s => (storeInvestmentsByOwner[owner.id]?.[s.id] || 0) > 0);

              return (
                <div
                  key={owner.id}
                  className="rounded-xl sm:rounded-2xl bg-surface border border-border p-2.5 sm:p-3.5 space-y-2 hover:border-fg-subtle/50 transition-all shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    {/* Header: Partner Identity & Share */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-black text-xs shrink-0">
                          {info.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-xs sm:text-sm text-fg truncate">
                              {info.name}
                            </h3>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider border ${
                                info.roleTag === 'Администратор'
                                  ? 'bg-accent/10 border-accent/30 text-accent'
                                  : 'bg-info/10 border-info/30 text-info'
                              }`}
                            >
                              {info.roleTag}
                            </span>
                            {ownerStore ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider bg-warning/10 border border-warning/30 text-warning truncate max-w-28 sm:max-w-36">
                                {ownerStore.name}
                              </span>
                            ) : info.roleTag === 'Администратор' ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider bg-accent/10 border border-accent/30 text-accent">
                                Все филиалы
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openSharesModal(owner.id)}
                        className="px-2 py-0.5 sm:py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-accent font-bold text-[10px] sm:text-xs transition-colors shrink-0 cursor-pointer max-w-36 sm:max-w-48 truncate"
                        title="Нажмите для настройки доли"
                      >
                        {ownerShareLabel(owner.id)}
                      </button>
                    </div>

                    {/* Share Progress Bar */}
                    <div className="w-full bg-surface-raised h-1 rounded-full overflow-hidden border border-border">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-300"
                        style={{ width: `${share === null ? 100 : Math.min(100, Math.max(0, share))}%` }}
                      />
                    </div>

                    {/* Balances: Capital & Available Profit */}
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                      {/* Capital in business */}
                      <div className="p-2 rounded-xl bg-surface-raised border border-border">
                        <span className="text-[9px] font-semibold text-fg-subtle uppercase block truncate">
                          Капитал в обороте
                        </span>
                        <div className="text-xs sm:text-sm font-bold font-mono text-fg mt-0.5">
                          ${formatMoney(capUsd)}
                        </div>
                        <span className="text-[9px] sm:text-[10px] text-fg-subtle block font-mono truncate">
                          ≈ {formatMoney(capTjs)} TJS
                        </span>
                      </div>

                      {/* Profit not yet capitalized */}
                      <div className="p-2 rounded-xl bg-warning/10 border border-warning/25">
                        <span className="text-[9px] font-semibold text-warning uppercase block truncate">
                          Прибыль до закрытия
                        </span>
                        <div className="text-xs sm:text-sm font-bold font-mono text-warning mt-0.5">
                          ${formatMoney(profitUsd)}
                        </div>
                        <span className="text-[9px] sm:text-[10px] text-warning/80 block font-mono truncate">
                          ≈ {formatMoney(profitTjs)} TJS
                        </span>
                      </div>
                    </div>

                    {/* Attached store stock & cash assets snapshot */}
                    {partnerStoreAssets && (
                      <div className="p-1.5 sm:p-2 rounded-lg bg-surface-raised border border-border text-[10px] sm:text-[11px] flex flex-wrap items-center justify-between gap-1 shadow-2xs">
                        <span className="text-fg-subtle flex items-center gap-1 font-semibold truncate">
                          <Store className="w-3 h-3 text-accent shrink-0" />
                          {partnerStoreAssets.name}:
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                          <span className="text-fg-muted">
                            Товар: <strong className="text-info font-bold">${formatMoney(partnerStoreAssets.stockCostUsd)}</strong> ({partnerStoreAssets.stockCount} шт)
                          </span>
                          <span>·</span>
                          <span className="text-fg-muted">
                            Касса: <strong className="text-accent font-bold">${formatMoney(partnerStoreAssets.cashUsd)}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Lifetime Financial Metrics */}
                    <div className="p-1.5 rounded-lg bg-surface-raised/50 border border-border flex items-center justify-around text-center text-xs">
                      <div>
                        <span className="text-[9px] text-fg-subtle block">Начислено</span>
                        <span className="font-bold font-mono text-fg text-[10px] sm:text-[11px] block">
                          ${formatMoney(owner.totalAccruedProfitUsd)}
                        </span>
                      </div>
                      <div className="h-4 w-px bg-border" />
                      <div>
                        <span className="text-[9px] text-fg-subtle block">Выплачено</span>
                        <span className="font-bold font-mono text-info text-[10px] sm:text-[11px] block">
                          ${formatMoney(owner.totalPaidProfitUsd)}
                        </span>
                      </div>
                      <div className="h-4 w-px bg-border" />
                      <div>
                        <span className="text-[9px] text-fg-subtle block">Реинвест</span>
                        <span className="font-bold font-mono text-accent text-[10px] sm:text-[11px] block">
                          ${formatMoney(owner.totalReinvestedUsd)}
                        </span>
                      </div>
                    </div>

                    {/* Stores distribution preview */}
                    {activeStores.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase font-bold text-fg-subtle block">
                          Размещение капитала по локациям:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {activeStores.map(s => {
                            const storeAmt = storeInvestmentsByOwner[owner.id]?.[s.id] || 0;
                            const isWh = s.isMainWarehouse;
                            return (
                              <div
                                key={s.id}
                                className="px-1.5 py-0.5 rounded-md bg-surface-raised border border-border text-[9px] sm:text-[10px] flex items-center gap-1"
                              >
                                {isWh ? (
                                  <Warehouse className="w-3 h-3 text-warning shrink-0" />
                                ) : (
                                  <Store className="w-3 h-3 text-accent shrink-0" />
                                )}
                                <span className="font-medium text-fg-muted truncate max-w-24 sm:max-w-32">{s.name}:</span>
                                <span className="font-bold font-mono text-fg">${formatMoney(storeAmt)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clean Action Buttons */}
                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => openTxModalForOwner(owner.id, 'INVESTMENT')}
                      className="px-2 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-accent border border-accent/25 hover:border-accent text-xs font-bold transition-all text-center cursor-pointer shadow-2xs min-h-[32px] flex items-center justify-center gap-1"
                      title="Внести личные средства в капитал"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Внести</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openTxModalForOwner(owner.id, 'WITHDRAWAL')}
                      className="px-2 py-1.5 rounded-lg bg-surface-raised hover:bg-danger/10 text-fg-subtle hover:text-danger border border-border hover:border-danger/30 text-xs font-semibold transition-all text-center cursor-pointer min-h-[32px] flex items-center justify-center gap-1"
                      title="Изъять вложенный капитал"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Вывод</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section: Transaction History (Clean & Minimalist) */}
        <div className="p-2.5 sm:p-3.5 rounded-xl bg-surface border border-border space-y-2.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
              <h2 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide">
                История операций
              </h2>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-raised border border-border text-fg-muted font-bold font-mono">
                {filteredTransactions.length}
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="space-y-1.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
              {/* Search */}
              <div className="relative flex-1 min-w-36">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по учредителю, примечанию или сумме..."
                  className="w-full rounded-xl bg-surface-raised border border-border pl-8 pr-7 py-1.5 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Controls Row */}
              <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                {/* Partner Dropdown */}
                <select
                  value={selectedOwnerFilter}
                  onChange={(e) => setSelectedOwnerFilter(e.target.value)}
                  className="flex-1 sm:flex-initial bg-surface-raised border border-border text-fg text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="ALL">Все учредители</option>
                  {displayOwners.map((o) => (
                    <option key={o.id} value={o.id}>{getOwnerDetails(o).name}</option>
                  ))}
                </select>

                {/* Store Dropdown (Central Cash only) */}
                {storeCtx.mode === 'CENTRAL' && (
                  <select
                    value={selectedStoreFilter}
                    onChange={(e) => setSelectedStoreFilter(e.target.value)}
                    className="flex-1 sm:flex-initial bg-surface-raised border border-border text-fg text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="ALL">Все объекты</option>
                    {retailStores.map((s) => (
                      <option key={s.id} value={s.id}>{formatStoreName(s.name)}</option>
                    ))}
                    {mainWarehouse && (
                      <option value={mainWarehouse.id}>Центральный склад ({mainWarehouse.name})</option>
                    )}
                  </select>
                )}

                {/* Period Filter */}
                <div className="flex items-center gap-0.5 bg-surface-raised border border-border p-0.5 rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => setPeriodFilter('ALL')}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      periodFilter === 'ALL'
                        ? 'bg-surface text-accent shadow-xs font-bold'
                        : 'text-fg-subtle hover:text-fg'
                    }`}
                  >
                    Все
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodFilter('SPECIFIC_MONTH')}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      periodFilter === 'SPECIFIC_MONTH'
                        ? 'bg-surface text-accent shadow-xs font-bold'
                        : 'text-fg-subtle hover:text-fg'
                    }`}
                  >
                    Месяц
                  </button>
                </div>

                {periodFilter === 'SPECIFIC_MONTH' && (
                  <MonthPicker
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    className="h-7 px-2 rounded-xl border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none shrink-0"
                  />
                )}

                {(searchQuery || typeFilter !== 'ALL' || selectedOwnerFilter !== 'ALL' || selectedStoreFilter !== 'ALL' || periodFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setTypeFilter('ALL');
                      setSelectedOwnerFilter('ALL');
                      setSelectedStoreFilter('ALL');
                      setPeriodFilter('ALL');
                    }}
                    className="p-1.5 text-fg-subtle hover:text-danger hover:bg-danger/10 rounded-xl transition-colors shrink-0 cursor-pointer"
                    title="Сбросить все фильтры"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Operation Type Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {[
                { id: 'ALL', label: 'Все' },
                { id: 'INVESTMENT', label: '+ Вложения' },
                { id: 'REINVEST', label: 'Реинвест' },
                { id: 'PROFIT_PAYOUT', label: '↑ Выплаты' },
                { id: 'WITHDRAWAL', label: 'Вывод' },
              ].map((pill) => {
                const isActive = typeFilter === pill.id;
                const count =
                  pill.id === 'ALL'
                    ? ownerTransactions.length
                    : ownerTransactions.filter(t => t.type === pill.id).length;
                return (
                  <button
                    key={pill.id}
                    onClick={() => setTypeFilter(pill.id as typeof typeFilter)}
                    className={`px-2 py-1 rounded-xl text-xs whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-accent text-accent-fg font-bold shadow-xs'
                        : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg font-medium'
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive ? 'bg-accent-fg/20 text-accent-fg font-bold' : 'bg-surface text-fg-subtle'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transactions List */}
          <div className="space-y-1.5 pt-0.5">
            {filteredTransactions.length === 0 ? (
              <div className="p-6 text-center text-fg-subtle text-xs space-y-1">
                <CreditCard className="w-6 h-6 mx-auto opacity-40 text-fg-subtle" />
                <p className="font-semibold text-fg">Нет операций по выбранным критериям</p>
                <p className="text-[11px]">Попробуйте сбросить фильтры или добавьте новую операцию.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View (>= 768px) */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-raised text-[10px] font-bold text-fg-subtle uppercase tracking-wider select-none">
                    <th className="py-2.5 px-3">Дата</th>
                    <th className="py-2.5 px-3">Учредитель</th>
                    <th className="py-2.5 px-3">Операция</th>
                    <th className="py-2.5 px-3">Объект / Касса</th>
                    <th className="py-2.5 px-3 text-right">Сумма USD</th>
                    <th className="py-2.5 px-3 text-right">Сумма TJS</th>
                    <th className="py-2.5 px-3">Провел</th>
                    <th className="py-2.5 px-3">Примечание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedTransactions.map((tx) => {
                    const isDeposit = tx.type === 'INVESTMENT';
                    const isReinvest = tx.type === 'REINVEST';
                    const isPayout = tx.type === 'PROFIT_PAYOUT';
                    const isCapitalIncrease = isDeposit || isReinvest;
                    const tjsVal = Math.round((tx.amountUsd || 0) * (tx.exchangeRate || rate));

                    return (
                      <tr key={tx.id} className="hover:bg-surface-raised/70 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap text-fg-subtle font-mono text-[11px]">
                          {tx.date}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-bold text-fg">{tx.ownerName}</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                              isReinvest
                                ? 'bg-warning/10 border-warning/30 text-warning'
                                : isDeposit
                                ? 'bg-accent/10 border-accent/30 text-accent'
                                : isPayout
                                ? 'bg-info/10 border-info/30 text-info'
                                : 'bg-danger/10 border-danger/30 text-danger'
                            }`}
                          >
                            {isReinvest ? (
                              <Coins className="w-3 h-3" />
                            ) : isDeposit ? (
                              <ArrowDownLeft className="w-3 h-3" />
                            ) : isPayout ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <Wallet className="w-3 h-3" />
                            )}
                            <span>
                              {isReinvest
                                ? 'Реинвест'
                                : isDeposit
                                ? 'Внесение'
                                : isPayout
                                ? 'Выплата'
                                : 'Вывод'}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {tx.sourceOrDestination ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted">
                              {mainWarehouse &&
                              (tx.sourceOrDestination === mainWarehouse.name || tx.sourceOrDestination === mainWarehouse.id) ? (
                                <Warehouse className="w-3 h-3 text-warning shrink-0" />
                              ) : (
                                <Store className="w-3 h-3 text-accent shrink-0" />
                              )}
                              <span>{tx.sourceOrDestination}</span>
                            </span>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono">
                          <span
                            className={`text-xs font-bold ${
                              isCapitalIncrease ? 'text-accent' : 'text-warning'
                            }`}
                          >
                            {isCapitalIncrease ? '+' : '-'}${tx.amountUsd?.toLocaleString()} USD
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-[11px] text-fg-subtle">
                          ≈ {isCapitalIncrease ? '+' : '-'}{tjsVal.toLocaleString()} TJS
                          <span className="text-[10px] text-fg-subtle/70 ml-1">({tx.exchangeRate})</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-fg-subtle text-[11px]">
                          {tx.createdByName || 'Администратор'}
                        </td>
                        <td className="py-2.5 px-3 text-fg-muted max-w-xs truncate" title={tx.note || ''}>
                          {tx.note || <span className="text-fg-subtle/50">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< 768px) */}
            <div className="md:hidden space-y-1.5">
              {paginatedTransactions.map((tx) => {
                const isDeposit = tx.type === 'INVESTMENT';
                const isReinvest = tx.type === 'REINVEST';
                const isPayout = tx.type === 'PROFIT_PAYOUT';
                const isCapitalIncrease = isDeposit || isReinvest;
                const tjsVal = Math.round((tx.amountUsd || 0) * (tx.exchangeRate || rate));

                return (
                  <div
                    key={tx.id}
                    className="p-2 sm:p-2.5 rounded-xl bg-surface-raised border border-border hover:border-fg-subtle/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 text-xs"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <div
                        className={`p-1.5 rounded-lg shrink-0 border ${
                          isReinvest
                            ? 'bg-warning/10 border-warning/30 text-warning'
                            : isDeposit
                            ? 'bg-accent/10 border-accent/30 text-accent'
                            : isPayout
                            ? 'bg-info/10 border-info/30 text-info'
                            : 'bg-danger/10 border-danger/30 text-danger'
                        }`}
                      >
                        {isReinvest ? (
                          <Coins className="w-3.5 h-3.5" />
                        ) : isDeposit ? (
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                        ) : isPayout ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <Wallet className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                              isReinvest
                                ? 'bg-warning/10 border-warning/30 text-warning'
                                : isDeposit
                                ? 'bg-accent/10 border-accent/30 text-accent'
                                : isPayout
                                ? 'bg-info/10 border-info/30 text-info'
                                : 'bg-danger/10 border-danger/30 text-danger'
                            }`}
                          >
                            {isReinvest
                              ? 'Реинвест'
                              : isDeposit
                              ? 'Внесение'
                              : isPayout
                              ? 'Выплата'
                              : 'Вывод'}
                          </span>

                          <span className="font-bold text-fg truncate">{tx.ownerName}</span>

                          {tx.sourceOrDestination && (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-surface border border-border text-fg-muted flex items-center gap-1 truncate">
                              {mainWarehouse &&
                              (tx.sourceOrDestination === mainWarehouse.name || tx.sourceOrDestination === mainWarehouse.id) ? (
                                <Warehouse className="w-3 h-3 text-warning shrink-0" />
                              ) : (
                                <Store className="w-3 h-3 text-accent shrink-0" />
                              )}
                              <span className="truncate">{tx.sourceOrDestination}</span>
                            </span>
                          )}
                        </div>

                        {tx.note && (
                          <p className="text-[11px] text-fg-muted truncate">
                            {tx.note}
                          </p>
                        )}

                        <div className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
                          <span>{tx.date}</span>
                          <span>•</span>
                          <span>Провел: <strong className="text-fg-muted font-medium">{tx.createdByName || 'Администратор'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 border-border pt-1 sm:pt-0 flex items-center justify-between sm:block">
                      <span
                        className={`text-xs sm:text-sm font-bold font-mono ${
                          isCapitalIncrease ? 'text-accent' : 'text-warning'
                        }`}
                      >
                        {isCapitalIncrease ? '+' : '-'}${tx.amountUsd?.toLocaleString()} USD
                      </span>
                      <span className="text-[10px] text-fg-subtle block font-mono">
                        ≈ {isCapitalIncrease ? '+' : '-'}{tjsVal.toLocaleString()} TJS (курс {tx.exchangeRate})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
          </div>

          {/* Pagination */}
          {totalTransactionsPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border text-xs">
              <span className="text-fg-subtle text-[11px]">
                Страница <strong className="text-fg font-mono">{transactionsPage}</strong> из <strong className="text-fg font-mono">{totalTransactionsPages}</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}
                  disabled={transactionsPage === 1}
                  className="px-2 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  ← Назад
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionsPage(p => Math.min(totalTransactionsPages, p + 1))}
                  disabled={transactionsPage === totalTransactionsPages}
                  className="px-2 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Вперед →
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* MODAL: Edit Shares */}
      {isSharesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveShares} className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-border p-4 sm:p-5 text-fg shadow-2xl space-y-3.5 text-xs">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-accent" />
                <div>
                  <h4 className="text-sm font-bold text-fg uppercase tracking-wide">
                    Доли партнеров в магазинах
                  </h4>
                  <p className="text-[11px] text-fg-subtle">
                    Настройка распределения чистой прибыли по каждому филиалу
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSharesModalOpen(false)}
                className="text-fg-subtle hover:text-fg p-1 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Store Selector */}
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1 items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-accent" />
                  <span>Магазин:</span>
                </label>
                <select
                  value={selectedSharesStoreId}
                  onChange={(e) => handleSharesStoreChange(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs font-semibold text-fg focus:border-accent focus:outline-none transition-colors cursor-pointer"
                >
                  {retailStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Partner separate indicator */}
              {currentStorePartner && (
                <div className="p-2.5 rounded-xl bg-surface-raised border border-border flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-info/10 text-info font-bold text-[10px] flex items-center justify-center shrink-0">
                      {formatUserName(currentStorePartner.name).substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-fg-subtle block">Партнёр магазина:</span>
                      <strong className="text-fg font-semibold text-xs truncate block">
                        {formatUserName(currentStorePartner.name)}
                      </strong>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-info/15 text-info border border-info/30 uppercase">
                    Партнёр
                  </span>
                </div>
              )}
            </div>

            {/* Form for selected store */}
            {currentStorePartner && adminOwner ? (
              <div className="space-y-3">
                {/* Admin and Partner Cards */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Admin Card */}
                  <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-fg truncate">
                        {formatUserName(adminOwner.name || 'Администратор')}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent uppercase">
                        Админ
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        required
                        value={adminShareVal}
                        onChange={(e) => handleAdminShareInputChange(e.target.value)}
                        placeholder="60"
                        className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-base text-accent font-bold focus:border-accent focus:outline-none pr-8 font-mono"
                      />
                      <span className="absolute right-3 top-2.5 text-fg-subtle font-bold text-sm">%</span>
                    </div>
                    <span className="text-[10px] text-fg-subtle block">
                      Доля администратора
                    </span>
                  </div>

                  {/* Partner Card */}
                  <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-fg truncate">
                        {formatUserName(currentStorePartner.name || 'Партнёр')}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-info/15 border border-info/30 text-info uppercase">
                        Партнёр
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        required
                        value={partnerShareVal}
                        onChange={(e) => handlePartnerShareInputChange(e.target.value)}
                        placeholder="40"
                        className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-base text-info font-bold focus:border-info focus:outline-none pr-8 font-mono"
                      />
                      <span className="absolute right-3 top-2.5 text-fg-subtle font-bold text-sm">%</span>
                    </div>
                    <span className="text-[10px] text-fg-subtle block">
                      Доля партнёра филиала
                    </span>
                  </div>
                </div>

                {/* Visual Ratio Bar */}
                {(() => {
                  const aVal = Math.max(0, Math.min(100, parseFloat(adminShareVal) || 0));
                  const pVal = Math.max(0, Math.min(100, parseFloat(partnerShareVal) || 0));
                  return (
                    <div className="space-y-1">
                      <div className="w-full h-2.5 rounded-full bg-surface-raised border border-border overflow-hidden flex">
                        <div
                          className="bg-accent h-full transition-all duration-300"
                          style={{ width: `${aVal}%` }}
                          title={`Администратор: ${aVal}%`}
                        />
                        <div
                          className="bg-info h-full transition-all duration-300"
                          style={{ width: `${pVal}%` }}
                          title={`Партнёр: ${pVal}%`}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-fg-subtle font-medium font-mono">
                        <span>{formatUserName(adminOwner.name)}: <strong className="text-accent">{aVal}%</strong></span>
                        <span>{formatUserName(currentStorePartner.name)}: <strong className="text-info">{pVal}%</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Sum validation status */}
                {(() => {
                  const aVal = parseFloat(adminShareVal) || 0;
                  const pVal = parseFloat(partnerShareVal) || 0;
                  const total = Math.round((aVal + pVal) * 100) / 100;
                  const isValid = Math.abs(total - 100) < 0.001;
                  return (
                    <div
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                        isValid
                          ? 'bg-accent/10 border-accent/30 text-accent'
                          : 'bg-danger/10 border-danger/30 text-danger'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {isValid ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>Сумма долей: {total}%</span>
                      </span>
                      <span className="text-[11px]">{!isValid ? 'требуется ровно 100%' : aVal <= 0 ? 'у администратора должна остаться доля' : '100% ✓ (Корректно)'}</span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* No partner assigned to this store */
              <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 space-y-2 text-warning">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold">Партнёр не назначен</span>
                </div>
                <p className="text-[11px] text-fg leading-relaxed">
                  Для магазина <strong>«{currentSharesStore?.name}»</strong> ещё не создан или не прикреплён партнёр.
                </p>
                <p className="text-[10px] text-fg-subtle">
                  Перейдите во вкладку <strong>«Сотрудники»</strong>, создайте или отредактируйте сотрудника с ролью <strong>«Партнёр»</strong> и выберите этот магазин.
                </p>
              </div>
            )}

            <p className="text-[10px] text-fg-subtle leading-snug">
              Новые доли применяются к прибыли с момента сохранения. Уже начисленная прибыль и возвраты
              прошлых продаж считаются по долям, действовавшим в момент продажи.
            </p>

            <div className="flex space-x-2 pt-1 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsSharesModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg border border-border uppercase disabled:opacity-50 transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !currentStorePartner}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Transaction */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateTx} className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-border p-4 sm:p-5 text-fg shadow-2xl space-y-3.5 text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-accent" />
                <h4 className="text-sm font-bold text-fg uppercase">
                  Финансовая операция
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="text-fg-subtle hover:text-fg p-1 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Учредитель *</label>
                <select
                  value={selectedOwnerId ?? ''}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                >
                  {displayOwners.map((o) => (
                    <option key={o.id} value={o.id}>{getOwnerDetails(o).name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Тип операции *</label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as 'INVESTMENT' | 'WITHDRAWAL')}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                >
                  <option value="INVESTMENT">Внесение капитала (Вложение)</option>
                  <option value="WITHDRAWAL">Изъятие / вывод капитала</option>
                </select>
              </div>

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Объект (магазин / склад) *</label>
                <select
                  value={selectedTxStoreId}
                  onChange={(e) => setSelectedTxStoreId(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                >
                  {mainWarehouse && (
                    <option value={mainWarehouse.id}>
                      Центральный склад ({mainWarehouse.name})
                    </option>
                  )}
                  {retailStores.map(store => (
                    <option key={store.id} value={store.id}>
                      {formatStoreName(store.name)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Сумма ($ USD) *</label>
                <div className="relative">
                  <input
                    step="0.01"
                    type="number"
                    min="0.01"
                    required
                    value={amountUsd ?? ''}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="1000"
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold font-mono focus:border-accent focus:outline-none pr-8"
                  />
                  <span className="absolute right-3 top-2 text-fg-subtle font-bold">$</span>
                </div>
                {amountUsd && parseFloat(amountUsd) > 0 && (
                  <span className="text-[11px] text-accent font-semibold block mt-1 font-mono">
                    ≈ {formatMoney((parseFloat(amountUsd) || 0) * rate)} TJS (по курсу {rate})
                  </span>
                )}
              </div>

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Основание / Примечание</label>
                <input
                  type="text"
                  value={note ?? ''}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Необязательно"
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-1 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsTxModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg border border-border uppercase disabled:opacity-50 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Проведение…' : 'Провести'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Quarterly Report */}
      {isQuarterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-surface border border-border p-3.5 sm:p-4 text-fg shadow-2xl space-y-3 text-xs">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-fg leading-tight">
                    Закрытие периода ({selectedQuarter} {selectedQuarterYear})
                  </h4>
                  <p className="text-[10px] text-fg-subtle">
                    Финансовая ведомость и распределение прибыли партнеров
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuarterModalOpen(false)}
                className="text-fg-subtle hover:text-fg p-1.5 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quarter / Year Selector Toolbar */}
            <div className="flex items-center justify-between gap-2 p-1 rounded-xl bg-surface-raised border border-border">
              <div className="flex items-center gap-1 flex-1">
                {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => {
                  const isSel = selectedQuarter === q;
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSelectedQuarter(q)}
                      className={`flex-1 py-1 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSel
                          ? 'bg-amber-500 text-black shadow-xs font-black'
                          : 'text-fg-subtle hover:text-fg hover:bg-surface'
                      }`}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>

              <select
                value={selectedQuarterYear}
                onChange={(e) => setSelectedQuarterYear(parseInt(e.target.value))}
                className="rounded-lg bg-surface border border-border px-2 py-1 text-xs text-fg font-bold focus:outline-none focus:border-amber-500 cursor-pointer shrink-0"
              >
                <option value={2026}>2026 г.</option>
                <option value={2025}>2025 г.</option>
                <option value={2024}>2024 г.</option>
              </select>
            </div>

            {/* Breakdown Table */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-fg-subtle px-0.5">
                <span className="font-semibold uppercase tracking-wider">Сводная ведомость ($ USD)</span>
                <span className="font-mono">{displayOwners.length} {ownerCountLabel(displayOwners.length)}</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                    <tr>
                      <th className="py-2 px-2.5 font-semibold">Партнер / Доля</th>
                      <th className="py-2 px-2 text-right font-semibold">Начислено</th>
                      <th className="py-2 px-2 text-right font-semibold">Выплачено</th>
                      <th className="py-2 px-2 text-right font-semibold text-amber-500">Остаток</th>
                      <th className="py-2 px-2.5 text-right font-semibold">Капитал</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs">
                    {displayOwners.map((o) => {
                      const isNegative = (o.availableProfitUsd || 0) < 0;
                      return (
                        <tr key={o.id} className="hover:bg-surface/50 font-mono transition-colors">
                          <td className="py-1.5 px-2.5 font-sans">
                            <span className="font-bold text-fg block text-xs truncate max-w-[130px] sm:max-w-none">
                              {getOwnerDetails(o).name}
                            </span>
                            <span className="text-[10px] text-fg-subtle block truncate max-w-[150px] sm:max-w-none leading-tight">
                              {ownerShareLabel(o.id)}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold text-fg">
                            {formatUsd(o.totalAccruedProfitUsd)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-fg-subtle">
                            {formatUsd(o.totalPaidProfitUsd)}
                          </td>
                          <td className={`py-1.5 px-2 text-right font-bold ${
                            isNegative ? 'text-rose-500' : (o.availableProfitUsd || 0) > 0 ? 'text-amber-500' : 'text-fg-subtle'
                          }`}>
                            {formatUsd(o.availableProfitUsd)}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-medium text-fg">
                            {formatUsd(o.capitalBalanceUsd)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-surface/80 font-bold border-t border-border text-xs font-mono">
                    <tr>
                      <td className="py-2 px-2.5 uppercase font-sans text-fg-subtle text-[11px]">ИТОГО:</td>
                      <td className="py-2 px-2 text-right text-fg">
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.totalAccruedProfitUsd || 0), 0))}
                      </td>
                      <td className="py-2 px-2 text-right text-fg-subtle">
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.totalPaidProfitUsd || 0), 0))}
                      </td>
                      <td className={`py-2 px-2 text-right font-bold ${
                        displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0) < 0
                          ? 'text-rose-500'
                          : 'text-amber-500'
                      }`}>
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0))}
                      </td>
                      <td className="py-2 px-2.5 text-right text-fg">
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.capitalBalanceUsd || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Sweep option interactive toggle card */}
            <div
              onClick={() => setTransferRemainingToCapital(prev => !prev)}
              className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-2.5 ${
                transferRemainingToCapital
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-surface-raised border-border hover:border-fg-subtle/30'
              }`}
            >
              <div className="pt-0.5 shrink-0">
                <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                  transferRemainingToCapital
                    ? 'bg-amber-500 text-black'
                    : 'border border-border bg-surface text-transparent'
                }`}>
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-fg block leading-tight">
                  Зачислить прибыль в оборотный капитал
                </span>
                <span className="text-[11px] text-fg-subtle block leading-tight mt-0.5">
                  {transferRemainingToCapital
                    ? 'Доступный остаток прибыли будет автоматически перенесен в капитал партнеров'
                    : 'Прибыль останется на балансе партнеров до следующего периода'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsQuarterModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors cursor-pointer disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmCloseQuarter}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Закрытие…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Закрыть {selectedQuarter} {selectedQuarterYear}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
