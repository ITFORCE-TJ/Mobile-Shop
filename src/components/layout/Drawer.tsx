import React, { useState, useMemo } from 'react';
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
  ChevronDown,
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
  const { setStoreSwitchModalOpen, triggerStoreTransition } = useUIStore();

  const [collapsedGroups, setCollapsedGroups] = useState<Record<number, boolean>>({});

  const toggleGroup = (index: number) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const userRole = currentUser?.role || 'SELLER';
  const isSeller = userRole === 'SELLER';
  const isPartner = userRole === 'PARTNER';
  const isAdmin = userRole === 'ADMIN';
  const isStoreScoped = isSeller || isPartner;
  const isCentralCashMode = isAdmin && (!selectedStoreId || selectedStoreId === 'all');
  const activeRetailStore = isAdmin && !isCentralCashMode ? stores.find(s => s.id === selectedStoreId && !s.isMainWarehouse) : null;
  const userStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;

  const unreadNotifs = Array.isArray(notifications) ? notifications.filter(n => !n.read).length : 0;

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
          title: 'Склад и касса',
          items: [
            { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['SELLER'] },
            { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['SELLER'] },
            { id: 'EXPENSES', label: 'Расходы кассы', icon: Wallet, roles: ['SELLER'] },
          ],
        },
      ];
    }

    if (isPartner) {
      return [
        {
          title: 'Магазин',
          items: [
            { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['PARTNER'] },
            { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['PARTNER'] },
            { id: 'EXCHANGE', label: 'Обмен (Trade-In)', icon: RefreshCw, roles: ['PARTNER'] },
            { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['PARTNER'] },
          ],
        },
        {
          title: 'Склад',
          items: [
            { id: 'INVENTORY', label: 'Склад магазина', icon: Package, roles: ['PARTNER'] },
            { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['PARTNER'] },
          ],
        },
        {
          title: 'Управление точкой',
          items: [
            { id: 'EXPENSES', label: 'Расходы кассы', icon: Wallet, roles: ['PARTNER'] },
            { id: 'SETTINGS', label: 'Настройки системы', icon: Settings, roles: ['PARTNER'] },
          ],
        },
      ];
    }

    if (isCentralCashMode) {
      return [
        {
          title: 'Центральная касса и финансы',
          items: [
            { id: 'FINANCE', label: 'Финансы и отчёты', icon: Landmark, roles: ['ADMIN'] },
            { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN'] },
            { id: 'EXPENSES', label: 'Расходы кассы', icon: Wallet, roles: ['ADMIN'] },
            { id: 'BONUSES', label: 'Бонусы поставщиков', icon: Gift, roles: ['ADMIN'] },
            { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN'] },
          ],
        },
        {
          title: 'Склад и логистика',
          items: [
            { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['ADMIN'] },
            { id: 'PURCHASE', label: 'Приходы (партии)', icon: PlusCircle, roles: ['ADMIN'] },
            { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN'] },
            { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['ADMIN'] },
            { id: 'SUPPLIERS', label: 'Поставщики', icon: Truck, roles: ['ADMIN'] },
          ],
        },
        {
          title: 'Система и доступ',
          items: [
            { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
            { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
            { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN'] },
            { id: 'SETTINGS', label: 'Настройки системы', icon: Settings, roles: ['ADMIN'] },
          ],
        },
      ];
    }

    // Retail Store mode for Admin
    return [
      {
        title: `Продажи: ${activeRetailStore?.name || 'Магазин'}`,
        items: [
          { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['ADMIN'] },
          { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN'] },
          { id: 'EXCHANGE', label: 'Обмен (Trade-In)', icon: RefreshCw, roles: ['ADMIN'] },
          { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['ADMIN'] },
          { id: 'INVENTORY', label: 'Склад магазина', icon: Package, roles: ['ADMIN'] },
          { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN'] },
        ],
      },
      {
        title: 'Финансы (Центральный офис)',
        items: [
          { id: 'FINANCE', label: 'Финансы', icon: Landmark, roles: ['ADMIN'] },
          { id: 'EXPENSES', label: 'Расходы', icon: Wallet, roles: ['ADMIN'] },
          { id: 'BONUSES', label: 'Бонусы', icon: Gift, roles: ['ADMIN'] },
          { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN'] },
        ],
      },
      {
        title: 'Система и доступ',
        items: [
          { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
          { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
          { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN'] },
          { id: 'SETTINGS', label: 'Настройки системы', icon: Settings, roles: ['ADMIN'] },
        ],
      },
    ];
  }, [isSeller, isPartner, isCentralCashMode, activeRetailStore, userStoreName]);

  if (!drawerOpen) return null;

  return (
    <>
      {/* Backdrop overlay for outside click to collapse */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <div className="app-safe-area fixed inset-x-0 top-0 bottom-[calc(3.5rem+var(--bottom-nav-pb))] z-50 flex md:hidden flex-col bg-bg text-fg-muted w-full overflow-hidden shadow-2xl animate-in slide-in-from-top-2 duration-200">
        {/* Header */}
        <div className="p-3.5 border-b border-border bg-surface flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center shrink-0">
              {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'MS'}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-fg truncate">
                {currentUser?.name || 'Пользователь'}
              </h2>
              <p className="text-[11px] font-medium text-accent truncate">
                {isStoreScoped ? (isPartner ? 'Партнёр' : 'Продавец') : isCentralCashMode ? 'Центральная касса' : `Продажи: ${activeRetailStore?.name || 'Магазин'}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Свернуть меню"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            <X className="w-4 h-4" />
            <span>Свернуть</span>
          </button>
        </div>

        {/* Mode Switcher Banner for Admin only */}
        {isAdmin && (
          <div className="p-3 border-b border-border bg-surface-raised/40 shrink-0">
            {isCentralCashMode ? (
              <div
                onClick={() => {
                  setDrawerOpen(false);
                  triggerStoreTransition({
                    storeName: 'Центральная касса (Главный офис)',
                    storeId: 'all',
                    isCentral: true,
                  });
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
                      triggerStoreTransition({
                        storeName: 'Центральная касса (Главный офис)',
                        storeId: 'all',
                        isCentral: true,
                      });
                      setSelectedStoreId('all');
                      setActivePage('FINANCE');
                      navigate('/finance');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95"
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

        {/* Vertical List of Menu Items with Collapsible/Expandable Sections */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
          {navGroups.map((group, gIdx) => {
            const visibleItems = group.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;
            const isCollapsed = Boolean(collapsedGroups[gIdx]);

            return (
              <div key={gIdx} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(gIdx)}
                  className="w-full flex items-center justify-between px-1 py-1 text-[11px] font-bold text-fg-subtle uppercase tracking-wider hover:text-fg transition-colors select-none group"
                >
                  <span className="group-hover:text-fg transition-colors">{group.title}</span>
                  <span className="flex items-center gap-1 text-[10px] lowercase font-normal opacity-70 group-hover:opacity-100 transition-opacity">
                    <span>{isCollapsed ? 'развернуть' : 'свернуть'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-1.5 pt-0.5 animate-in fade-in-50 duration-150">
                    {visibleItems.map(item => {
                      const Icon = item.icon;
                      const routePath = PAGE_ROUTES[item.id] || '/sale';
                      const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === (isStoreScoped ? 'SALE' : 'FINANCE'));
                      const isNotif = item.id === 'NOTIFICATIONS';

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActivePage(item.id);
                            navigate(routePath);
                            setDrawerOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all active:scale-[0.99] cursor-pointer ${
                            isActive
                              ? 'bg-accent/15 border-accent/40 text-accent font-semibold shadow-xs'
                              : 'bg-surface hover:bg-surface-raised border-border text-fg-muted hover:text-fg'
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
                )}
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
    </>
  );
};
