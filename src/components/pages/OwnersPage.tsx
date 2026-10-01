import { getBusinessDateKey } from '../../utils/businessDate';
import { formatMoney } from '../../utils/money';
import React, { useState, useMemo, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import {
  Plus,
  PieChart,
  Percent,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Users,
  Search,
  Briefcase,
  CreditCard,
  Coins,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Store,
  Warehouse,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowRightLeft,
  Calendar,
  FileText
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { MonthPicker } from '../ui/MonthPicker';

function ownerCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'учредитель';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'учредителя';
  return 'учредителей';
}

function storeCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'объект';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'объекта';
  return 'объектов';
}

const TX_TYPE_LABELS: Record<'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST', string> = {
  INVESTMENT: 'Внесение капитала',
  REINVEST: 'Реинвестирование из прибыли',
  PROFIT_PAYOUT: 'Выплата чистой прибыли',
  WITHDRAWAL: 'Изъятие / Вывод капитала',
};

export const OwnersPage: React.FC = () => {
  const {
    currentUser,
    owners,
    users,
    stores,
    ownerTransactions,
    suppliers,
    todayRate,
    createOwnerTransaction,
    updateOwnerProfitShares,
    linkOwnerToUser,
    closeQuarterPeriod,
    initializeOwners
  } = useAppFields(
    'currentUser',
    'owners',
    'users',
    'stores',
    'ownerTransactions',
    'suppliers',
    'todayRate',
    'createOwnerTransaction',
    'updateOwnerProfitShares',
    'linkOwnerToUser',
    'closeQuarterPeriod',
    'initializeOwners'
  );

  const [isInitializing, setIsInitializing] = useState(false);
  const [linkingOwnerId, setLinkingOwnerId] = useState<string | null>(null);

  const handleChangeLinkedUser = async (ownerId: string, newUserId: string) => {
    if (linkingOwnerId) return;
    setLinkingOwnerId(ownerId);
    const res = await linkOwnerToUser(ownerId, newUserId || null);
    setLinkingOwnerId(null);
    if (!res.success) {
      setStatusBanner({ tone: 'error', text: res.message || 'Не удалось привязать аккаунт' });
    }
  };

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
  const displayOwners = useMemo(() => {
    return [...owners].sort((a, b) => {
      const roleA = a.userId ? users.find(u => u.id === a.userId)?.role : undefined;
      const roleB = b.userId ? users.find(u => u.id === b.userId)?.role : undefined;
      return ownerRoleRank(roleA) - ownerRoleRank(roleB);
    });
  }, [owners, users]);

  const getOwnerDetails = (owner: { id: string; name?: string; userId?: string }) => {
    const linkedUser = owner.userId ? users.find(u => u.id === owner.userId) : undefined;
    if (linkedUser?.role === 'ADMIN') {
      return { name: owner.name || 'Администратор', roleTag: 'Администратор', roleSub: 'Владелец & Управляющий' };
    }
    if (linkedUser?.role === 'PARTNER') {
      return { name: owner.name || 'Партнер', roleTag: 'Партнер', roleSub: 'Соучредитель бизнеса' };
    }
    return { name: owner.name || 'Владелец', roleTag: 'Владелец', roleSub: 'Совладелец бизнеса' };
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
  const [rebalanceOnSave, setRebalanceOnSave] = useState(false);

  // Tx state
  const [selectedOwnerId, setSelectedOwnerId] = useState(owners[0]?.id || '');

  useEffect(() => {
    if (!selectedOwnerId && owners.length > 0) {
      setSelectedOwnerId(owners[0].id);
    }
  }, [owners, selectedOwnerId]);

  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST'>('PROFIT_PAYOUT');
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

  const currentStorePartner = useMemo(() => {
    if (!currentSharesStore) return undefined;
    return owners.find(o => o.storeId === currentSharesStore.id);
  }, [owners, currentSharesStore]);

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
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'SPECIFIC_MONTH'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const TRANSACTIONS_PAGE_SIZE = 12;
  const [transactionsPage, setTransactionsPage] = useState(1);

  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stores breakdown filter & view
  const [storeLocationFilter, setStoreLocationFilter] = useState<'ALL' | 'RETAIL' | 'WAREHOUSE'>('ALL');

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  const normalizeStoreName = (name?: string) =>
    (name || '').toLowerCase().replace(/["'«»]|магазин|склад/gi, '').trim();

  const resolveTxStore = (sourceOrDestination?: string, storesList: typeof stores = stores) => {
    if (!sourceOrDestination) return null;
    const raw = sourceOrDestination.trim().toLowerCase();
    const byId = storesList.find(s => s.id === sourceOrDestination || s.id.toLowerCase() === raw);
    if (byId) return byId;
    const byName = storesList.find(s => s.name.trim().toLowerCase() === raw);
    if (byName) return byName;
    const cleanTarget = normalizeStoreName(sourceOrDestination);
    if (cleanTarget) {
      const byClean = storesList.find(s => {
        const c = normalizeStoreName(s.name);
        return c === cleanTarget || c.includes(cleanTarget) || cleanTarget.includes(c);
      });
      if (byClean) return byClean;
    }
    return null;
  };

  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => {
      if (a.isMainWarehouse && !b.isMainWarehouse) return 1;
      if (!a.isMainWarehouse && b.isMainWarehouse) return -1;
      return a.name.localeCompare(b.name, 'ru');
    });
  }, [stores]);

  const displayedStores = useMemo(() => {
    if (storeLocationFilter === 'RETAIL') return sortedStores.filter(s => !s.isMainWarehouse);
    if (storeLocationFilter === 'WAREHOUSE') return sortedStores.filter(s => s.isMainWarehouse);
    return sortedStores;
  }, [sortedStores, storeLocationFilter]);

  // Track invested capital separately for each store and owner
  const storeInvestmentsByOwner = useMemo(() => {
    const mainStore = mainWarehouse || stores[0];
    const result: Record<string, Record<string, number>> = {};

    owners.forEach(owner => {
      const capital = Math.max(0, owner.capitalBalanceUsd || 0);
      const storeMap: Record<string, number> = {};
      stores.forEach(s => { storeMap[s.id] = 0; });

      if (capital === 0) {
        result[owner.id] = storeMap;
        return;
      }

      let txSum = 0;
      const txs = ownerTransactions.filter(
        tx => tx.ownerId === owner.id && (tx.type === 'INVESTMENT' || tx.type === 'REINVEST' || tx.type === 'WITHDRAWAL')
      );

      txs.forEach(tx => {
        const matched = resolveTxStore(tx.sourceOrDestination, stores);
        const targetId = matched ? matched.id : (mainStore?.id || stores[0]?.id);
        if (targetId) {
          const delta = tx.type === 'WITHDRAWAL' ? -(tx.amountUsd || 0) : (tx.amountUsd || 0);
          storeMap[targetId] = (storeMap[targetId] || 0) + delta;
          txSum += delta;
        }
      });

      const diff = capital - txSum;
      const fallbackId = mainStore?.id || stores[0]?.id;
      if (fallbackId) {
        storeMap[fallbackId] = (storeMap[fallbackId] || 0) + diff;
      }

      stores.forEach(s => {
        if ((storeMap[s.id] || 0) < 0) storeMap[s.id] = 0;
      });

      const positiveSum = Object.values(storeMap).reduce((acc, v) => acc + v, 0);
      if (fallbackId && positiveSum !== capital) {
        storeMap[fallbackId] = Math.max(0, (storeMap[fallbackId] || 0) + (capital - positiveSum));
      }

      result[owner.id] = storeMap;
    });

    return result;
  }, [owners, stores, ownerTransactions, mainWarehouse]);

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
  const totalSpentOnGoodsUsd = useMemo(() => (suppliers || []).reduce((acc, s) => acc + (s.totalPaidUsd ?? 0), 0), [suppliers]);
  const totalAvailableProfit = useMemo(() => owners.reduce((acc, o) => acc + (o.availableProfitUsd ?? 0), 0), [owners]);

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

  const openSharesModal = (targetStoreIdOrOwnerId?: string) => {
    let targetStore = retailStores[0] || stores[0];
    if (targetStoreIdOrOwnerId) {
      const byStore = stores.find(s => s.id === targetStoreIdOrOwnerId);
      if (byStore) {
        targetStore = byStore;
      } else {
        const byOwner = owners.find(o => o.id === targetStoreIdOrOwnerId);
        if (byOwner?.storeId) {
          const matched = stores.find(s => s.id === byOwner.storeId);
          if (matched) targetStore = matched;
        }
      }
    }
    const storeId = targetStore?.id || '';
    setSelectedSharesStoreId(storeId);

    const partner = owners.find(o => o.storeId === storeId);
    if (partner) {
      const pShare = partner.profitSharePercent ?? 40;
      setPartnerShareVal(pShare.toString());
      setAdminShareVal((Math.max(0, Math.min(100, Math.round((100 - pShare) * 10000) / 10000))).toString());
    } else {
      setPartnerShareVal('0');
      setAdminShareVal('100');
    }

    setRebalanceOnSave(false);
    setStatusBanner(null);
    setIsSharesModalOpen(true);
  };

  const handleSharesStoreChange = (newStoreId: string) => {
    setSelectedSharesStoreId(newStoreId);
    const partner = owners.find(o => o.storeId === newStoreId);
    if (partner) {
      const pShare = partner.profitSharePercent ?? 40;
      setPartnerShareVal(pShare.toString());
      setAdminShareVal((Math.max(0, Math.min(100, Math.round((100 - pShare) * 10000) / 10000))).toString());
    } else {
      setPartnerShareVal('0');
      setAdminShareVal('100');
    }
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

  const handleApplyPreset = (adminPct: number, partnerPct: number) => {
    setAdminShareVal(adminPct.toString());
    setPartnerShareVal(partnerPct.toString());
  };

  const openTxModalForOwner = (
    ownerId: string,
    defaultType: 'INVESTMENT' | 'PROFIT_PAYOUT' | 'WITHDRAWAL' | 'REINVEST',
    targetStoreId?: string
  ) => {
    setSelectedOwnerId(ownerId);
    setTxType(defaultType);
    if (targetStoreId) {
      setSelectedTxStoreId(targetStoreId);
    } else if (!selectedTxStoreId && stores.length > 0) {
      setSelectedTxStoreId(stores[0].id);
    }
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

    if (adminNum < 0 || adminNum > 100 || partnerNum < 0 || partnerNum > 100) {
      setStatusBanner({ tone: 'error', text: 'Доля должна быть в диапазоне от 0% до 100%' });
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
      const payload: { ownerId: string; sharePercent: number }[] = [
        { ownerId: adminOwner.id, sharePercent: adminNum },
        { ownerId: currentStorePartner.id, sharePercent: partnerNum },
      ];

      // Keep existing shares of all other store owners intact
      owners.forEach(o => {
        if (o.id !== adminOwner.id && o.id !== currentStorePartner.id) {
          payload.push({ ownerId: o.id, sharePercent: o.profitSharePercent ?? 0 });
        }
      });

      const res = await updateOwnerProfitShares(payload, undefined, rebalanceOnSave);
      if (res.success) {
        setIsSharesModalOpen(false);
        setStatusBanner({
          tone: 'success',
          text: `Доли для магазина «${currentSharesStore?.name || ''}» успешно сохранены: ${adminOwner.name} ${adminNum}%, ${currentStorePartner.name} ${partnerNum}%${rebalanceOnSave ? ' (остатки прибыли пересчитаны)' : ''}`
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

    const currentOwner = owners.find(o => o.id === selectedOwnerId);

    if ((txType === 'REINVEST' || txType === 'PROFIT_PAYOUT') && currentOwner) {
      const availProfit = currentOwner.availableProfitUsd ?? 0;
      if (val > availProfit) {
        setStatusBanner({
          tone: 'error',
          text: `Сумма ($${val}) превышает доступный остаток к выплате ($${availProfit})`
        });
        return;
      }
    }

    const targetStore = stores.find(s => s.id === selectedTxStoreId) || stores[0];

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
        const typeText =
          txType === 'REINVEST'
            ? 'Реинвестирование'
            : txType === 'INVESTMENT'
            ? 'Внесение капитала'
            : txType === 'PROFIT_PAYOUT'
            ? 'Выплата прибыли'
            : 'Изъятие капитала';
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
    const sweepNote = transferRemainingToCapital
      ? 'Невыплаченный остаток прибыли партнеров будет зачислен в их капитал.'
      : 'Невыплаченный остаток прибыли партнеров перейдет на следующий период.';
    if (!window.confirm(`Закрыть период ${quarterName}? ${sweepNote}`)) {
      return;
    }
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
      <div className="p-3.5 sm:p-4 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <PieChart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-fg leading-tight">Партнеры и капитал</h1>
            <p className="text-[11px] sm:text-xs text-fg-subtle">
              {owners.length} {ownerCountLabel(owners.length)} · Учет долей, инвестиций и распределение прибыли
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => openTxModalForOwner(displayOwners[0]?.id || '', 'INVESTMENT')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-semibold transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Внести капитал</span>
          </button>

          <button
            type="button"
            onClick={() => openSharesModal()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-medium transition-colors cursor-pointer"
          >
            <Percent className="w-3.5 h-3.5 text-accent" />
            <span>Доли партнеров</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusBanner(null);
              setIsQuarterModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg text-xs font-medium transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-warning" />
            <span>Квартальный отчет</span>
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-5 bg-bg">
        {/* Top 4 Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Capital */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold text-fg-subtle uppercase">Общий капитал</span>
              <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <Briefcase className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-black text-fg">
                  ${formatMoney(totalCapitalInvested)}
                </span>
                <span className="text-xs font-bold text-fg-subtle">USD</span>
              </div>
              <span className="text-[11px] text-fg-muted block mt-0.5">
                ≈ {formatMoney(totalCapitalInvested * rate)} TJS
              </span>
            </div>
            <div className="pt-2 border-t border-border text-[10px] text-fg-subtle truncate">
              В товаре: <strong className="text-fg-muted">${formatMoney(totalSpentOnGoodsUsd)}</strong>
            </div>
          </div>

          {/* Available Profit */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold text-fg-subtle uppercase">К выплате</span>
              <div className="w-7 h-7 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center text-warning shrink-0">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-xl font-black text-warning">
                  ${formatMoney(totalAvailableProfit)}
                </span>
                <span className="text-xs font-bold text-fg-subtle">USD</span>
              </div>
              <span className="text-[11px] text-fg-muted block mt-0.5">
                ≈ {formatMoney(totalAvailableProfit * rate)} TJS
              </span>
            </div>
            <div className="pt-2 border-t border-border text-[10px] text-fg-subtle truncate">
              Доступный остаток прибыли
            </div>
          </div>

          {/* Shares Ratio */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold text-fg-subtle uppercase">Соотношение долей</span>
              <div className="w-7 h-7 rounded-lg bg-info/10 border border-info/20 flex items-center justify-center text-info shrink-0">
                <Percent className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-black text-fg">
                {displayOwners.map(o => `${o.profitSharePercent || 0}%`).join(' / ')}
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-raised overflow-hidden flex border border-border mt-2">
                {displayOwners.map((o, idx) => {
                  const colors = ['bg-accent', 'bg-info', 'bg-warning', 'bg-highlight'];
                  return (
                    <div
                      key={o.id}
                      className={`${colors[idx % colors.length]} h-full transition-all`}
                      style={{ width: `${o.profitSharePercent || 0}%` }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="pt-2 border-t border-border text-[10px] text-fg-subtle truncate">
              {displayOwners.map(o => `${getOwnerDetails(o).name} (${o.profitSharePercent || 0}%)`).join(' · ')}
            </div>
          </div>

          {/* Exchange Rate */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold text-fg-subtle uppercase">Курс валюты</span>
              <div className="w-7 h-7 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-fg-muted shrink-0">
                <Coins className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-xl font-black text-fg">1 USD</span>
                <span className="text-xs font-bold text-fg-subtle">=</span>
                <span className="text-lg sm:text-xl font-black text-accent">{rate} TJS</span>
              </div>
              <span className="text-[11px] text-fg-subtle block mt-0.5">
                Расчетный курс операций
              </span>
            </div>
            <div className="pt-2 border-t border-border text-[10px] text-fg-subtle truncate">
              Автоматический пересчет
            </div>
          </div>
        </div>

        {/* Section: Partner Cards (Core Section) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayOwners.map((owner) => {
              const info = getOwnerDetails(owner);
              const share = owner.profitSharePercent ?? 0;
              const capUsd = owner.capitalBalanceUsd ?? 0;
              const capTjs = Math.round(capUsd * rate);
              const profitUsd = owner.availableProfitUsd ?? 0;
              const profitTjs = Math.round(profitUsd * rate);

              return (
                <div
                  key={owner.id}
                  className="rounded-2xl bg-surface border border-border p-4 sm:p-5 space-y-4 hover:border-fg-subtle/50 transition-all shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Header: Partner Identity & Share */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-black text-sm shrink-0">
                          {info.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm sm:text-base text-fg truncate">
                              {info.name}
                            </h3>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border ${
                                info.roleTag === 'Администратор'
                                  ? 'bg-accent/10 border-accent/30 text-accent'
                                  : 'bg-info/10 border-info/30 text-info'
                              }`}
                            >
                              {info.roleTag}
                            </span>
                            {owner.storeId && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-warning/10 border border-warning/30 text-warning">
                                {stores.find(s => s.id === owner.storeId)?.name || 'Магазин'}
                              </span>
                            )}
                            {!owner.storeId && info.roleTag === 'Администратор' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-accent/10 border border-accent/30 text-accent">
                                Все филиалы
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-fg-subtle block mt-0.5">
                            {info.roleSub}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openSharesModal(owner.id)}
                        className="px-2.5 py-1 rounded-xl bg-surface-raised hover:bg-surface border border-border text-accent font-bold text-xs transition-colors shrink-0 cursor-pointer"
                        title="Нажмите для настройки доли"
                      >
                        {share}% доли
                      </button>
                    </div>

                    {/* Share Progress Bar */}
                    <div className="w-full bg-surface-raised h-1.5 rounded-full overflow-hidden border border-border">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                      />
                    </div>

                    {/* Balances: Capital & Available Profit */}
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Capital in business */}
                      <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-1">
                        <span className="text-[10px] font-semibold text-fg-subtle uppercase block">
                          Капитал в обороте
                        </span>
                        <div className="text-base sm:text-lg font-bold text-fg">
                          ${formatMoney(capUsd)}
                        </div>
                        <span className="text-[11px] text-fg-subtle block">
                          ≈ {formatMoney(capTjs)} TJS
                        </span>
                      </div>

                      {/* Available for payout */}
                      <div className="p-3 rounded-xl bg-warning/10 border border-warning/25 space-y-1">
                        <span className="text-[10px] font-semibold text-warning uppercase block">
                          Остаток к выплате
                        </span>
                        <div className="text-base sm:text-lg font-bold text-warning">
                          ${formatMoney(profitUsd)}
                        </div>
                        <span className="text-[11px] text-warning/80 block">
                          ≈ {formatMoney(profitTjs)} TJS
                        </span>
                      </div>
                    </div>

                    {/* Lifetime Financial Metrics */}
                    <div className="p-2.5 rounded-xl bg-surface-raised/50 border border-border flex items-center justify-around text-center text-xs">
                      <div>
                        <span className="text-[10px] text-fg-subtle block">Начислено</span>
                        <span className="font-bold text-fg text-xs mt-0.5 block">
                          ${formatMoney(owner.totalAccruedProfitUsd)}
                        </span>
                      </div>
                      <div className="h-6 w-px bg-border" />
                      <div>
                        <span className="text-[10px] text-fg-subtle block">Выплачено</span>
                        <span className="font-bold text-info text-xs mt-0.5 block">
                          ${formatMoney(owner.totalPaidProfitUsd)}
                        </span>
                      </div>
                      <div className="h-6 w-px bg-border" />
                      <div>
                        <span className="text-[10px] text-fg-subtle block">Реинвест</span>
                        <span className="font-bold text-accent text-xs mt-0.5 block">
                          ${formatMoney(owner.totalReinvestedUsd)}
                        </span>
                      </div>
                    </div>

                    {/* Stores distribution preview */}
                    {stores.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] uppercase font-bold text-fg-subtle block">
                          Размещение капитала по локациям:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {stores.map(s => {
                            const storeAmt = storeInvestmentsByOwner[owner.id]?.[s.id] || 0;
                            if (storeAmt === 0 && capUsd > 0) return null;
                            const isWh = s.isMainWarehouse;
                            return (
                              <div
                                key={s.id}
                                className="px-2 py-1 rounded-lg bg-surface-raised border border-border text-[11px] flex items-center gap-1.5"
                              >
                                {isWh ? (
                                  <Warehouse className="w-3 h-3 text-warning shrink-0" />
                                ) : (
                                  <Store className="w-3 h-3 text-accent shrink-0" />
                                )}
                                <span className="font-medium text-fg-muted truncate max-w-32">{s.name}:</span>
                                <span className="font-bold text-fg">${formatMoney(storeAmt)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clean Action Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={() => openTxModalForOwner(owner.id, 'INVESTMENT')}
                      className="px-2 py-2 rounded-xl bg-surface-raised hover:bg-surface text-accent border border-accent/25 hover:border-accent text-xs font-bold transition-all text-center cursor-pointer shadow-2xs"
                      title="Внести личные средства в капитал"
                    >
                      + Внести
                    </button>

                    <button
                      type="button"
                      onClick={() => openTxModalForOwner(owner.id, 'PROFIT_PAYOUT')}
                      disabled={profitUsd <= 0}
                      className="px-2 py-2 rounded-xl bg-warning/15 hover:bg-warning/25 disabled:opacity-40 disabled:cursor-not-allowed text-warning border border-warning/30 text-xs font-bold transition-all text-center cursor-pointer"
                      title="Выплатить начисленную чистую прибыль"
                    >
                      ↑ Выплата
                    </button>

                    <button
                      type="button"
                      onClick={() => openTxModalForOwner(owner.id, 'REINVEST')}
                      disabled={profitUsd <= 0}
                      className="px-2 py-2 rounded-xl bg-surface-raised hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed text-fg-muted hover:text-fg border border-border text-xs font-semibold transition-all text-center cursor-pointer"
                      title="Реинвестировать остаток прибыли в капитал"
                    >
                      Реинвест
                    </button>

                    <button
                      type="button"
                      onClick={() => openTxModalForOwner(owner.id, 'WITHDRAWAL')}
                      className="px-2 py-2 rounded-xl bg-surface-raised hover:bg-danger/10 text-fg-subtle hover:text-danger border border-border hover:border-danger/30 text-xs font-semibold transition-all text-center cursor-pointer"
                      title="Изъять вложенный капитал"
                    >
                      Вывод
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section: Capital Allocation by Location (Stores & Warehouse) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide">
                  Капитал по объектам сети
                </h2>
                <p className="text-[11px] text-fg-subtle">
                  Распределение вложений учредителей между магазинами и центральным складом
                </p>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center bg-surface-raised p-1 rounded-xl border border-border text-xs font-semibold self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setStoreLocationFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  storeLocationFilter === 'ALL'
                    ? 'bg-accent text-accent-fg font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Все ({sortedStores.length})
              </button>
              <button
                type="button"
                onClick={() => setStoreLocationFilter('RETAIL')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  storeLocationFilter === 'RETAIL'
                    ? 'bg-accent text-accent-fg font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Магазины ({retailStores.length})
              </button>
              <button
                type="button"
                onClick={() => setStoreLocationFilter('WAREHOUSE')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  storeLocationFilter === 'WAREHOUSE'
                    ? 'bg-accent text-accent-fg font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Склад ({mainWarehouse ? 1 : 0})
              </button>
            </div>
          </div>

          {/* Clean Modern Location Table */}
          <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                <tr>
                  <th className="p-3">Объект</th>
                  <th className="p-3 text-right">Вложено (Капитал)</th>
                  <th className="p-3 text-right">Доля в сети</th>
                  {displayOwners.map(owner => (
                    <th key={owner.id} className="p-3 text-right">
                      {getOwnerDetails(owner).name}
                    </th>
                  ))}
                  <th className="p-3 text-center">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedStores.map(store => {
                  const isWarehouse = store.isMainWarehouse;
                  const totalStoreCap = displayOwners.reduce((sum, o) => {
                    return sum + (storeInvestmentsByOwner[o.id]?.[store.id] || 0);
                  }, 0);
                  const pct = totalCapitalInvested > 0 ? Math.round((totalStoreCap / totalCapitalInvested) * 1000) / 10 : 0;
                  const totalStoreTjs = Math.round(totalStoreCap * rate);

                  return (
                    <tr key={store.id} className="hover:bg-surface/50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`p-2 rounded-xl border shrink-0 ${
                              isWarehouse
                                ? 'bg-warning/10 border-warning/30 text-warning'
                                : 'bg-accent/10 border-accent/30 text-accent'
                            }`}
                          >
                            {isWarehouse ? <Warehouse className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-fg block text-xs">
                                {store.name}
                              </span>
                              <span
                                className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${
                                  isWarehouse
                                    ? 'bg-warning/15 border-warning/30 text-warning'
                                    : 'bg-accent/15 border-accent/30 text-accent'
                                }`}
                              >
                                {isWarehouse ? 'Склад' : 'Магазин'}
                              </span>
                            </div>
                            <span className="text-[10px] text-fg-subtle block mt-0.5">
                              {isWarehouse ? 'Центральный хаб и товарный резерв' : 'Розничная точка продаж'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-right">
                        <span className="font-bold text-fg text-sm block">
                          ${formatMoney(totalStoreCap)}
                        </span>
                        <span className="text-[10px] text-fg-subtle block">
                          ≈ {formatMoney(totalStoreTjs)} TJS
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <div className="inline-block text-right">
                          <span className="font-bold text-fg text-xs block">{pct}%</span>
                          <div className="w-16 bg-surface h-1.5 rounded-full overflow-hidden ml-auto mt-1 border border-border">
                            <div
                              className="bg-accent h-full rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {displayOwners.map(owner => {
                        const amount = storeInvestmentsByOwner[owner.id]?.[store.id] || 0;
                        const shareInStore = totalStoreCap > 0 ? Math.round((amount / totalStoreCap) * 100) : 50;

                        return (
                          <td key={owner.id} className="p-3 text-right">
                            <span className={`font-bold block ${amount > 0 ? 'text-fg' : 'text-fg-subtle'}`}>
                              ${formatMoney(amount)}
                            </span>
                            <span className="text-[10px] text-fg-subtle block">
                              {shareInStore}% в объекте
                            </span>
                          </td>
                        );
                      })}

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => openTxModalForOwner(displayOwners[0]?.id, 'INVESTMENT', store.id)}
                          className="px-2.5 py-1 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 font-bold text-xs transition-colors cursor-pointer"
                          title={`Внести капитал в ${store.name}`}
                        >
                          + Вложить
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section: Transaction History (Clean & Minimalist) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-accent" />
              <h2 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide">
                История финансовых операций
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-raised border border-border text-fg-muted font-bold">
                {filteredTransactions.length} записей
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по учредителю, примечанию или сумме..."
                  className="w-full rounded-xl bg-surface-raised border border-border pl-9 pr-8 py-1.5 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Partner Dropdown */}
              <select
                value={selectedOwnerFilter}
                onChange={(e) => setSelectedOwnerFilter(e.target.value)}
                className="bg-surface-raised border border-border text-fg text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent shrink-0 cursor-pointer"
              >
                <option value="ALL">Все учредители</option>
                {displayOwners.map((o) => (
                  <option key={o.id} value={o.id}>{getOwnerDetails(o).name}</option>
                ))}
              </select>

              {/* Store Dropdown */}
              <select
                value={selectedStoreFilter}
                onChange={(e) => setSelectedStoreFilter(e.target.value)}
                className="bg-surface-raised border border-border text-fg text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent shrink-0 cursor-pointer"
              >
                <option value="ALL">Все объекты</option>
                {retailStores.map((s) => (
                  <option key={s.id} value={s.id}>Магазин «{s.name}»</option>
                ))}
                {mainWarehouse && (
                  <option value={mainWarehouse.id}>Центральный склад ({mainWarehouse.name})</option>
                )}
              </select>

              {/* Period Filter */}
              <div className="flex items-center gap-1 bg-surface-raised border border-border p-0.5 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setPeriodFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    periodFilter === 'ALL'
                      ? 'bg-surface text-accent shadow-xs font-bold'
                      : 'text-fg-subtle hover:text-fg'
                  }`}
                >
                  Все время
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodFilter('SPECIFIC_MONTH')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    periodFilter === 'SPECIFIC_MONTH'
                      ? 'bg-surface text-accent shadow-xs font-bold'
                      : 'text-fg-subtle hover:text-fg'
                  }`}
                >
                  По месяцам
                </button>
              </div>

              {periodFilter === 'SPECIFIC_MONTH' && (
                <MonthPicker
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  className="h-8 px-2 rounded-xl border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none shrink-0"
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

            {/* Operation Type Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {[
                { id: 'ALL', label: 'Все операции' },
                { id: 'INVESTMENT', label: '+ Вложения' },
                { id: 'REINVEST', label: 'Реинвест' },
                { id: 'PROFIT_PAYOUT', label: '↑ Выплаты прибыли' },
                { id: 'WITHDRAWAL', label: 'Вывод капитала' },
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
                    className={`px-2.5 py-1 rounded-xl text-xs whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-accent text-accent-fg font-bold shadow-xs'
                        : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg font-medium'
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
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
          <div className="space-y-2 pt-1">
            {filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-fg-subtle text-xs space-y-1">
                <CreditCard className="w-6 h-6 mx-auto opacity-40 text-fg-subtle" />
                <p className="font-semibold text-fg">Нет операций по выбранным критериям</p>
                <p className="text-[11px]">Попробуйте сбросить фильтры или добавьте новую операцию.</p>
              </div>
            ) : (
              paginatedTransactions.map((tx) => {
                const isDeposit = tx.type === 'INVESTMENT';
                const isReinvest = tx.type === 'REINVEST';
                const isPayout = tx.type === 'PROFIT_PAYOUT';
                const isCapitalIncrease = isDeposit || isReinvest;
                const tjsVal = Math.round((tx.amountUsd || 0) * (tx.exchangeRate || rate));

                return (
                  <div
                    key={tx.id}
                    className="p-3 rounded-xl bg-surface-raised border border-border hover:border-fg-subtle/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-xl shrink-0 border ${
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
                          <Coins className="w-4 h-4" />
                        ) : isDeposit ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : isPayout ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <Wallet className="w-4 h-4" />
                        )}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
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

                          <span className="font-bold text-fg">{tx.ownerName}</span>

                          {tx.sourceOrDestination && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface border border-border text-fg-muted flex items-center gap-1">
                              {mainWarehouse &&
                              (tx.sourceOrDestination === mainWarehouse.name || tx.sourceOrDestination === mainWarehouse.id) ? (
                                <Warehouse className="w-3 h-3 text-warning" />
                              ) : (
                                <Store className="w-3 h-3 text-accent" />
                              )}
                              <span>{tx.sourceOrDestination}</span>
                            </span>
                          )}
                        </div>

                        {tx.note && (
                          <p className="text-xs text-fg-muted">
                            {tx.note}
                          </p>
                        )}

                        <div className="flex items-center gap-2 text-[10px] text-fg-subtle">
                          <span>{tx.date}</span>
                          <span>•</span>
                          <span>Провел: <strong className="text-fg-muted font-medium">{tx.createdByName || 'Администратор'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 border-t sm:border-t-0 border-border pt-2 sm:pt-0">
                      <span
                        className={`text-sm font-bold block ${
                          isCapitalIncrease ? 'text-accent' : 'text-warning'
                        }`}
                      >
                        {isCapitalIncrease ? '+' : '-'}${tx.amountUsd?.toLocaleString()} USD
                      </span>
                      <span className="text-[10px] text-fg-subtle block mt-0.5">
                        ≈ {isCapitalIncrease ? '+' : '-'}{tjsVal.toLocaleString()} TJS (курс {tx.exchangeRate})
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalTransactionsPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-border text-xs">
              <span className="text-fg-subtle">
                Страница <strong className="text-fg">{transactionsPage}</strong> из <strong className="text-fg">{totalTransactionsPages}</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}
                  disabled={transactionsPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  ← Назад
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionsPage(p => Math.min(totalTransactionsPages, p + 1))}
                  disabled={transactionsPage === totalTransactionsPages}
                  className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Вперед →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Edit Shares */}
      {isSharesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveShares} className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4 text-xs">
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
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-accent" />
                <span>Выберите магазин:</span>
              </label>
              <select
                value={selectedSharesStoreId}
                onChange={(e) => handleSharesStoreChange(e.target.value)}
                className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs font-semibold text-fg focus:border-accent focus:outline-none transition-colors cursor-pointer"
              >
                {stores.map((s) => {
                  const partner = owners.find(o => o.storeId === s.id);
                  const partnerInfo = partner ? ` — Партнёр: ${partner.name} (${partner.profitSharePercent ?? 40}%)` : ' — (партнёр не назначен)';
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isMainWarehouse ? '(Склад)' : ''}{partnerInfo}
                    </option>
                  );
                })}
              </select>
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
                        {adminOwner.name || 'Администратор'}
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
                        className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-base text-accent font-bold focus:border-accent focus:outline-none pr-8"
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
                        {currentStorePartner.name || 'Партнёр'}
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
                        className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-base text-info font-bold focus:border-info focus:outline-none pr-8"
                      />
                      <span className="absolute right-3 top-2.5 text-fg-subtle font-bold text-sm">%</span>
                    </div>
                    <span className="text-[10px] text-fg-subtle block">
                      Доля партнёра филиала
                    </span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] text-fg-subtle font-semibold">Быстро:</span>
                  {[
                    { label: '60 / 40', admin: 60, partner: 40 },
                    { label: '50 / 50', admin: 50, partner: 50 },
                    { label: '70 / 30', admin: 70, partner: 30 },
                    { label: '80 / 20', admin: 80, partner: 20 },
                  ].map((p) => {
                    const isActive = parseFloat(adminShareVal) === p.admin && parseFloat(partnerShareVal) === p.partner;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => handleApplyPreset(p.admin, p.partner)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-accent text-accent-fg border-accent shadow-xs'
                            : 'bg-surface hover:bg-surface-raised border-border text-fg'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {/* Visual Ratio Bar */}
                {(() => {
                  const aVal = Math.max(0, Math.min(100, parseFloat(adminShareVal) || 0));
                  const pVal = Math.max(0, Math.min(100, parseFloat(partnerShareVal) || 0));
                  return (
                    <div className="space-y-1">
                      <div className="w-full h-3 rounded-full bg-surface-raised border border-border overflow-hidden flex">
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
                      <div className="flex justify-between text-[10px] text-fg-subtle font-medium">
                        <span>{adminOwner.name}: <strong className="text-accent">{aVal}%</strong></span>
                        <span>{currentStorePartner.name}: <strong className="text-info">{pVal}%</strong></span>
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
                      <span className="text-[11px]">{isValid ? '100% ✓ (Корректно)' : 'требуется ровно 100%'}</span>
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

            {/* Rebalance checkbox */}
            <label className="flex items-start gap-2 p-2.5 rounded-xl border border-border bg-surface-raised cursor-pointer">
              <input
                type="checkbox"
                checked={rebalanceOnSave}
                onChange={(e) => setRebalanceOnSave(e.target.checked)}
                className="rounded bg-surface border-border text-accent focus:ring-0 mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block font-semibold text-fg text-[11px]">Пересчитать текущие остатки прибыли</span>
                <span className="block text-[10px] text-fg-subtle leading-tight">
                  Распределить накопленный остаток прибыли заново по новым долям.
                </span>
              </span>
            </label>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateTx} className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
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
                  onChange={(e) => setTxType(e.target.value as any)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                >
                  <option value="INVESTMENT">Внесение капитала (Вложение)</option>
                  <option value="PROFIT_PAYOUT">Выплата чистой прибыли</option>
                  <option value="REINVEST">Реинвестирование из прибыли</option>
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
                  {retailStores.map(store => (
                    <option key={store.id} value={store.id}>
                      Магазин «{store.name}»
                    </option>
                  ))}
                  {mainWarehouse && (
                    <option value={mainWarehouse.id}>
                      Центральный склад ({mainWarehouse.name})
                    </option>
                  )}
                </select>
              </div>

              {/* Helper for available profit */}
              {(() => {
                const currentOwner = owners.find(o => o.id === selectedOwnerId);
                const availProfit = currentOwner?.availableProfitUsd ?? 0;

                if ((txType === 'REINVEST' || txType === 'PROFIT_PAYOUT') && availProfit > 0) {
                  return (
                    <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted">Остаток к выплате:</span>
                        <strong className="text-warning font-bold">${availProfit.toLocaleString()} USD</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAmountUsd(availProfit.toFixed(2))}
                        className="w-full py-1.5 px-2 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning text-xs font-bold border border-warning/40 transition-colors cursor-pointer"
                      >
                        Заполнить весь остаток (${availProfit.toLocaleString()})
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

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
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-fg-subtle font-bold">$</span>
                </div>
                {amountUsd && parseFloat(amountUsd) > 0 && (
                  <span className="text-[11px] text-accent font-semibold block mt-1">
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

            <div className="flex space-x-2 pt-2 border-t border-border">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-surface border border-warning/40 p-5 text-fg shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-warning" />
                <h4 className="text-sm font-bold text-warning uppercase tracking-wide">
                  Квартальный отчет и закрытие периода
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsQuarterModalOpen(false)}
                className="text-fg-subtle hover:text-fg p-1 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quarter / Year */}
            <div className="grid grid-cols-2 gap-3 bg-surface-raised p-3 rounded-xl border border-border">
              <div>
                <label className="block text-[11px] text-fg-subtle uppercase mb-1 font-semibold">Отчетный квартал</label>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(e.target.value as any)}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-warning font-bold focus:border-warning focus:outline-none cursor-pointer"
                >
                  <option value="Q1">Q1 (1-й Квартал: Январь - Март)</option>
                  <option value="Q2">Q2 (2-й Квартал: Апрель - Июнь)</option>
                  <option value="Q3">Q3 (3-й Квартал: Июль - Сентябрь)</option>
                  <option value="Q4">Q4 (4-й Квартал: Октябрь - Декабрь)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-fg-subtle uppercase mb-1 font-semibold">Отчетный год</label>
                <select
                  value={selectedQuarterYear}
                  onChange={(e) => setSelectedQuarterYear(parseInt(e.target.value))}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-fg font-bold focus:border-warning focus:outline-none cursor-pointer"
                >
                  <option value={2026}>2026 год</option>
                  <option value={2025}>2025 год</option>
                  <option value={2024}>2024 год</option>
                </select>
              </div>
            </div>

            {/* Breakdown Table */}
            <div className="space-y-2">
              <span className="font-bold text-fg uppercase text-xs">Сводная ведомость по партнерам ($ USD):</span>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                    <tr>
                      <th className="p-2.5">Партнер</th>
                      <th className="p-2.5 text-center">Доля</th>
                      <th className="p-2.5 text-right">Начислено ($)</th>
                      <th className="p-2.5 text-right">Выплачено ($)</th>
                      <th className="p-2.5 text-right">Реинвест ($)</th>
                      <th className="p-2.5 text-right text-warning">Остаток ($)</th>
                      <th className="p-2.5 text-right">Капитал ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {displayOwners.map((o) => (
                      <tr key={o.id} className="hover:bg-surface/50">
                        <td className="p-2.5 font-bold text-fg">{getOwnerDetails(o).name}</td>
                        <td className="p-2.5 text-center text-fg-subtle">{o.profitSharePercent || 0}%</td>
                        <td className="p-2.5 text-right font-semibold text-fg">${formatMoney(o.totalAccruedProfitUsd)}</td>
                        <td className="p-2.5 text-right text-info">${formatMoney(o.totalPaidProfitUsd)}</td>
                        <td className="p-2.5 text-right text-accent">${formatMoney(o.totalReinvestedUsd)}</td>
                        <td className="p-2.5 text-right font-bold text-warning">${formatMoney(o.availableProfitUsd)}</td>
                        <td className="p-2.5 text-right font-semibold text-fg">${formatMoney(o.capitalBalanceUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface font-bold border-t border-border text-xs">
                    <tr>
                      <td colSpan={2} className="p-2.5 uppercase text-fg-subtle">ИТОГО:</td>
                      <td className="p-2.5 text-right text-fg">${formatMoney(displayOwners.reduce((sum, o) => sum + (o.totalAccruedProfitUsd || 0), 0))}</td>
                      <td className="p-2.5 text-right text-info">${formatMoney(displayOwners.reduce((sum, o) => sum + (o.totalPaidProfitUsd || 0), 0))}</td>
                      <td className="p-2.5 text-right text-accent">${formatMoney(displayOwners.reduce((sum, o) => sum + (o.totalReinvestedUsd || 0), 0))}</td>
                      <td className="p-2.5 text-right text-warning">${formatMoney(displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0))}</td>
                      <td className="p-2.5 text-right text-fg">${formatMoney(displayOwners.reduce((sum, o) => sum + (o.capitalBalanceUsd || 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Sweep option */}
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2">
              <label className="flex items-start space-x-2.5 cursor-pointer text-fg text-xs">
                <input
                  type="checkbox"
                  checked={transferRemainingToCapital}
                  onChange={(e) => setTransferRemainingToCapital(e.target.checked)}
                  className="rounded bg-surface border-border text-warning focus:ring-0 mt-0.5"
                />
                <div>
                  <strong className="block text-warning">Автоматически зачислить невыплаченный остаток в капитал</strong>
                  <span className="text-[11px] text-fg-subtle block mt-0.5">
                    Невыплаченный остаток будет перенесен в оборотный капитал партнеров. Если снять галочку — остаток сохранится к выплате на следующий период.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsQuarterModalOpen(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg border border-border uppercase disabled:opacity-50 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmCloseQuarter}
                className="flex-1 py-2.5 px-3 rounded-xl bg-warning hover:bg-warning/90 text-xs font-bold uppercase text-black shadow-xs transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmitting ? 'Закрытие…' : 'Закрыть период'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
