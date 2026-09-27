import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { PageId } from '../../types';
import {
  ShoppingBag,
  History,
  Package,
  PlusCircle,
  ArrowLeftRight,
  RefreshCw,
  Wrench,
  Truck,
  Gift,
  Wallet,
  Users,
  UserCheck,
  FileText,
  Settings,
  Bell,
  LogOut,
  X,
  ChevronRight,
  Landmark
} from 'lucide-react';

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
  FINANCE: '/finance',
  AUDIT_LOG: '/audit-log',
  SETTINGS: '/settings',
  NOTIFICATIONS: '/notifications',
};

interface NavGroup {
  title: string;
  items: {
    id: PageId;
    label: string;
    icon: React.ElementType;
    roles: ('ADMIN' | 'PARTNER' | 'SELLER')[];
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Основные операции',
    items: [
      { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'EXCHANGE', label: 'Обмен (Trade-In)', icon: RefreshCw, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
    ]
  },
  {
    title: 'Склад и логистика',
    items: [
      { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'PURCHASE', label: 'Приходы (партии)', icon: PlusCircle, roles: ['ADMIN', 'PARTNER'] },
      { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SUPPLIERS', label: 'Поставщики', icon: Truck, roles: ['ADMIN', 'PARTNER'] },
    ]
  },
  {
    title: 'Финансы и учёт',
    items: [
      { id: 'FINANCE', label: 'Финансы', icon: Landmark, roles: ['ADMIN', 'PARTNER'] },
      { id: 'EXPENSES', label: 'Расходы магазина', icon: Wallet, roles: ['ADMIN', 'PARTNER'] },
      { id: 'BONUSES', label: 'Бонусы продавцов', icon: Gift, roles: ['ADMIN', 'PARTNER'] },
      { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN', 'PARTNER'] },
    ]
  },
  {
    title: 'Система и доступ',
    items: [
      { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
      { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
      { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER'] },
      { id: 'SETTINGS', label: 'Настройки системы', icon: Settings, roles: ['ADMIN', 'PARTNER'] },
    ]
  }
];

export const Drawer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    setActivePage,
    drawerOpen,
    setDrawerOpen,
    logout,
    stores
  } = useAppFields('currentUser', 'setActivePage', 'drawerOpen', 'setDrawerOpen', 'logout', 'stores');
  const { notifications } = useNotifications();

  if (!drawerOpen) return null;

  const userRole = currentUser?.role || 'SELLER';
  const bottomNavPages: PageId[] = [
    'INVENTORY', 'SALES_HISTORY', 'SALE',
    userRole === 'ADMIN' || userRole === 'PARTNER' ? 'PURCHASE' : 'EXCHANGE',
  ];
  // `resolved` tracks whether an actionable notification has been handled, not whether
  // the user has seen it — informational notifications are created already resolved.
  const unreadNotifs = notifications.filter(n => !n.read).length;
  const userStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;
  const storeSubtitle = currentUser?.role === 'SELLER'
    ? (userStoreName || 'Магазин не привязан')
    : (userStoreName || 'Все магазины');

  return (
    <div className="app-safe-area fixed inset-x-0 top-0 bottom-[calc(3.5rem+var(--bottom-nav-pb))] z-40 flex md:hidden flex-col bg-bg text-fg-muted w-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/30 text-accent font-bold text-sm flex items-center justify-center shrink-0">
            {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'US'}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-fg-muted truncate">
              {currentUser?.name || 'Пользователь'}
            </h2>
            <p className="text-xs font-medium text-accent truncate">
              {storeSubtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Закрыть меню"
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-raised text-fg-muted hover:text-fg-muted border border-border transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Vertical List of Menu Items */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
        {NAV_GROUPS.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.roles.includes(userRole) && !bottomNavPages.includes(item.id));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-2">
              <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider px-1 block">
                {group.title}
              </span>

              <div className="space-y-1.5">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const routePath = PAGE_ROUTES[item.id] || '/sale';
                  const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === 'SALE');
                  const isNotif = item.id === 'NOTIFICATIONS';

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActivePage(item.id);
                        navigate(routePath);
                        setDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all active:scale-[0.99] ${
                        isActive
                          ? 'bg-accent/10 text-accent border-accent/40 font-semibold shadow-xs'
                          : 'bg-surface hover:bg-surface-raised text-fg-muted border-border/80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          isActive ? 'bg-accent/20 text-accent' : 'bg-surface-raised text-fg-subtle border border-border'
                        }`}>
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <span className="text-xs md:text-sm font-medium truncate">{item.label}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isNotif && unreadNotifs > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                            {unreadNotifs}
                          </span>
                        )}
                        <ChevronRight className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-fg-subtle/50'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Logout item at the end of the mobile menu list */}
        <div className="pt-2">
          <button
            onClick={() => {
              setDrawerOpen(false);
              logout();
            }}
            className="w-full flex items-center justify-between px-3.5 py-3.5 rounded-xl border text-left bg-danger/10 hover:bg-danger/15 text-danger border-danger/30 font-semibold transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-danger/15 text-danger shrink-0 border border-danger/20">
                <LogOut className="w-4.5 h-4.5" />
              </div>
              <span className="text-xs md:text-sm font-bold truncate">Выйти из системы</span>
            </div>
            <ChevronRight className="w-4 h-4 text-danger/60 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
