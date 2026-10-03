import React from 'react';
import { SupplierInvoice, Supplier, Store, User } from '../../types';
import { formatInvoiceDate } from './types';
import { MonthPicker } from '../ui/MonthPicker';
import {
  Search,
  Scan,
  X,
  Plus,
  Package,
  FileText,
  ChevronRight,
  Truck,
  Store as StoreIcon,
  Edit2,
  Trash2,
} from 'lucide-react';

interface PurchaseHistoryListProps {
  filteredInvoices: SupplierInvoice[];
  suppliers: Supplier[];
  stores: Store[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedMonth: string;
  onMonthChange: (m: string) => void;
  selectedSupplierFilter: string;
  onSupplierFilterChange: (s: string) => void;
  onResetFilters: () => void;
  onScanFinder: () => void;
  onNewPurchaseClick: () => void;
  onSelectInvoice: (id: string) => void;
  onEditInvoice: (inv: SupplierInvoice) => void;
  onDeleteInvoice: (id: string) => void;
  currentUser: User | null;
  justSavedInvoice: string | null;
}

export const PurchaseHistoryList: React.FC<PurchaseHistoryListProps> = ({
  filteredInvoices,
  suppliers,
  stores,
  searchQuery,
  onSearchChange,
  selectedMonth,
  onMonthChange,
  selectedSupplierFilter,
  onSupplierFilterChange,
  onResetFilters,
  onScanFinder,
  onNewPurchaseClick,
  onSelectInvoice,
  onEditInvoice,
  onDeleteInvoice,
  currentUser,
  justSavedInvoice,
}) => {
  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      {/* Search & Filters Bar */}
      <div className="p-2.5 sm:p-3 border-b border-border bg-surface space-y-2 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Compact Search Bar with Scanner inside right corner */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск: № накладной / IMEI..."
              className="w-full rounded-xl bg-surface-raised border border-border pl-8 pr-8 py-1.5 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                title="Очистить"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onScanFinder}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-accent hover:text-accent-strong p-0.5 transition-colors cursor-pointer"
                title="Сканировать IMEI или номер накладной"
              >
                <Scan className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* New Purchase button right next to search */}
          <button
            type="button"
            onClick={onNewPurchaseClick}
            className="shrink-0 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-accent-fg font-semibold text-xs flex items-center gap-1 transition-all shadow-xs whitespace-nowrap min-h-[32px] sm:min-h-[34px] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span><span className="hidden sm:inline">Новый </span>приход</span>
          </button>
        </div>

        {/* Period selector & Supplier Filter */}
        <div className="flex items-center justify-between gap-1.5 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <MonthPicker
              value={selectedMonth}
              onChange={onMonthChange}
              className="h-7 px-2.5 rounded-xl border border-accent text-accent text-xs font-semibold bg-surface focus:outline-none cursor-pointer"
            />

