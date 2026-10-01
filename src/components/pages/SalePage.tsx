import { decimal, moneyNumber, sumMoney, formatMoney } from '../../utils/money';
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { Device, PaymentMethod } from '../../types';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import {
  Smartphone,
  Trash2,
  AlertTriangle,
  CreditCard,
  Banknote,
  Split,
  CheckCircle2,
  ChevronDown,
  ShoppingCart,
  Store as StoreIcon,
  Plus,
  Flame,
  Landmark,
} from 'lucide-react';
import { SearchBar } from '../ui/SearchBar';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { soundEffects } from '../../utils/sound';

interface CartItem {
  device: Device;
  salePriceTjs?: number;
}

export const SalePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    devices,
    todayRate,
    selectedStoreId,
    setSelectedStoreId,
    stores,
    openScanner,
    createSale,
    isInitialLoading,
    setActivePage,
  } = useAppFields('currentUser', 'devices', 'todayRate', 'selectedStoreId', 'setSelectedStoreId', 'stores', 'openScanner', 'createSale', 'isInitialLoading', 'setActivePage');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [expandedVariantKey, setExpandedVariantKey] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, 'DEBT'>>('CASH');
  const [cashAmountInput, setCashAmountInput] = useState('');
  const [cardAmountInput, setCardAmountInput] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<StatusMessage | null>(null);

  const [completedReceiptNumber, setCompletedReceiptNumber] = useState<number | null>(null);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  const isSeller = currentUser?.role === 'SELLER';
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';
  const isCentralCashMode = !isSeller && (!selectedStoreId || selectedStoreId === 'all');
  const [localSaleStoreId, setLocalSaleStoreId] = useState<string>('');

  const selectableStores = useMemo(() => {
    return stores.filter(s => !s.isMainWarehouse);
  }, [stores]);

  const effectiveStoreId = isSeller
    ? currentUser?.storeId
    : (isCentralCashMode
        ? (selectableStores.some(s => s.id === localSaleStoreId) ? localSaleStoreId : (selectableStores[0]?.id || ''))
        : (selectableStores.some(s => s.id === selectedStoreId) ? selectedStoreId : (selectableStores[0]?.id || '')));

  const activeStore = stores.find(s => s.id === effectiveStoreId);
  const activeStoreName = activeStore?.name || 'Магазин';
  const isCurrentStoreWarehouse = Boolean(activeStore?.isMainWarehouse);

  const availableDevices = useMemo(() => {
    return devices.filter(d => {
      const isAvailableStatus = d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
      if (!isAvailableStatus) return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          d.imei.toLowerCase().includes(q) ||
          (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q) ||
          d.storage.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (selectedBrand !== 'ALL' && d.brand !== selectedBrand) return false;
      if (cart.some(ci => ci.device.id === d.id)) return false;

      return true;
    });
  }, [devices, effectiveStoreId, searchQuery, selectedBrand, cart]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    devices.forEach(d => {
      const isAvailableStatus = d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
      if (!isAvailableStatus) return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;
      if (d.brand?.trim()) set.add(d.brand.trim());
    });
    return [{ value: 'ALL', label: 'Все бренды' }, ...Array.from(set).sort().map(b => ({ value: b, label: b }))];
  }, [devices, effectiveStoreId]);

  const defaultPriceFor = (device: Device): number | undefined =>
    device.retailPriceTjs && device.retailPriceTjs > 0 ? device.retailPriceTjs : undefined;

  const addDeviceToCart = (device: Device) => {
    soundEffects.playAddToCartSuccess();
    setCart(prev => [...prev, { device, salePriceTjs: defaultPriceFor(device) }]);
    setExpandedVariantKey(null);
  };

  const groupedVariants = useMemo(() => {
    const groups: Record<string, {
      variantKey: string;
      brand: string;
      model: string;
      ram?: string;
      storage: string;
      color: string;
      devices: Device[];
    }> = {};

    for (const dev of availableDevices) {
      const ramPart = dev.ram ? dev.ram.trim() : '';
      const key = `${dev.brand}_${dev.model}_${ramPart}_${dev.storage}_${dev.color}`;
      if (!groups[key]) {
        groups[key] = { variantKey: key, brand: dev.brand, model: dev.model, ram: dev.ram, storage: dev.storage, color: dev.color, devices: [] };
      }
      groups[key].devices.push(dev);
    }

    return Object.values(groups);
  }, [availableDevices]);

  const handleSelectVariant = (variant: typeof groupedVariants[0]) => {
    if (variant.devices.length === 1) {
      addDeviceToCart(variant.devices[0]);
    } else {
      setExpandedVariantKey(prev => (prev === variant.variantKey ? null : variant.variantKey));
    }
  };

  const handleUpdatePrice = (index: number, newPrice?: number) => {
    setCart(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        salePriceTjs: newPrice !== undefined && !isNaN(newPrice) && newPrice > 0 ? newPrice : undefined
      };
      return next;
    });
  };

  const handleRemoveFromCart = (index: number) => {
    setCart(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) setIsCartOpen(false);
      return updated;
    });
  };

  const handleTriggerScanner = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const exactDev = devices.find(d =>
        (d.imei === code || d.imei2 === code) &&
        (d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE') &&
        (!effectiveStoreId || d.locationId === effectiveStoreId) &&
        !cart.some(ci => ci.device.id === d.id)
      );

      if (exactDev) {
        addDeviceToCart(exactDev);
        setPaymentStatus(null);
        setIsCartOpen(true);
      } else {
        soundEffects.playError();
        setSearchQuery(code);
      }
    });
  };

  const handleAddMore = () => {
    setIsCartOpen(false);
  };

  const totalTjs = sumMoney(cart.map(item => item.salePriceTjs && item.salePriceTjs > 0 ? item.salePriceTjs : 0));
  const hasEmptyPrice = cart.some(item => item.salePriceTjs === undefined || item.salePriceTjs <= 0);
  const totalUsd = todayRate ? +(totalTjs / todayRate.rate).toFixed(2) : 0;
  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  const isItemBelowCost = (item: CartItem) => {
    if (item.salePriceTjs === undefined || isNaN(item.salePriceTjs)) return false;
    const costTjs = item.device.costBasisUsd * rate;
    return item.salePriceTjs < costTjs;
  };

  const handleOpenCart = () => {
    if (cart.length === 0) return;
    setPaymentMethod('CASH');
    setCashAmountInput(totalTjs > 0 ? totalTjs.toString() : '');
    setCardAmountInput('0');
    setCustomerNameInput('');
    setPaymentStatus(null);
    setIsCartOpen(true);
  };

  const handleFinishPayment = async () => {
    if (isSubmittingSale) return;
    setPaymentStatus(null);

    const invalidItem = cart.find(ci => ci.salePriceTjs === undefined || ci.salePriceTjs <= 0);
    if (invalidItem) {
      setPaymentStatus({ tone: 'error', text: `Укажите цену продажи для устройства: ${invalidItem.device.brand} ${invalidItem.device.model}` });
      return;
    }

    let cashVal = 0;
    let cardVal = 0;

    if (paymentMethod === 'CASH') {
      cashVal = totalTjs;
    } else if (paymentMethod === 'CARD') {
      cardVal = totalTjs;
    } else if (paymentMethod === 'SPLIT') {
      cashVal = parseFloat(cashAmountInput) || 0;
      cardVal = parseFloat(cardAmountInput) || 0;
      if (Math.abs(cashVal + cardVal - totalTjs) > 0.01) {
        setPaymentStatus({ tone: 'error', text: `Сумма наличных (${formatMoney(cashVal)}) + карты (${formatMoney(cardVal)}) не равна итогу (${formatMoney(totalTjs)} TJS)` });
        return;
      }
    }

    if (isCurrentStoreWarehouse) {
      setPaymentStatus({ tone: 'error', text: 'Главный склад предназначен только для хранения телефонов. Продажи со склада запрещены.' });
      return;
    }

    setIsSubmittingSale(true);
    try {
      const res = await createSale({
        items: cart.map(ci => ({ device: ci.device, salePriceTjs: ci.salePriceTjs! })),
        paymentMethod,
        cashAmountTjs: cashVal,
        cardAmountTjs: cardVal,
        customerName: customerNameInput.trim() || undefined,
      });

      if (res.success && res.receiptNumber) {
        setCompletedReceiptNumber(res.receiptNumber);
        setIsCartOpen(false);
        setCart([]);
        setCustomerNameInput('');
      } else {
        setPaymentStatus({ tone: 'error', text: res.message || 'Ошибка оформления продажи' });
      }
    } finally {
      setIsSubmittingSale(false);
    }
  };

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted relative">
      <StatusBanner message={paymentStatus} onDismiss={() => setPaymentStatus(null)} />

      {isCurrentStoreWarehouse && (
        <div className="p-3 bg-warning/15 border-b border-warning/30 text-warning text-xs font-medium flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Главный склад предназначен исключительно для хранения телефонов. Продажи со склада запрещены. Выберите розничную точку продаж.</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="p-2.5 md:p-3 border-b border-border bg-bg space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Block 1: Label badge */}
            <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-surface-raised border border-border text-xs font-medium text-fg-muted shrink-0 shadow-2xs box-border">
              <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Точка:</span>
            </div>

            {/* Block 2: Store selection / display */}
            {isAdmin ? (
              <div className="relative inline-flex items-center h-8 rounded-lg bg-surface border border-border hover:border-accent/40 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-colors shadow-2xs box-border min-w-0">
                <select
                  value={effectiveStoreId}
                  onChange={(e) => {
                    const newStoreId = e.target.value;
                    setSelectedStoreId(newStoreId);
                    setLocalSaleStoreId(newStoreId);
                  }}
                  className="h-full bg-transparent border-0 outline-none focus:outline-none focus:ring-0 cursor-pointer pl-2.5 pr-7 text-xs font-semibold text-fg-muted appearance-none max-w-52 sm:max-w-64 truncate py-0 leading-none m-0"
                >
                  {selectableStores.map(s => (
                    <option key={s.id} value={s.id} className="bg-surface text-fg-muted">
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle pointer-events-none" />
              </div>
            ) : (
              <div className="inline-flex items-center h-8 px-2.5 rounded-lg bg-surface border border-border text-xs font-semibold text-accent truncate shadow-2xs box-border max-w-52 sm:max-w-64">
                {activeStoreName}
              </div>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setSelectedStoreId('all');
                  setActivePage('FINANCE');
                  navigate('/finance');
                }}
                className="inline-flex items-center gap-1 h-8 px-2 sm:px-2.5 rounded-lg bg-surface hover:bg-accent/10 border border-border hover:border-accent/30 text-xs font-semibold text-accent transition-colors shrink-0 shadow-2xs cursor-pointer"
                title="Вернуться в режим Центральной кассы"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">В Центр. кассу</span>
                <span className="sm:hidden">В центр</span>
              </button>
            )}
          </div>

          <span className="text-[11px] text-fg-subtle tabular-nums font-medium">
            В наличии: <strong className="text-fg-muted font-semibold">{availableDevices.length}</strong> шт.
          </span>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onScan={handleTriggerScanner}
          placeholder="Поиск по IMEI / штрихкоду / модели..."
        />

        <FilterPillGroup options={brands} value={selectedBrand} onChange={setSelectedBrand} scrollable />
      </div>

      {/* Catalog */}
      <div className={`flex-1 overflow-y-auto divide-y divide-border ${cart.length > 0 ? 'pb-32 md:pb-24' : 'pb-4'}`}>
        {isInitialLoading ? (
          <LoadingState label="Загрузка каталога…" />
        ) : groupedVariants.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="Товары не найдены"
            description={`В наличии нет устройств по текущим фильтрам (${activeStoreName})`}
            action={
              selectedBrand !== 'ALL' ? (
                <Button variant="secondary" onClick={() => setSelectedBrand('ALL')}>Сбросить фильтр бренда</Button>
              ) : undefined
            }
          />
        ) : (
          groupedVariants.map((variant) => {
            const costs = variant.devices.map(d => d.purchaseCostUsd ?? d.costBasisUsd ?? 0);
            const maxCost = Math.max(...costs);
            const minCost = Math.min(...costs);
            const hasCostVariance = maxCost > minCost;
            const isExpanded = expandedVariantKey === variant.variantKey;
            const sortedDevices = [...variant.devices].sort((a, b) => (b.purchaseCostUsd ?? b.costBasisUsd ?? 0) - (a.purchaseCostUsd ?? a.costBasisUsd ?? 0));

            return (
              <div key={variant.variantKey}>
                <button
                  onClick={() => handleSelectVariant(variant)}
                  className="w-full text-left px-4 py-3 active:bg-surface-raised flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-fg-muted truncate">{variant.brand} {variant.model}</p>
                      {hasCostVariance && (
                        <Badge tone="warning">
                          <Flame className="w-3 h-3 mr-1 inline" />${minCost}–${maxCost}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      {variant.ram ? `${variant.ram} · ` : ''}{variant.storage} · {variant.color}
                    </p>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2">
                    <Badge tone="neutral">{variant.devices.length} шт.</Badge>
                    {variant.devices.length > 1 && (
                      <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="bg-surface/60 border-t border-border px-4 py-2 space-y-2">
                    {hasCostVariance && (
                      <p className="text-xs text-warning font-medium">Рекомендуется первым продать экземпляр за ${maxCost}</p>
                    )}
                    {sortedDevices.map((dev) => {
                      const devCost = dev.purchaseCostUsd ?? dev.costBasisUsd ?? 0;
                      const isHighestCost = hasCostVariance && devCost === maxCost;
                      return (
                        <button
                          key={dev.id}
                          onClick={() => addDeviceToCart(dev)}
                          className={`w-full p-3 text-left rounded-lg flex items-center justify-between gap-2 border transition-colors ${
                            isHighestCost ? 'border-warning bg-warning/10' : 'border-border bg-surface active:bg-surface-raised'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-fg-muted">
                              IMEI: {dev.imei}{dev.imei2 ? ` / ${dev.imei2}` : ''}
                            </p>
                            <p className="text-xs text-fg-subtle mt-0.5">
                              Закупка: ${devCost}
                            </p>
                          </div>
                          <Badge tone={isHighestCost ? 'warning' : 'accent'}>Выбрать</Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Floating cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-18 md:bottom-4 left-3 right-3 md:left-64 md:right-4 z-40 max-w-2xl mx-auto">
          <div className="p-3 rounded-xl bg-surface border border-accent/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 pl-1">
              <div className="w-9 h-9 rounded-lg bg-accent text-accent-fg flex items-center justify-center font-bold text-sm shrink-0">
                {cart.length}
              </div>
              <div className="truncate">
                <span className="text-sm font-bold text-accent block truncate">{formatMoney(totalTjs)} TJS</span>
                <span className="text-xs text-fg-subtle block">≈ ${formatMoney(totalUsd)} USD</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsClearConfirmOpen(true)}
                className="h-9 px-2.5 rounded-lg text-xs font-medium text-fg-subtle hover:text-danger transition-colors"
              >
                Очистить
              </button>
              <Button onClick={handleOpenCart} leftIcon={ShoppingCart}>Оформить</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={isClearConfirmOpen}
        title="Очистить корзину?"
        message={`Из корзины будут удалены все ${cart.length} товар(ов). Это действие нельзя отменить.`}
        confirmLabel="Очистить"
        onConfirm={() => {
          setCart([]);
          setIsClearConfirmOpen(false);
        }}
        onCancel={() => setIsClearConfirmOpen(false)}
      />

      {/* Checkout */}
      <Dialog
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title={`Чек · ${activeStoreName}`}
        subtitle={`${formatMoney(totalTjs)} TJS ≈ $${formatMoney(totalUsd)}`}
        maxWidth="lg"
        footer={
          <div className="w-full grid grid-cols-2 gap-2">
            <div className="col-span-2 flex items-center justify-between pb-2 text-sm">
              <span className="text-fg-muted">К оплате</span>
              <strong className="text-lg tabular-nums text-accent">{formatMoney(totalTjs)} TJS</strong>
            </div>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              leftIcon={Plus}
              disabled={isSubmittingSale}
              onClick={handleAddMore}
              className="h-12 text-sm font-bold flex items-center justify-center"
            >
              Добавить ещё
            </Button>
            <Button
              size="lg"
              fullWidth
              leftIcon={CheckCircle2}
              loading={isSubmittingSale}
              disabled={hasEmptyPrice || totalTjs <= 0}
              onClick={handleFinishPayment}
              className="h-12 text-sm font-bold flex items-center justify-center"
            >
              {isSubmittingSale ? 'Оформление…' : hasEmptyPrice ? 'Укажите цену' : 'Оплата'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 mb-4">
          {cart.map((item, idx) => {
            const belowCost = isItemBelowCost(item);
            const priceMissing = item.salePriceTjs === undefined || item.salePriceTjs <= 0;

            return (
              <div key={`${item.device.id}-${idx}`} className="p-3 rounded-lg border border-border bg-surface">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg-muted">{item.device.brand} {item.device.model}</p>
                    <p className="text-xs text-fg-subtle">
                      {item.device.ram ? `${item.device.ram} · ` : ''}{item.device.storage} · {item.device.color}
                    </p>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      IMEI: {item.device.imei}{item.device.imei2 ? ` / ${item.device.imei2}` : ''}
                    </p>
                  </div>
                  <IconButton icon={Trash2} tone="danger" size="sm" aria-label="Удалить из корзины" onClick={() => handleRemoveFromCart(idx)} />
                </div>

                <div className="mt-2.5">
                  <label className="block text-xs font-medium text-fg-muted mb-1">
                    Цена продажи (TJS) <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <input step="0.01"
                      type="number"
                      inputMode="numeric"
                      min="0.01"
                      placeholder="Укажите цену продажи..."
                      value={item.salePriceTjs !== undefined ? item.salePriceTjs : ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        handleUpdatePrice(idx, isNaN(val) ? undefined : val);
                      }}
                      className={`w-full h-11 rounded-lg px-3 pr-14 text-sm font-semibold bg-bg focus:outline-none focus:ring-1 ${
                        priceMissing
                          ? 'border border-warning text-warning focus:border-warning focus:ring-warning'
                          : belowCost
                            ? 'border border-danger text-danger focus:border-danger focus:ring-danger'
                            : 'border border-border text-accent focus:border-accent focus:ring-accent'
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-fg-subtle">TJS</span>
                  </div>

                  {priceMissing && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Обязательное поле
                    </p>
                  )}
                  {belowCost && !priceMissing && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-danger font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Цена ниже себестоимости
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">Покупатель / телефон (опционально)</label>
            <input
              type="text"
              value={customerNameInput}
              onChange={(e) => setCustomerNameInput(e.target.value)}
              placeholder="Имя или номер телефона"
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'CASH' as const, label: 'Наличные', icon: Banknote },
              { id: 'CARD' as const, label: 'Карта', icon: CreditCard },
              { id: 'SPLIT' as const, label: 'Разделить', icon: Split },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPaymentMethod(id);
                  if (id === 'CASH') { setCashAmountInput(totalTjs.toString()); setCardAmountInput('0'); }
                  else if (id === 'CARD') { setCardAmountInput(totalTjs.toString()); setCashAmountInput('0'); }
                  else { const half = Math.floor(totalTjs / 2); setCashAmountInput(half.toString()); setCardAmountInput(moneyNumber(decimal(totalTjs).minus(half)).toString()); }
                }}
                className={`h-16 rounded-lg border flex flex-col items-center justify-center gap-1 transition-colors ${
                  paymentMethod === id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>

          {paymentMethod === 'SPLIT' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-xs text-fg-muted block mb-1">Наличные</span>
                <input step="0.01"
                  type="number"
                  min="0"
                  max={totalTjs}
                  value={cashAmountInput}
                  onChange={(e) => {
                    const valStr = e.target.value;
                    const raw = parseFloat(valStr);
                    if (!isNaN(raw)) {
                      const clamped = Math.min(totalTjs, Math.max(0, raw));
                      setCashAmountInput(raw > totalTjs ? totalTjs.toString() : valStr);
                      setCardAmountInput(Number(Math.max(0, totalTjs - clamped).toFixed(2)).toString());
                    } else {
                      setCashAmountInput(valStr);
                      setCardAmountInput(totalTjs.toString());
                    }
                  }}
                  className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm font-semibold text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <span className="text-xs text-fg-muted block mb-1">Карта</span>
                <input step="0.01"
                  type="number"
                  min="0"
                  max={totalTjs}
                  value={cardAmountInput}
                  onChange={(e) => {
                    const valStr = e.target.value;
                    const raw = parseFloat(valStr);
                    if (!isNaN(raw)) {
                      const clamped = Math.min(totalTjs, Math.max(0, raw));
                      setCardAmountInput(raw > totalTjs ? totalTjs.toString() : valStr);
                      setCashAmountInput(Number(Math.max(0, totalTjs - clamped).toFixed(2)).toString());
                    } else {
                      setCardAmountInput(valStr);
                      setCashAmountInput(totalTjs.toString());
                    }
                  }}
                  className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm font-semibold text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Receipt */}
      <Dialog
        open={completedReceiptNumber !== null}
        onClose={() => setCompletedReceiptNumber(null)}
        title="Продажа завершена"
        maxWidth="sm"
        footer={<Button fullWidth onClick={() => setCompletedReceiptNumber(null)}>Новый чек</Button>}
      >
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-accent">Чек #{completedReceiptNumber}</p>

          <div className="my-3 p-3 bg-bg rounded-lg border border-border text-left space-y-1 text-xs">
            <div className="text-fg-muted font-medium">{new Date().toLocaleString('ru-RU')}</div>
            <div className="text-fg-muted">{activeStoreName}</div>
            <div className="text-accent font-semibold">Оператор: {currentUser?.name || 'Администратор'}</div>
          </div>

          <p className="text-xs text-fg-subtle">Устройства списаны со склада {activeStoreName}</p>
        </div>
      </Dialog>
    </div>
  );
};
