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

export const TabletNavRail: React.FC = () => {
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

  const unreadNotifs = notifications.filter(n => !n.read).length;

  const visibleItems = useMemo(() => {
    if (isSeller) {
      return [
        { id: 'SALE' as PageId, label: 'POS', icon: ShoppingBag },
        { id: 'SALES_HISTORY' as PageId, label: 'Продажи', icon: History },
        { id: 'EXCHANGE' as PageId, label: 'Обмен', icon: RefreshCw },
        { id: 'REPAIR' as PageId, label: 'Ремонт', icon: Wrench },
        { id: 'INVENTORY' as PageId, label: 'Склад', icon: Package },
        { id: 'TRANSFER' as PageId, label: 'Перевод', icon: ArrowLeftRight },
      ];
    }

    if (isCentralCashMode) {
      const items: { id: PageId; label: string; icon: any }[] = [
        { id: 'FINANCE' as PageId, label: 'Финансы', icon: Landmark },
        { id: 'SALES_HISTORY' as PageId, label: 'Продажи', icon: History },
        { id: 'EXPENSES' as PageId, label: 'Расходы', icon: Wallet },
        { id: 'BONUSES' as PageId, label: 'Бонусы', icon: Gift },
        { id: 'INVENTORY' as PageId, label: 'Склад', icon: Package },
      ];
      if (userRole === 'ADMIN') {
        items.push({ id: 'PURCHASE' as PageId, label: 'Приход', icon: PlusCircle });
      }
      items.push(
        { id: 'TRANSFER' as PageId, label: 'Перевод', icon: ArrowLeftRight },
        { id: 'REPAIR' as PageId, label: 'Ремонт', icon: Wrench }
      );
      if (userRole === 'ADMIN') {
        items.push({ id: 'SUPPLIERS' as PageId, label: 'Поставщ.', icon: Truck });
      }
      items.push({ id: 'OWNERS' as PageId, label: 'Партнеры', icon: Users });
      if (userRole === 'ADMIN') {
        items.push(
          { id: 'EMPLOYEES' as PageId, label: 'Кадры', icon: UserCheck },
          { id: 'AUDIT_LOG' as PageId, label: 'Аудит', icon: FileText }
        );
      }
      items.push(
        { id: 'NOTIFICATIONS' as PageId, label: 'Увед.', icon: Bell },
        { id: 'SETTINGS' as PageId, label: 'Опции', icon: Settings }
      );
      return items;
    }

    // Retail Store Selling Mode for Admin
    return [
      { id: 'SALE' as PageId, label: 'POS', icon: ShoppingBag },
      { id: 'SALES_HISTORY' as PageId, label: 'Продажи', icon: History },
      { id: 'EXCHANGE' as PageId, label: 'Обмен', icon: RefreshCw },
      { id: 'REPAIR' as PageId, label: 'Ремонт', icon: Wrench },
      { id: 'INVENTORY' as PageId, label: 'Склад', icon: Package },
      { id: 'TRANSFER' as PageId, label: 'Перевод', icon: ArrowLeftRight },
      { id: 'FINANCE' as PageId, label: 'Финансы', icon: Landmark },
      { id: 'EXPENSES' as PageId, label: 'Расходы', icon: Wallet },
      { id: 'BONUSES' as PageId, label: 'Бонусы', icon: Gift },
      { id: 'OWNERS' as PageId, label: 'Партнеры', icon: Users },
      { id: 'NOTIFICATIONS' as PageId, label: 'Увед.', icon: Bell },
      { id: 'SETTINGS' as PageId, label: 'Опции', icon: Settings },
    ];
  }, [isSeller, isCentralCashMode]);

  return (
    <aside className="hidden md:flex lg:hidden flex-col w-20 border-r border-border bg-surface text-fg-muted select-none shrink-0 h-full sticky top-0 py-3 items-center justify-between z-30">
      <div className="flex flex-col items-center gap-1.5 w-full px-2">
        {!isSeller ? (
          <button
            type="button"
            onClick={() => {
              if (!isCentralCashMode) {
                setSelectedStoreId('all');
                setActivePage('FINANCE');
                navigate('/finance');
              } else if (location.pathname !== '/finance') {
                setActivePage('FINANCE');
                navigate('/finance');
              } else {
                setStoreSwitchModalOpen(true);
              }
            }}
            className={`w-12 h-12 rounded-xl border flex flex-col items-center justify-center transition-all active:scale-95 shadow-xs cursor-pointer ${
              isCentralCashMode
                ? 'bg-accent/15 border-accent/40 text-accent hover:bg-accent/25'
                : 'bg-warning/15 border-warning/40 text-warning hover:bg-warning/25'
            }`}
            title={
              isCentralCashMode
                ? location.pathname === '/finance'
                  ? 'Центральная касса (Нажмите для выбора магазина)'
                  : 'Перейти в Центральную кассу'
                : `${activeRetailStore?.name || 'Магазин'} (Нажмите для перехода в Центральную кассу)`
            }
          >
            {isCentralCashMode ? <Landmark className="w-5 h-5" /> : <Store className="w-5 h-5" />}
            <span className="text-[8px] font-bold uppercase mt-0.5 tracking-tighter truncate max-w-[40px]">
              {isCentralCashMode ? 'Офис' : 'В Центр'}
            </span>
          </button>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 text-accent font-extrabold text-xs flex items-center justify-center">
            POS
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-none py-3 space-y-1.5 w-full px-2 flex flex-col items-center">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const routePath = PAGE_ROUTES[item.id] || '/sale';
          const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === (isSeller ? 'SALE' : 'FINANCE'));

          return (
            <button
              key={item.id}
              onClick={() => {
                setActivePage(item.id);
                navigate(routePath);
              }}
              className={`w-full min-h-10 py-1.5 rounded-lg flex flex-col items-center justify-center transition-colors relative ${
                isActive ? 'bg-accent/15 text-accent font-bold' : 'text-fg-subtle hover:text-fg-muted hover:bg-surface-raised'
              }`}
              title={item.label}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] mt-0.5 tracking-tight leading-none truncate max-w-15">
                {item.label}
              </span>

              {item.id === 'NOTIFICATIONS' && unreadNotifs > 0 && (
                <span className="absolute top-1 right-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-danger px-1 text-[8px] font-bold text-white">
                  {unreadNotifs}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col items-center pt-2 border-t border-border w-full px-2">
        <button
          onClick={logout}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-raised hover:bg-danger/10 text-fg-muted hover:text-danger border border-border transition-colors"
          title="Выйти из системы"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
