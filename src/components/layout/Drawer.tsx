import React, { useMemo } from 'react';
import { useCollapsedNavGroups } from '../../hooks/useCollapsedNavGroups';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useUIStore } from '../../stores/useUIStore';
import { PageId } from '../../types';
import { formatUserName } from '../../utils/formatUser';
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
  PackagePlus,
} from 'lucide-react';
import { NAV_PAGE_ROUTES } from '../../router/navRoutes';

interface NavGroup {
  title: string;
  items: {
    id: PageId;
    label: string;
    icon: React.ElementType;
    roles: ('ADMIN' | 'PARTNER' | 'SELLER')[];
  }[];
}

const ITEM_STYLES: Record<string, { bg: string; text: string }> = {
  SALE: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  SALES_HISTORY: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  EXCHANGE: { bg: 'bg-violet-500/10 dark:bg-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
  REPAIR: { bg: 'bg-orange-500/10 dark:bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400' },
  INVENTORY: { bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  RECEIPTS: { bg: 'bg-teal-500/10 dark:bg-teal-500/20', text: 'text-teal-600 dark:text-teal-400' },
  TRANSFER: { bg: 'bg-sky-500/10 dark:bg-sky-500/20', text: 'text-sky-600 dark:text-sky-400' },
  PURCHASE: { bg: 'bg-cyan-500/10 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400' },
  EXPENSES: { bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
  FINANCE: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  BONUSES: { bg: 'bg-fuchsia-500/10 dark:bg-fuchsia-500/20', text: 'text-fuchsia-600 dark:text-fuchsia-400' },
  OWNERS: { bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
  SUPPLIERS: { bg: 'bg-sky-500/10 dark:bg-sky-500/20', text: 'text-sky-600 dark:text-sky-400' },
  EMPLOYEES: { bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  AUDIT_LOG: { bg: 'bg-slate-500/10 dark:bg-slate-500/20', text: 'text-slate-600 dark:text-slate-400' },
  NOTIFICATIONS: { bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  SETTINGS: { bg: 'bg-zinc-500/10 dark:bg-zinc-500/20', text: 'text-zinc-600 dark:text-zinc-400' },
};

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

  const { isCollapsed: isGroupCollapsed, toggle: toggleGroup } = useCollapsedNavGroups();

  const userRole = currentUser?.role || 'SELLER';
  const isSeller = userRole === 'SELLER';
  const isPartner = userRole === 'PARTNER';
  const isAdmin = userRole === 'ADMIN';
  const isStoreScoped = isSeller || isPartner;
  const cleanDisplayName = formatUserName(currentUser?.name);
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
            { id: 'RECEIPTS', label: 'Приход товара', icon: PackagePlus, roles: ['SELLER'] },
            { id: 'TRANSFER', label: 'Отправка на склад', icon: ArrowLeftRight, roles: ['SELLER'] },
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
            { id: 'RECEIPTS', label: 'Приход товара', icon: PackagePlus, roles: ['PARTNER'] },
            { id: 'TRANSFER', label: 'Отправка на склад', icon: ArrowLeftRight, roles: ['PARTNER'] },
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
            { id: 'RECEIPTS', label: 'Приходы магазинов', icon: PackagePlus, roles: ['ADMIN'] },
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
          { id: 'RECEIPTS', label: 'Приходы магазина', icon: PackagePlus, roles: ['ADMIN'] },
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

  React.useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    document.documentElement.setAttribute('data-drawer-open', 'true');
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.documentElement.removeAttribute('data-drawer-open');
    };
  }, [drawerOpen, setDrawerOpen]);

  if (!drawerOpen) return null;

  return (
    <>
      {/* Backdrop overlay for outside click to collapse */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <div className="app-safe-area fixed inset-0 z-50 flex md:hidden flex-col bg-bg text-fg-muted w-full h-full overflow-hidden shadow-2xl animate-in slide-in-from-top-2 duration-200">
        {/* Header */}
        <div className="p-3.5 border-b border-border bg-surface flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center shadow-xs">
                {cleanDisplayName.substring(0, 2).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-fg truncate leading-tight">
                  {cleanDisplayName}
                </h2>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-surface-raised border border-border text-fg-subtle shrink-0">
                  {isAdmin ? 'Админ' : isPartner ? 'Партнер' : 'Продавец'}
                </span>
              </div>
              {isStoreScoped ? (
                userStoreName ? (
                  <p className="text-[11px] font-medium text-fg-subtle truncate flex items-center gap-1 mt-0.5">
                    <Store className="w-3 h-3 text-accent shrink-0" />
                    <span>{userStoreName}</span>
                  </p>
                ) : null
              ) : (
                <p className="text-[11px] font-medium text-accent truncate flex items-center gap-1 mt-0.5">
                  {isCentralCashMode ? (
                    <>
                      <Landmark className="w-3 h-3 shrink-0" />
                      <span>Центральная касса</span>
                    </>
                  ) : (
                    <>
                      <Store className="w-3 h-3 shrink-0" />
                      <span>{activeRetailStore?.name || 'Магазин'}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Закрыть меню"
            className="w-8.5 h-8.5 rounded-full flex items-center justify-center bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg transition-all active:scale-90 cursor-pointer shadow-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Banner for Admin only */}
        {isAdmin && (
          <div className="p-3 border-b border-border/80 bg-surface-raised/30 shrink-0">
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
                className="p-3 rounded-xl bg-surface border border-accent/25 hover:border-accent/40 space-y-2 cursor-pointer transition-colors shadow-xs"
                title="Перейти в Центральную кассу (Финансы)"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                      <Landmark className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-accent">Центральная касса</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      </div>
                      <p className="text-[11px] text-fg-subtle">Главный офис и финансовый учёт</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrawerOpen(false);
                    setStoreSwitchModalOpen(true);
                  }}
                  className="w-full h-8 px-2.5 rounded-lg bg-surface-raised hover:bg-accent hover:text-accent-fg border border-border text-xs font-semibold text-fg flex items-center justify-between transition-all shadow-xs active:scale-[0.98] cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-accent" />
                    <span>Выбрать магазин для продаж</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-surface border border-border shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Store className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Режим продаж</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      </div>
                      <p className="text-xs font-bold text-fg truncate leading-tight">
                        {activeRetailStore?.name || 'Магазин'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      setStoreSwitchModalOpen(true);
                    }}
                    className="h-8.5 px-2.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-xs font-medium text-fg flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  >
                    <Store className="w-3.5 h-3.5 text-fg-subtle" />
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
                    className="h-8.5 px-2.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    <span>В Центр</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vertical List of Menu Items with Collapsible/Expandable Sections */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {navGroups.map((group, gIdx) => {
            const visibleItems = group.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;
            const isCollapsed = isGroupCollapsed(group.title);

            return (
              <div key={gIdx} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center justify-between px-1.5 py-1 text-[11px] font-bold text-fg-subtle uppercase tracking-wider hover:text-fg transition-colors select-none group"
                >
                  <span className="group-hover:text-fg transition-colors">{group.title}</span>
                  <span className="flex items-center gap-1 text-[10px] lowercase font-normal opacity-70 group-hover:opacity-100 transition-opacity">
                    <span>{isCollapsed ? 'развернуть' : 'свернуть'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="rounded-2xl bg-surface border border-border shadow-xs divide-y divide-border/60 overflow-hidden">
                    {visibleItems.map(item => {
                      const Icon = item.icon;
                      const routePath = NAV_PAGE_ROUTES[item.id] || '/sale';
                      const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === (isStoreScoped ? 'SALE' : 'FINANCE'));
                      const isNotif = item.id === 'NOTIFICATIONS';
                      const style = ITEM_STYLES[item.id] || { bg: 'bg-surface-raised', text: 'text-fg-subtle' };

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActivePage(item.id);
                            navigate(routePath);
                            setDrawerOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors active:bg-surface-raised cursor-pointer ${
                            isActive
                              ? 'bg-accent/10 text-accent font-semibold'
                              : 'hover:bg-surface-raised/70 text-fg'
                          }`}
                        >
                          <div className="flex items-center gap-3 truncate min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                              isActive
                                ? 'bg-accent text-accent-fg shadow-xs scale-105'
                                : `${style.bg} ${style.text}`
                            }`}>
                              <Icon className="w-4.5 h-4.5" />
                            </div>
                            <span className="text-[13px] font-medium truncate leading-tight">{item.label}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isNotif && unreadNotifs > 0 && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white shadow-xs">
                                {unreadNotifs}
                              </span>
                            )}
                            <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'text-accent' : 'text-fg-subtle/40'}`} />
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
        <div className="p-3 pb-[calc(1rem+var(--bottom-nav-pb))] border-t border-border bg-surface shrink-0">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-surface-raised hover:bg-danger/10 border border-border hover:border-danger/30 text-fg-muted hover:text-danger text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
          >
            <LogOut className="w-4 h-4" />
            <span>Выйти из аккаунта</span>
          </button>
        </div>
      </div>
    </>
  );
};
