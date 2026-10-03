import React from 'react';
import { Store as StoreType } from '../../types';
import { formatUsd } from '../../utils/money';
import {
  Sparkles,
  Layers,
  List,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Filter,
  RotateCcw,
  X,
} from 'lucide-react';
import { SearchBar } from '../ui/SearchBar';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { InventoryViewMode } from './types';

interface InventoryFiltersBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onScan: () => void;
  onSubmitSearch: (val: string) => void;
  inventoryViewMode: InventoryViewMode;
  onViewModeChange: (mode: InventoryViewMode) => void;
  showAdvancedFilters: boolean;
  onToggleAdvancedFilters: () => void;
  activeFiltersCount: number;
  isMobileLayout: boolean;
  selectedBrand: string;
  onSelectBrand: (brand: string) => void;
  brands: { value: string; label: string }[];
  brandCountsMap: Map<string, number>;
  devicesInActiveLocationCount: number;
  selectedStatusFilter: 'ALL' | 'MAIN_WAREHOUSE' | 'STORE_STOCK' | 'BONUS_ONLY' | 'EXCHANGE_ONLY';
  onSelectStatusFilter: (status: 'ALL' | 'MAIN_WAREHOUSE' | 'STORE_STOCK' | 'BONUS_ONLY' | 'EXCHANGE_ONLY') => void;
  activeStore: StoreType | null;
  selectedLocationId: string;
  selectedRam: string;
  onSelectRam: (ram: string) => void;
  availableRams: string[];
  selectedStorage: string;
  onSelectStorage: (storage: string) => void;
  availableStorages: string[];
  minPriceUsd: string;
  maxPriceUsd: string;
  onMinPriceChange: (p: string) => void;
  onMaxPriceChange: (p: string) => void;
  sortBy: 'COUNT_DESC' | 'COUNT_ASC' | 'NAME_ASC' | 'NAME_DESC' | 'PRICE_DESC' | 'PRICE_ASC';
  onSortByChange: (sort: 'COUNT_DESC' | 'COUNT_ASC' | 'NAME_ASC' | 'NAME_DESC' | 'PRICE_DESC' | 'PRICE_ASC') => void;
  isAdmin: boolean;
  filteredDevicesCount: number;
  brandGroupsCount: number;
  filteredStockValueUsd: number;
  onResetAllFilters: () => void;
}

