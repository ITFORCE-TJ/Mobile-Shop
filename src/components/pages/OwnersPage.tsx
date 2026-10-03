import React, { useState, useMemo } from 'react';
import { decimal, formatMoney, moneyNumber } from '../../utils/money';
import { formatUserName } from '../../utils/formatUser';
import { capitalByLocation } from '../../utils/ownerCapital';
import { useAppFields } from '../../context/AppContext';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import {
  Plus,
  PieChart,
  Percent,
  Briefcase,
  Users,
  Coins,
  Package,
  Banknote,
  Wallet,
  Loader2,
  Store,
  Warehouse,
  FileText
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useStoreContext } from '../../utils/storeContext';
import { OwnerTransactionModal } from '../owners/OwnerTransactionModal';
import { StoreSharesModal } from '../owners/StoreSharesModal';
import { QuarterReportModal } from '../owners/QuarterReportModal';
import { OwnerCard } from '../owners/OwnerCard';
import { OwnerTransactionsTable } from '../owners/OwnerTransactionsTable';

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
  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal open states
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txModalOwnerId, setTxModalOwnerId] = useState<string | undefined>(undefined);
  const [txModalType, setTxModalType] = useState<'INVESTMENT' | 'WITHDRAWAL'>('INVESTMENT');

  const [isSharesModalOpen, setIsSharesModalOpen] = useState(false);
  const [selectedSharesStoreId, setSelectedSharesStoreId] = useState<string>('');

  const [isQuarterModalOpen, setIsQuarterModalOpen] = useState(false);

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;
  const storeCtx = useStoreContext();

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

  const mainWarehouse = useMemo(() => stores.find(s => s.isMainWarehouse), [stores]);
  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);

  const adminOwner = useMemo(() => {
    return owners.find(o => !o.storeId || users.find(u => u.id === o.userId)?.role === 'ADMIN') || owners[0];
  }, [owners, users]);

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
        totalUsd: stockCost + cash
      };
    });
  }, [stores, inStockDevices]);

  const openSharesModal = (ownerId?: string) => {
    if (ownerId) {
      const partnerStore = stores.find(s => {
        const pair = sharePairOf(s.id);
        return (pair && pair.ownerId === ownerId) || (owners.find(o => o.id === ownerId)?.storeId === s.id);
      });
      if (partnerStore) {
        setSelectedSharesStoreId(partnerStore.id);
      }
    }
    setIsSharesModalOpen(true);
  };

  const openTxModalForOwner = (ownerId: string, type: 'INVESTMENT' | 'WITHDRAWAL') => {
    setTxModalOwnerId(ownerId);
    setTxModalType(type);
    setIsTxModalOpen(true);
  };

  const handleCreateTx = async (data: {
    ownerId: string;
    type: 'INVESTMENT' | 'WITHDRAWAL';
    amountUsd: number;
    storeId: string;
    note?: string;
  }) => {
    if (isSubmitting) return;
    setStatusBanner(null);

    const targetStore = stores.find(s => s.id === data.storeId);
    if (!targetStore) {
      setStatusBanner({ tone: 'error', text: 'Выберите кассу: магазин или центральный склад' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createOwnerTransaction({
        ownerId: data.ownerId,
        type: data.type,
        amountUsd: data.amountUsd,
        storeId: targetStore.id,
        destination: targetStore.name,
        source: targetStore.name,
        note: data.note,
      });

      if (res.success) {
        setIsTxModalOpen(false);
        const typeText = data.type === 'INVESTMENT' ? 'Внесение капитала' : 'Изъятие капитала';
        setStatusBanner({
          tone: 'success',
          text: `Операция «${typeText}» на сумму $${data.amountUsd.toLocaleString()} успешно проведена`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка транзакции' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveShares = async (storeId: string, partnerOwnerId: string, partnerSharePercent: number) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const targetStore = stores.find(s => s.id === storeId);
      const partnerOwner = owners.find(o => o.id === partnerOwnerId);
      const adminNum = Math.round((100 - partnerSharePercent) * 100) / 100;
      const res = await setStoreProfitShares(storeId, [{ ownerId: partnerOwnerId, sharePercent: partnerSharePercent }]);
      if (res.success) {
        setIsSharesModalOpen(false);
        setStatusBanner({
          tone: 'success',
          text: `Доли магазина «${targetStore?.name || ''}» сохранены: ${formatUserName(adminOwner?.name)} ${adminNum}%, ${formatUserName(partnerOwner?.name)} ${partnerSharePercent}%. Действуют для прибыли с этого момента.`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка сохранения долей' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCloseQuarter = async (data: { quarterName: string; transferRemainingToCapital: boolean }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await closeQuarterPeriod({
        quarterName: data.quarterName,
        transferRemainingToCapital: data.transferRemainingToCapital
      });

      if (res.success) {
        setIsQuarterModalOpen(false);
        setStatusBanner({
          tone: 'success',
          text: `Финансовый период «${data.quarterName}» успешно закрыт`
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
              <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide truncate">
                Капитал и Учредители
              </h1>
              <p className="text-[10px] text-fg-subtle truncate">
                Учёт капитала, долей и истории финансовых операций
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {owners.length === 0 && currentUser?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={handleInitializeOwners}
                disabled={isInitializing}
                className="px-2.5 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs shadow-xs disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isInitializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
                <span>Инициализировать (50% / 50%)</span>
              </button>
            )}

            {currentUser?.role === 'ADMIN' && (
              <>
                <button
                  type="button"
                  onClick={() => openSharesModal()}
                  className="px-2.5 py-1.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Настройка долей партнеров по магазинам"
                >
                  <Percent className="w-3.5 h-3.5 text-accent" />
                  <span className="hidden sm:inline">Доли партнеров</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsQuarterModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-500 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Сводная ведомость и закрытие квартального периода"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Закрыть квартал</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTxModalOwnerId(displayOwners[0]?.id);
                    setTxModalType('INVESTMENT');
                    setIsTxModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Операция</span>
                </button>
              </>
            )}
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

          {/* Section: Partner Cards */}
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
                const ownerStoreId = owner.storeId;
                const ownerStore = ownerStoreId ? stores.find(s => s.id === ownerStoreId) : null;
                const partnerStoreAssets = ownerStoreId ? storeAssetsBreakdown.find(s => s.id === ownerStoreId) : null;
                const activeStores = stores.filter(s => (storeInvestmentsByOwner[owner.id]?.[s.id] || 0) > 0);

                return (
                  <OwnerCard
                    key={owner.id}
                    owner={owner}
                    info={info}
                    share={share}
                    ownerStore={ownerStore}
                    ownerShareLabel={ownerShareLabel(owner.id)}
                    rate={rate}
                    partnerStoreAssets={partnerStoreAssets}
                    activeStores={activeStores}
                    storeInvestments={storeInvestmentsByOwner[owner.id] || {}}
                    onOpenSharesModal={() => openSharesModal(owner.id)}
                    onOpenTxModal={(type) => openTxModalForOwner(owner.id, type)}
                  />
                );
              })}
            </div>
          </div>

          {/* Section: Transaction History */}
          <OwnerTransactionsTable
            ownerTransactions={ownerTransactions}
            stores={stores}
            mainWarehouse={mainWarehouse}
            retailStores={retailStores}
            displayOwners={displayOwners}
            getOwnerDetails={getOwnerDetails}
            rate={rate}
            isCentralMode={storeCtx.mode === 'CENTRAL'}
            defaultStoreId={storeCtx.storeId}
          />
        </div>
      </div>

      {/* MODAL: Edit Shares */}
      <StoreSharesModal
        open={isSharesModalOpen}
        onClose={() => setIsSharesModalOpen(false)}
        onSave={handleSaveShares}
        retailStores={retailStores}
        stores={stores}
        adminOwner={adminOwner}
        partnerForStore={partnerForStore}
        storeProfitShares={storeProfitShares}
        initialStoreId={selectedSharesStoreId}
        isSubmitting={isSubmitting}
      />

      {/* MODAL: Transaction */}
      <OwnerTransactionModal
        open={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        onSubmit={handleCreateTx}
        displayOwners={displayOwners}
        getOwnerDetails={getOwnerDetails}
        stores={stores}
        mainWarehouse={mainWarehouse}
        retailStores={retailStores}
        rate={rate}
        initialOwnerId={txModalOwnerId}
        initialTxType={txModalType}
        isSubmitting={isSubmitting}
      />

      {/* MODAL: Quarterly Report */}
      <QuarterReportModal
        open={isQuarterModalOpen}
        onClose={() => setIsQuarterModalOpen(false)}
        onConfirmClose={handleConfirmCloseQuarter}
        displayOwners={displayOwners}
        getOwnerDetails={getOwnerDetails}
        ownerShareLabel={ownerShareLabel}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
