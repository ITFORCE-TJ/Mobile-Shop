import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { Store } from '../../types';
import {
  Store as StoreIcon,
  Landmark,
  ArrowRight,
  X,
  Coins,
  Package,
} from 'lucide-react';
import { soundEffects } from '../../utils/sound';

interface StoreSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StoreSwitchModal: React.FC<StoreSwitchModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const {
    currentUser,
    stores,
    devices,
    selectedStoreId,
    setSelectedStoreId,
    activePage,
    setActivePage,
  } = useAppFields(
    'currentUser',
    'stores',
    'devices',
    'selectedStoreId',
    'setSelectedStoreId',
    'activePage',
    'setActivePage'
  );

  const retailStores = React.useMemo(() => {
    return stores.filter((s) => !s.isMainWarehouse);
  }, [stores]);

  const isCentralCashActive = !selectedStoreId || selectedStoreId === 'all';
  const currentStore = retailStores.find((s) => s.id === selectedStoreId);

  if (!isOpen) return null;

  const handleSelectStore = (store: Store) => {
    try {
      soundEffects.playAddToCartSuccess();
    } catch (_) {}

    setSelectedStoreId(store.id);
    setActivePage('SALE');
    navigate('/sale');
    onClose();
  };

  const handleReturnToCentral = () => {
    try {
      soundEffects.playAddToCartSuccess();
    } catch (_) {}

    setSelectedStoreId('all');
    setActivePage('FINANCE');
    navigate('/finance');
    onClose();
  };

  // Selection Modal View
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center">
              <StoreIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-fg">Выбор магазина для продаж</h3>
              <p className="text-[11px] text-fg-subtle">
                Выберите торговую точку для активации кассы и POS-терминала
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current status pill */}
        <div className="p-3 rounded-xl bg-surface-raised/70 border border-border shrink-0 flex items-center justify-between">
          <div className="space-y-0.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">
              Текущий рабочий режим:
            </span>
            <div className="text-xs font-bold text-fg flex items-center gap-1.5 truncate">
              {isCentralCashActive ? (
                <>
                  <Landmark className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>Центральная касса (Главный офис)</span>
                </>
              ) : (
                <>
                  <StoreIcon className="w-3.5 h-3.5 text-warning shrink-0" />
                  <span>Режим продаж: {currentStore?.name || 'Магазин'}</span>
                </>
              )}
            </div>
          </div>

          {!isCentralCashActive && (
            <button
              type="button"
              onClick={handleReturnToCentral}
              className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-semibold text-xs flex items-center gap-1 transition-colors shrink-0 shadow-xs"
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>В Центр. кассу</span>
            </button>
          )}
        </div>

        {/* Store list */}
        <div className="space-y-2.5 flex-1 overflow-y-auto pr-0.5">
          <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider block px-1">
            Центральное управление
          </span>

          {/* Dedicated Central Cash Card */}
          <div
            onClick={handleReturnToCentral}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
              isCentralCashActive
                ? 'bg-accent/10 border-accent/50 shadow-xs'
                : 'bg-surface hover:bg-accent/5 border-border hover:border-accent/40'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  isCentralCashActive
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'bg-surface-raised border border-border text-accent group-hover:bg-accent group-hover:text-accent-fg'
                }`}
              >
                <Landmark className="w-4 h-4" />
              </div>

              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-fg truncate">
                    Центральная касса (Главный офис)
                  </span>
                  {isCentralCashActive && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-accent/20 text-accent border border-accent/30">
                      Активна
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Финансовый учёт, касса, отчёты, расходы и прибыль
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-accent shrink-0 group-hover:translate-x-0.5 transition-transform">
              <span className="hidden sm:inline">
                {isCentralCashActive ? 'Выбрана' : 'Перейти'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider block px-1 pt-1.5">
            Розничные торговые точки ({retailStores.length})
          </span>

          {retailStores.map((store) => {
            const isSelected = selectedStoreId === store.id;
            const storeStock = devices.filter(
              (d) =>
                (d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE') &&
                d.locationId === store.id
            ).length;

            return (
              <div
                key={store.id}
                onClick={() => handleSelectStore(store)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                  isSelected
                    ? 'bg-accent/10 border-accent/50 shadow-xs'
                    : 'bg-surface hover:bg-surface-raised border-border hover:border-accent/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-accent text-accent-fg'
                        : 'bg-surface-raised border border-border text-fg-muted group-hover:text-accent group-hover:border-accent/30'
                    }`}
                  >
                    <StoreIcon className="w-4 h-4" />
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-fg truncate">{store.name}</span>
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-accent/20 text-accent border border-accent/30">
                          Активен
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-fg-subtle flex-wrap font-mono">
                      <span className="flex items-center gap-1">
                        <Coins className="w-3 h-3 text-fg-subtle" />
                        Касса: {(store.cashBalanceTjs || 0).toLocaleString()} TJS
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3 text-fg-subtle" />
                        {storeStock} шт.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent shrink-0 group-hover:translate-x-0.5 transition-transform">
                  <span className="hidden sm:inline">
                    {isSelected ? 'Выбран' : 'Перейти'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info & Central Cash option */}
        <div className="pt-2 border-t border-border flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-raised border border-border text-xs font-semibold text-fg hover:bg-surface-raised/80 transition-colors"
          >
            Отмена
          </button>

          {!isCentralCashActive && (
            <button
              type="button"
              onClick={handleReturnToCentral}
              className="px-3.5 py-2 rounded-xl bg-surface-raised hover:bg-accent/10 border border-border hover:border-accent/30 text-xs font-semibold text-accent flex items-center gap-1.5 transition-colors"
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Вернуться в Центральную кассу</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