export const InventoryFiltersBar: React.FC<InventoryFiltersBarProps> = ({
  searchQuery,
  onSearchChange,
  onScan,
  onSubmitSearch,
  inventoryViewMode,
  onViewModeChange,
  showAdvancedFilters,
  onToggleAdvancedFilters,
  activeFiltersCount,
  isMobileLayout,
  selectedBrand,
  onSelectBrand,
  brands,
  brandCountsMap,
  devicesInActiveLocationCount,
  selectedStatusFilter,
  onSelectStatusFilter,
  activeStore,
  selectedLocationId,
  selectedRam,
  onSelectRam,
  availableRams,
  selectedStorage,
  onSelectStorage,
  availableStorages,
  minPriceUsd,
  maxPriceUsd,
  onMinPriceChange,
  onMaxPriceChange,
  sortBy,
  onSortByChange,
  isAdmin,
  filteredDevicesCount,
  brandGroupsCount,
  filteredStockValueUsd,
  onResetAllFilters,
}) => {
  const filterFields = (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 text-xs">
        {/* Filter 1: Brand */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Бренд
          </label>
          <select
            value={selectedBrand}
            onChange={(e) => onSelectBrand(e.target.value)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1.5 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            {brands.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>

        {/* Filter 2: Status / Type */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Наличие
          </label>
          <select
            value={selectedStatusFilter}
            onChange={(e) => onSelectStatusFilter(e.target.value as any)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1.5 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            <option value="ALL">Все {activeStore ? `(«${activeStore.name}»)` : 'в наличии'}</option>
            {selectedLocationId === 'ALL' && (
              <>
                <option value="MAIN_WAREHOUSE">Центральный склад</option>
                <option value="STORE_STOCK">В магазинах</option>
              </>
            )}
            <option value="BONUS_ONLY">Бонусы поставщиков</option>
            <option value="EXCHANGE_ONLY">После обмена</option>
          </select>
        </div>

        {/* Filter 3: RAM */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Оперативная память
          </label>
          <select
            value={selectedRam}
            onChange={(e) => onSelectRam(e.target.value)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1.5 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            <option value="ALL">Любая память</option>
            {availableRams.map(ram => (
              <option key={ram} value={ram}>{ram} GB</option>
            ))}
          </select>
        </div>

        {/* Filter 4: Storage */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Встроенная память
          </label>
          <select
            value={selectedStorage}
            onChange={(e) => onSelectStorage(e.target.value)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1.5 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            <option value="ALL">Любой объем</option>
            {availableStorages.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* Filter 5: Sorting */}
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Сортировка
          </label>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as any)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            <option value="COUNT_DESC">По количеству: больше → меньше</option>
            <option value="COUNT_ASC">По количеству: меньше → больше</option>
            <option value="NAME_ASC">По названию бренда: А → Я</option>
            <option value="NAME_DESC">По названию бренда: Я → А</option>
            {isAdmin && (
              <>
                <option value="PRICE_DESC">По цене: дорогие → дешевые</option>
                <option value="PRICE_ASC">По цене: дешевые → дорогие</option>
              </>
            )}
          </select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-2 sm:space-y-2.5">
      {/* Search Bar + Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex-1 min-w-0">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            onScan={onScan}
            onSubmit={onSubmitSearch}
            placeholder="Поиск по IMEI, штрихкоду, модели, бренду, цвету..."
          />
        </div>

        {/* Desktop view mode switcher + filter button */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => onViewModeChange('BY_BRAND')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                inventoryViewMode === 'BY_BRAND'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg-muted'
              }`}
              title="Группировать по брендам"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>По брендам</span>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange('BY_MODEL')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                inventoryViewMode === 'BY_MODEL'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg-muted'
              }`}
              title="Группировать по моделям"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>По моделям</span>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange('FLAT_LIST')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                inventoryViewMode === 'FLAT_LIST'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg-muted'
              }`}
              title="Полный список товаров"
            >
              <List className="w-3.5 h-3.5" />
              <span>Список</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleAdvancedFilters}
            aria-expanded={showAdvancedFilters}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              showAdvancedFilters || activeFiltersCount > 0
                ? 'bg-accent/15 border-accent text-accent shadow-xs'
                : 'bg-surface-raised border-border text-fg-muted hover:border-fg-subtle'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Фильтры</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-accent text-accent-fg text-[9px] font-black flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
            {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Mobile Subrow: View Mode Switcher on Left + Filter Button on Right */}
        <div className="flex sm:hidden items-center gap-1.5">
          <div className="flex-1 grid grid-cols-3 p-0.5 rounded-xl bg-surface-raised border border-border">
            <button
              type="button"
              onClick={() => onViewModeChange('BY_BRAND')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                inventoryViewMode === 'BY_BRAND'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg-muted'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Бренды</span>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange('BY_MODEL')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                inventoryViewMode === 'BY_MODEL'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg-muted'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Модели</span>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange('FLAT_LIST')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                inventoryViewMode === 'FLAT_LIST'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-fg-subtle hover:text-fg-muted'
              }`}
            >
              <List className="w-3 h-3" />
              <span>Список</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleAdvancedFilters}
            aria-expanded={showAdvancedFilters}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
              showAdvancedFilters || activeFiltersCount > 0
                ? 'bg-accent/15 border-accent text-accent shadow-xs'
                : 'bg-surface-raised border-border text-fg-muted hover:border-fg-subtle'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Фильтры</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-accent text-accent-fg text-[9px] font-black flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
            {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Quick Horizontal Brand Chips */}
      {brandCountsMap.size > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          <button
            type="button"
            onClick={() => onSelectBrand('ALL')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
              selectedBrand === 'ALL'
                ? 'bg-accent text-accent-fg border-accent shadow-xs'
                : 'bg-surface-raised hover:bg-surface border-border text-fg-muted'
            }`}
          >
            Все бренды ({devicesInActiveLocationCount})
          </button>

          {Array.from(brandCountsMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([bName, count]) => {
              const isSelected = selectedBrand === bName;
              return (
                <button
                  key={bName}
                  type="button"
                  onClick={() => onSelectBrand(isSelected ? 'ALL' : bName)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-accent text-accent-fg border-accent shadow-xs font-bold'
                      : 'bg-surface-raised hover:bg-surface border-border text-fg-muted'
                  }`}
                >
                  <span>{bName}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface text-fg-subtle'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
        </div>
      )}

      {/* Advanced Filters Panel (Desktop Inline) */}
      {showAdvancedFilters && !isMobileLayout && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface-raised border border-border space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold text-fg-muted">Фильтры</span>
            </div>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={onResetAllFilters}
                className="text-[11px] text-accent hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Сбросить всё ({activeFiltersCount})</span>
              </button>
            )}
          </div>

          {filterFields}
        </div>
      )}

      {/* Active Filters Badges & Summary Line */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="text-[11px] text-fg-subtle font-medium">
              Найдено: <strong className="text-accent font-bold">{filteredDevicesCount}</strong> шт.
              {filteredDevicesCount > 0 && (
                <span className="opacity-80">
                  {' '}· {brandGroupsCount} {brandGroupsCount === 1 ? 'бренд' : 'брендов'}
                </span>
              )}
              {isAdmin && filteredDevicesCount > 0 && (
                <span className="opacity-80"> · {formatUsd(filteredStockValueUsd)}</span>
              )}
            </span>

            {/* Active filter badges */}
            {selectedBrand !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                <span>Бренд: {selectedBrand}</span>
                <button
                  type="button"
                  onClick={() => onSelectBrand('ALL')}
                  className="hover:opacity-70 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedRam !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                <span>RAM: {selectedRam} GB</span>
                <button
                  type="button"
                  onClick={() => onSelectRam('ALL')}
                  className="hover:opacity-70 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedStorage !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                <span>Память: {selectedStorage}</span>
                <button
                  type="button"
                  onClick={() => onSelectStorage('ALL')}
                  className="hover:opacity-70 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedStatusFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                <span>
                  {selectedStatusFilter === 'MAIN_WAREHOUSE'
                    ? 'Центральный склад'
                    : selectedStatusFilter === 'STORE_STOCK'
                    ? 'В магазинах'
                    : selectedStatusFilter === 'BONUS_ONLY'
                    ? 'Бонусы'
                    : 'После обмена'}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectStatusFilter('ALL')}
                  className="hover:opacity-70 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {(minPriceUsd || maxPriceUsd) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                <span>
                  Цена: ${minPriceUsd || '0'} – ${maxPriceUsd || '∞'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onMinPriceChange('');
                    onMaxPriceChange('');
                  }}
                  className="hover:opacity-70 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-raised border border-border text-fg-muted">
                <span>Поиск: «{searchQuery}»</span>
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="hover:opacity-70 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={onResetAllFilters}
                className="text-[10px] font-bold text-accent hover:underline ml-1 cursor-pointer"
              >
                Сбросить все
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile Dialog for Filters */}
      <Dialog
        open={isMobileLayout && showAdvancedFilters}
        onClose={onToggleAdvancedFilters}
        title="Фильтры"
        subtitle={`Найдено: ${filteredDevicesCount} шт.`}
        footer={
          <div className="w-full grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              fullWidth
              disabled={activeFiltersCount === 0}
              onClick={onResetAllFilters}
            >
              Сбросить{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
            </Button>
            <Button fullWidth onClick={onToggleAdvancedFilters}>
              Показать {filteredDevicesCount} шт.
            </Button>
          </div>
        }
      >
        {filterFields}
      </Dialog>
    </div>
  );
};
