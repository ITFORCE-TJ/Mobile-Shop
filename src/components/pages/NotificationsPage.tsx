import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  ChevronDown,
  ShoppingBag,
  RotateCcw,
  RefreshCw,
  ArrowLeftRight,
  Trash2,
  Wallet,
  Landmark,
  PackagePlus,
  Gift,
  Wrench,
  Users,
} from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { apiClient } from '../../api/client';
import { mapNotification } from '../../api/mappers';
import type { NotificationItem, PageId } from '../../types';
import { NAV_PAGE_ROUTES } from '../../router/navRoutes';
import { formatTjs, formatUsd } from '../../utils/money';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { LoadingState } from '../ui/Skeleton';
import { useStoreContext } from '../../utils/storeContext';

/** Names of the business events, for the action filter and the item label. */
export const ACTION_LABELS: Record<string, string> = {
  STORE_RECEIPT: 'Приход в магазин',
  SALE: 'Продажа',
  SALE_BELOW_COST: 'Продажа ниже себестоимости',
  REFUND: 'Возврат',
  EXCHANGE: 'Обмен',
  TRANSFER: 'Перемещение',
  TRANSFER_REQUEST: 'Запрос перемещения',
  TRANSFER_APPROVAL: 'Перемещение подтверждено',
  TRANSFER_REJECT: 'Перемещение отклонено',
  EXPENSE: 'Расход',
  EXPENSE_PAID: 'Оплата расхода',
  EXPENSE_EDIT: 'Расход изменён',
  EXPENSE_DELETE: 'Расход отменён',
  PAYROLL_PAYOUT: 'Зарплата',
  CASH_COLLECTION: 'Инкассация',
  CASH_COLLECTION_CANCEL: 'Отмена инкассации',
  STORE_CASH_ADJUSTMENT: 'Корректировка кассы',
  SUPPLIER_PAYMENT: 'Оплата поставщику',
  PURCHASE: 'Приход на главный склад',
  SUPPLIER_BONUS: 'Бонус поставщика',
  BONUS_EDIT: 'Бонус изменён',
  BONUS_DELETE: 'Бонус удалён',
  BONUS_PROFIT_DISTRIBUTED: 'Бонусный пул распределён',
  BONUS_POOL_ANNULLED: 'Бонусный пул обнулён',
  REPAIR_STATUS_CHANGE: 'Ремонт',
  OWNER_INVESTMENT: 'Взнос капитала',
  OWNER_WITHDRAWAL: 'Изъятие капитала',
  PROFIT_PAYOUT: 'Выплата прибыли',
  REINVEST: 'Капитализация прибыли',
  QUARTER_CLOSE: 'Закрытие квартала',
};