            <select
              value={selectedSupplierFilter}
              onChange={(e) => onSupplierFilterChange(e.target.value)}
              className="h-7 bg-surface border border-border text-fg text-xs font-semibold rounded-xl px-2.5 py-0.5 focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="all">Все поставщики</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {(searchQuery || selectedSupplierFilter !== 'all') && (
              <button
                type="button"
                onClick={onResetFilters}
                className="p-1 text-fg-subtle hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer"
                title="Сбросить фильтры"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Metrics Strip */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] text-fg-subtle font-mono">
            <span>{filteredInvoices.length} накл.</span>
            <span>·</span>
            <span className="text-accent font-bold">
              {filteredInvoices.reduce((sum, inv) => sum + (inv.devicesCount || 0), 0)} шт
            </span>
            <span>·</span>
            <span className="font-bold text-fg">
              ${filteredInvoices.reduce((sum, inv) => sum + (inv.totalAmountUsd || 0), 0).toLocaleString()}
            </span>
            {filteredInvoices.reduce((sum, inv) => sum + (inv.remainingAmountUsd || 0), 0) > 0 && (
              <>
                <span>·</span>
                <span className="text-danger font-semibold whitespace-nowrap">
                  Долг: ${filteredInvoices.reduce((sum, inv) => sum + (inv.remainingAmountUsd || 0), 0).toLocaleString()}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Invoices List / Table */}
      <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
        {filteredInvoices.length === 0 ? (
          <div className="p-10 text-center text-fg-subtle">
            <Package className="w-9 h-9 mx-auto mb-2 opacity-40 text-fg-subtle" />
            <p className="text-xs font-medium text-fg">Приходы не найдены</p>
            <p className="text-[11px] mt-1 text-fg-subtle">
              Нажмите «Новый приход», чтобы зарегистрировать партию товара
            </p>
          </div>
        ) : (
          filteredInvoices.map((inv) => {
            const isPaid = inv.status === 'PAID';
            const isPartial = inv.status === 'PARTIALLY_PAID';
            const isJustSaved = justSavedInvoice === inv.invoiceNumber;
            const locationLabel = inv.isStorePurchase && inv.storeId
              ? (stores.find(s => s.id === inv.storeId)?.name || 'Магазин')
              : 'Главный склад';

            return (
              <div
                key={inv.id}
                onClick={() => onSelectInvoice(inv.id)}
                className={`p-2.5 sm:p-3 hover:bg-surface-raised/80 cursor-pointer transition-colors flex flex-col gap-1.5 ${
                  isJustSaved ? 'bg-accent/15 border-l-4 border-l-accent' : ''
                }`}
              >
                {/* Row 1: Document + Status + Amount + Chevron */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                      isPaid ? 'bg-accent/10 border-accent/25 text-accent' :
                      isPartial ? 'bg-warning/10 border-warning/25 text-warning' :
                      'bg-danger/10 border-danger/25 text-danger'
                    }`}>
                      <FileText className="w-3.5 h-3.5" />
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold font-mono text-fg truncate">
                        {inv.invoiceNumber}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold border ${
                        isPaid ? 'bg-accent/15 text-accent border-accent/30' :
                        isPartial ? 'bg-warning/15 text-warning border-warning/30' :
                        'bg-danger/15 text-danger border-danger/30'
                      }`}>
                        {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                      </span>
                      {(inv.totalAmountUsd === 0 || inv.invoiceNumber.includes('BONUS')) && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md font-medium bg-highlight/20 text-highlight border border-highlight/40">
                          🎁 Подарок ($0)
                        </span>
                      )}
                      {isJustSaved && (
                        <span className="text-[9px] bg-accent text-accent-fg px-1.5 py-0.2 rounded font-bold">
                          Новое
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount & Debt & Chevron */}
                  <div className="text-right shrink-0 flex items-center gap-1.5">
                    <div className="flex flex-col items-end">
                      <span className="text-xs sm:text-sm font-bold font-mono text-fg leading-tight">
                        {inv.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(inv.totalAmountUsd || 0).toLocaleString()}`}
                      </span>
                      {inv.remainingAmountUsd > 0 ? (
                        <span className="text-[10px] text-danger font-mono font-bold">
                          долг ${inv.remainingAmountUsd.toLocaleString()}
                        </span>
                      ) : inv.totalAmountUsd > 0 ? (
                        <span className="text-[10px] text-fg-subtle font-mono">
                          ~{Math.round((inv.totalAmountUsd || 0) * inv.exchangeRate).toLocaleString()} TJS
                        </span>
                      ) : null}
                    </div>
                    <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" />
                  </div>
                </div>

                {/* Row 2: Metadata (Supplier, Date, Store) + Units + Edit/Delete */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-fg-subtle pl-9">
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span className="text-fg-muted font-semibold flex items-center gap-1 shrink-0">
                      <Truck className="w-3 h-3 text-fg-subtle" />
                      <span className="truncate max-w-[120px] sm:max-w-none">{inv.supplierName}</span>
                    </span>
                    <span>•</span>
                    <span className="shrink-0">{formatInvoiceDate(inv.date)}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5 text-fg-muted shrink-0 truncate">
                      <StoreIcon className="w-3 h-3 text-fg-subtle" />
                      <span className="truncate max-w-[110px] sm:max-w-none">{locationLabel}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-accent font-bold font-mono">{inv.devicesCount || 0} шт.</span>

                    {/* Quick Edit/Delete */}
                    {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onEditInvoice(inv)}
                          className="p-1 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-accent border border-border transition-colors cursor-pointer"
                          title="Редактировать накладную"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteInvoice(inv.id)}
                          className="p-1 rounded-lg bg-surface-raised hover:bg-danger/20 text-fg-subtle hover:text-danger border border-border transition-colors cursor-pointer"
                          title="Удалить накладную"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
