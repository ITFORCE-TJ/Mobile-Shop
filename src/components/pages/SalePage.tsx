import { decimal, moneyNumber, sumMoney, formatMoney } from '../../utils/money';
import React, { useState, useMemo } from 'react';
import { useAppFields } from '../../context/AppContext';
import { Device, PaymentMethod } from '../../types';
import { looksLikeDeviceCode, normalizeScanCode, resolveSaleScan, saleScanMessage } from '../../utils/scanLookup';
import { formatReceiptText, paymentSummary } from '../../utils/receipt';
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
  Share2,
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
import { useUIStore } from '../../stores/useUIStore';
import { useUnfinishedWork } from '../../utils/pwaUpdateSafety';

interface CartItem {
  device: Device;
  salePriceTjs?: number;
}

export const SalePage: React.FC = () => {
  const { setStoreSwitchModalOpen } = useUIStore();
  const {
    currentUser,
    devices,
    todayRate,
    selectedStoreId,
    stores,
    openScanner,
    createSale,
    isInitialLoading,
    sales,
  } = useAppFields('currentUser', 'devices', 'todayRate', 'selectedStoreId', 'stores', 'openScanner', 'createSale', 'isInitialLoading', 'sales');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  useUnfinishedWork(cart.length > 0, 'Незавершённая продажа');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [expandedVariantKey, setExpandedVariantKey] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, 'DEBT'>>('CASH');
  const [cashAmountInput, setCashAmountInput] = useState('');
  const [cardAmountInput, setCardAmountInput] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<StatusMessage | null>(null);

  const [completedReceiptNumber, setCompletedReceiptNumber] = useState<number | null>(null);
  const completedSale = useMemo(
    () => (completedReceiptNumber === null ? undefined : sales.find(s => s.receiptNumber === completedReceiptNumber)),
    [sales, completedReceiptNumber]
  );
  const [receiptShareState, setReceiptShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  const isRealAdmin = currentUser?.role === 'ADMIN';
  const isSeller = currentUser?.role === 'SELLER';
  const isPartner = currentUser?.role === 'PARTNER';
  const isStoreScoped = isSeller || isPartner;
  const isAdmin = currentUser?.role === 'ADMIN';
  const isCentralCashMode = isAdmin && (!selectedStoreId || selectedStoreId === 'all');

  const selectableStores = useMemo(() => {
    return stores.filter(s => !s.isMainWarehouse);
  }, [stores]);

  // Store-bound users sell in their own store; the admin sells in the store picked in the top
  // bar (in central-cash mode no store is picked and the page asks for one).
  const effectiveStoreId = isStoreScoped
    ? currentUser?.storeId
    : (isCentralCashMode
        ? ''
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

  /**
   * One answer for every scan: the camera scanner and a USB/Bluetooth scanner (which types the
   * code into search and presses Enter). A phone that can't be added says why instead of only
   * beeping, so a cashier in a noisy shop still knows what happened.
   */
  const handleDeviceCode = (rawCode: string, source: 'camera' | 'enter') => {
    const code = normalizeScanCode(rawCode);
    if (!code) return;
    const result = resolveSaleScan({
      devices,
      code,
      storeId: effectiveStoreId,
      cartDeviceIds: cart.map(ci => ci.device.id),
      storeName: (id) => stores.find(s => s.id === id)?.name,
    });

    if (result.kind === 'add') {
      addDeviceToCart(result.device);
      if (source === 'camera') {
        setPaymentStatus(null);
        setIsCartOpen(true);
      } else {
        // Keep the cursor in search so the next phone can be scanned straight away.
        setSearchQuery('');
        setPaymentStatus({ tone: 'success', text: `Добавлено в корзину: ${result.device.brand} ${result.device.model}` });
      }
      return;
    }
    // Enter on an ordinary text search ("iphone 15") just keeps filtering the catalog.
    if (source === 'enter' && result.kind === 'not-found' && !looksLikeDeviceCode(code)) return;
    soundEffects.playError();
    setPaymentStatus({ tone: result.kind === 'not-found' ? 'error' : 'warning', text: saleScanMessage(result) });
    if (source === 'camera') setSearchQuery(code);
  };

  const handleTriggerScanner = () => {
    openScanner((scannedCode) => handleDeviceCode(scannedCode, 'camera'));
  };

  const handleAddMore = () => {
    setIsCartOpen(false);
  };

  const totalTjs = sumMoney(cart.map(item => item.salePriceTjs && item.salePriceTjs > 0 ? item.salePriceTjs : 0));
  const hasEmptyPrice = cart.some(item => item.salePriceTjs === undefined || item.salePriceTjs <= 0);
  const totalUsd = todayRate ? moneyNumber(decimal(totalTjs).div(todayRate.rate)) : 0;
  // Without today's rate there is no honest USD figure, so none is shown (the sale itself
  // requires the rate on the server anyway).
  const usdLabel = todayRate ? `≈ $${formatMoney(totalUsd)}` : 'курс на сегодня не задан';

  const isItemBelowCost = (item: CartItem) => {
    if (!todayRate || item.salePriceTjs === undefined || isNaN(item.salePriceTjs)) return false;
    return decimal(item.salePriceTjs).lt(decimal(item.device.costBasisUsd).mul(todayRate.rate));
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

      {isCentralCashMode && (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={StoreIcon}
            title="Выберите магазин"
            description="Продажа проводится в конкретном магазине. Выберите его — так же, как кнопкой «Продавать в магазине» в верхней панели."
            action={<Button leftIcon={StoreIcon} onClick={() => setStoreSwitchModalOpen(true)}>Выбрать магазин</Button>}
          />
        </div>
      )}

      {!isCentralCashMode && (<>
      {/* Filter bar */}
      <div className="p-2 sm:p-2.5 border-b border-border bg-surface shrink-0 space-y-2">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onScan={handleTriggerScanner}
          onSubmit={(value) => handleDeviceCode(value, 'enter')}
          placeholder="Поиск по IMEI / штрихкоду / модели..."
        />

        {brands.length > 2 && (
          <div className="flex items-center justify-between gap-2 overflow-hidden pt-0.5">
            <div className="flex-1 min-w-0">
              <FilterPillGroup options={brands} value={selectedBrand} onChange={setSelectedBrand} scrollable />
            </div>
            <span className="text-[11px] text-fg-subtle tabular-nums font-medium shrink-0 hidden sm:inline">
              В наличии: <strong className="text-fg-muted font-semibold">{availableDevices.length}</strong> шт.
            </span>
          </div>
        )}
      </div>

      {/* Catalog */}
      <div
        key={effectiveStoreId}
        className="animate-store-catalog flex-1 min-h-0 overflow-y-auto divide-y divide-border pb-4"
      >
        {isInitialLoading ? (
          <LoadingState label="Загрузка каталога…" />
        ) : groupedVariants.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="Товары не найдены"
            description={`В наличии нет устройств${searchQuery ? ' по вашему запросу' : ''}${isStoreScoped ? '' : ` (${activeStoreName})`}`}
            action={
              selectedBrand !== 'ALL' || searchQuery ? (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setSelectedBrand('ALL');
                    setSearchQuery('');
                  }}
                >
                  Сбросить фильтры
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="px-3.5 py-1.5 bg-surface-raised/40 border-b border-border text-[11px] text-fg-subtle flex items-center justify-between sticky top-0 backdrop-blur-xs z-10">
              <span className="font-semibold text-fg-muted">В наличии: <strong className="text-accent font-bold">{availableDevices.length}</strong> шт.</span>
              {selectedBrand !== 'ALL' && (
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                  {selectedBrand}
                </span>
              )}
            </div>
            {groupedVariants.map((variant) => {
            const costs = variant.devices.map(d => d.purchaseCostUsd ?? d.costBasisUsd ?? 0);
            const maxCost = costs.length ? Math.max(...costs) : 0;
            const hasCostVariance = costs.length > 1 && maxCost > Math.min(...costs);
            const isExpanded = expandedVariantKey === variant.variantKey;
            const sortedDevices = [...variant.devices].sort((a, b) => (b.purchaseCostUsd ?? b.costBasisUsd ?? 0) - (a.purchaseCostUsd ?? a.costBasisUsd ?? 0));
            const retailPrices = variant.devices.map(defaultPriceFor).filter((p): p is number => p !== undefined);
            const minRetail = retailPrices.length ? Math.min(...retailPrices) : undefined;
            const maxRetail = retailPrices.length ? Math.max(...retailPrices) : undefined;

            return (
              <div key={variant.variantKey}>
                <button
                  onClick={() => handleSelectVariant(variant)}
                  className="w-full text-left px-4 py-3 active:bg-surface-raised flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg-muted truncate">{variant.brand} {variant.model}</p>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      {variant.ram ? `${variant.ram} · ` : ''}{variant.storage} · {variant.color}
                    </p>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div className="flex flex-col items-end gap-0.5">
                      {minRetail !== undefined ? (
                        <span className="text-sm font-bold tabular-nums text-accent whitespace-nowrap">
                          {formatMoney(minRetail)}{maxRetail !== undefined && maxRetail > minRetail ? `–${formatMoney(maxRetail)}` : ''} TJS
                        </span>
                      ) : (
                        <span className="text-xs text-fg-subtle whitespace-nowrap">Цена не задана</span>
                      )}
                      <span className="text-xs text-fg-subtle tabular-nums">{variant.devices.length} шт.</span>
                    </div>
                    {variant.devices.length > 1 && (
                      <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="bg-surface/60 border-t border-border px-4 py-2 space-y-2">
                    {isRealAdmin && hasCostVariance && (
                      <p className="text-xs text-warning font-medium">Рекомендуется первым продать экземпляр за ${maxCost}</p>
                    )}
                    {sortedDevices.map((dev) => {
                      const devCost = dev.purchaseCostUsd ?? dev.costBasisUsd ?? 0;
                      const isHighestCost = isRealAdmin && hasCostVariance && devCost === maxCost;
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
                            {isRealAdmin && devCost > 0 && (
                              <p className="text-xs text-fg-subtle mt-0.5">
                                Закупка: ${devCost}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {defaultPriceFor(dev) !== undefined && (
                              <span className="text-xs font-semibold tabular-nums text-fg-muted">{formatMoney(defaultPriceFor(dev))} TJS</span>
                            )}
                            <Badge tone={isHighestCost ? 'warning' : 'accent'}>Выбрать</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>

      </>)}

      {/* Cart bar: a normal last row of the page, so it always sits above the bottom navigation
          (which already pads for the iPhone home indicator) and centers on the content area next
          to any side navigation. Extra bottom space on phones clears the raised center nav button. */}
      {cart.length > 0 && (
        <div className="shrink-0 px-3 pt-2 pb-7 md:pb-3 border-t border-border bg-bg">
          <div className="max-w-2xl mx-auto p-3 rounded-xl bg-surface border border-accent/40 flex items-center justify-between gap-2" role="region" aria-label="Корзина">
            <div className="flex items-center gap-3 min-w-0 pl-1">
              <div className="w-9 h-9 rounded-lg bg-accent text-accent-fg flex items-center justify-center font-bold text-sm shrink-0">
                {cart.length}
              </div>
              <div className="truncate">
                <span className="text-sm font-bold text-accent block truncate">{formatMoney(totalTjs)} TJS</span>
                <span className="text-xs text-fg-subtle block">{usdLabel}</span>
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
        title={isStoreScoped ? 'Чек' : `Чек · ${activeStoreName}`}
        subtitle={`${formatMoney(totalTjs)} TJS · ${usdLabel}`}
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
              disabled={hasEmptyPrice || totalTjs <= 0 || isSubmittingSale}
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
                      inputMode="decimal"
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
        onClose={() => { setCompletedReceiptNumber(null); setReceiptShareState('idle'); }}
        title="Продажа завершена"
        maxWidth="sm"
        footer={
          <div className="w-full grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              fullWidth
              leftIcon={Share2}
              disabled={!completedSale}
              onClick={async () => {
                if (!completedSale) return;
                const text = formatReceiptText(completedSale, { showStore: !isStoreScoped });
                try {
                  if (navigator.share) {
                    await navigator.share({ title: `Чек №${completedSale.receiptNumber}`, text });
                    return;
                  }
                  await navigator.clipboard.writeText(text);
                  setReceiptShareState('copied');
                } catch (err) {
                  // Closing the share sheet is not an error.
                  if ((err as Error)?.name !== 'AbortError') setReceiptShareState('failed');
                }
              }}
            >
              {receiptShareState === 'copied' ? 'Скопировано' : 'Отправить чек'}
            </Button>
            <Button fullWidth onClick={() => { setCompletedReceiptNumber(null); setReceiptShareState('idle'); }}>Новый чек</Button>
          </div>
        }
      >
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">Чек №{completedReceiptNumber}</p>
              <p className="text-xs text-fg-subtle">
                {new Date(completedSale?.date || Date.now()).toLocaleString('ru-RU')}
                {!isStoreScoped && ` · ${completedSale?.storeName || activeStoreName}`}
              </p>
            </div>
          </div>

          {completedSale ? (
            <div className="rounded-lg border border-border bg-bg divide-y divide-border text-sm">
              {completedSale.items.map((item) => (
                <div key={item.deviceId} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-fg-muted">{item.brand} {item.model}</p>
                    <p className="text-xs text-fg-subtle">IMEI: {item.imei}</p>
                  </div>
                  <span className="tabular-nums font-semibold text-fg-muted whitespace-nowrap">{formatMoney(item.salePriceTjs)} TJS</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-fg-muted">Итого</span>
                <strong className="text-base tabular-nums text-accent">{formatMoney(completedSale.totalTjs)} TJS</strong>
              </div>
              <div className="px-3 py-2 text-xs text-fg-subtle space-y-0.5">
                <p>Оплата: <span className="text-fg-muted">{paymentSummary(completedSale)}</span></p>
                {completedSale.customerName && <p>Покупатель: <span className="text-fg-muted">{completedSale.customerName}</span></p>}
                <p>Продавец: <span className="text-fg-muted">{completedSale.sellerName || currentUser?.name}</span></p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-fg-subtle">Продажа сохранена. Состав чека появится после обновления данных — его можно открыть в «Истории продаж».</p>
          )}

          {receiptShareState === 'failed' && (
            <p className="mt-2 text-xs text-danger">Не удалось отправить чек. Откройте его в «Истории продаж».</p>
          )}
        </div>
      </Dialog>
    </div>
  );
};
