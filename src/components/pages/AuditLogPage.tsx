import { getBusinessDateKey } from '../../utils/businessDate';
import React, { useState, useMemo } from 'react';
import { useAppFields } from '../../context/AppContext';
import {
  ShieldCheck,
  Search,
  Calendar,
  X,
  ArrowDown,
  ArrowUp,
  Download
} from 'lucide-react';
import { exportAuditLogsReport } from '../../utils/exportReports';

type DateFilterMode = 'TODAY' | 'SPECIFIC' | 'ALL';
type SortOrderMode = 'DESC' | 'ASC';

const FILTER_CATEGORIES = [
  { id: 'ALL', label: 'Все категории' },
  { id: 'SALE', label: 'Продажи' },
  { id: 'REFUND', label: 'Возвраты' },
  { id: 'EXCHANGE', label: 'Обмены' },
  { id: 'PURCHASE', label: 'Приходы' },
  { id: 'TRANSFER', label: 'Перемещения' },
  { id: 'REPAIR', label: 'Ремонты' },
  { id: 'AUTH', label: 'Авторизация' },
  { id: 'SYSTEM', label: 'Системные' },
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
  const { auditLogs, currentUser } = useAppFields('auditLogs', 'currentUser');

  const todayStr = useMemo(() => getBusinessDateKey(), []);

  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('TODAY');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<SortOrderMode>('DESC');

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (dateFilterMode === 'TODAY') {
        const logDateStr = log.timestamp ? getBusinessDateKey(new Date(log.timestamp)) : '';
        if (logDateStr !== todayStr) return false;
      } else if (dateFilterMode === 'SPECIFIC') {
        const logDateStr = log.timestamp ? getBusinessDateKey(new Date(log.timestamp)) : '';
        if (logDateStr !== selectedDate) return false;
      }

      if (activeCategoryFilter !== 'ALL') {
        const category = getLogCategory(log);
        if (category !== activeCategoryFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          (log.action && log.action.toLowerCase().includes(q)) ||
          (log.details && log.details.toLowerCase().includes(q)) ||
          (log.userName && log.userName.toLowerCase().includes(q)) ||
          (log.userRole && log.userRole.toLowerCase().includes(q)) ||
          ((log as any).ipAddress && (log as any).ipAddress.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
    });
  }, [auditLogs, dateFilterMode, selectedDate, todayStr, activeCategoryFilter, searchQuery, sortOrder]);

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
      case 'SALE': return 'ПРОДАЖА';
      case 'REFUND': return 'ВОЗВРАТ';
      case 'EXCHANGE': return 'ОБМЕН';
      case 'PURCHASE': return 'ПРИХОД';
      case 'TRANSFER': return 'ПЕРЕМЕЩЕНИЕ';
      case 'REPAIR': return 'РЕМОНТ';
      case 'AUTH': return 'АВТОРИЗАЦИЯ';
      default: return 'СИСТЕМНОЕ';
    }
  };

  if (currentUser?.role !== 'ADMIN') return <div role="alert" className="p-6">Нет доступа к журналу аудита</div>;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      {/* Header Bar */}
      <div className="p-3.5 border-b border-border bg-surface flex items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-accent bg-accent/15 px-3 py-1 rounded-xl border border-accent/30">
            {filteredLogs.length} событий
          </span>
          <button
            type="button"
            onClick={() => exportAuditLogsReport(filteredLogs)}
            disabled={filteredLogs.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-muted text-xs font-bold transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Экспорт (CSV)</span>
          </button>
        </div>
      </div>

      {/* Row 2: Date Selector, Sorting & Search Bar */}
      <div className="p-3 border-b border-border bg-bg space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Date Selector & Sort Toggle */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-xs text-fg-subtle font-semibold uppercase">ПЕРИОД:</span>

            <button
              type="button"
              onClick={() => setDateFilterMode('TODAY')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase flex items-center space-x-1.5 transition-all ${
                dateFilterMode === 'TODAY'
                  ? 'border-accent text-accent bg-accent/15'
                  : 'border-border text-fg-muted hover:text-fg-muted bg-surface'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Сегодня</span>
            </button>

            <div className={`flex items-center space-x-1.5 rounded-xl border px-3 py-1 text-xs transition-all ${
              dateFilterMode === 'SPECIFIC'
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-surface text-fg-muted'
            }`}>
              <span className="text-[10px] uppercase font-semibold">Дата:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setDateFilterMode('SPECIFIC');
                }}
                className="bg-transparent text-fg-muted text-xs font-semibold focus:outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => setDateFilterMode('ALL')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase transition-all ${
                dateFilterMode === 'ALL'
                  ? 'border-accent text-accent bg-accent/15'
                  : 'border-border text-fg-muted hover:text-fg-muted bg-surface'
              }`}
            >
              <span>За все время</span>
            </button>

            {/* Sort Toggle Button */}
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC')}
              className="px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-raised text-fg-muted text-xs font-bold uppercase flex items-center space-x-1.5 transition-all ml-1"
              title="Переключить порядок сортировки по дате"
            >
              {sortOrder === 'DESC' ? <ArrowDown className="w-3.5 h-3.5 text-accent" /> : <ArrowUp className="w-3.5 h-3.5 text-accent" />}
              <span>{sortOrder === 'DESC' ? 'Сначала новые' : 'Сначала старые'}</span>
            </button>
          </div>

          {/* Right: Search */}
          <div className="relative w-full sm:w-64 md:w-80">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по событию / сотруднику / IMEI..."
              className="w-full rounded-xl bg-surface border border-border pl-9 pr-8 py-1.5 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-fg-subtle hover:text-fg-muted"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Row 3: Category Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pt-1">
          {FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase whitespace-nowrap transition-all ${
                activeCategoryFilter === cat.id
                  ? 'bg-accent text-accent-fg shadow-xs scale-105'
                  : 'bg-surface hover:bg-surface-raised text-fg-muted border border-border'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table / Event List */}
      <div className="flex-1 overflow-y-auto bg-bg p-3 sm:p-4">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-fg-muted text-xs uppercase tracking-wider font-semibold">
            События аудита за выбранный период не найдены
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => {
              const catKey = getLogCategory(log);
              const badgeStyle = getActionBadgeColor(catKey);
              const catLabel = getCategoryLabel(catKey);

              return (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs hover:border-fg-subtle transition-colors"
                >
                  <div className="flex items-start space-x-3 min-w-0 flex-1">
                    <span className={`px-2.5 py-1 rounded-lg font-bold uppercase text-[10px] border shrink-0 mt-0.5 tracking-wider ${badgeStyle}`}>
                      {catLabel}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-fg-muted truncate">{log.action}</p>
                      {log.details && (
                        <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">{log.details}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-4 text-xs shrink-0 border-t sm:border-t-0 border-border pt-2 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <span className="font-bold text-fg-muted block">{log.userName || 'Система'}</span>
                      <span className="text-[10px] text-fg-subtle uppercase block">{log.userRole || 'SYSTEM'}</span>
                    </div>

                    <div className="text-right text-fg-subtle text-[11px] font-medium">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
