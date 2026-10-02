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
  Landmark,
  Store,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
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

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    setActivePage,
    logout,
    stores,
    selectedStoreId,
  } = useAppFields(
    'currentUser',
    'setActivePage',
    'logout',
    'stores',
    'selectedStoreId'
  );
  const { notifications } = useNotifications();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const { isCollapsed: isGroupCollapsed, toggle: toggleGroup } = useCollapsedNavGroups();

  const userRole = currentUser?.role || 'SELLER';
  const isSeller = userRole === 'SELLER';
  const isPartner = userRole === 'PARTNER';
  const isAdmin = userRole === 'ADMIN';
  const isStoreScoped = isSeller || isPartner;
  const isCentralCashMode = isAdmin && (!selectedStoreId || selectedStoreId === 'all');
  const activeRetailStore = isAdmin && !isCentralCashMode ? stores.find(s => s.id === selectedStoreId && !s.isMainWarehouse) : null;
  const sellerStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;
  const cleanDisplayName = formatUserName(currentUser?.name);

  const unreadNotifs = Array.isArray(notifications) ? notifications.filter(n => !n.read).length : 0;

  const navGroups = useMemo<NavGroup[]>(() => {
    // 1. Seller always only sees their assigned store's retail operations
    if (isSeller) {
      return [
        {
          title: 'Основное',
          items: [
            { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['SELLER'] },
            { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['SELLER'] },
            { id: 'EXCHANGE', label: 'Обмен Trade-In', icon: RefreshCw, roles: ['SELLER'] },
            { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['SELLER'] },
          ],
        },
        {
          title: 'Склад',
          items: [
            { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['SELLER'] },
            { id: 'RECEIPTS', label: 'Приход товара', icon: PackagePlus, roles: ['SELLER'] },
            { id: 'TRANSFER', label: 'Отправка на склад', icon: ArrowLeftRight, roles: ['SELLER'] },
          ],
        },
      ];
    }

    // 2. Partner: works on site in their own store, has more privileges than seller
    // Strictly hidden: Finance, Bonuses, Owners/Capital, Employees, Audit Log, Notifications
    if (isPartner) {
      return [
        {
          title: 'Магазин',
          items: [
            { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['PARTNER'] },
            { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['PARTNER'] },
            { id: 'EXCHANGE', label: 'Обмен Trade-In', icon: RefreshCw, roles: ['PARTNER'] },
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
            { id: 'SETTINGS', label: 'Настройки', icon: Settings, roles: ['PARTNER'] },
          ],
        },
      ];
    }

    // 3. Admin in Central Cash Mode (Default upon login)
    // Only Central Cash & Management items appear — Retail POS is hidden to keep focus clean.
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
          title: 'Управление',
          items: [
            { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
            { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
            { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN'] },
            { id: 'SETTINGS', label: 'Настройки', icon: Settings, roles: ['ADMIN'] },
          ],
        },
      ];
    }

    // 4. Admin in Retail Store Mode (selling at chosen store)
    return [
      {
        title: `Продажи: ${activeRetailStore?.name || 'Магазин'}`,
        items: [
          { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['ADMIN'] },
          { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN'] },
          { id: 'EXCHANGE', label: 'Обмен Trade-In', icon: RefreshCw, roles: ['ADMIN'] },
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
  }, [isSeller, isPartner, isCentralCashMode, activeRetailStore, sellerStoreName]);

  return (
    <aside className={`hidden lg:flex flex-col border-r border-border bg-surface text-fg-muted select-none shrink-0 h-full sticky top-0 transition-all duration-200 ${
      sidebarCollapsed ? 'w-16' : 'w-60'
    }`}>
      {/* Brand Header */}
      <div className={`h-14 flex items-center border-b border-border shrink-0 ${
        sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'
      }`}>
        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Развернуть боковое меню"
            aria-label="Развернуть боковое меню"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-raised hover:bg-surface border border-border text-accent transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            <PanelLeftOpen className="w-4 h-4 text-fg-muted hover:text-fg" />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-sm bg-accent shrink-0" />
              <span className="font-bold text-xs tracking-wider text-fg-muted uppercase truncate">Mobile Shop</span>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              title="Свернуть боковое меню"
              aria-label="Свернуть боковое меню"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-fg transition-colors cursor-pointer"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        )}
      </div>


      {/* Nav Groups */}
      <nav className={`flex-1 overflow-y-auto scrollbar-none py-2 space-y-2.5 ${sidebarCollapsed ? 'px-1.5' : 'px-2.5'}`}>
        {navGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;
          const isCollapsed = isGroupCollapsed(group.title);

          return (
            <div key={gIdx} className="space-y-0.5">
              {!sidebarCollapsed ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-fg-subtle tracking-wider uppercase hover:text-fg transition-colors select-none group"
                >
                  <span className="truncate group-hover:text-fg">{group.title}</span>
                  <ChevronDown className={`w-3 h-3 text-fg-subtle transition-transform duration-200 shrink-0 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                </button>
              ) : (
                <div className="h-px bg-border/60 my-1 mx-2" />
              )}

              {(!isCollapsed || sidebarCollapsed) && (
                <div className="space-y-0.5">
                  {visibleItems.map(item => {
                    const Icon = item.icon;
                    const routePath = NAV_PAGE_ROUTES[item.id] || '/sale';
                    const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === (isStoreScoped ? 'SALE' : 'FINANCE'));
                    const isNotif = item.id === 'NOTIFICATIONS';

                    if (sidebarCollapsed) {
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActivePage(item.id);
                            navigate(routePath);
                          }}
                          title={item.label}
                          className={`w-10 h-10 mx-auto flex items-center justify-center rounded-xl transition-all relative cursor-pointer ${
                            isActive
                              ? 'bg-accent text-accent-fg shadow-xs font-bold'
                              : 'text-fg-subtle hover:text-fg hover:bg-surface-raised'
                          }`}
                        >
                          <Icon className="w-5 h-5 shrink-0" />
                          {isNotif && unreadNotifs > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger ring-2 ring-surface" />
                          )}
                        </button>
                      );
                    }

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActivePage(item.id);
                          navigate(routePath);
                        }}
                        className={`w-full flex items-center justify-between h-9 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          isActive ? 'bg-accent/10 text-accent font-semibold' : 'text-fg-muted hover:text-fg hover:bg-surface-raised'
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
              )}
            </div>
          );
        })}
      </nav>

      {/* User profile & Store info footer */}
      <div className={`border-t border-border bg-surface shrink-0 ${sidebarCollapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-2.5 space-y-2'}`}>
        {sidebarCollapsed ? (
          <>
            <div
              title={cleanDisplayName}
              className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 text-accent font-bold text-xs flex items-center justify-center cursor-default"
            >
              {cleanDisplayName.substring(0, 2).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={logout}
              title="Выйти из аккаунта"
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-raised hover:bg-danger/10 text-fg-subtle hover:text-danger border border-border hover:border-danger/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <div title={`v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'} (${typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : 'dev'})`} className="text-[9px] font-mono text-fg-subtle opacity-60 text-center select-none truncate max-w-full">
              {typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : 'dev'}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 px-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center shrink-0">
                {cleanDisplayName.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-fg-muted truncate">{cleanDisplayName}</p>
                {isStoreScoped ? (
                  sellerStoreName ? (
                    <p className="text-[10px] text-fg-subtle truncate flex items-center gap-1">
                      <Store className="w-2.5 h-2.5 text-accent shrink-0" />
                      <span>{sellerStoreName}</span>
                    </p>
                  ) : null
                ) : (
                  <p className="text-[10px] text-fg-subtle truncate flex items-center gap-1">
                    {isCentralCashMode ? (
                      <>
                        <Landmark className="w-2.5 h-2.5 text-accent shrink-0" />
                        <span>Центральная касса</span>
                      </>
                    ) : (
                      <>
                        <Store className="w-2.5 h-2.5 text-warning shrink-0" />
                        <span>{activeRetailStore?.name || 'Магазин'}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-0.5">
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-surface-raised hover:bg-danger/10 text-fg-subtle hover:text-danger border border-border hover:border-danger/30 text-xs font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Выход</span>
              </button>
            </div>

            <div className="pt-0.5 px-1 flex items-center justify-between text-[10px] text-fg-subtle opacity-70">
              <span>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}</span>
              <span className="font-mono text-[9px]">{typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : 'dev'}</span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
