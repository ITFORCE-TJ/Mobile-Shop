import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useUIStore } from '../../stores/useUIStore';
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
  Landmark,
  Store,
  ArrowRight,
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

export const Drawer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    setActivePage,
    drawerOpen,
    setDrawerOpen,
    logout,
    stores,
    selectedStoreId,
    setSelectedStoreId,
  } = useAppFields(
    'currentUser',
    'setActivePage',
    'drawerOpen',
    'setDrawerOpen',
    'logout',
    'stores',
    'selectedStoreId',
    'setSelectedStoreId'
  );
  const { notifications } = useNotifications();
  const { setStoreSwitchModalOpen } = useUIStore();

  if (!drawerOpen) return null;

  const userRole = currentUser?.role || 'SELLER';
  const isSeller = userRole === 'SELLER';
  const isCentralCashMode = !isSeller && (!selectedStoreId || selectedStoreId === 'all');
  const activeRetailStore = !isSeller && !isCentralCashMode ? stores.find(s => s.id === selectedStoreId && !s.isMainWarehouse) : null;
  const userStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;

  const unreadNotifs = notifications.filter(n => !n.read).length;

  const navGroups = useMemo<NavGroup[]>(() => {
    if (isSeller) {
      return [
        {
          title: 'Основные операции',
          items: [
            { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['SELLER'] },
            { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['SELLER'] },
            { id: 'EXCHANGE', label: 'Обмен (Trade-In)', icon: RefreshCw, roles: ['SELLER'] },
            { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['SELLER'] },
          ],
        },
        {
          title: 'Склад',
          items: [
            { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['SELLER'] },
            { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['SELLER'] },
          ],
        },
      ];
    }

    if (isCentralCashMode) {
      return [
        {
          title: 'Центральная касса и финансы',
          items: [
            { id: 'FINANCE', label: 'Финансы и отчёты', icon: Landmark, roles: ['ADMIN', 'PARTNER'] },
            { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN', 'PARTNER'] },
            { id: 'EXPENSES', label: 'Расходы кассы', icon: Wallet, roles: ['ADMIN', 'PARTNER'] },
            { id: 'BONUSES', label: 'Бонусы поставщиков', icon: Gift, roles: ['ADMIN', 'PARTNER'] },
            { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN', 'PARTNER'] },
          ],
        },
        {
          title: 'Склад и логистика',
          items: [
            { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['ADMIN', 'PARTNER'] },
            { id: 'PURCHASE', label: 'Приходы (партии)', icon: PlusCircle, roles: ['ADMIN'] },
            { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER'] },
            { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER'] },
            { id: 'SUPPLIERS', label: 'Поставщики', icon: Truck, roles: ['ADMIN'] },
          ],
        },
        {
          title: 'Система и доступ',
          items: [
            { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
            { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
            { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER'] },
            { id: 'SETTINGS', label: 'Настройки системы', icon: Settings, roles: ['ADMIN', 'PARTNER'] },
          ],
        },
      ];
    }

    // Retail Store mode for Admin
    return [
      {
        title: `Продажи: ${activeRetailStore?.name || 'Магазин'}`,
        items: [
          { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER'] },
          { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN', 'PARTNER'] },
          { id: 'EXCHANGE', label: 'Обмен (Trade-In)', icon: RefreshCw, roles: ['ADMIN', 'PARTNER'] },
          { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER'] },
          { id: 'INVENTORY', label: 'Склад магазина', icon: Package, roles: ['ADMIN', 'PARTNER'] },
          { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER'] },
        ],
      },
      {
        title: 'Финансы (Центральный офис)',
        items: [
          { id: 'FINANCE', label: 'Финансы', icon: Landmark, roles: ['ADMIN', 'PARTNER'] },
          { id: 'EXPENSES', label: 'Расходы', icon: Wallet, roles: ['ADMIN', 'PARTNER'] },
          { id: 'BONUSES', label: 'Бонусы', icon: Gift, roles: ['ADMIN', 'PARTNER'] },
          { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN', 'PARTNER'] },
        ],
      },
      {
        title: 'Система и доступ',
        items: [
          { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
          { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
          { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER'] },
          { id: 'SETTINGS', label: 'Настройки системы', icon: Settings, roles: ['ADMIN', 'PARTNER'] },
        ],
      },
    ];
  }, [isSeller, isCentralCashMode, activeRetailStore]);

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
              {isSeller ? (userStoreName || 'Магазин не привязан') : isCentralCashMode ? 'Центральная касса' : `Продажи: ${activeRetailStore?.name || 'Магазин'}`}
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

      {/* Mode Switcher Banner for Admin/Partner */}
      {!isSeller && (
        <div className="p-3 border-b border-border bg-surface-raised/40 shrink-0">
          {isCentralCashMode ? (
            <div
              onClick={() => {
                setDrawerOpen(false);
                setSelectedStoreId('all');
                setActivePage('FINANCE');
                navigate('/finance');
              }}
              className="p-3 rounded-xl bg-accent/5 hover:bg-accent/10 border border-accent/25 space-y-1.5 cursor-pointer transition-colors"
              title="Перейти в Центральную кассу (Финансы)"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1">
                  <Landmark className="w-3.5 h-3.5" />
                  Центральная касса
                </span>
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              </div>
              <p className="text-xs text-fg-subtle">
                Режим главного офиса и финансового учёта
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawerOpen(false);
                  setStoreSwitchModalOpen(true);
                }}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-raised hover:bg-accent hover:text-accent-fg border border-border text-xs font-semibold text-fg flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <Store className="w-3.5 h-3.5" />
                <span>Выбрать магазин для продаж</span>
                <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-70" />
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-warning flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" />
                  Режим продаж
                </span>
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              </div>
              <p className="text-xs font-bold text-fg truncate">
                {activeRetailStore?.name || 'Магазин'}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setStoreSwitchModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg flex items-center justify-center gap-1 transition-all"
                >
                  <Store className="w-3 h-3 text-fg-subtle" />
                  <span>Сменить</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setSelectedStoreId('all');
                    setActivePage('FINANCE');
                    navigate('/finance');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                  title="Автоматически перейти в Центральную кассу"
                >
                  <Landmark className="w-3 h-3" />
                  <span>В Центр</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vertical List of Menu Items */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
        {navGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.roles.includes(userRole));
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
                  const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === (isSeller ? 'SALE' : 'FINANCE'));
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
                          ? 'bg-accent/15 border-accent/40 text-accent font-semibold shadow-xs'
                          : 'bg-surface hover:bg-surface-raised border-border text-fg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-accent' : 'text-fg-subtle'}`} />
                        <span className="text-xs">{item.label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isNotif && unreadNotifs > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                            {unreadNotifs}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-surface shrink-0">
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-surface-raised hover:bg-danger/10 border border-border hover:border-danger/30 text-fg-muted hover:text-danger text-xs font-semibold transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Выйти из аккаунта</span>
        </button>
      </div>
    </div>
  );
};