function formatNotificationDate(rawDate?: string | number | Date): string {
  if (!rawDate) return '';
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Сегодня, ${timeStr}`;
  if (isYesterday) return `Вчера, ${timeStr}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${timeStr}`;
}

function getEventIconConfig(actionType?: string): { icon: React.ElementType; tone: 'accent' | 'warning' | 'danger' | 'info' | 'purple' } {
  switch (actionType) {
    case 'SALE':
    case 'SALE_BELOW_COST':
      return { icon: ShoppingBag, tone: 'accent' };
    case 'REFUND':
      return { icon: RotateCcw, tone: 'warning' };
    case 'EXCHANGE':
      return { icon: RefreshCw, tone: 'info' };
    case 'TRANSFER':
    case 'TRANSFER_REQUEST':
    case 'TRANSFER_APPROVAL':
    case 'TRANSFER_REJECT':
      return { icon: ArrowLeftRight, tone: 'info' };
    case 'EXPENSE_DELETE':
    case 'BONUS_DELETE':
      return { icon: Trash2, tone: 'danger' };
    case 'EXPENSE':
    case 'EXPENSE_PAID':
    case 'EXPENSE_EDIT':
      return { icon: Wallet, tone: 'warning' };
    case 'CASH_COLLECTION':
    case 'CASH_COLLECTION_CANCEL':
    case 'STORE_CASH_ADJUSTMENT':
      return { icon: Landmark, tone: 'accent' };
    case 'PURCHASE':
    case 'STORE_RECEIPT':
      return { icon: PackagePlus, tone: 'accent' };
    case 'SUPPLIER_BONUS':
    case 'BONUS_EDIT':
    case 'BONUS_PROFIT_DISTRIBUTED':
    case 'BONUS_POOL_ANNULLED':
      return { icon: Gift, tone: 'purple' };
    case 'REPAIR_STATUS_CHANGE':
      return { icon: Wrench, tone: 'info' };
    case 'OWNER_INVESTMENT':
    case 'OWNER_WITHDRAWAL':
    case 'PROFIT_PAYOUT':
    case 'REINVEST':
    case 'PAYROLL_PAYOUT':
      return { icon: Users, tone: 'accent' };
    default:
      return { icon: Bell, tone: 'accent' };
  }
}

const TONE_BADGE_STYLES: Record<string, string> = {
  accent: 'bg-accent/10 border-accent/25 text-accent',
  warning: 'bg-warning/10 border-warning/25 text-warning',
  danger: 'bg-danger/10 border-danger/25 text-danger',
  info: 'bg-info/10 border-info/25 text-info',
  purple: 'bg-purple-500/10 border-purple-500/25 text-purple-400',
};

/** Where a notification leads: an app path ('/receipts?receipt=…') or an older page id. */
function targetPath(n: NotificationItem): string | null {
  const target = n.targetRoute || n.linkPage;
  if (!target) return null;
  if (target.startsWith('/')) return target;
  return NAV_PAGE_ROUTES[target] ?? null;
}

const pageIdFor = (path: string): PageId | undefined => {
  const pathname = path.split('?')[0];
  return Object.keys(NAV_PAGE_ROUTES).find((id) => NAV_PAGE_ROUTES[id] === pathname && id !== 'REPORTS') as PageId | undefined;
};

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, setActivePage, stores } = useAppFields('currentUser', 'setActivePage', 'stores');
  // The bell's list: its change (a realtime NOTIFICATION_CREATED refetch) refreshes this page too.
  const { notifications: bellList, fetchNotifications } = useNotifications();

  const [view, setView] = useState<'UNREAD' | 'ALL'>('UNREAD');
  const [storeChoice, setStoreId] = useState('');
  // Admin inside a store sees that store's events; Central Cash shows every store.
  const storeCtx = useStoreContext();
  const storeId = storeCtx.mode === 'STORE' ? storeCtx.storeId : storeChoice;
  const [actionType, setActionType] = useState('');
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams({ view: 'history', limit: '50' });
    if (view === 'UNREAD') params.set('unread', '1');
    if (storeId) params.set('storeId', storeId);
    if (actionType) params.set('actionType', actionType);
    if (cursor) params.set('cursor', cursor);
    return apiClient<{ items: any[]; nextCursor: string | null }>(`/notifications?${params.toString()}`);
  }, [view, storeId, actionType]);

  const bellKey = useMemo(() => bellList.map((n) => `${n.id}:${n.read ? 1 : 0}`).join(','), [bellList]);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    query()
      .then((page) => {
        if (cancelled) return;
        setItems(page.items.map(mapNotification));
        setNextCursor(page.nextCursor);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить уведомления'); });
    return () => { cancelled = true; };
  }, [query, bellKey]);

  if (currentUser?.role !== 'ADMIN') return <Navigate to="/sale" replace />;

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await query(nextCursor);
      setItems((prev) => [...(prev ?? []), ...page.items.map(mapNotification)]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (n: NotificationItem) => {
    if (n.read) return;
    try {
      await apiClient(`/notifications/${n.id}/read`, { method: 'PATCH' });
      setItems((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, read: true, isRead: true } : x)));
      void fetchNotifications();
    } catch {
      setError('Не удалось отметить уведомление прочитанным');
    }
  };

  const markAll = async () => {
    try {
      await apiClient('/notifications/read-all', { method: 'POST' });
      void fetchNotifications();
    } catch {
      setError('Не удалось отметить уведомления прочитанными');
    }
  };

  const open = (n: NotificationItem) => {
    void markRead(n);
    const path = targetPath(n);
    if (!path) return;
    const pageId = pageIdFor(path);
    if (pageId) setActivePage(pageId);
    if (n.targetType === 'TRANSFER_REQUEST') navigate('/transfer', { state: { tab: 'list' } });
    else navigate(path);
  };

  const retailStores = stores.filter((s) => !s.isMainWarehouse);
  const unreadCount = bellList.filter((n) => !n.read).length;
  const hasUnread = unreadCount > 0 || (items ?? []).some((n) => !n.read);

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      {/* Desktop Header */}
      <div className="hidden sm:flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface shrink-0">
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-fg leading-none">Уведомления</h1>
            <p className="text-[11px] text-fg-subtle mt-0.5">Журнал событий и системные оповещения</p>
          </div>
        </div>
        {hasUnread && (
          <button
            type="button"
            onClick={markAll}
            className="px-3 py-1.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <CheckCheck className="w-3.5 h-3.5 text-accent" />
            <span>Прочитать все</span>
          </button>
        )}
      </div>

      {/* Compact Filters Strip */}
      <div className="p-2.5 sm:p-3 border-b border-border bg-surface/50 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <FilterPillGroup
            options={[
              { value: 'UNREAD', label: `Непрочитанные${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
              { value: 'ALL', label: 'Все' },
            ]}
            value={view}
            onChange={setView}
          />
          {hasUnread && (
            <button
              type="button"
              onClick={markAll}
              className="sm:hidden px-2 py-1 rounded-lg bg-surface-raised hover:bg-accent/10 border border-border hover:border-accent/30 text-fg-subtle hover:text-accent text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95 shrink-0"
              title="Отметить все прочитанными"
            >
              <CheckCheck className="w-3.5 h-3.5 text-accent" />
              <span className="text-[11px]">Прочитать</span>
            </button>
          )}
        </div>

        {/* Clean 2-column select row */}
        <div className="grid grid-cols-2 gap-2">
          {storeCtx.mode === 'CENTRAL' && (
            <div className="relative">
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                aria-label="Магазин"
                className="w-full h-8 pl-2.5 pr-7 rounded-lg bg-surface border border-border text-fg-muted hover:border-accent/40 text-xs font-medium appearance-none truncate cursor-pointer focus:outline-hidden focus:border-accent transition-colors"
              >
                <option value="">Все магазины</option>
                {retailStores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-fg-subtle absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}
          <div className={`relative ${storeCtx.mode !== 'CENTRAL' ? 'col-span-2' : ''}`}>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              aria-label="Действие"
              className="w-full h-8 pl-2.5 pr-7 rounded-lg bg-surface border border-border text-fg-muted hover:border-accent/40 text-xs font-medium appearance-none truncate cursor-pointer focus:outline-hidden focus:border-accent transition-colors"
            >
              <option value="">Все действия</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-fg-subtle absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto">
        {error && <p className="m-3 text-xs text-danger bg-danger/10 border border-danger/30 rounded-xl p-2.5">{error}</p>}
        {items === null ? (
          <LoadingState label="Загрузка уведомлений…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={view === 'UNREAD' ? 'Нет непрочитанных уведомлений' : 'Уведомлений нет'}
            description={view === 'UNREAD' ? 'Все события просмотрены' : undefined}
          />
        ) : (
          <div className="p-2 sm:p-3 space-y-2">
            {items.map((n) => {
              const unread = !n.read;
              const path = targetPath(n);
              const amounts = [n.amountTjs != null ? formatTjs(n.amountTjs) : null, n.amountUsd != null ? formatUsd(n.amountUsd) : null].filter(Boolean).join(' · ');
              const imeis = n.details?.imeis;
              const { icon: EventIcon, tone } = getEventIconConfig(n.actionType);
              const badgeStyle = TONE_BADGE_STYLES[tone] || TONE_BADGE_STYLES.accent;
              const dateLabel = formatNotificationDate(n.date || n.timestamp);

              return (
                <div
                  key={n.id}
                  onClick={() => open(n)}
                  className={`group relative rounded-xl border transition-all text-left p-3 cursor-pointer select-none active:scale-[0.99] ${
                    unread
                      ? 'bg-accent/[0.04] border-accent/30 hover:border-accent/50 shadow-2xs'
                      : 'bg-surface hover:bg-surface-raised/80 border-border/80 text-fg-muted'
                  }`}
                >
                  {/* Top Row: Icon + Title + Date + Mark Read */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${badgeStyle}`}>
                        <EventIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs sm:text-sm font-bold truncate ${unread ? 'text-fg' : 'text-fg-muted'}`}>
                            {n.title}
                          </span>
                          {unread && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 animate-pulse" />
                          )}
                        </div>
                        {n.actionType && ACTION_LABELS[n.actionType] &&
                         !n.title.toLowerCase().includes(ACTION_LABELS[n.actionType].toLowerCase()) && (
                          <span className="text-[10px] text-fg-subtle font-medium block truncate">
                            {ACTION_LABELS[n.actionType]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-fg-subtle whitespace-nowrap">
                        {dateLabel}
                      </span>
                      {unread && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void markRead(n);
                          }}
                          title="Отметить прочитанным"
                          className="w-6 h-6 rounded-md hover:bg-accent/15 text-fg-subtle hover:text-accent flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message Body */}
                  {n.message && (
                    <p className="text-xs text-fg-muted mt-1.5 leading-relaxed wrap-break-word">
                      {n.message}
                    </p>
                  )}

                  {/* IMEI preview if any */}
                  {imeis && imeis.length > 0 && (
                    <p className="text-[11px] font-mono text-fg-subtle mt-1.5 break-all bg-surface-raised/60 px-2 py-0.5 rounded border border-border/50">
                      IMEI: {imeis.slice(0, 5).join(', ')}{imeis.length > 5 ? ` +${imeis.length - 5}` : ''}
                    </p>
                  )}

                  {/* Bottom Metadata & Action Tag */}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40 text-[11px] flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap text-fg-subtle">
                      {n.storeName && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-raised border border-border text-[10px] font-medium text-fg-muted">
                          {n.storeName}
                        </span>
                      )}
                      {n.actorName && (
                        <span className="text-fg-subtle text-[11px]">
                          {n.actorName}
                        </span>
                      )}
                      {amounts && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-fg-muted">
                            {amounts}
                          </span>
                        </>
                      )}
                      {n.documentRef && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-fg-subtle">
                            {n.documentRef}
                          </span>
                        </>
                      )}
                    </div>

                    {path && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent group-hover:underline ml-auto">
                        {n.actionType === 'STORE_RECEIPT' ? 'Открыть приход' : 'Перейти'}
                        <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {nextCursor && (
          <div className="p-3 flex justify-center">
            <Button variant="secondary" loading={loadingMore} onClick={loadMore}>Показать ещё</Button>
          </div>
        )}
      </div>
    </div>
  );
};
