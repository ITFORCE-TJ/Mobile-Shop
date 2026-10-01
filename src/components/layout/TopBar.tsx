import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useUIStore } from '../../stores/useUIStore';
import {
  Bell,
  Store,
  Landmark,
  ArrowRight,
} from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';

export const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    activePage,
    setActivePage,
    stores,
    selectedStoreId,
    setSelectedStoreId,
  } = useAppFields(
    'currentUser',
    'activePage',
    'setActivePage',
    'stores',
    'selectedStoreId',
    'setSelectedStoreId'
  );
  const { notifications } = useNotifications();
  const {
    setStoreSwitchModalOpen,
    triggerStoreTransition,
  } = useUIStore();

  const isStoreScoped = currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isCentralCashMode = isAdmin && (!selectedStoreId || selectedStoreId === 'all');
  const activeRetailStore = isAdmin && !isCentralCashMode ? stores.find(s => s.id === selectedStoreId && !s.isMainWarehouse) : null;
  const storeName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;

  const unreadNotifsCount = notifications.filter(n => !n.read).length;

  const getPageTitle = () => {
    switch (activePage) {
      case 'SALE': return 'POS Терминал';
      case 'SALES_HISTORY': return 'История продаж';
      case 'INVENTORY': return 'Склад товаров';
      case 'PURCHASE': return 'Приходы товара';
      case 'TRANSFER': return isStoreScoped ? 'Отправка на склад' : 'Перемещение';
      case 'EXCHANGE': return 'Обмен Trade-In';
      case 'REPAIR': return 'Сервис и ремонт';
      case 'SUPPLIERS': return 'Поставщики';
      case 'BONUSES': return 'Бонусы';
      case 'EXPENSES': return 'Расходы';
      case 'OWNERS': return 'Партнеры и капитал';
      case 'EMPLOYEES': return 'Сотрудники';
      case 'REPORTS': return 'Финансовые отчёты';
      case 'FINANCE': return 'Финансы';
      case 'AUDIT_LOG': return 'Журнал аудита';
      case 'SETTINGS': return 'Настройки';
      case 'NOTIFICATIONS': return 'Уведомления';
      default: return 'Mobile Shop';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-surface px-3 md:px-4 select-none shrink-0 gap-2">
      {/* Left: Page Title (on phones the menu opens from the bottom navigation) */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="min-w-0">
          <h1 className="text-sm md:text-base font-bold text-fg truncate tracking-tight">
            {getPageTitle()}
          </h1>
          {isStoreScoped && (
            <p className="text-[11px] text-fg-subtle truncate flex items-center">
              <Store className="w-2.5 h-2.5 mr-1 text-accent shrink-0 inline" />
              <span className="truncate">{formatStoreName(storeName) || 'Магазин не привязан'}</span>
            </p>
          )}
        </div>
      </div>

      {/* Center/Right: Quick Switcher for Admin only */}
      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            {isCentralCashMode ? (
              <button
                type="button"
                onClick={() => setStoreSwitchModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-raised hover:bg-accent hover:text-accent-fg border border-border text-xs font-semibold text-fg transition-all shadow-2xs active:scale-95 cursor-pointer"
                title="Перейти в режим розничных продаж"
              >
                <Store className="w-3.5 h-3.5 text-accent" />
                <span className="hidden sm:inline">Продавать в магазине</span>
                <span className="sm:hidden">Магазины</span>
                <ArrowRight className="w-3 h-3 opacity-60" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStoreSwitchModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                  title="Сменить магазин"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span className="max-w-30 sm:max-w-none truncate">{formatStoreName(activeRetailStore?.name) || 'Магазин'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerStoreTransition({
                      storeName: 'Центральная касса (Главный офис)',
                      storeId: 'all',
                      isCentral: true,
                    });
                    setSelectedStoreId('all');
                    setActivePage('FINANCE');
                    navigate('/finance');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-raised hover:bg-accent hover:text-accent-fg border border-border text-xs font-semibold text-fg transition-all shadow-2xs active:scale-95 cursor-pointer"
                  title="Вернуться в Центральную кассу"
                >
                  <Landmark className="w-3.5 h-3.5 text-accent" />
                  <span className="hidden md:inline">В Центральную кассу</span>
                  <span className="md:hidden">В центр</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Notifications button (hidden for PARTNER) */}
        {currentUser?.role !== 'PARTNER' && (
          <button
            onClick={() => {
              if (activePage === 'NOTIFICATIONS') {
                setActivePage(isStoreScoped ? 'SALE' : 'FINANCE');
                navigate(isStoreScoped ? '/sale' : '/finance');
              } else {
                setActivePage('NOTIFICATIONS');
                navigate('/notifications');
              }
            }}
            aria-label={activePage === 'NOTIFICATIONS' ? 'Закрыть уведомления' : 'Уведомления'}
            className={`relative inline-flex items-center justify-center w-[44px] h-[44px] md:w-9 md:h-9 rounded-lg transition-colors active:scale-95 border cursor-pointer ${
              activePage === 'NOTIFICATIONS'
                ? 'bg-accent/15 text-accent border-accent/40'
                : 'text-fg-muted hover:text-fg hover:bg-surface-raised border-border'
            }`}
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                {unreadNotifsCount}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
};
