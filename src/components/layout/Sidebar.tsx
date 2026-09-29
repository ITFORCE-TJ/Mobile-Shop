import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { PageId, Role } from '../../types';
import { isStoreScoped, ROLE_LABELS } from '../../utils/roles';
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
  Landmark,
  Store
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
    roles: Role[];
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Основное',
    items: [
      { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER', 'STORE_MANAGER', 'SELLER'] },
      { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN', 'PARTNER', 'STORE_MANAGER', 'SELLER'] },
      { id: 'EXCHANGE', label: 'Обмен Trade-In', icon: RefreshCw, roles: ['ADMIN', 'PARTNER', 'STORE_MANAGER', 'SELLER'] },
      { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER', 'STORE_MANAGER', 'SELLER'] },
    ]
  },
  {
    title: 'Склад',
    items: [
      { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['ADMIN', 'PARTNER', 'STORE_MANAGER', 'SELLER'] },
      { id: 'PURCHASE', label: 'Приходы (партии)', icon: PlusCircle, roles: ['ADMIN', 'PARTNER'] },
      { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER', 'STORE_MANAGER', 'SELLER'] },
      { id: 'SUPPLIERS', label: 'Поставщики', icon: Truck, roles: ['ADMIN', 'PARTNER'] },
    ]
  },
  {
    title: 'Финансы',
    items: [
      { id: 'FINANCE', label: 'Финансы', icon: Landmark, roles: ['ADMIN', 'PARTNER', 'STORE_MANAGER'] },
      { id: 'EXPENSES', label: 'Расходы', icon: Wallet, roles: ['ADMIN', 'PARTNER', 'STORE_MANAGER'] },
      { id: 'BONUSES', label: 'Бонусы', icon: Gift, roles: ['ADMIN', 'PARTNER'] },
      { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN', 'PARTNER'] },
    ]
  },
  {
    title: 'Управление',
    items: [
      { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
      { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
      { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER'] },
      { id: 'SETTINGS', label: 'Настройки', icon: Settings, roles: ['ADMIN', 'PARTNER'] },
    ]
  }
];

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, setActivePage, logout, stores } = useAppFields('currentUser', 'setActivePage', 'logout', 'stores');
  const { notifications } = useNotifications();

  const userRole = currentUser?.role || 'SELLER';
  const sellerStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;
  // `resolved` tracks whether an actionable notification has been handled, not whether
  // the user has seen it — informational notifications are created already resolved.
  const unreadNotifs = notifications.filter(n => !n.read).length;

  return (
    <aside className="hidden lg:flex flex-col w-60 border-r border-border bg-surface text-fg-muted select-none shrink-0 h-full sticky top-0">
      <div className="h-14 flex items-center px-4 border-b border-border justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
          <span className="font-bold text-xs tracking-wider text-fg-muted uppercase">Mobile Shop</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised border border-border text-fg-subtle font-semibold">
          POS
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-none px-2.5 py-3 space-y-3">
        {NAV_GROUPS.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-0.5">
              <span className="text-[10px] font-semibold text-fg-muted tracking-wide px-2 uppercase">
                {group.title}
              </span>
              <div className="space-y-0.5">
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
                      }}
                      className={`w-full flex items-center justify-between h-10 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg hover:bg-surface-raised'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-fg-subtle'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {isNotif && unreadNotifs > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                          {unreadNotifs}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-2.5 border-t border-border flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center shrink-0">
          {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'US'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-fg-muted truncate">{currentUser?.name || 'Пользователь'}</p>
          {isStoreScoped(currentUser) ? (
            <p className="text-[10px] text-accent truncate flex items-center gap-1" title={sellerStoreName}>
              <Store className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{sellerStoreName || 'Магазин не привязан'}</span>
            </p>
          ) : (
            <p className="text-[10px] text-fg-subtle truncate">
              {currentUser ? ROLE_LABELS[currentUser.role] : ''}
            </p>
          )}
        </div>
      </div>

      <div className="p-2.5 pt-0 shrink-0">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-surface-raised hover:bg-danger/10 border border-border hover:border-danger/30 text-fg-muted hover:text-danger h-10 text-xs font-semibold transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Выход</span>
        </button>
      </div>
    </aside>
  );
};
