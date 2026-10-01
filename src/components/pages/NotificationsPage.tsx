import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, ChevronRight } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { apiClient } from '../../api/client';
import { mapNotification } from '../../api/mappers';
import type { NotificationItem, PageId } from '../../types';
import { NAV_PAGE_ROUTES } from '../../router/navRoutes';
import { formatTjs, formatUsd } from '../../utils/money';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { LoadingState } from '../ui/Skeleton';

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
  const [storeId, setStoreId] = useState('');
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
  const hasUnread = (items ?? []).some((n) => !n.read) || bellList.some((n) => !n.read);

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <PageHeader
        icon={Bell}
        title="Уведомления"
        action={hasUnread ? (
          <Button variant="secondary" leftIcon={CheckCheck} onClick={markAll}>
            <span className="hidden sm:inline">Прочитать все</span>
          </Button>
        ) : undefined}
      />

      <div className="p-3 border-b border-border shrink-0 flex flex-wrap items-center gap-2">
        <FilterPillGroup options={[{ value: 'UNREAD', label: 'Непрочитанные' }, { value: 'ALL', label: 'Все' }]} value={view} onChange={setView} />
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Магазин" className="rounded-lg bg-surface border border-border px-3 text-fg-muted">
          <option value="">Все магазины</option>
          {retailStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={actionType} onChange={(e) => setActionType(e.target.value)} aria-label="Действие" className="rounded-lg bg-surface border border-border px-3 text-fg-muted">
          <option value="">Все действия</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="m-3 text-sm text-danger">{error}</p>}
        {items === null ? (
          <LoadingState label="Загрузка уведомлений…" />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title={view === 'UNREAD' ? 'Нет непрочитанных уведомлений' : 'Уведомлений нет'} description={view === 'UNREAD' ? 'Все события просмотрены' : undefined} />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const unread = !n.read;
              const path = targetPath(n);
              const amounts = [n.amountTjs != null ? formatTjs(n.amountTjs) : null, n.amountUsd != null ? formatUsd(n.amountUsd) : null].filter(Boolean).join(' · ');
              const imeis = n.details?.imeis;
              return (
                <li key={n.id} className={`flex items-stretch ${unread ? 'bg-accent/5' : ''}`}>
                  <button type="button" onClick={() => open(n)} className="flex-1 min-w-0 text-left p-3 sm:p-4 active:bg-surface-raised">
                    <div className="flex items-center gap-2 flex-wrap">
                      {unread && <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-label="Не прочитано" />}
                      <span className="text-sm font-semibold text-fg">{n.title}</span>
                      {n.actionType && ACTION_LABELS[n.actionType] && n.actionType !== 'STORE_RECEIPT' && (
                        <span className="text-xs text-fg-subtle">{ACTION_LABELS[n.actionType]}</span>
                      )}
                    </div>
                    <p className="text-sm text-fg-muted mt-1 wrap-break-word">{n.message}</p>
                    {imeis && imeis.length > 0 && (
                      <p className="text-xs text-fg-subtle mt-1 break-all">IMEI: {imeis.slice(0, 5).join(', ')}{imeis.length > 5 ? ` и ещё ${imeis.length - 5}` : ''}</p>
                    )}
                    <p className="text-xs text-fg-subtle mt-1">
                      {[n.storeName, n.actorName, amounts || null, n.documentRef, new Date(n.date || n.timestamp || Date.now()).toLocaleString('ru-RU')].filter(Boolean).join(' · ')}
                    </p>
                    {path && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent">
                        {n.actionType === 'STORE_RECEIPT' ? 'Открыть приход' : 'Перейти'} <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                  {unread && (
                    <button type="button" onClick={() => void markRead(n)} aria-label="Отметить прочитанным" className="w-12 shrink-0 flex items-center justify-center text-fg-subtle hover:text-accent border-l border-border">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
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
