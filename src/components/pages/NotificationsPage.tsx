import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { Bell, ArrowRight, CheckCheck } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { isStoreScoped } from '../../utils/roles';

const PAGE_ROUTES: Record<string, string> = {
  SALE: '/sale',
  SALES_HISTORY: '/sales-history',
  INVENTORY: '/inventory',
  PURCHASE: '/purchase',
  TRANSFER: '/transfer',
  EXCHANGE: '/exchange',
  REPAIR: '/repair',
  SUPPLIERS: '/suppliers',
  BONUSES: '/bonuses',
  EXPENSES: '/expenses',
  OWNERS: '/owners',
  EMPLOYEES: '/employees',
  REPORTS: '/finance',
  AUDIT_LOG: '/audit-log',
  SETTINGS: '/settings',
  NOTIFICATIONS: '/notifications',
};

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, setActivePage } = useAppFields('currentUser', 'setActivePage');
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useNotifications();

  if (isStoreScoped(currentUser)) {
    return <Navigate to="/sale" replace />;
  }

  const visibleNotifications = notifications.filter(n => {
    if (n.targetRole && n.targetRole !== currentUser?.role) return false;
    if (n.targetUserId && n.targetUserId !== currentUser?.id) return false;
    return true;
  }).sort((a, b) => new Date(b.date || b.timestamp || 0).getTime() - new Date(a.date || a.timestamp || 0).getTime());

  const handleNotificationClick = (n: typeof notifications[0]) => {
    markNotificationAsRead(n.id);
    const target = n.linkPage || n.targetRoute || 'SALE';
    const route = PAGE_ROUTES[target] || (Object.values(PAGE_ROUTES).includes(target) ? target : '/sale');
    const pageId = Object.keys(PAGE_ROUTES).find(key => PAGE_ROUTES[key] === route) || 'SALE';
    setActivePage(pageId as any);

    if (route === '/transfer' || n.targetType === 'TRANSFER_REQUEST') {
      navigate('/transfer', { state: { tab: 'list' } });
    } else {
      navigate(route);
    }
  };

  const hasUnread = visibleNotifications.some(n => !(n.read ?? n.isRead));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <PageHeader
        icon={Bell}
        title="Уведомления"
        action={
          hasUnread ? (
            <Button variant="secondary" size="md" leftIcon={CheckCheck} className="h-9 px-3" onClick={() => markAllNotificationsAsRead?.()}>
              <span className="hidden sm:inline">Прочитать все</span>
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {visibleNotifications.length === 0 ? (
          <EmptyState icon={Bell} title="Нет новых уведомлений" />
        ) : (
          visibleNotifications.map((n) => {
            const isUnread = !(n.read ?? n.isRead);
            const dateStr = n.timestamp || n.date || new Date().toISOString();
            const target = n.linkPage || n.targetRoute;

            return (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left p-4 active:bg-surface-raised transition-colors flex items-start justify-between gap-3 ${
                  isUnread ? 'bg-accent/5 border-l-2 border-accent' : ''
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-fg-muted">{n.title}</span>
                    {isUnread && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                  </div>
                  <p className="text-sm text-fg-muted">{(n.message || '').replace(/^TR-[^:]*:\s*/i, '')}</p>
                  <span className="text-xs text-fg-subtle block mt-1">{new Date(dateStr).toLocaleString('ru-RU')}</span>
                </div>

                {target && (
                  <span className="text-xs font-semibold text-accent shrink-0 flex items-center gap-1">
                    Перейти <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
