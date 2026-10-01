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
  Landmark,
  Store,
  Sparkles,
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

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    setActivePage,
    logout,
    stores,
    selectedStoreId,
    setSelectedStoreId,
  } = useAppFields(
    'currentUser',
    'setActivePage',
    'logout',
    'stores',
    'selectedStoreId',
    'setSelectedStoreId'
  );
  const { notifications } = useNotifications();
  const { setStoreSwitchModalOpen } = useUIStore();

  const userRole = currentUser?.role || 'SELLER';
  const isSeller = userRole === 'SELLER';
  const isCentralCashMode = !isSeller && (!selectedStoreId || selectedStoreId === 'all');
  const activeRetailStore = !isSeller && !isCentralCashMode ? stores.find(s => s.id === selectedStoreId && !s.isMainWarehouse) : null;
  const sellerStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;

  const unreadNotifs = notifications.filter(n => !n.read).length;

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
            { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['SELLER'] },
          ],
        },
      ];
    }

    // 2. Admin/Partner in Central Cash Mode (Default upon login)
    // Only Central Cash & Management items appear — Retail POS is hidden to keep focus clean.
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
            { id: 'PURCHASE', label: 'Приходы (партии)', icon: PlusCircle, roles: ['ADMIN', 'PARTNER'] },
            { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER'] },
            { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER'] },
            { id: 'SUPPLIERS', label: 'Поставщики', icon: Truck, roles: ['ADMIN', 'PARTNER'] },
          ],
        },
        {
          title: 'Управление',
          items: [
            { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
            { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
            { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER'] },
            { id: 'SETTINGS', label: 'Настройки', icon: Settings, roles: ['ADMIN', 'PARTNER'] },
          ],
        },
      ];
    }

    // 3. Admin/Partner in Retail Store Mode (selling at chosen store)
    return [
      {
        title: `Продажи: ${activeRetailStore?.name || 'Магазин'}`,
        items: [
          { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER'] },
          { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN', 'PARTNER'] },
          { id: 'EXCHANGE', label: 'Обмен Trade-In', icon: RefreshCw, roles: ['ADMIN', 'PARTNER'] },
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
        title: 'Управление',
        items: [
          { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
          { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
          { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER'] },
          { id: 'SETTINGS', label: 'Настройки', icon: Settings, roles: ['ADMIN', 'PARTNER'] },
        ],
      },
    ];
  }, [isSeller, isCentralCashMode, activeRetailStore]);

  return (
    <aside className="hidden lg:flex flex-col w-60 border-r border-border bg-surface text-fg-muted select-none shrink-0 h-full sticky top-0">
      {/* Brand Header */}
      <div className="h-14 flex items-center px-4 border-b border-border justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
          <span className="font-bold text-xs tracking-wider text-fg-muted uppercase">Mobile Shop</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised border border-border text-fg-subtle font-semibold">
          {isSeller ? 'POS' : isCentralCashMode ? 'ОФИС' : 'РОЗНИЦА'}
        </span>
      </div>

      {/* Admin Mode Switcher Card */}
      {!isSeller && (
        <div className="px-2.5 pt-2.5 pb-1 shrink-0">
          {isCentralCashMode ? (
            <div
              onClick={() => {
                setSelectedStoreId('all');
                setActivePage('FINANCE');
                navigate('/finance');
              }}
              className="p-2.5 rounded-xl bg-accent/5 hover:bg-accent/10 border border-accent/25 space-y-1.5 shadow-2xs cursor-pointer transition-colors group"
              title="Перейти в Центральную кассу (Финансы)"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1.5 group-hover:underline">
                  <Landmark className="w-3.5 h-3.5" />
                  Центральная касса
                </span>
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              </div>
              <p className="text-[11px] text-fg-subtle leading-tight group-hover:text-fg transition-colors">
                Режим главного офиса и финансового учёта
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStoreSwitchModalOpen(true);
                }}
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-accent hover:text-accent-fg border border-border text-[11px] font-semibold text-fg flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <Store className="w-3.5 h-3.5" />
                <span>Продавать в магазине</span>
                <ArrowRight className="w-3 h-3 ml-auto opacity-70" />
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-warning/10 border border-warning/30 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-warning flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5" />
                  Режим продаж
                </span>
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              </div>
              <p className="text-xs font-bold text-fg truncate">
                {activeRetailStore?.name || 'Магазин'}
              </p>
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setStoreSwitchModalOpen(true)}
                  className="px-2 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-[10px] font-semibold text-fg flex items-center justify-center gap-1 transition-all"
                >
                  <Store className="w-3 h-3 text-fg-subtle" />
                  <span>Сменить</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStoreId('all');
                    setActivePage('FINANCE');
                    navigate('/finance');
                  }}
                  className="px-2 py-1 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-[10px] font-bold flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
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

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto scrollbar-none px-2.5 py-2 space-y-3">
        {navGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-0.5">
              <span className="text-[10px] font-semibold text-fg-subtle tracking-wide px-2 uppercase block mb-1">
                {group.title}
              </span>
              <div className="space-y-0.5">
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
                      }}
                      className={`w-full flex items-center justify-between h-9 px-2.5 rounded-lg text-xs font-medium transition-colors ${
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
            </div>
          );
        })}
      </nav>

      {/* User profile & Store info footer */}
      <div className="p-2.5 border-t border-border flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center shrink-0">
          {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'US'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-fg-muted truncate">{currentUser?.name || 'Пользователь'}</p>
          {isSeller ? (
            <p className="text-[10px] text-accent truncate flex items-center gap-1" title={sellerStoreName}>
              <Store className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{sellerStoreName || 'Магазин не привязан'}</span>
            </p>
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

      <div className="p-2.5 pt-0 shrink-0">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-surface-raised hover:bg-danger/10 border border-border hover:border-danger/30 text-fg-muted hover:text-danger h-9 text-xs font-semibold transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Выход</span>
        </button>
      </div>
    </aside>
  );
};
