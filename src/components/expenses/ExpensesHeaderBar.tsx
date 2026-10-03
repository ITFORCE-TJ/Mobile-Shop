import React from 'react';
import {
  TrendingDown,
  RotateCcw,
  Plus,
  AlertCircle,
  Search,
  X,
  SlidersHorizontal,
  Store as StoreIcon,
  Tag,
  User,
  ArrowUpDown
} from 'lucide-react';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { DateRangePicker } from '../ui/DateRangePicker';
import { Select } from '../ui/Input';
import { ExpensesHeaderBarProps, getCategoryLabel } from './types';

export const ExpensesHeaderBar: React.FC<ExpensesHeaderBarProps> = ({
  totalExpensesTjs,
  totalExpensesUsd,
  filteredExpensesCount,
  totalExpensesCount,
  hasActiveFilters,
  onResetFilters,
  onOpenAddModal,
  unpaidTotalTjs,
  unpaidCount,
  totalUnpaidInScope,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  todayStr,
  thisMonthStr,
  periodFilter,
  setPeriodFilter,
  selectedMonth,
  setSelectedMonth,
  selectedStartDate,
  setSelectedStartDate,
  selectedEndDate,
  setSelectedEndDate,
  resetToCurrentMonth,
  filtersOpen,
  setFiltersOpen,
  activeFiltersCount,
  isAdmin,
  isStoreModeCentral,
  selectedStoreFilter,
  setSelectedStoreFilter,
  stores,
  canAddCategory,
  onOpenAddCategoryModal,
  selectedCategoryTab,
  setSelectedCategoryTab,
  allCategoryOptions,
  categoryCounts,
  selectedEmployeeFilter,
  setSelectedEmployeeFilter,
  activeEmployees,
  users,
  sortBy,
  setSortBy,
  customCategories,
}) => {
  return (
    <div className="border-b border-border bg-surface shrink-0 p-2 sm:p-2.5">
      <div className="max-w-6xl xl:max-w-7xl mx-auto w-full space-y-2">
        {/* Row 1: KPI Summary + Action Buttons */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-danger/10 text-danger flex items-center justify-center shrink-0">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
              <span className="text-sm sm:text-base font-black text-danger font-mono tracking-tight">
                -{formatMoney(totalExpensesTjs)} TJS
              </span>
              <span className="text-[11px] text-fg-subtle font-mono">
                ≈ -${formatMoney(totalExpensesUsd)}
              </span>
              <span className="text-[10px] text-fg-subtle px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/80">
                {filteredExpensesCount} из {totalExpensesCount}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="h-7.5 px-2 rounded-lg border border-border bg-surface-raised hover:bg-surface text-[11px] font-semibold text-fg-muted hover:text-fg transition-colors flex items-center gap-1 cursor-pointer"
                title="Сбросить все фильтры"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Сбросить</span>
              </button>
            )}
            <Button
              variant="danger"
              leftIcon={Plus}
              onClick={onOpenAddModal}
              className="!h-7.5 !px-2.5 text-xs font-bold shrink-0 shadow-xs"
            >
              <span className="sm:hidden">Расход</span>
              <span className="hidden sm:inline">Добавить расход</span>
            </Button>
          </div>
        </div>

        {/* Unpaid Warning Notice (if any) */}
        {unpaidTotalTjs > 0 && (
          <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-warning/10 border border-warning/25 text-warning text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'UNPAID' ? 'ALL' : 'UNPAID')}
              className="font-semibold hover:underline flex items-center gap-1.5 cursor-pointer text-left min-w-0 text-[11px]"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Не оплачено: <strong>{formatMoney(unpaidTotalTjs)} TJS</strong> ({unpaidCount} шт.)</span>
            </button>
            <span className="text-[10px] opacity-80 shrink-0 font-medium ml-2">
              {statusFilter === 'UNPAID' ? '✕ сбросить' : '→ показать'}
            </span>
          </div>
        )}

        {/* Row 2: Search + Quick Dates + Filter Toggle in one unified row */}
        <div className="flex items-center gap-1.5">
          {/* SearchBar Input */}
          <div className="relative flex-1 min-w-[120px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по расходам..."
              className="w-full h-8 rounded-lg bg-surface-raised border border-border pl-8 pr-7 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Date: Сегодня */}
          <button
            type="button"
            onClick={() => {
              setSelectedStartDate(todayStr);
              setSelectedEndDate(todayStr);
              setSelectedMonth('');
              setPeriodFilter('TODAY');
            }}
            className={cn(
              'h-8 px-2.5 rounded-lg border text-xs font-semibold shrink-0 transition-all select-none cursor-pointer',
              periodFilter === 'TODAY'
                ? 'border-accent/50 bg-accent/10 text-accent font-bold'
                : 'border-border/80 bg-surface-raised text-fg-muted hover:text-fg'
            )}
          >
            Сегодня
          </button>

          {/* Calendar Month Picker */}
          <DateRangePicker
            startDate={periodFilter === 'CUSTOM' ? selectedStartDate : ''}
            endDate={periodFilter === 'CUSTOM' ? selectedEndDate : ''}
            selectedMonth={periodFilter === 'MONTH' ? selectedMonth : undefined}
            currentMonthStr={thisMonthStr}
            isToday={periodFilter === 'TODAY'}
            isAllTime={periodFilter === 'ALL'}
            onSelectAllTime={() => {
              setSelectedMonth('');
              setPeriodFilter('ALL');
            }}
            isActive={periodFilter === 'MONTH' || periodFilter === 'CUSTOM' || periodFilter === 'ALL'}
            onChange={(start, end, monthStr) => {
              if (monthStr) {
                setSelectedMonth(monthStr);
                setSelectedStartDate(start);
                setSelectedEndDate(end);
                setPeriodFilter('MONTH');
              } else if (start === todayStr && end === todayStr) {
                setSelectedMonth('');
                setSelectedStartDate(start);
                setSelectedEndDate(end);
                setPeriodFilter('TODAY');
              } else {
                setSelectedMonth('');
                setSelectedStartDate(start);
                setSelectedEndDate(end);
                setPeriodFilter('CUSTOM');
              }
            }}
            onResetMonth={resetToCurrentMonth}
            className="shrink-0 [&_button]:!h-8 [&_button]:!px-2.5 [&_button]:!rounded-lg"
          />

          {/* Advanced Filter Toggle Button */}
          <button
            type="button"
            onClick={() => setFiltersOpen(v => !v)}
            className={`relative h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
              filtersOpen || hasActiveFilters
                ? 'border-accent bg-accent/10 text-accent shadow-2xs'
                : 'border-border/80 bg-surface-raised text-fg-muted hover:border-accent/40'
            }`}
            title="Дополнительные фильтры"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Фильтры</span>
            {hasActiveFilters && (
              <span className="w-4 h-4 rounded-full bg-accent text-accent-fg font-bold text-[9px] flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Row 3: Status pills + Active filter chips inline */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
          {/* Status pills */}
          <div className="flex items-center gap-0.5 bg-surface-raised p-0.5 rounded-lg border border-border/80 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2 py-0.8 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-surface text-fg shadow-xs border border-border/80'
                  : 'text-fg-subtle hover:text-fg'
              }`}
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('UNPAID')}
              className={`px-2 py-0.8 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                statusFilter === 'UNPAID'
                  ? 'bg-warning/20 text-warning border border-warning/40 shadow-xs'
                  : 'text-fg-subtle hover:text-warning'
              }`}
            >
              <span>Не оплачено</span>
              {totalUnpaidInScope > 0 && (
                <span className={`px-1 py-0.1 rounded-full text-[9px] font-bold ${
                  statusFilter === 'UNPAID' ? 'bg-warning text-black' : 'bg-warning/20 text-warning'
                }`}>
                  {totalUnpaidInScope}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PAID')}
              className={`px-2 py-0.8 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                statusFilter === 'PAID'
                  ? 'bg-accent/20 text-accent border border-accent/40 shadow-xs'
                  : 'text-fg-subtle hover:text-fg'
              }`}
            >
              Оплачено
            </button>
          </div>

          {/* Active filter chips inline */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1 shrink-0">
              {isAdmin && selectedStoreFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-raised border border-border text-fg-muted shrink-0">
                  <StoreIcon className="w-3 h-3 text-accent" />
                  <span>{formatStoreName(stores.find(s => s.id === selectedStoreFilter)?.name) || selectedStoreFilter}</span>
                  <button onClick={() => setSelectedStoreFilter('ALL')} className="hover:text-danger ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedCategoryTab !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-raised border border-border text-fg-muted shrink-0">
                  <Tag className="w-3 h-3 text-accent" />
                  <span>{getCategoryLabel(selectedCategoryTab, customCategories)}</span>
                  <button onClick={() => setSelectedCategoryTab('ALL')} className="hover:text-danger ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedEmployeeFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-raised border border-border text-fg-muted shrink-0">
                  <User className="w-3 h-3 text-accent" />
                  <span>
                    {selectedEmployeeFilter === 'ANY_EMPLOYEE'
                      ? 'Все сотрудники'
                      : users.find(u => u.id === selectedEmployeeFilter)?.name || selectedEmployeeFilter}
                  </span>
                  <button onClick={() => setSelectedEmployeeFilter('ALL')} className="hover:text-danger ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {sortBy !== 'DATE_DESC' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-raised border border-border text-fg-muted shrink-0">
                  <ArrowUpDown className="w-3 h-3 text-accent" />
                  <span>
                    {sortBy === 'DATE_ASC'
                      ? 'Старые'
                      : sortBy === 'AMOUNT_DESC'
                      ? 'Макс. сумма'
                      : 'Мин. сумма'}
                  </span>
                  <button onClick={() => setSortBy('DATE_DESC')} className="hover:text-danger ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={onResetFilters}
                className="text-[11px] text-accent hover:underline font-bold px-1 shrink-0 cursor-pointer"
              >
                Сбросить
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Advanced Filters Panel */}
        {filtersOpen && (
          <div className="pt-2.5 border-t border-border mt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {/* Store Filter */}
              {isAdmin && isStoreModeCentral && (
                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] font-bold">Филиал / Точка:</label>
                  <Select
                    value={selectedStoreFilter}
                    onChange={(e) => setSelectedStoreFilter(e.target.value)}
                    className="w-full !h-8 px-2.5 text-xs font-semibold"
                  >
                    <option value="ALL">Все филиалы и склады</option>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.isMainWarehouse ? `Центральный склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Category Filter */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-fg-subtle text-[11px] font-bold">Категория:</label>
                  {canAddCategory && (
                    <button
                      type="button"
                      onClick={onOpenAddCategoryModal}
                      className="text-[10px] text-accent hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Новая</span>
                    </button>
                  )}
                </div>
                <Select
                  value={selectedCategoryTab}
                  onChange={(e) => setSelectedCategoryTab(e.target.value)}
                  className="w-full !h-8 px-2.5 text-xs font-semibold"
                >
                  <option value="ALL">Все категории ({totalExpensesCount})</option>
                  {allCategoryOptions.map(c => {
                    const cnt = categoryCounts[c.id] || 0;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.label} {cnt > 0 ? `(${cnt})` : ''}
                      </option>
                    );
                  })}
                </Select>
              </div>

              {/* Employee Filter */}
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] font-bold">Сотрудник / Назначение:</label>
                <Select
                  value={selectedEmployeeFilter}
                  onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                  className="w-full !h-8 px-2.5 text-xs font-semibold"
                >
                  <option value="ALL">Все расходы</option>
                  <option value="ANY_EMPLOYEE">Только сотрудники (авансы/ЗП)</option>
                  {activeEmployees.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.role === 'ADMIN' ? ' (Админ)' : ''}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Sorting */}
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] font-bold">Сортировка:</label>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="w-full !h-8 px-2.5 text-xs font-semibold"
                >
                  <option value="DATE_DESC">Сначала новые (по дате)</option>
                  <option value="DATE_ASC">Сначала старые (по дате)</option>
                  <option value="AMOUNT_DESC">Сумма: по убыванию (макс)</option>
                  <option value="AMOUNT_ASC">Сумма: по возрастанию (мин)</option>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/60">
              <span className="text-[11px] text-fg-subtle">
                Найдено <strong className="text-fg">{filteredExpensesCount}</strong> из {totalExpensesCount} расходов
              </span>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="text-xs text-danger hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Сбросить</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="px-2.5 py-0.5 rounded-lg bg-surface-raised border border-border text-xs font-semibold text-fg-muted hover:text-fg cursor-pointer"
                >
                  Свернуть
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
