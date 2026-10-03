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
  Coins,
} from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';
import { formatUserName } from '../../utils/formatUser';

export const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    activePage,
    setActivePage,
    stores,
    selectedStoreId,
    setSelectedStoreId,
    todayRate,
  } = useAppFields(
    'currentUser',
    'activePage',
    'setActivePage',
    'stores',
    'selectedStoreId',
    'setSelectedStoreId',
    'todayRate'
  );
  const { notifications } = useNotifications();
  const {
    setStoreSwitchModalOpen,
    triggerStoreTransition,
    setDailyRateModalOpen,
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
      case 'RECEIPTS': return isStoreScoped ? 'Приёмка товаров' : 'Приходы в магазины';
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

      {/* Center/Right: Quick Actions & Profile on Desktop */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Live Daily Exchange Rate (desktop/tablet) */}
        {todayRate && (
          <button
            type="button"
            onClick={() => {
              if (isAdmin) setDailyRateModalOpen(true);
            }}
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-raised border border-border text-xs font-semibold text-fg transition-all shadow-2xs select-none ${
              isAdmin ? 'hover:bg-surface hover:border-accent/40 active:scale-95 cursor-pointer' : 'cursor-default'
            }`}
            title={isAdmin ? "Курс валют на сегодня. Нажмите для изменения" : "Курс валют на сегодня"}
          >
            <Coins className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="text-[10px] uppercase font-bold text-fg-subtle">USD/TJS</span>
            <span className="font-mono text-accent font-bold">{todayRate.rate}</span>
          </button>
        )}

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
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => setStoreSwitchModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer shrink-0"
                  title="Сменить магазин"
                >
                  <Store className="w-3.5 h-3.5 shrink-0" />
                  <span className="max-w-[75px] sm:max-w-none truncate">{formatStoreName(activeRetailStore?.name) || 'Магазин'}</span>
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
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-surface-raised hover:bg-accent hover:text-accent-fg border border-border text-xs font-semibold text-fg transition-all shadow-2xs active:scale-95 cursor-pointer shrink-0"
                  title="Вернуться в Центральную кассу"
                >
                  <Landmark className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="hidden sm:inline">В Центральную кассу</span>
                  <span className="sm:hidden">В центр</span>
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

        {/* User Identity Chip on Desktop */}
        <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-border/80">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/25 text-accent font-bold text-xs flex items-center justify-center shrink-0">
            {formatUserName(currentUser?.name).substring(0, 2).toUpperCase()}
          </div>
          <div className="text-left text-xs leading-tight">
            <div className="font-semibold text-fg truncate max-w-28 xl:max-w-36">{formatUserName(currentUser?.name)}</div>
            <div className="text-[10px] text-fg-subtle font-medium">
              {currentUser?.role === 'ADMIN' ? 'Администратор' : currentUser?.role === 'PARTNER' ? 'Партнёр' : 'Продавец'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
