import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { Bell, ChevronDown, Store } from 'lucide-react';
import { isStoreScoped } from '../../utils/roles';

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

  // `resolved` tracks whether an actionable notification (e.g. an approval) has been
  // handled — it says nothing about whether the user has actually seen it. Purely
  // informational notifications are created already resolved, so counting only `read`
  // is what makes the badge reflect "new to you", not "still needs action".
  const unreadNotifsCount = notifications.filter(n => !n.read).length;
  const userStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;
  const storeScoped = isStoreScoped(currentUser);
  const currentStoreDisplay = storeScoped
    ? (userStoreName || 'Магазин не привязан')
    : (userStoreName || (selectedStoreId && selectedStoreId !== 'all' ? stores.find(s => s.id === selectedStoreId)?.name : undefined) || 'Все магазины');
  // Global store switcher: ADMIN/PARTNER pick a store once here and every page (sales,
  // stock, expenses, cash, reports) follows it; 'all' is the consolidated network view.
  const retailStores = stores.filter(s => !s.isMainWarehouse && s.active !== false);
  const mainWarehouse = stores.find(s => s.isMainWarehouse);
  const switcherValue = stores.some(s => s.id === selectedStoreId) ? selectedStoreId : 'all';

  const getPageTitle = () => {
    switch (activePage) {
      case 'SALE': return 'POS Терминал';
      case 'SALES_HISTORY': return 'История продаж';
      case 'INVENTORY': return 'Склад товаров';
      case 'PURCHASE': return 'Приходы товара';
      case 'TRANSFER': return 'Перемещение';
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
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-surface px-3 md:px-4 select-none shrink-0">
      {/* Left: Page Title + Store Subtitle */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="min-w-0">
          <h1 className="text-sm md:text-base font-bold text-fg-muted truncate tracking-tight">
            {getPageTitle()}
          </h1>
          {storeScoped ? (
            <p className="text-[11px] text-fg-subtle truncate flex items-center">
              <Store className="w-2.5 h-2.5 mr-1 text-accent shrink-0 inline" />
              <span className="truncate">{currentStoreDisplay}</span>
            </p>
          ) : (
            <label className="relative inline-flex items-center max-w-full text-[11px] text-fg-subtle hover:text-fg cursor-pointer">
              <Store className="w-2.5 h-2.5 mr-1 text-accent shrink-0" />
              <select
                aria-label="Магазин"
                value={switcherValue}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="appearance-none bg-transparent pr-4 font-semibold text-accent truncate max-w-[60vw] sm:max-w-xs focus:outline-none cursor-pointer"
              >
                <option value="all">Все магазины (сводно)</option>
                {retailStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                {mainWarehouse && <option value={mainWarehouse.id}>{mainWarehouse.name} (главный склад)</option>}
              </select>
              <ChevronDown className="w-3 h-3 -ml-3.5 text-accent pointer-events-none shrink-0" />
            </label>
          )}
        </div>
      </div>

      {/* Right: Notifications */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

        <button
          onClick={() => {
            if (activePage === 'NOTIFICATIONS') {
              setActivePage('SALE');
              navigate('/sale');
            } else {
              setActivePage('NOTIFICATIONS');
              navigate('/notifications');
            }
          }}
          aria-label={activePage === 'NOTIFICATIONS' ? 'Закрыть уведомления' : 'Уведомления'}
          className={`relative inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors active:scale-95 border ${
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
      </div>
    </header>
  );
};
