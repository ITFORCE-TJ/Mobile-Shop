import React from 'react';
import {
  ArrowLeft,
  Wrench,
  Search,
  X,
  Scan,
  Plus
} from 'lucide-react';
import { MonthPicker } from '../ui/MonthPicker';
import { formatMoney } from '../../utils/money';
import { cn } from '../../utils/cn';
import { RepairTopBarProps } from './types';
import { RepairStatus } from '../../types';

export const RepairTopBar: React.FC<RepairTopBarProps> = ({
  activeTab,
  onNavigateToList,
  onNavigateToCreate,
  searchQuery,
  setSearchQuery,
  onScanListSearch,
  isStoreScoped,
  isStoreModeCentral,
  selectedStoreId,
  setSelectedStoreId,
  retailStores,
  selectedMonth,
  setSelectedMonth,
  currentMonthKey,
  statusFilter,
  setStatusFilter,
  onResetFilters,
  statusCounts,
  totalRepairsCount,
  readyRepairsCount,
  totalExpensesTjs,
}) => {
  return (
    <div className="p-2 sm:p-2.5 border-b border-border bg-surface shrink-0 space-y-2">
      <div className="flex items-center gap-1.5 sm:gap-2">
        {activeTab === 'create' ? (
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={onNavigateToList}
              className="h-8.5 px-3 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>К журналу ремонтов</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Wrench className="w-3.5 h-3.5 text-accent" />
              <span>Прием в ремонт</span>
            </div>
          </div>
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
                  onClick={onScanListSearch}
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
              onClick={onNavigateToCreate}
              className="shrink-0 h-9 px-3 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-accent-fg font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs whitespace-nowrap cursor-pointer"
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
            {!isStoreScoped && isStoreModeCentral && (
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="h-8 bg-surface-raised border border-border text-fg text-xs font-semibold rounded-lg px-2.5 py-0.5 focus:outline-none focus:border-accent cursor-pointer"
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
              isActive={selectedMonth !== currentMonthKey}
              className="!h-8 !px-2.5 !rounded-lg text-xs"
            />

            {(searchQuery || (selectedStoreId !== 'ALL' && !isStoreScoped && isStoreModeCentral) || selectedMonth !== currentMonthKey || statusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={onResetFilters}
                className="h-8 px-2 text-fg-subtle hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="Сбросить все фильтры"
              >
                <X className="w-3 h-3" />
                <span className="text-[11px]">Сброс</span>
              </button>
            )}
          </div>

          {/* Quick Metrics Strip */}
          <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle shrink-0">
            <span className="px-2 py-0.5 rounded-lg bg-surface-raised border border-border/80 text-fg-muted font-medium">{totalRepairsCount} рем.</span>
            <span className="px-2 py-0.5 rounded-lg bg-accent/10 border border-accent/20 text-accent font-semibold">{readyRepairsCount} готово</span>
            <span className="px-2 py-0.5 rounded-lg bg-surface-raised border border-border/80 font-bold text-fg">{formatMoney(totalExpensesTjs)} TJS</span>
          </div>
        </div>
      )}

      {/* Row 3 (if list): Status Filter Segmented Tabs */}
      {activeTab === 'list' && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          {[
            { id: 'ALL', label: 'Все', count: statusCounts.ALL },
            { id: 'ACCEPTED', label: 'Приняты', count: statusCounts.ACCEPTED },
            { id: 'IN_PROGRESS', label: 'В работе', count: statusCounts.IN_PROGRESS },
            { id: 'READY', label: 'Готовы', count: statusCounts.READY },
            { id: 'ISSUED', label: 'Выданы', count: statusCounts.ISSUED },
          ].map((tab) => {
            const isSelected = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as 'ALL' | RepairStatus)}
                className={cn(
                  'h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer',
                  isSelected
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'bg-surface-raised border border-border/80 text-fg-muted hover:text-fg hover:bg-surface'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                    isSelected
                      ? 'bg-black/20 text-accent-fg'
                      : tab.count > 0
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'bg-surface text-fg-subtle border border-border/60'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
