import React, { useState, useMemo, useEffect } from 'react';
import {
  CreditCard,
  Search,
  X,
  Users,
  Building2,
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Warehouse,
  Store,
} from 'lucide-react';
import { CustomSelect, CustomSelectOption } from '../ui/CustomSelect';
import { MonthPicker } from '../ui/MonthPicker';
import { formatStoreName } from '../../utils/storeContext';
import { getBusinessDateKey } from '../../utils/businessDate';
import { OwnerTransaction, Owner, Store as StoreType } from '../../types';

interface OwnerTransactionsTableProps {
  ownerTransactions: OwnerTransaction[];
  stores: StoreType[];
  mainWarehouse?: StoreType;
  retailStores: StoreType[];
  displayOwners: Owner[];
  getOwnerDetails: (owner: Owner) => { name: string; roleTag: string; roleSub: string };
  rate: number;
  isCentralMode: boolean;
  defaultStoreId?: string | null;
}

const TRANSACTIONS_PAGE_SIZE = 12;

export const OwnerTransactionsTable: React.FC<OwnerTransactionsTableProps> = ({
  ownerTransactions,
  stores,
  mainWarehouse,
  retailStores,
  displayOwners,
  getOwnerDetails,
  rate,
  isCentralMode,
  defaultStoreId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PROFIT_PAYOUT' | 'INVESTMENT' | 'WITHDRAWAL' | 'REINVEST'>('ALL');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('ALL');
  const [storeFilterChoice, setSelectedStoreFilter] = useState<string>('ALL');
  const selectedStoreFilter = isCentralMode ? storeFilterChoice : (defaultStoreId || 'ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'SPECIFIC_MONTH'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const [transactionsPage, setTransactionsPage] = useState(1);

  const ownerFilterOptions = useMemo<CustomSelectOption[]>(() => [
    { value: 'ALL', label: 'Все учредители', icon: <Users className="w-3.5 h-3.5" /> },
    ...displayOwners.map((o) => {
      const details = getOwnerDetails(o);
      return {
        value: o.id,
        label: details.name,
        sublabel: details.roleTag,
        icon: <Users className="w-3.5 h-3.5" />,
      };
    }),
  ], [displayOwners, getOwnerDetails]);

  const storeFilterOptions = useMemo<CustomSelectOption[]>(() => [
    { value: 'ALL', label: 'Все объекты', icon: <Building2 className="w-3.5 h-3.5" /> },
    ...retailStores.map((s) => ({
      value: s.id,
      label: formatStoreName(s.name),
      icon: <Store className="w-3.5 h-3.5" />,
    })),
    ...(mainWarehouse ? [{
      value: mainWarehouse.id,
      label: `Центральный склад (${mainWarehouse.name})`,
      icon: <Warehouse className="w-3.5 h-3.5 text-warning" />,
    }] : []),
  ], [retailStores, mainWarehouse]);

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

  return (
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
            <CustomSelect
              value={selectedOwnerFilter}
              onChange={setSelectedOwnerFilter}
              options={ownerFilterOptions}
              title="Учредители"
              icon={<Users className="w-3.5 h-3.5" />}
              className="flex-1 sm:flex-initial"
              triggerClassName="w-full sm:w-auto"
            />

            {/* Store Dropdown (Central Cash only) */}
            {isCentralMode && (
              <CustomSelect
                value={selectedStoreFilter}
                onChange={setSelectedStoreFilter}
                options={storeFilterOptions}
                title="Объекты"
                icon={<Building2 className="w-3.5 h-3.5" />}
                className="flex-1 sm:flex-initial"
                triggerClassName="w-full sm:w-auto"
              />
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
  );
};
