import { auditActionLabel, auditRoleLabel, auditDetailsLabel, auditDateLabel } from '../../utils/auditLabels';
import { getBusinessDateKey } from '../../utils/businessDate';
import React, { useState, useMemo, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import {
  ShieldCheck,
  Search,
  Calendar,
  X,
  ArrowDown,
  ArrowUp,
  Download,
  Store as StoreIcon,
  RotateCcw,
  Filter
} from 'lucide-react';
import { exportAuditLogsReport } from '../../utils/exportReports';
import { useStoreContext } from '../../utils/storeContext';

type DateFilterMode = 'TODAY' | 'ALL' | 'SPECIFIC';
type SortOrderMode = 'DESC' | 'ASC';

const FILTER_CATEGORIES = [
  { id: 'ALL', label: 'Все категории' },
  { id: 'SALE', label: 'Продажи' },
  { id: 'REFUND', label: 'Возвраты' },
  { id: 'EXCHANGE', label: 'Обмены' },
  { id: 'PURCHASE', label: 'Приходы / Закупки' },
  { id: 'TRANSFER', label: 'Перемещения' },
  { id: 'REPAIR', label: 'Ремонты' },
  { id: 'AUTH', label: 'Авторизация' },
  { id: 'SYSTEM', label: 'Системные действия' },
];

const getLogCategory = (log: { action?: string; details?: string; category?: string }): string => {
  if (log.category && log.category !== 'SYSTEM' && log.category !== 'OTHER') {
    return log.category.toUpperCase();
  }
  const action = (log.action || '').toUpperCase();
  const details = (log.details || '').toUpperCase();
  const text = `${action} ${details}`;

  if (text.includes('SALE') || text.includes('SELL') || text.includes('ПРОДАЖ') || text.includes('ПРОДАН')) return 'SALE';
  if (text.includes('REFUND') || text.includes('RETURN') || text.includes('ВОЗВРАТ')) return 'REFUND';
  if (text.includes('EXCHANGE') || text.includes('TRADE_IN') || text.includes('ОБМЕН') || text.includes('ТРЕЙД')) return 'EXCHANGE';
  if (text.includes('PURCHASE') || text.includes('SUPPLIER') || text.includes('RECEIPT') || text.includes('ПРИХОД') || text.includes('ЗАКУПК')) return 'PURCHASE';
  if (text.includes('TRANSFER') || text.includes('TRANSIT') || text.includes('ПЕРЕМЕЩЕН') || text.includes('ТРАНЗИТ')) return 'TRANSFER';
  if (text.includes('REPAIR') || text.includes('РЕМОНТ')) return 'REPAIR';
  if (text.includes('LOGIN') || text.includes('LOGOUT') || text.includes('AUTH') || text.includes('ВХОД') || text.includes('ВЫХОД') || text.includes('ПАРОЛЬ') || text.includes('USER_CREATE')) return 'AUTH';

  return 'SYSTEM';
};

export const AuditLogPage: React.FC = () => {
  const { auditLogs, currentUser, users, stores } = useAppFields('auditLogs', 'currentUser', 'users', 'stores');

  const todayStr = useMemo(() => getBusinessDateKey(), []);

  // Filter states
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('TODAY');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('ALL');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [storeFilterChoice, setSelectedStoreFilter] = useState<string>('ALL');
  // Admin inside a store sees only that store's events; Central Cash shows everything.
  const storeCtx = useStoreContext();
  const selectedStoreFilter = storeCtx.mode === 'STORE' ? storeCtx.storeName : storeFilterChoice;
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<SortOrderMode>('DESC');

  // Pagination
  const PAGE_SIZE = 30;
  const [currentPage, setCurrentPage] = useState(1);

  // Dynamic dropdown options
  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    (users || []).forEach(u => {
      const display = u.name ? `${u.name} (@${u.login})` : `@${u.login}`;
      map.set(u.name || u.login, display);
    });
    auditLogs.forEach(l => {
      if (l.userName && !map.has(l.userName)) {
        map.set(l.userName, l.userName);
      }
    });
    return Array.from(map.entries()).map(([val, label]) => ({ val, label }));
  }, [users, auditLogs]);

  const storeOptions = useMemo(() => {
    const set = new Set<string>();
    (stores || []).forEach(s => set.add(s.name));
    auditLogs.forEach(l => {
      if (l.storeName) set.add(l.storeName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [stores, auditLogs]);

  const isAnyFilterActive = useMemo(() => {
    return (
      dateFilterMode !== 'ALL' ||
      activeCategoryFilter !== 'ALL' ||
      selectedUserFilter !== 'ALL' ||
      selectedRoleFilter !== 'ALL' ||
      selectedStoreFilter !== 'ALL' ||
      searchQuery.trim() !== ''
    );
  }, [dateFilterMode, activeCategoryFilter, selectedUserFilter, selectedRoleFilter, selectedStoreFilter, searchQuery]);

  const [showExtraFilters, setShowExtraFilters] = useState<boolean>(false);

  const activeExtraFiltersCount = useMemo(() => {
    let count = 0;
    if (activeCategoryFilter !== 'ALL') count++;
    if (selectedUserFilter !== 'ALL') count++;
    if (selectedRoleFilter !== 'ALL') count++;
    if (selectedStoreFilter !== 'ALL') count++;
    return count;
  }, [activeCategoryFilter, selectedUserFilter, selectedRoleFilter, selectedStoreFilter]);

  const handleResetFilters = () => {
    setDateFilterMode('ALL');
    setSelectedDate(todayStr);
    setActiveCategoryFilter('ALL');
    setSelectedUserFilter('ALL');
    setSelectedRoleFilter('ALL');
    setSelectedStoreFilter('ALL');
    setSearchQuery('');
    setSortOrder('DESC');
    setCurrentPage(1);
    setShowExtraFilters(false);
  };

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      // Date filter
      if (dateFilterMode === 'TODAY') {
        const logDateStr = log.timestamp ? getBusinessDateKey(new Date(log.timestamp)) : '';
        if (logDateStr !== todayStr) return false;
      } else if (dateFilterMode === 'SPECIFIC') {
        const logDateStr = log.timestamp ? getBusinessDateKey(new Date(log.timestamp)) : '';
        if (logDateStr !== selectedDate) return false;
      }

      // Category filter (Dropdown)
      if (activeCategoryFilter !== 'ALL') {
        const category = getLogCategory(log);
        if (category !== activeCategoryFilter) return false;
      }

      // User filter (Dropdown)
      if (selectedUserFilter !== 'ALL') {
        if (log.userName !== selectedUserFilter && (log as any).userId !== selectedUserFilter) {
          return false;
        }
      }

      // Role filter (Dropdown)
      if (selectedRoleFilter !== 'ALL') {
        if (log.userRole !== selectedRoleFilter) {
          return false;
        }
      }

      // Store filter (Dropdown)
      if (selectedStoreFilter !== 'ALL') {
        if (log.storeName !== selectedStoreFilter) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          auditActionLabel(log.action || '').toLowerCase().includes(q) ||
          auditRoleLabel(log.userRole).toLowerCase().includes(q) ||
          (log.action && log.action.toLowerCase().includes(q)) ||
          (log.details && log.details.toLowerCase().includes(q)) ||
          (log.userName && log.userName.toLowerCase().includes(q)) ||
          (log.userRole && log.userRole.toLowerCase().includes(q)) ||
          (log.storeName && log.storeName.toLowerCase().includes(q)) ||
          (log.imei && log.imei.toLowerCase().includes(q)) ||
          (log.receiptNumber && log.receiptNumber.toString().includes(q)) ||
          ((log as any).ipAddress && (log as any).ipAddress.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
    });
  }, [
    auditLogs,
    dateFilterMode,
    selectedDate,
    todayStr,
    activeCategoryFilter,
    selectedUserFilter,
    selectedRoleFilter,
    selectedStoreFilter,
    searchQuery,
    sortOrder
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    dateFilterMode,
    selectedDate,
    activeCategoryFilter,
    selectedUserFilter,
    selectedRoleFilter,
    selectedStoreFilter,
    searchQuery,
    sortOrder
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, currentPage]);

  const getActionBadgeColor = (category: string) => {
    switch (category) {
      case 'SALE':
        return 'bg-accent/15 text-accent border-accent/30';
      case 'REFUND':
        return 'bg-danger/15 text-danger border-danger/30';
      case 'EXCHANGE':
        return 'bg-warning/15 text-warning border-warning/30';
      case 'PURCHASE':
        return 'bg-info/15 text-info border-info/30';
      case 'TRANSFER':
        return 'bg-highlight/15 text-highlight border-highlight/30';
      case 'REPAIR':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'AUTH':
        return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
      default:
        return 'bg-surface-raised text-fg-subtle border-border';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'SALE': return 'Продажа';
      case 'REFUND': return 'Возврат';
      case 'EXCHANGE': return 'Обмен';
      case 'PURCHASE': return 'Приход';
      case 'TRANSFER': return 'Перемещение';
      case 'REPAIR': return 'Ремонт';
      case 'AUTH': return 'Авторизация';
      default: return 'Системное';
    }
  };

  if (currentUser?.role !== 'ADMIN') {
    return <div role="alert" className="p-6 text-xs text-fg-subtle">Нет доступа к журналу аудита</div>;
  }

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      {/* Header Bar */}
      <div className="px-3 py-2 sm:px-4 sm:py-2.5 border-b border-border bg-surface flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs sm:text-sm font-bold text-fg leading-tight">Журнал аудита</h1>
              <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.2 rounded-full border border-accent/20">
                {filteredLogs.length}
              </span>
            </div>
            <p className="text-[10px] text-fg-subtle truncate hidden sm:block">История действий сотрудников и системные события безопасности</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportAuditLogsReport(
                filteredLogs.map(log => ({
                  ...log,
                  action: auditActionLabel(log.action),
                  userRole: auditRoleLabel(log.userRole),
                  details: auditDetailsLabel(log.details || '')
                }))
              )
            }
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
            title="Экспорт в CSV"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar with Streamlined Controls */}
      <div className="p-2 sm:p-2.5 border-b border-border bg-surface space-y-1.5 shrink-0 shadow-2xs">
        {/* Row 1: Search & Quick Controls */}
        <div className="flex items-center gap-1.5">
          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по действию, сотруднику, IMEI..."
              className="w-full h-8 rounded-lg bg-surface-raised border border-border pl-8 pr-7 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
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

          {/* Period selector dropdown */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={dateFilterMode}
              onChange={(e) => setDateFilterMode(e.target.value as DateFilterMode)}
              className="h-8 bg-surface-raised border border-border text-fg text-xs font-medium rounded-lg px-2 focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="TODAY">Сегодня</option>
              <option value="ALL">Все время</option>
              <option value="SPECIFIC">Дата...</option>
            </select>

            {/* Date Picker if 'SPECIFIC' */}
            {dateFilterMode === 'SPECIFIC' && (
              <div className="relative h-8 flex items-center rounded-lg border border-accent bg-accent/10 px-2 text-xs text-accent font-semibold">
                <Calendar className="w-3 h-3 mr-1 shrink-0" />
                <span>{selectedDate ? selectedDate.split('-').reverse().join('.') : 'Дата'}</span>
                <input
                  type="date"
                  lang="ru"
                  aria-label="Дата событий"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                />
              </div>
            )}

            {/* Sort order toggle button */}
            <button
              type="button"
              onClick={() => setSortOrder(prev => (prev === 'DESC' ? 'ASC' : 'DESC'))}
              className="h-8 w-8 rounded-lg border border-border bg-surface-raised hover:bg-surface text-fg flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title={sortOrder === 'DESC' ? 'Сначала новые' : 'Сначала старые'}
            >
              {sortOrder === 'DESC' ? (
                <ArrowDown className="w-3.5 h-3.5 text-accent" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5 text-accent" />
              )}
            </button>

            {/* Filter toggle button on mobile */}
            <button
              type="button"
              onClick={() => setShowExtraFilters(prev => !prev)}
              className={`sm:hidden h-8 px-2 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeExtraFiltersCount > 0 || showExtraFilters
                  ? 'border-accent bg-accent/10 text-accent font-bold'
                  : 'border-border bg-surface-raised text-fg-subtle hover:text-fg'
              }`}
              title="Дополнительные фильтры"
            >
              <Filter className="w-3.5 h-3.5" />
              {activeExtraFiltersCount > 0 && (
                <span className="w-3.5 h-3.5 rounded-full bg-accent text-white text-[9px] flex items-center justify-center font-bold">
                  {activeExtraFiltersCount}
                </span>
              )}
            </button>

            {/* Reset Filters button */}
            {isAnyFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="h-8 px-2 rounded-lg bg-surface-raised hover:bg-danger/10 text-fg-subtle hover:text-danger border border-border hover:border-danger/30 text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                title="Сбросить все фильтры"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Сброс</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Secondary Dropdowns (Collapsible on mobile, always visible on sm+) */}
        <div
          className={`grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40 ${
            showExtraFilters || activeExtraFiltersCount > 0 ? 'grid' : 'hidden sm:flex'
          }`}
        >
          {/* Category Dropdown */}
          <div className="min-w-28 flex-1 sm:flex-initial">
            <select
              value={activeCategoryFilter}
              onChange={(e) => setActiveCategoryFilter(e.target.value)}
              className={`w-full h-7.5 bg-surface-raised border text-[11px] sm:text-xs font-medium rounded-lg px-2 focus:outline-none focus:border-accent cursor-pointer transition-colors ${
                activeCategoryFilter !== 'ALL'
                  ? 'border-accent text-accent font-bold bg-accent/10'
                  : 'border-border text-fg'
              }`}
            >
              {FILTER_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* User / Employee Dropdown */}
          <div className="min-w-32 flex-1 sm:flex-initial">
            <select
              value={selectedUserFilter}
              onChange={(e) => setSelectedUserFilter(e.target.value)}
              className={`w-full h-7.5 bg-surface-raised border text-[11px] sm:text-xs font-medium rounded-lg px-2 focus:outline-none focus:border-accent cursor-pointer transition-colors ${
                selectedUserFilter !== 'ALL'
                  ? 'border-accent text-accent font-bold bg-accent/10'
                  : 'border-border text-fg'
              }`}
            >
              <option value="ALL">Все сотрудники</option>
              {userOptions.map((u) => (
                <option key={u.val} value={u.val}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* Role Dropdown */}
          <div className="min-w-28 flex-1 sm:flex-initial">
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className={`w-full h-7.5 bg-surface-raised border text-[11px] sm:text-xs font-medium rounded-lg px-2 focus:outline-none focus:border-accent cursor-pointer transition-colors ${
                selectedRoleFilter !== 'ALL'
                  ? 'border-accent text-accent font-bold bg-accent/10'
                  : 'border-border text-fg'
              }`}
            >
              <option value="ALL">Все роли</option>
              <option value="ADMIN">Администратор</option>
              <option value="PARTNER">Партнер</option>
              <option value="SELLER">Продавец</option>
            </select>
          </div>

          {/* Store / Location Dropdown */}
          {storeOptions.length > 0 && storeCtx.mode === 'CENTRAL' && (
            <div className="min-w-28 flex-1 sm:flex-initial">
              <select
                value={selectedStoreFilter}
                onChange={(e) => setSelectedStoreFilter(e.target.value)}
                className={`w-full h-7.5 bg-surface-raised border text-[11px] sm:text-xs font-medium rounded-lg px-2 focus:outline-none focus:border-accent cursor-pointer transition-colors ${
                  selectedStoreFilter !== 'ALL'
                    ? 'border-accent text-accent font-bold bg-accent/10'
                    : 'border-border text-fg'
                }`}
              >
                <option value="ALL">Все локации</option>
                {storeOptions.map((store) => (
                  <option key={store} value={store}>
                    {store}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Table / Event List */}
      <div className="flex-1 overflow-y-auto bg-bg p-2.5 sm:p-4 space-y-1.5 sm:space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-fg-subtle text-xs space-y-1">
            <ShieldCheck className="w-8 h-8 mx-auto opacity-30 text-fg-subtle" />
            <p className="font-semibold text-fg">События аудита не найдены</p>
            <p className="text-[11px]">Попробуйте изменить параметры поиска или сбросить фильтры.</p>
          </div>
        ) : (
          paginatedLogs.map((log) => {
            const catKey = getLogCategory(log);
            const badgeStyle = getActionBadgeColor(catKey);
            const catLabel = getCategoryLabel(catKey);

            return (
              <div
                key={log.id}
                className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 text-xs hover:border-fg-subtle/30 transition-colors shadow-2xs"
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] sm:text-[10px] border uppercase tracking-wider shrink-0 mt-0.5 ${badgeStyle}`}>
                    {catLabel}
                  </span>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-xs sm:text-sm text-fg leading-snug">
                        {auditActionLabel(log.action)}
                      </p>
                      {log.storeName && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-fg-muted flex items-center gap-1 shrink-0">
                          <StoreIcon className="w-2.5 h-2.5 text-accent" />
                          <span>{log.storeName}</span>
                        </span>
                      )}
                    </div>

                    {log.details && (
                      <p className="text-[11px] sm:text-xs text-fg-muted break-words leading-relaxed">
                        {auditDetailsLabel(log.details)}
                      </p>
                    )}

                    {/* Mobile: compact author and timestamp row */}
                    <div className="flex sm:hidden items-center justify-between gap-2 text-[10px] text-fg-subtle pt-1 border-t border-border/40">
                      <div className="flex items-center gap-1 min-w-0 truncate">
                        <strong className="text-fg font-semibold truncate">{log.userName || 'Система'}</strong>
                        <span className="text-fg-subtle/70">·</span>
                        <span className="text-fg-subtle truncate">{auditRoleLabel(log.userRole)}</span>
                      </div>
                      <span className="font-mono text-fg-subtle whitespace-nowrap shrink-0">
                        {auditDateLabel(log.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Desktop: author and date aligned on the right */}
                <div className="hidden sm:flex items-center justify-end gap-3 text-xs shrink-0 text-right">
                  <div>
                    <span className="font-bold text-fg block text-xs">{log.userName || 'Система'}</span>
                    <span className="text-[10px] text-fg-subtle block font-semibold">{auditRoleLabel(log.userRole)}</span>
                  </div>

                  <div className="text-right text-fg-subtle text-[11px] font-mono whitespace-nowrap pl-2.5 border-l border-border/60">
                    {auditDateLabel(log.timestamp)}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border text-xs">
            <span className="text-fg-subtle text-[11px] sm:text-xs">
              Стр. <strong className="text-fg">{currentPage}</strong> из <strong className="text-fg">{totalPages}</strong>
              <span className="hidden sm:inline"> · {filteredLogs.length} событий</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                ← Назад
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Вперед →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
