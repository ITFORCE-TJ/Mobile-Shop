import { decimal, moneyNumber, sumMoney, formatMoney } from '../../utils/money';
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { Device, PaymentMethod, Sale, SaleItem } from '../../types';
import {
  Search,
  Scan,
  AlertCircle,
  X,
  Banknote,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';

export const ExchangePage: React.FC = () => {
  const location = useLocation();
  const navigatedState = location.state as {
    saleReceiptNumber?: number;
    item?: SaleItem;
    customerName?: string;
    saleId?: string;
    saleStoreId?: string;
    saleStoreName?: string;
    saleDate?: string;
  } | null;

  const {
    currentUser,
    sales,
    fetchSalesRange,
    devices,
    processExchange,
    openScanner,
    stores,
    selectedStoreId: globalSelectedStoreId
  } = useAppFields('currentUser', 'sales', 'fetchSalesRange', 'devices', 'processExchange', 'openScanner', 'stores', 'selectedStoreId');

  const [receiptSearch, setReceiptSearch] = useState('');
  const [selectedOldDevice, setSelectedOldDevice] = useState<Device | null>(null);
  const [receiptChoice, setReceiptChoice] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);

  const [exchangeInValueTjs, setExchangeInValueTjs] = useState<number>(0);
  // What the customer paid for the returned item — the trade-in credit can't exceed it.
  const [soldPriceTjs, setSoldPriceTjs] = useState<number>(0);

  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [replacementDevice, setReplacementDevice] = useState<Device | null>(null);

  const [newPriceTjs, setNewPriceTjs] = useState<number>(0);

  const [exchangePaymentMethod, setExchangePaymentMethod] = useState<PaymentMethod>('CASH');
  const [givenCashTjs, setGivenCashTjs] = useState<string>('');

  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The exchange must happen within a single store — the server already enforces this
  // (the replacement device lookup is scoped to sale.storeId), but without mirroring it
  // here, an admin/partner (who has no fixed currentUser.storeId) could browse and pick
  // a replacement sitting in a different store's stock and only find out at submit time.
  // Once an old device is selected, its own store (where it was originally sold) wins;
  // otherwise fall back to the seller's fixed store, then whatever's active on POS Terminal.
  const effectiveStoreId = selectedOldDevice?.locationId
    || currentUser?.storeId
    || (globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : '');
  const currentStoreName = stores.find(s => s.id === effectiveStoreId)?.name || currentUser?.storeName || 'Магазин';

  const availableDevices = useMemo(() => {
    return devices.filter(d => {
      const isAvailable = d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
      if (!isAvailable) return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;
      if (selectedOldDevice && d.id === selectedOldDevice.id) return false;

      if (deviceSearchQuery.trim()) {
        const q = deviceSearchQuery.toLowerCase().trim();
        const matches =
          d.imei.toLowerCase().includes(q) ||
          (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [devices, effectiveStoreId, deviceSearchQuery, selectedOldDevice]);

  const resolveOldDeviceFromItem = (sale: { storeId: string; storeName: string; date?: string; [key: string]: any }, item: SaleItem): Device => {
    const matchedDev = devices.find(d => d.imei === item.imei || d.id === item.deviceId);
    return matchedDev || {
      id: item.deviceId || `old-${Date.now()}`,
      imei: item.imei,
      imei2: item.imei2,
      brand: item.brand,
      model: item.model,
      color: item.color,
      storage: item.storage,
      costBasisUsd: 100,
      purchaseCostUsd: 100,
      retailPriceTjs: item.salePriceTjs || 1000,
      status: 'SOLD',
      locationId: sale.storeId,
      locationName: sale.storeName,
      supplierId: 'sup-tradein',
      createdAt: sale.date || new Date().toISOString(),
      timeline: [],
    };
  };

  // The exchange is anchored to whichever store the old device was originally sold at
  // (see effectiveStoreId above) — if a replacement was already picked from a different
  // store before that, it's no longer valid and must be cleared rather than silently
  // left in place to fail at submit.
  const applySelectedOldDevice = (dev: Device, amountTjs: number) => {
    setSelectedOldDevice(dev);
    setExchangeInValueTjs(amountTjs);
    setSoldPriceTjs(amountTjs);
    if (replacementDevice && replacementDevice.locationId !== dev.locationId) {
      setReplacementDevice(null);
      setNewPriceTjs(0);
      setStatus({ tone: 'info', text: `Устройство на замену было выбрано из другого магазина и сброшено — обмен проводится в пределах одного магазина` });
    }
  };

  useEffect(() => {
    if (navigatedState?.item) {
      const item = navigatedState.item;
      const matchedSale = sales.find(s => (navigatedState.saleReceiptNumber && s.receiptNumber === navigatedState.saleReceiptNumber) || s.id === navigatedState.saleId);
      const dev = resolveOldDeviceFromItem(matchedSale || {
        storeId: navigatedState.saleStoreId || currentUser?.storeId || '',
        storeName: navigatedState.saleStoreName || currentUser?.storeName || 'Магазин',
        date: navigatedState.saleDate || new Date().toISOString(),
      }, item);

      applySelectedOldDevice(dev, item.salePriceTjs || 0);
      setStatus({
        tone: 'success',
        text: `Устройство ${item.brand} ${item.model} (${item.imei}) из чека #${navigatedState.saleReceiptNumber || ''} выбрано для обмена. Теперь выберите устройство на замену из наличия.`
      });
      window.history.replaceState({}, document.title);
    }
  }, [navigatedState]);

  const handlePickReceiptItem = (sale: Sale, item: SaleItem) => {
    applySelectedOldDevice(resolveOldDeviceFromItem(sale, item), item.salePriceTjs || 0);
    setReceiptChoice(null);
    setStatus({ tone: 'success', text: `Устройство ${item.brand} ${item.model} выбрано из чека #${sale.receiptNumber}` });
  };

  // Only devices with an actual sale record can be traded in — the exchange is modeled
  // as swapping an item within that sale, not a standalone "customer's own phone" credit.
  // A device merely sitting in stock (never sold here) has no sale to attach the exchange
  // to, so that lookup path was removed rather than accepted only to fail on submit.
  const searchSalesFor = (list: Sale[], q: string): boolean => {
    for (const sale of list) {
      if (sale.receiptNumber.toString() === q) {
        if (sale.items.length > 1) {
          setReceiptChoice({ sale, items: sale.items });
          setStatus({ tone: 'info', text: `В чеке #${sale.receiptNumber} несколько товаров — выберите нужный` });
          return true;
        }
        const item = sale.items[0];
        if (item) {
          handlePickReceiptItem(sale, item);
          setStatus({ tone: 'success', text: `Найдено проданное устройство по чеку #${sale.receiptNumber}` });
          return true;
        }
      }

      for (const item of sale.items) {
        if (
          item.imei.toLowerCase() === q ||
          (item.imei2 && item.imei2.toLowerCase() === q)
        ) {
          applySelectedOldDevice(resolveOldDeviceFromItem(sale, item), item.salePriceTjs || 0);
          setStatus({ tone: 'success', text: `Устройство ${item.brand} ${item.model} найдено в истории продаж` });
          return true;
        }
      }
    }
    return false;
  };

  // `sales` only holds a recent window by default — a trade-in against an older sale
  // falls through to a server-side search (by receipt number or IMEI) before reporting
  // "not found", instead of only ever checking what happens to already be loaded.
  const handleFindSoldImei = async (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    setReceiptChoice(null);

    if (searchSalesFor(sales, q)) return;

    try {
      const found = await fetchSalesRange({ search: query.trim() });
      if (searchSalesFor(found, q)) return;
    } catch {
      // fall through to the not-found message below
    }

    setStatus({ tone: 'error', text: `Проданное устройство по чеку/IMEI "${query}" не найдено в истории продаж` });
  };

  const handleScanOldDevice = () => {
    openScanner((scannedCode) => {
      handleFindSoldImei(scannedCode);
    });
  };

  const handleScanReplacement = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const dev = availableDevices.find(d =>
        d.imei === code || d.imei2 === code
      );
      if (dev) {
        handleSelectReplacement(dev);
      } else {
        setDeviceSearchQuery(code);
      }
    });
  };

  const handleSelectReplacement = (dev: Device) => {
    setReplacementDevice(dev);
    setNewPriceTjs(dev.retailPriceTjs || 0);
  };

  const differenceTjs = useMemo(() => {
    return moneyNumber(decimal(newPriceTjs).minus(exchangeInValueTjs));
  }, [newPriceTjs, exchangeInValueTjs]);

  const handleSubmitExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedOldDevice || !replacementDevice) {
      setStatus({ tone: 'error', text: 'Для проведения обмена выберите сдаваемое и выдаваемое устройство' });
      return;
    }

    if (exchangeInValueTjs <= 0) {
      setStatus({ tone: 'error', text: 'Залоговая оценочная стоимость сдаваемого аппарата должна быть больше 0' });
      return;
    }

    if (soldPriceTjs > 0 && exchangeInValueTjs > soldPriceTjs) {
      setStatus({ tone: 'error', text: `Зачётная стоимость не может превышать цену этой позиции в чеке (${formatMoney(soldPriceTjs)} TJS)` });
      return;
    }

    if (newPriceTjs <= 0) {
      setStatus({ tone: 'error', text: 'Укажите новую цену продажи выдаваемого устройства' });
      return;
    }

    // Customer owes a cash top-up — the exchange must not go through until that
    // payment is actually confirmed (cash received covers the amount due). Card
    // top-ups have no numeric confirmation step of their own, so they're exempt.
    if (differenceTjs > 0 && exchangePaymentMethod === 'CASH') {
      const givenCash = parseFloat(givenCashTjs) || 0;
      if (givenCash < differenceTjs) {
        setStatus({ tone: 'error', text: `Подтвердите оплату: клиент должен доплатить ${differenceTjs.toLocaleString()} TJS наличными, прежде чем можно провести обмен` });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await processExchange({
        originalSaleId: navigatedState?.saleId,
        originalSaleReceiptNumber: navigatedState?.saleReceiptNumber,
        returnedImei: selectedOldDevice.imei,
        returnedItem: {
          brand: selectedOldDevice.brand,
          model: selectedOldDevice.model,
          storage: selectedOldDevice.storage,
          color: selectedOldDevice.color,
          imei: selectedOldDevice.imei,
          exchangeInValueTjs,
        },
        exchangeInValueTjs,
        replacementDeviceId: replacementDevice.id,
        newPriceTjs,
        differenceTjs,
        // The payment-method toggle is only ever shown to the cashier when the customer
        // owes a top-up (differenceTjs > 0) — for a refund (differenceTjs < 0) the UI never
        // lets them pick, so we must not forward a stale choice left over from a previous
        // exchange in this session. Omitting it lets the backend default to CASH, matching
        // the "Выплатите клиенту из кассы" copy shown for that case.
        paymentMethod: differenceTjs > 0 ? exchangePaymentMethod : undefined,
      });

      if (res.success) {
        setStatus({ tone: 'success', text: `Обмен Trade-In успешно проведен!` });
        setSelectedOldDevice(null);
        setReplacementDevice(null);
        setReceiptSearch('');
        setDeviceSearchQuery('');
        setReceiptChoice(null);
        setExchangeInValueTjs(0);
        setNewPriceTjs(0);
        setGivenCashTjs('');
        setExchangePaymentMethod('CASH');
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка проведения обмена' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <form onSubmit={handleSubmitExchange} className="flex-1 flex flex-col overflow-hidden">
        {/* Main 2-column Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-y-auto">
          {/* LEFT: Step 1 - Сдаваемое устройство (Incoming from customer) */}
          <div className="p-4 space-y-4 bg-bg">
            <div className="flex items-center space-x-2.5 border-b border-border pb-3">
              <div className="w-6 h-6 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center text-xs font-bold shrink-0">
                1
              </div>
              <h3 className="text-xs md:text-sm font-bold tracking-wide text-fg-muted">Сдаваемое устройство (клиент)</h3>
            </div>

            {/* Receipt / IMEI search bar */}
            {!selectedOldDevice ? (
              <div className="space-y-3">
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
                    <input
                      type="text"
                      value={receiptSearch ?? ''}
                      onChange={(e) => setReceiptSearch(e.target.value)}
                      placeholder="Номер чека или IMEI..."
                      className="w-full rounded-xl bg-surface border border-border pl-9 pr-3 py-2 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFindSoldImei(receiptSearch)}
                    disabled={!receiptSearch.trim()}
                    className="px-4 py-2 bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 text-xs font-bold rounded-xl text-accent-fg transition-colors"
                  >
                    Найти
                  </button>
                  <button
                    type="button"
                    onClick={handleScanOldDevice}
                    className="px-3 py-2 bg-surface-raised hover:bg-surface text-accent rounded-xl border border-border transition-colors"
                    title="Сканировать"
                  >
                    <Scan className="w-4 h-4" />
                  </button>
                </div>

                {receiptChoice && (
                  <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
                    {receiptChoice.items.map((item, idx) => (
                      <button
                        key={`${item.deviceId || item.imei}-${idx}`}
                        type="button"
                        onClick={() => handlePickReceiptItem(receiptChoice.sale, item)}
                        className="w-full text-left p-3 hover:bg-surface-raised flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <p className="font-bold text-fg-muted">{item.brand} {item.model}</p>
                          <p className="text-[11px] text-fg-muted mt-0.5">{item.storage} • {item.color}</p>
                          <p className="text-[10px] text-fg-subtle mt-0.5">IMEI: {item.imei}</p>
                        </div>
                        <span className="font-bold text-accent text-xs">{item.salePriceTjs.toLocaleString()} TJS</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 relative">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOldDevice(null);
                    setExchangeInValueTjs(0);
                  }}
                  className="absolute right-3.5 top-3.5 text-fg-subtle hover:text-fg-muted transition-colors"
                  title="Отменить выбор"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <span className="text-[10px] text-accent font-bold tracking-wider block">Принимаемый аппарат</span>
                  <h4 className="text-sm font-bold text-fg-muted mt-0.5">
                    {selectedOldDevice.brand} {selectedOldDevice.model}
                  </h4>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {selectedOldDevice.storage} • {selectedOldDevice.color}
                  </p>
                  <p className="text-xs text-fg-subtle mt-1">
                    IMEI: {selectedOldDevice.imei}
                  </p>
                </div>

                <div className="pt-3 border-t border-border space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-accent mb-1">
                      Оценочная зачетная стоимость (TJS):
                    </label>
                    <div className="relative">
                      <input step="0.01"
                        type="number"
                        min="0"
                        value={exchangeInValueTjs !== 0 ? exchangeInValueTjs : ''}
                        onChange={(e) => setExchangeInValueTjs(parseFloat(e.target.value) || 0)}
                        placeholder="Зачетная сумма в сомони..."
                        className="w-full rounded-xl bg-surface-raised border-2 border-accent/60 hover:border-accent focus:border-accent px-3.5 py-2 text-sm font-bold text-accent focus:outline-none transition-colors"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs text-accent font-bold">TJS</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Step 2 - Выдаваемое устройство со склада */}
          <div className="p-4 space-y-4 bg-bg">
            <div className="flex items-center space-x-2.5 border-b border-border pb-3">
              <div className="w-6 h-6 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center text-xs font-bold shrink-0">
                2
              </div>
              <h3 className="text-xs md:text-sm font-bold tracking-wide text-fg-muted">Выдаваемое устройство (со склада)</h3>
            </div>

            {replacementDevice ? (
              <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 relative">
                <button
                  type="button"
                  onClick={() => {
                    setReplacementDevice(null);
                    setNewPriceTjs(0);
                  }}
                  className="absolute right-3.5 top-3.5 text-fg-subtle hover:text-fg-muted transition-colors"
                  title="Отменить выбор"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <span className="text-[10px] text-accent font-bold tracking-wider block">Выдаваемый аппарат</span>
                  <h4 className="text-sm font-bold text-fg-muted mt-0.5">
                    {replacementDevice.brand} {replacementDevice.model}
                  </h4>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {replacementDevice.ram ? `${replacementDevice.ram} • ` : ''}{replacementDevice.storage} • {replacementDevice.color}
                  </p>
                  <p className="text-xs text-fg-subtle mt-1">
                    IMEI: {replacementDevice.imei}
                  </p>
                </div>

                <div className="pt-3 border-t border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-accent">
                      Цена продажи (TJS):
                    </label>
                  </div>
                  <div className="relative">
                    <input step="0.01"
                      type="number"
                      min="0"
                      value={newPriceTjs !== 0 ? newPriceTjs : ''}
                      onChange={(e) => setNewPriceTjs(parseFloat(e.target.value) || 0)}
                      placeholder="Цена продажи..."
                      className="w-full rounded-xl bg-surface-raised border-2 border-accent/60 hover:border-accent focus:border-accent px-3.5 py-2 text-sm font-bold text-accent focus:outline-none transition-colors"
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs text-accent font-bold">TJS</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
                    <input
                      type="text"
                      value={deviceSearchQuery ?? ''}
                      onChange={(e) => setDeviceSearchQuery(e.target.value)}
                      placeholder="Поиск по наличию / IMEI..."
                      className="w-full rounded-xl bg-surface border border-border pl-9 pr-3 py-2 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleScanReplacement}
                    className="px-3 py-2 bg-surface-raised hover:bg-surface text-accent rounded-xl border border-border transition-colors"
                    title="Сканировать"
                  >
                    <Scan className="w-4 h-4" />
                  </button>
                </div>

                {/* List of in-stock devices */}
                <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-surface">
                  {availableDevices.length === 0 ? (
                    <div className="p-4 text-center text-fg-muted text-xs">
                      Нет подходящих товаров в наличии ({currentStoreName})
                    </div>
                  ) : (
                    availableDevices.slice(0, 8).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleSelectReplacement(d)}
                        className="w-full text-left p-3 hover:bg-surface-raised flex items-center justify-between text-xs transition-colors group"
                      >
                        <div>
                          <p className="font-bold text-fg-muted group-hover:text-accent transition-colors">{d.brand} {d.model}</p>
                          <p className="text-[11px] text-fg-muted mt-0.5">{d.ram ? `${d.ram} • ` : ''}{d.storage} • {d.color}</p>
                          <p className="text-[10px] text-fg-subtle mt-0.5">IMEI: {d.imei}</p>
                        </div>
                        <span className="font-bold text-accent text-xs">
                          {formatMoney(d.retailPriceTjs)} TJS
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settlement & Difference Banner */}
        {selectedOldDevice && replacementDevice && (
          <div className="p-4 bg-surface border-t border-border space-y-3 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Banknote className="w-4.5 h-4.5 text-accent" />
                <h4 className="text-xs md:text-sm font-bold text-fg-muted">
                  Расчет разницы обмена
                </h4>
              </div>
              <div className="text-xs flex items-center space-x-3">
                <span className="text-fg-muted">Новый: <strong className="text-accent">{newPriceTjs.toLocaleString()} TJS</strong></span>
                <span className="text-fg-subtle">—</span>
                <span className="text-fg-muted">Зачет: <strong className="text-accent">{exchangeInValueTjs.toLocaleString()} TJS</strong></span>
                <span className="text-fg-subtle">=</span>
                <strong className="text-xs">
                  {differenceTjs > 0 ? (
                    <span className="text-accent font-bold">Разница: +{differenceTjs.toLocaleString()} TJS</span>
                  ) : differenceTjs < 0 ? (
                    <span className="text-warning font-bold">Разница: {differenceTjs.toLocaleString()} TJS</span>
                  ) : (
                    <span className="text-accent font-bold">Разница: 0 TJS</span>
                  )}
                </strong>
              </div>
            </div>

            {/* Dynamic Alert Banner */}
            {differenceTjs > 0 ? (
              <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-2.5">
                  <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-accent tracking-wide">
                      Требуется доплата от клиента
                    </p>
                    <p className="text-xs text-fg-muted mt-0.5">
                      Клиенту необходимо доплатить <strong className="text-accent">{differenceTjs.toLocaleString()} TJS</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  {/* Payment method for the customer's top-up */}
                  <div className="flex items-center bg-surface-raised p-1 rounded-xl border border-border shrink-0">
                    {(['CASH', 'CARD'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setExchangePaymentMethod(method)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          exchangePaymentMethod === method ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {method === 'CASH' ? 'Наличные' : 'Карта'}
                      </button>
                    ))}
                  </div>

                  {/* Input Cash Given — change calculator for the cashier */}
                  {exchangePaymentMethod === 'CASH' && (
                    <div className="flex items-center space-x-3 bg-surface-raised p-2 rounded-xl border border-border">
                      <div>
                        <label className="block text-[10px] font-bold text-fg-subtle mb-0.5">
                          Внесено клиентом:
                        </label>
                        <div className="relative">
                          <input step="0.01"
                            type="number"
                            min="0"
                            placeholder={differenceTjs.toString()}
                            value={givenCashTjs}
                            onChange={(e) => setGivenCashTjs(e.target.value)}
                            className="w-28 rounded-lg bg-surface border border-border px-2 py-1 text-xs font-bold text-accent focus:border-accent focus:outline-none"
                          />
                          <span className="absolute right-2 top-1 text-[10px] text-fg-subtle">TJS</span>
                        </div>
                      </div>
                      {givenCashTjs && (parseFloat(givenCashTjs) || 0) > differenceTjs && (
                        <div>
                          <span className="block text-[10px] font-bold text-fg-subtle mb-0.5">Сдача:</span>
                          <span className="text-xs font-bold text-warning">
                            {((parseFloat(givenCashTjs) || 0) - differenceTjs).toLocaleString()} TJS
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : differenceTjs < 0 ? (
              <div className="p-3.5 rounded-xl bg-warning/15 border border-warning/30 flex items-center space-x-2.5">
                <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                <div>
                  <p className="text-xs font-bold text-warning tracking-wide">
                    Возврат разницы клиенту
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Сдаваемое устройство дороже. Выплатите клиенту из кассы: <strong className="text-warning">{Math.abs(differenceTjs).toLocaleString()} TJS</strong>.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Action Bottom Bar */}
        <div className="p-3.5 bg-surface border-t border-border flex flex-col sm:flex-row gap-3 sm:items-center justify-between shrink-0">
          <div className="text-xs font-medium text-fg-muted flex flex-wrap items-center gap-2">
            <span>Новый: <strong className="text-accent">{formatMoney(newPriceTjs)} TJS</strong></span>
            <span>·</span>
            <span>Зачет: <strong className="text-accent">{formatMoney(exchangeInValueTjs)} TJS</strong></span>
            <span>·</span>
            <span className="font-bold text-fg-muted">
              {differenceTjs > 0 ? `Доплата: +${formatMoney(differenceTjs)} TJS` : differenceTjs < 0 ? `Возврат: ${formatMoney(differenceTjs)} TJS` : 'Равный обмен'}
            </span>
          </div>

          <button
            type="submit"
            disabled={
              !selectedOldDevice || !replacementDevice || exchangeInValueTjs <= 0 || newPriceTjs <= 0 || isSubmitting ||
              (differenceTjs > 0 && exchangePaymentMethod === 'CASH' && (parseFloat(givenCashTjs) || 0) < differenceTjs)
            }
            className="px-5 py-2.5 bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 text-xs font-bold rounded-xl text-accent-fg tracking-wider flex items-center space-x-2 transition-all shadow-xs"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            <span>{isSubmitting ? 'Проведение…' : 'Подтвердить обмен'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
