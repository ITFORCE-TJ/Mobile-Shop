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
  Menu,
  RefreshCw,
  Landmark,
  Wallet,
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

export const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    setActivePage,
    drawerOpen,
    setDrawerOpen,
    selectedStoreId,
  } = useAppFields('currentUser', 'setActivePage', 'drawerOpen', 'setDrawerOpen', 'selectedStoreId');
  const { notifications } = useNotifications();

  const userRole = currentUser?.role || 'SELLER';
  const isSeller = userRole === 'SELLER';
  const isCentralCashMode = !isSeller && (!selectedStoreId || selectedStoreId === 'all');

  const unreadNotifs = notifications.filter(n => !n.read).length;

  const NavItem: React.FC<{ routePath: string; label: string; icon: React.ElementType; onSelect: () => void }> = ({
    routePath,
    label,
    icon: Icon,
    onSelect,
  }) => {
    const isActive = location.pathname === routePath;
    return (
      <button
        onClick={onSelect}
        className={`flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 transition-colors ${
          isActive ? 'text-accent' : 'text-fg-subtle active:text-fg'
        }`}
      >
        <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
        <span className={`text-[10px] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
      </button>
    );
  };

  if (isCentralCashMode) {
    const isFinanceActive = location.pathname === '/finance' || location.pathname === '/';

    return (
      <nav className="app-bottom-nav md:hidden shrink-0 w-full bg-surface border-t border-border flex items-stretch justify-around select-none">
        <NavItem
          routePath="/finance"
          label="Финансы"
          icon={Landmark}
          onSelect={() => {
            setActivePage('FINANCE');
            navigate('/finance');
          }}
        />
        <NavItem
          routePath="/expenses"
          label="Расходы"
          icon={Wallet}
          onSelect={() => {
            setActivePage('EXPENSES');
            navigate('/expenses');
          }}
        />

        {/* Center primary action in Central Cash — Finance Dashboard */}
        <div className="flex-1 flex justify-center items-center relative">
          <button
            onClick={() => {
              setActivePage('FINANCE');
              navigate('/finance');
            }}
            className={`w-14 h-14 -mt-5 rounded-full flex flex-col items-center justify-center active:scale-95 transition-transform shadow-md ${
              isFinanceActive ? 'bg-accent-strong text-accent-fg' : 'bg-accent text-accent-fg'
            }`}
            title="Центральная касса и финансы"
          >
            <Landmark className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-[9px] font-bold tracking-tight leading-none mt-0.5">Офис</span>
          </button>
        </div>

        <NavItem
          routePath="/inventory"
          label="Склад"
          icon={Package}
          onSelect={() => {
            setActivePage('INVENTORY');
            navigate('/inventory');
          }}
        />

        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className={`flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 transition-colors ${
            drawerOpen ? 'text-accent' : 'text-fg-subtle active:text-fg'
          }`}
        >
          <div className="relative">
            <Menu className="w-5 h-5" strokeWidth={drawerOpen ? 2.5 : 2} />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                {unreadNotifs}
              </span>
            )}
          </div>
          <span className={`text-[10px] leading-none ${drawerOpen ? 'font-semibold' : 'font-medium'}`}>Меню</span>
        </button>
      </nav>
    );
  }

  // Retail Store mode / Seller
  const isSaleActive = location.pathname === '/sale' || location.pathname === '/';

  return (
    <nav className="app-bottom-nav md:hidden shrink-0 w-full bg-surface border-t border-border flex items-stretch justify-around select-none">
      <NavItem
        routePath="/inventory"
        label="Склад"
        icon={Package}
        onSelect={() => {
          setActivePage('INVENTORY');
          navigate('/inventory');
        }}
      />
      <NavItem
        routePath="/sales-history"
        label="История"
        icon={History}
        onSelect={() => {
          setActivePage('SALES_HISTORY');
          navigate('/sales-history');
        }}
      />

      {/* Center primary action — POS */}
      <div className="flex-1 flex justify-center items-center relative">
        <button
          onClick={() => {
            setActivePage('SALE');
            navigate('/sale');
          }}
          className={`w-14 h-14 -mt-5 rounded-full flex flex-col items-center justify-center active:scale-95 transition-transform shadow-md ${
            isSaleActive ? 'bg-accent-strong text-accent-fg' : 'bg-accent text-accent-fg'
          }`}
          title="POS Терминал"
        >
          <ShoppingBag className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-[9px] font-bold tracking-tight leading-none mt-0.5">POS</span>
        </button>
      </div>

      <NavItem
        routePath="/exchange"
        label="Обмен"
        icon={RefreshCw}
        onSelect={() => {
          setActivePage('EXCHANGE');
          navigate('/exchange');
        }}
      />

      <button
        onClick={() => setDrawerOpen(!drawerOpen)}
        className={`flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 transition-colors ${
          drawerOpen ? 'text-accent' : 'text-fg-subtle active:text-fg'
        }`}
      >
        <div className="relative">
          <Menu className="w-5 h-5" strokeWidth={drawerOpen ? 2.5 : 2} />
          {unreadNotifs > 0 && (
            <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unreadNotifs}
            </span>
          )}
        </div>
        <span className={`text-[10px] leading-none ${drawerOpen ? 'font-semibold' : 'font-medium'}`}>Меню</span>
      </button>
    </nav>
  );
};
