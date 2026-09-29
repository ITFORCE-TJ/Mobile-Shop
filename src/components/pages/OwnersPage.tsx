import { getBusinessDateKey } from '../../utils/businessDate';
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
  Loader2
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { MonthPicker } from '../ui/MonthPicker';
import { isStoreScoped } from '../../utils/roles';

// Standard Russian noun pluralization (1 -> singular, 2-4 -> few, else -> many),
// so the header stays correct whether the business has 2 partners or a third is added.
function ownerCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'учредитель';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'учредителя';
  return 'учредителей';
}

// The operation is now fixed by which button opened the modal, not chosen inside it —
// this just labels the modal so the user still sees what they're about to do.
const TX_TYPE_LABELS: Record<'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST', string> = {
  INVESTMENT: 'Внесение капитала',
  REINVEST: 'Реинвестирование в бизнес',
  PROFIT_PAYOUT: 'Выплата чистой прибыли',
  WITHDRAWAL: 'Изъятие / Вывод капитала',
};

export const OwnersPage: React.FC = () => {
  const {
    currentUser,
    owners,
    users,
    ownerTransactions,
    suppliers,
    todayRate,
    createOwnerTransaction,
    updateOwnerProfitShares,
    linkOwnerToUser,
    closeQuarterPeriod,
    initializeOwners
  } = useAppFields('currentUser', 'owners', 'users', 'ownerTransactions', 'suppliers', 'todayRate', 'createOwnerTransaction', 'updateOwnerProfitShares', 'linkOwnerToUser', 'closeQuarterPeriod', 'initializeOwners');

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
      setStatusBanner({ tone: 'success', text: 'Владельцы успешно инициализированы в базе данных (50% / 50%)!' });
    } else {
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка инициализации владельцев' });
    }
  };

  // Always show the admin's card before the partner's, regardless of creation
  // order in the database — driven by the actual linked account's role, not a guess.
  const ownerRoleRank = (role?: string) => (role === 'ADMIN' ? 0 : role === 'PARTNER' ? 1 : 2);
  const displayOwners = useMemo(() => {
    return [...owners].sort((a, b) => {
      const roleA = a.userId ? users.find(u => u.id === a.userId)?.role : undefined;
      const roleB = b.userId ? users.find(u => u.id === b.userId)?.role : undefined;
      return ownerRoleRank(roleA) - ownerRoleRank(roleB);
    });
  }, [owners, users]);

  // Role/name are derived from the owner's actually linked account (not a guessed
  // position) — "владелец #1 is always admin" broke the moment names/roles changed
  // without this link, which is exactly the bug this fixes.
  const getOwnerDetails = (owner: { id: string; name?: string; userId?: string }) => {
    const linkedUser = owner.userId ? users.find(u => u.id === owner.userId) : undefined;
    if (linkedUser?.role === 'ADMIN') {
      return { name: owner.name!, roleTag: 'АДМИНИСТРАТОР', roleSub: 'Главный администратор & Владелец бизнеса' };
    }
    if (linkedUser?.role === 'PARTNER') {
      return { name: owner.name!, roleTag: 'ПАРТНЕР', roleSub: 'Партнер & Соучредитель бизнеса' };
    }
    return { name: owner.name || 'Владелец', roleTag: 'ВЛАДЕЛЕЦ', roleSub: 'Совладелец бизнеса (аккаунт не привязан)' };
  };

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isSharesModalOpen, setIsSharesModalOpen] = useState(false);
  const [isQuarterModalOpen, setIsQuarterModalOpen] = useState(false);

  // Quarter Report state
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [selectedQuarterYear, setSelectedQuarterYear] = useState<number>(2026);
  const [transferRemainingToCapital, setTransferRemainingToCapital] = useState(true);

  // Shares edit state
  const [sharesInput, setSharesInput] = useState<Record<string, string>>({});
  // Off by default: redistributing balances pools every owner's accrued/available profit
  // and re-splits it by the new shares, ignoring what each one was already paid — it moves
  // money between partners, so it must be a deliberate choice, never a side effect of Save.
  const [rebalanceOnSave, setRebalanceOnSave] = useState(false);

  // Tx state
  const [selectedOwnerId, setSelectedOwnerId] = useState(owners[0]?.id || '');

  // Owners load asynchronously — resync once they arrive.
  useEffect(() => {
    if (!selectedOwnerId && owners.length > 0) {
      setSelectedOwnerId(owners[0].id);
    }
  }, [owners, selectedOwnerId]);

  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST'>('PROFIT_PAYOUT');
  const [amountUsd, setAmountUsd] = useState('');
  const [note, setNote] = useState('');

  // History filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PROFIT_PAYOUT' | 'INVESTMENT' | 'WITHDRAWAL' | 'REINVEST'>('ALL');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('ALL');
  // Defaults to showing every transaction ever recorded (matches the always-lifetime
  // "Начислено прибыли" cards above) — a month filter is opt-in, not the default, so
  // nothing that was visible before this filter existed suddenly disappears.
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'SPECIFIC_MONTH'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const TRANSACTIONS_PAGE_SIZE = 15;
  const [transactionsPage, setTransactionsPage] = useState(1);

  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  // Filtered transactions (Must be called before any conditional return statements)
  const filteredTransactions = useMemo(() => {
    return ownerTransactions.filter((tx) => {
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }
      if (selectedOwnerFilter !== 'ALL' && tx.ownerId !== selectedOwnerFilter) {
        return false;
      }
      if (periodFilter === 'SPECIFIC_MONTH' && !getBusinessDateKey(new Date(tx.date)).startsWith(selectedMonth)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesOwner = (tx.ownerName || '').toLowerCase().includes(q);
        const matchesNote = (tx.note || '').toLowerCase().includes(q);
        const matchesOperator = (tx.createdByName || '').toLowerCase().includes(q);
        const matchesAmount = (tx.amountUsd?.toString() || '').includes(q);
        if (!matchesOwner && !matchesNote && !matchesOperator && !matchesAmount) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [ownerTransactions, typeFilter, selectedOwnerFilter, periodFilter, selectedMonth, searchQuery]);

  // Changing a filter can leave the current page past the end of the new
  // (shorter) result set — snap back to page 1 whenever the filters change.
  useEffect(() => {
    setTransactionsPage(1);
  }, [typeFilter, selectedOwnerFilter, periodFilter, selectedMonth, searchQuery]);

  const totalTransactionsPages = Math.max(1, Math.ceil(filteredTransactions.length / TRANSACTIONS_PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (transactionsPage - 1) * TRANSACTIONS_PAGE_SIZE;
    return filteredTransactions.slice(start, start + TRANSACTIONS_PAGE_SIZE);
  }, [filteredTransactions, transactionsPage]);

  const totalCapitalInvested = useMemo(() => owners.reduce((acc, o) => acc + (o.capitalBalanceUsd ?? 0), 0), [owners]);
  // Money that has actually left the main-warehouse cash register to pay suppliers for
  // goods — distinct from totalDebtUsd (still owed) and from stock already received but
  // not yet paid for, so it answers "how much of the invested capital is gone on inventory".
  const totalSpentOnGoodsUsd = useMemo(() => (suppliers || []).reduce((acc, s) => acc + (s.totalPaidUsd ?? 0), 0), [suppliers]);
  const totalAvailableProfit = useMemo(() => owners.reduce((acc, o) => acc + (o.availableProfitUsd ?? 0), 0), [owners]);

  if (isStoreScoped(currentUser)) {
    return (
      <div className="p-8 text-center text-fg-muted text-xs">
        <p className="font-bold text-fg-muted uppercase">Доступ ограничен</p>
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
            <h3 className="font-bold text-fg-muted uppercase text-sm">Владельцы не настроены</h3>
            <p className="mt-1 text-fg-subtle text-xs leading-relaxed">
              Инициализируйте владельцев в базе данных перед финансовыми операциями, вложениями и распределением прибыли.
            </p>
          </div>
          <button
            onClick={handleInitializeOwners}
            disabled={isInitializing}
            className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-50 text-accent-fg font-bold text-xs uppercase tracking-wider transition-all shadow-xs flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>{isInitializing ? 'ИНИЦИАЛИЗАЦИЯ...' : 'ИНИЦИАЛИЗИРОВАТЬ ВЛАДЕЛЬЦЕВ (50% / 50%)'}</span>
          </button>
        </div>
      </div>
    );
  }

  const openSharesModal = () => {
    const init: Record<string, string> = {};
    owners.forEach(o => {
      init[o.id] = (o.profitSharePercent ?? 0).toString();
    });
    setSharesInput(init);
    setRebalanceOnSave(false);
    setStatusBanner(null);
    setIsSharesModalOpen(true);
  };

  const openTxModalForOwner = (ownerId: string, defaultType: 'INVESTMENT' | 'PROFIT_PAYOUT' | 'WITHDRAWAL' | 'REINVEST') => {
    setSelectedOwnerId(ownerId);
    setTxType(defaultType);
    setAmountUsd('');
    setNote('');
    setStatusBanner(null);
    setIsTxModalOpen(true);
  };

  const handleShareInputChange = (changedOwnerId: string, valueStr: string) => {
    setSharesInput(prev => {
      const nextState = { ...prev, [changedOwnerId]: valueStr };

      if (owners.length === 2) {
        const otherOwner = owners.find(o => o.id !== changedOwnerId);
        if (otherOwner) {
          const parsed = parseFloat(valueStr);
          if (!isNaN(parsed)) {
            const complement = Math.max(0, Math.min(100, Math.round((100 - parsed) * 10000) / 10000));
            nextState[otherOwner.id] = complement.toString();
          } else if (valueStr === '') {
            nextState[otherOwner.id] = '';
          }
        }
      }
      return nextState;
    });
  };

  const handleSaveShares = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const payload = owners.map(o => ({
      ownerId: o.id,
      sharePercent: parseFloat(sharesInput[o.id] || '0') || 0
    }));

    const total = payload.reduce((acc, p) => acc + p.sharePercent, 0);
    if (Math.abs(total - 100) > 0.00005) {
      setStatusBanner({
        tone: 'error',
        text: `Сумма долей должна быть строго 100% (сейчас ${total}%)`
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // New shares apply to future operations only, unless the admin explicitly opted
      // into redistributing the existing balances as well.
      const res = await updateOwnerProfitShares(payload, undefined, rebalanceOnSave);
      if (res.success) {
        setIsSharesModalOpen(false);
        setStatusBanner({
          tone: 'success',
          text: rebalanceOnSave
            ? 'Доли партнеров сохранены, остатки прибыли пересчитаны строго по долям'
            : 'Доли партнеров сохранены и будут применяться к новым операциям'
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

    // Both draw from the same availableProfitUsd bucket the backend guards against —
    // check it here too so a typo gets instant feedback instead of a round trip.
    if ((txType === 'REINVEST' || txType === 'PROFIT_PAYOUT') && currentOwner) {
      const availProfit = currentOwner.availableProfitUsd ?? 0;
      if (val > availProfit) {
        setStatusBanner({
          tone: 'error',
          text: `Сумма ${txType === 'REINVEST' ? 'реинвестирования' : 'выплаты'} ($${val}) превышает доступный остаток к выплате ($${availProfit})`
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await createOwnerTransaction({
        ownerId: selectedOwnerId,
        type: txType,
        amountUsd: val,
        note: note.trim() || undefined
      });

      if (res.success) {
        setIsTxModalOpen(false);
        setAmountUsd('');
        setNote('');
        const typeText = txType === 'REINVEST' ? 'Реинвестирование из остатка к выплате' : txType === 'INVESTMENT' ? 'Вложение личного капитала' : txType === 'PROFIT_PAYOUT' ? 'Выплата прибыли' : 'Изъятие капитала';
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
      : 'Невыплаченный остаток прибыли партнеров сохранится и перейдет на следующий период.';
    if (!window.confirm(`Закрыть квартал ${quarterName}? Будет сохранён снимок текущих показателей в историю. ${sweepNote} Начисленная и выплаченная прибыль (lifetime) не обнуляются.`)) {
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
          text: `Финансовый период «Квартал ${quarterName}» официально закрыт.`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка закрытия квартала' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />

      {/* Row 1: Top Header Bar */}
      <div className="p-3 sm:p-3.5 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2">
          <PieChart className="w-4 h-4 text-accent" />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 shrink-0">
          <button
            onClick={() => {
              setStatusBanner(null);
              setIsQuarterModalOpen(true);
            }}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-warning/10 hover:bg-warning/20 border border-warning/30 text-warning text-[11px] font-bold transition-colors whitespace-nowrap shrink-0"
            title="Сформировать квартальный отчёт партнеров и закрыть финансовый период"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Квартальный отчет</span>
          </button>

          <button
            onClick={openSharesModal}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-muted text-[11px] font-bold transition-colors whitespace-nowrap shrink-0"
          >
            <Percent className="w-3.5 h-3.5 text-accent" />
            <span>Доли партнеров</span>
          </button>
        </div>
      </div>

      {/* Scrollable Main Content Container */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 bg-bg">
        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card 1: Total Capital */}
          <div className="p-3.5 rounded-xl bg-surface border border-border flex items-start justify-between">
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block font-semibold">Общий вложенный капитал</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl font-bold text-fg-muted">
                  ${totalCapitalInvested.toLocaleString()}
                </span>
                <span className="text-xs text-fg-subtle font-medium">USD</span>
              </div>
              <span className="text-[10px] text-fg-muted block mt-0.5">
                ≈ {(Math.round(totalCapitalInvested * rate)).toLocaleString()} TJS
              </span>
              <span className="text-[10px] text-fg-subtle block mt-1.5 pt-1.5 border-t border-border">
                Потрачено на товары: <strong className="text-fg-muted">${totalSpentOnGoodsUsd.toLocaleString()}</strong>
              </span>
            </div>
            <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 text-accent shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>

          {/* Card 4: Available Profit */}
          <div className="p-3.5 rounded-xl bg-surface border border-border flex items-start justify-between">
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block font-semibold">К выплате партнерам</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl font-bold text-warning">
                  ${totalAvailableProfit.toLocaleString()}
                </span>
                <span className="text-xs text-fg-subtle font-medium">USD</span>
              </div>
              <span className="text-[10px] text-fg-muted block mt-0.5">
                ≈ {(Math.round(totalAvailableProfit * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-xl bg-warning/10 border border-warning/20 text-warning shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Section 1: Owners Cards (2-Column Grid) */}
        <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center space-x-2">
              <Briefcase className="w-4 h-4 text-accent" />
              <span>СОБСТВЕННИКИ И ВЛОЖЕНИЯ</span>
            </span>
            <span className="text-xs text-fg-subtle">{owners.length} {ownerCountLabel(owners.length)} бизнеса</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayOwners.map((owner, idx) => {
              const info = getOwnerDetails(owner);
              return (
                <div
                  key={owner.id}
                  className="p-4 rounded-xl bg-surface-raised border border-border hover:border-fg-subtle transition-all space-y-3.5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header of Partner Card */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-accent font-bold text-sm shadow-xs shrink-0">
                          {info.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <h4 className="text-xs sm:text-sm font-bold text-fg-muted">{info.name}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent uppercase tracking-wider">
                              {info.roleTag}
                            </span>
                          </div>
                          <span className="text-xs text-fg-subtle block mt-0.5">{info.roleSub}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs font-bold">
                          {owner.profitSharePercent ?? 0}% ДОЛИ
                        </span>
                      </div>
                    </div>

                    {/* Share Progress Bar */}
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden p-0.5 border border-border">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, owner.profitSharePercent || 0))}%` }}
                      />
                    </div>

                    {/* Capital Investment Display */}
                    <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-fg-subtle uppercase">
                        <span>ЛИЧНО ВЛОЖЕНО В ОБОРОТ (КАПИТАЛ):</span>
                        <span className="text-accent font-bold">ВЛОЖЕНИЕ</span>
                      </div>
                      <div className="flex items-baseline">
                        <span className="text-base sm:text-lg text-fg-muted font-bold">
                          ${(owner.capitalBalanceUsd ?? 0).toLocaleString()} USD
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Available for Payout Banner */}
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2.5 text-xs mt-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-fg-subtle text-[11px] uppercase">Остаток к выплате:</span>
                      <span className="font-bold text-warning text-sm">
                        ${(owner.availableProfitUsd ?? 0).toLocaleString()} USD
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'INVESTMENT')}
                        className="flex-1 min-w-fit px-2 sm:px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-raised text-accent border border-border text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors text-center"
                        title="Внести новые личные средства в капитал"
                      >
                        + ЛИЧНЫЕ
                      </button>
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'REINVEST')}
                        className="flex-1 min-w-fit px-2 sm:px-2.5 py-1.5 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning border border-warning/40 text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors text-center"
                        title="Реинвестировать остаток к выплате в бизнес"
                      >
                        ВЛОЖИТЬ ОСТАТОК
                      </button>
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'PROFIT_PAYOUT')}
                        className="flex-1 min-w-fit px-2 sm:px-2.5 py-1.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors text-center"
                        title="Выплатить прибыль на руки"
                      >
                        ↑ ВЫПЛАТИТЬ
                      </button>
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'WITHDRAWAL')}
                        className="flex-1 min-w-fit px-2 sm:px-2.5 py-1.5 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors text-center"
                        title="Изъять вложенный капитал"
                      >
                        🏦 ИЗЪЯТЬ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Full Width Transactions Feed */}
        <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-accent" />
              <span className="font-bold text-xs text-fg-muted uppercase tracking-wide">
                ИСТОРИЯ ФИНАНСОВЫХ ОПЕРАЦИЙ
              </span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold">
                {filteredTransactions.length} событий
              </span>
            </div>
          </div>

          {/* Controls Bar: Search & Compact Modern Filters */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Search Input */}
              <div className="relative flex-1 min-w-50">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по партнеру, примечанию или сумме..."
                  className="w-full rounded-xl bg-surface-raised border border-border pl-9 pr-8 py-1.5 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Partner Dropdown */}
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={selectedOwnerFilter}
                  onChange={(e) => setSelectedOwnerFilter(e.target.value)}
                  className="bg-surface-raised border border-border text-fg-muted text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent shrink-0 cursor-pointer"
                >
                  <option value="ALL">Все партнеры</option>
                  {displayOwners.map((o) => (
                    <option key={o.id} value={o.id}>{getOwnerDetails(o).name}</option>
                  ))}
                </select>

                {/* Period Toggle Pills */}
                <div className="flex items-center gap-1 bg-surface-raised border border-border p-0.5 rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => setPeriodFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      periodFilter === 'ALL'
                        ? 'bg-surface text-accent shadow-xs font-bold'
                        : 'text-fg-subtle hover:text-fg-muted'
                    }`}
                  >
                    Все время
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodFilter('SPECIFIC_MONTH')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      periodFilter === 'SPECIFIC_MONTH'
                        ? 'bg-surface text-accent shadow-xs font-bold'
                        : 'text-fg-subtle hover:text-fg-muted'
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

                {/* Reset all filters button if any active */}
                {(searchQuery || typeFilter !== 'ALL' || selectedOwnerFilter !== 'ALL' || periodFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setTypeFilter('ALL');
                      setSelectedOwnerFilter('ALL');
                      setPeriodFilter('ALL');
                    }}
                    className="p-1.5 text-fg-subtle hover:text-danger hover:bg-danger/10 rounded-xl transition-colors shrink-0"
                    title="Сбросить все фильтры"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Operation Type Segmented Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 pt-0.5">
              {[
                { id: 'ALL', label: 'Все операции' },
                { id: 'INVESTMENT', label: '+ Вложения' },
                { id: 'REINVEST', label: '🔄 Реинвест' },
                { id: 'PROFIT_PAYOUT', label: '↑ Выплаты' },
                { id: 'WITHDRAWAL', label: '🏦 Вывод' },
              ].map((pill) => {
                const isActive = typeFilter === pill.id;
                const count = pill.id === 'ALL' 
                  ? ownerTransactions.length 
                  : ownerTransactions.filter(t => t.type === pill.id).length;
                return (
                  <button
                    key={pill.id}
                    onClick={() => setTypeFilter(pill.id as typeof typeFilter)}
                    className={`px-2.5 py-1 rounded-xl text-xs whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                      isActive
                        ? 'bg-accent text-accent-fg font-bold shadow-xs'
                        : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg-muted hover:border-fg-subtle/40 font-medium'
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-accent-fg/20 text-accent-fg font-bold' : 'bg-surface text-fg-subtle'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transactions Feed List */}
          <div className="space-y-2.5 pt-1">
            {filteredTransactions.length === 0 ? (
              <div className="p-12 text-center text-fg-muted text-xs space-y-2">
                <CreditCard className="w-8 h-8 mx-auto opacity-30 text-fg-subtle" />
                <p className="uppercase font-bold tracking-wider">История транзакций пуста</p>
              </div>
            ) : (
              paginatedTransactions.map((tx) => {
                const isDeposit = tx.type === 'INVESTMENT';
                const isReinvest = tx.type === 'REINVEST';
                const isPayout = tx.type === 'PROFIT_PAYOUT';
                // INVESTMENT and REINVEST both add money to the business's capital — a
                // reinvestment is just sourced from already-accrued profit instead of a
                // fresh personal deposit, so it belongs on the same "+" side, not with
                // PROFIT_PAYOUT/WITHDRAWAL which actually take money out to the owner.
                const isCapitalIncrease = isDeposit || isReinvest;
                const tjsVal = Math.round((tx.amountUsd || 0) * (tx.exchangeRate || rate));

                return (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-xl bg-surface-raised border border-border hover:border-fg-subtle transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start space-x-3 min-w-0">
                      <div className={`p-2.5 rounded-xl shrink-0 border ${
                        isReinvest ? 'bg-warning/10 border-warning/30 text-warning' :
                        isDeposit ? 'bg-accent/10 border-accent/30 text-accent' :
                        isPayout ? 'bg-info/10 border-info/30 text-info' :
                        'bg-danger/10 border-danger/30 text-danger'
                      }`}>
                        {isReinvest ? <Coins className="w-4 h-4" /> :
                         isDeposit ? <ArrowDownLeft className="w-4 h-4" /> :
                         isPayout ? <ArrowUpRight className="w-4 h-4" /> :
                         <Wallet className="w-4 h-4 text-danger" />}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                            isReinvest ? 'bg-warning/10 border-warning/30 text-warning' :
                            isDeposit ? 'bg-accent/10 border-accent/30 text-accent' :
                            isPayout ? 'bg-info/10 border-info/30 text-info' :
                            'bg-danger/10 border-danger/30 text-danger'
                          }`}>
                            {isReinvest ? '🔄 РЕИНВЕСТИРОВАНИЕ' : isDeposit ? '📥 ВНЕСЕНИЕ КАПИТАЛА' : isPayout ? '📤 ВЫПЛАТА ПРИБЫЛИ' : '🏦 ВЫВОД КАПИТАЛА'}
                          </span>

                          <span className="text-xs font-bold text-fg-muted">
                            {tx.ownerName}
                          </span>
                        </div>

                        {tx.note && (
                          <p className="text-xs text-fg-muted wrap-break-word">
                            {tx.note}
                          </p>
                        )}

                        <div className="flex items-center space-x-2 text-[10px] text-fg-subtle">
                          <span>{tx.date}</span>
                          <span>•</span>
                          <span>Провел: <strong className="text-fg-muted font-semibold">{tx.createdByName || 'Администратор'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 border-t sm:border-t-0 border-border pt-2 sm:pt-0">
                      <span className={`text-sm font-bold block ${isCapitalIncrease ? 'text-accent' : 'text-warning'}`}>
                        {isCapitalIncrease ? '+' : '-'}${tx.amountUsd?.toLocaleString()} USD
                      </span>
                      <span className="text-[10px] text-fg-subtle block">
                        ≈ {isCapitalIncrease ? '+' : '-'}{tjsVal.toLocaleString()} TJS · курс {tx.exchangeRate}
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
                Страница <strong className="text-fg-muted">{transactionsPage}</strong> из <strong className="text-fg-muted">{totalTransactionsPages}</strong>
                <span className="hidden sm:inline"> · {filteredTransactions.length} событий всего</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTransactionsPage(p => Math.max(1, p - 1))}
                  disabled={transactionsPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg-muted font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Назад
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionsPage(p => Math.min(totalTransactionsPages, p + 1))}
                  disabled={transactionsPage === totalTransactionsPages}
                  className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg-muted font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Вперед →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Edit Shares Percent */}
      {isSharesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveShares} className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-fg-muted uppercase tracking-wide flex items-center space-x-2">
                <Percent className="w-4 h-4 text-accent" />
                <span>ДОЛИ ПАРТНЕРОВ В БИЗНЕСЕ</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsSharesModalOpen(false)}
                className="text-fg-subtle hover:text-fg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-fg-muted">
              Укажите процент доли каждого партнера. Сумма должна составлять строго 100%.
            </p>

            <div className="space-y-3">
              {displayOwners.map((owner) => (
                <div key={owner.id} className="space-y-1.5">
                  <label className="block text-[11px] uppercase font-semibold text-fg-subtle mb-1">
                    {getOwnerDetails(owner).name} (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      required
                      value={sharesInput[owner.id] ?? ''}
                      onChange={(e) => handleShareInputChange(owner.id, e.target.value)}
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs text-accent font-bold focus:border-accent focus:outline-none pr-8"
                    />
                    <span className="absolute right-3 top-2.5 text-fg-subtle font-bold">%</span>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-fg-subtle mb-1">Привязанный аккаунт</label>
                    <select
                      value={owner.userId ?? ''}
                      disabled={linkingOwnerId === owner.id}
                      onChange={(e) => handleChangeLinkedUser(owner.id, e.target.value)}
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none disabled:opacity-50"
                    >
                      <option value="">— не привязан —</option>
                      {users.filter(u => u.role === 'ADMIN' || u.role === 'PARTNER').map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.login})</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 p-3 rounded-xl border border-border bg-surface-raised cursor-pointer">
              <input
                type="checkbox"
                checked={rebalanceOnSave}
                onChange={(e) => setRebalanceOnSave(e.target.checked)}
                className="rounded bg-surface border-border text-warning focus:ring-0 mt-0.5"
              />
              <span className="space-y-1">
                <span className="block font-semibold text-fg-muted">Перераспределить текущие остатки прибыли по новым долям</span>
                <span className="block text-[10px] text-fg-subtle">
                  Без галочки новые доли применяются только к будущим продажам, расходам и бонусам.
                </span>
              </span>
            </label>

            {rebalanceOnSave && (
            <div className="p-3 bg-surface-raised rounded-xl border border-warning space-y-2">
              <p className="text-[11px] font-semibold text-warning">
                Внимание: вся накопленная и доступная прибыль партнёров будет сложена и заново разделена по долям без учёта уже выплаченного каждому. Это переносит деньги между партнёрами и не отменяется автоматически.
              </p>
              <div className="flex items-center justify-between text-[11px] font-bold uppercase text-fg-subtle border-b border-border pb-1.5">
                <span>Перерасчет остатка прибыли ({totalAvailableProfit.toLocaleString()} USD):</span>
              </div>
              <div className="space-y-1.5 text-xs">
                {displayOwners.map(o => {
                  const pct = parseFloat(sharesInput[o.id] || '0') || 0;
                  const shareVal = Math.round(totalAvailableProfit * pct) / 100;
                  return (
                    <div key={o.id} className="flex justify-between items-center">
                      <span className="text-fg-muted font-medium">{getOwnerDetails(o).name} ({pct}%):</span>
                      <strong className={`font-bold ${shareVal < 0 ? 'text-warning' : 'text-accent'}`}>
                        ${shareVal.toFixed(2)} USD
                      </strong>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-fg-subtle mt-1">
                Остаток к выплате каждого партнера будет автоматически пересчитан пропорционально указанным долям.
              </p>
            </div>
            )}

            <div className="flex space-x-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsSharesModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg-muted border border-border uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Capital Transaction */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateTx} className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-fg-muted uppercase flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-accent" />
                <span>ОПЕРАЦИЯ С КАПИТАЛОМ</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="text-fg-subtle hover:text-fg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">ПАРТНЕР *</label>
                <select
                  value={selectedOwnerId ?? ''}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted text-xs font-semibold focus:border-accent focus:outline-none"
                >
                  {displayOwners.map((o, idx) => (
                    <option key={o.id} value={o.id}>{getOwnerDetails(o).name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Операция</label>
                <div className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted text-xs font-semibold">
                  {TX_TYPE_LABELS[txType]}
                </div>
              </div>

              {/* Helper box for INVESTMENT / REINVEST */}
              {(() => {
                const currentOwner = owners.find(o => o.id === selectedOwnerId);
                const availProfit = currentOwner?.availableProfitUsd ?? 0;

                if (txType === 'REINVEST' || txType === 'INVESTMENT' || txType === 'PROFIT_PAYOUT') {
                  return (
                    <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted">Остаток к выплате партнера:</span>
                        <strong className="text-warning font-bold">${availProfit.toLocaleString()} USD</strong>
                      </div>

                      {txType === 'REINVEST' && availProfit > 0 && (
                        <button
                          type="button"
                          onClick={() => setAmountUsd(availProfit.toFixed(2))}
                          className="w-full py-1.5 px-2 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning text-xs font-bold border border-warning/40 flex items-center justify-center space-x-1 transition-colors"
                        >
                          <span>ВЛОЖИТЬ ВЕСЬ ОСТАТОК </span>
                        </button>
                      )}

                      {txType === 'PROFIT_PAYOUT' && availProfit > 0 && (
                        <button
                          type="button"
                          onClick={() => setAmountUsd(availProfit.toFixed(2))}
                          className="w-full py-1.5 px-2 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning text-xs font-bold border border-warning/40 flex items-center justify-center space-x-1 transition-colors"
                        >
                          <span>ВЫПЛАТИТЬ ВЕСЬ ОСТАТОК</span>
                        </button>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">СУММА ($ USD) *</label>
                <div className="relative">
                  <input step="0.01"
                    type="number"
                    min="0.01"
                    required
                    value={amountUsd ?? ''}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="1000"
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent text-xs font-bold focus:border-accent focus:outline-none pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-fg-subtle font-bold">$</span>
                </div>
              </div>

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">ОСНОВАНИЕ / ПРИМЕЧАНИЕ</label>
                <input
                  type="text"
                  value={note ?? ''}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Необязательно"
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted text-xs focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsTxModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg-muted border border-border uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Проведение…' : 'Провести'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Quarterly Report & Period Settlement */}
      {isQuarterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-surface border border-warning/40 p-5 text-fg-muted shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-warning uppercase tracking-wide flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-warning" />
                <span>📊 КВАРТАЛЬНЫЙ ОТЧЕТ И ЗАКРЫТИЕ ФИНАНСОВОГО ПЕРИОДА</span>
              </h4>
              <button type="button" onClick={() => setIsQuarterModalOpen(false)} className="text-fg-subtle hover:text-fg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quarter & Year Selector Controls */}
            <div className="grid grid-cols-2 gap-3 bg-surface-raised p-3 rounded-xl border border-border">
              <div>
                <label className="block text-[11px] text-fg-subtle uppercase mb-1 font-bold">ОТЧЕТНЫЙ КВАРТАЛ *</label>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(e.target.value as any)}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-warning font-bold focus:border-warning focus:outline-none"
                >
                  <option value="Q1">Q1 (1-й Квартал: Январь - Март)</option>
                  <option value="Q2">Q2 (2-й Квартал: Апрель - Июнь)</option>
                  <option value="Q3">Q3 (3-й Квартал: Июль - Сентябрь)</option>
                  <option value="Q4">Q4 (4-й Квартал: Октябрь - Декабрь)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-fg-subtle uppercase mb-1 font-bold">ОТЧЕТНЫЙ ГОД *</label>
                <select
                  value={selectedQuarterYear}
                  onChange={(e) => setSelectedQuarterYear(parseInt(e.target.value))}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-fg-muted font-bold focus:border-warning focus:outline-none"
                >
                  <option value={2026}>2026 год</option>
                  <option value={2025}>2025 год</option>
                  <option value={2024}>2024 год</option>
                </select>
              </div>
            </div>

            {/* Breakdown Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-fg-muted uppercase">Сводная ведомость по партнерам:</span>
                <span className="text-[11px] text-fg-subtle">Валюта отчета: USD ($)</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                    <tr>
                      <th className="p-2.5">Партнер</th>
                      <th className="p-2.5 text-center">Доля</th>
                      <th className="p-2.5 text-right">Начислено ($)</th>
                      <th className="p-2.5 text-right">Выплачено ($)</th>
                      <th className="p-2.5 text-right">Реинвестировано ($)</th>
                      <th className="p-2.5 text-right text-warning">Остаток ($)</th>
                      <th className="p-2.5 text-right">Капитал ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {displayOwners.map((o, idx) => (
                      <tr key={o.id} className="hover:bg-surface/50">
                        <td className="p-2.5 font-bold text-fg-muted">{getOwnerDetails(o).name}</td>
                        <td className="p-2.5 text-center text-fg-subtle">{o.profitSharePercent || 0}%</td>
                        <td className="p-2.5 text-right font-semibold text-fg-muted">${(o.totalAccruedProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right text-info">${(o.totalPaidProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right text-accent">${(o.totalReinvestedUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold text-warning">${(o.availableProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right font-semibold text-fg-muted">${(o.capitalBalanceUsd || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface font-bold border-t border-border text-xs">
                    <tr>
                      <td colSpan={2} className="p-2.5 uppercase text-fg-subtle">ИТОГО КВАРТАЛ:</td>
                      <td className="p-2.5 text-right text-fg-muted">${displayOwners.reduce((sum, o) => sum + (o.totalAccruedProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-info">${displayOwners.reduce((sum, o) => sum + (o.totalPaidProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-accent">${displayOwners.reduce((sum, o) => sum + (o.totalReinvestedUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-warning">${displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-fg-muted">${displayOwners.reduce((sum, o) => sum + (o.capitalBalanceUsd || 0), 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Quarter Settlement Option Checkbox */}
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2">
              <label className="flex items-start space-x-2.5 cursor-pointer text-fg-muted text-xs">
                <input
                  type="checkbox"
                  checked={transferRemainingToCapital}
                  onChange={(e) => setTransferRemainingToCapital(e.target.checked)}
                  className="rounded bg-surface border-border text-warning focus:ring-0 mt-0.5"
                />
                <div>
                  <strong className="block text-warning">Автоматически реинвестировать невыплаченный остаток в капитал</strong>
                  <span className="text-[11px] text-fg-subtle block mt-0.5">
                    При установке этой галочки остаток к выплате партнеров будет зачислен в их оборотный капитал. Если не отмечено — остаток сохранится и перейдет на следующий период. Начисленная и выплаченная прибыль (lifetime-показатели на главной панели) не обнуляются в любом случае.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsQuarterModalOpen(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg-muted border border-border uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmCloseQuarter}
                className="flex-1 py-2.5 px-3 rounded-xl bg-warning hover:bg-warning/90 text-xs font-bold uppercase text-black shadow-xs transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmitting ? 'ЗАКРЫТИЕ…' : '📊 ЗАКРЫТЬ КВАРТАЛЬНЫЙ ПЕРИОД'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
