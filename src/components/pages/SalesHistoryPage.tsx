import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { formatMoney } from '../../utils/money';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { SaleItem } from '../../types';
import {
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Wrench,
  RotateCcw,
  Receipt,
  ArrowLeft,
  Store,
  X
} from 'lucide-react';
import { SearchBar } from '../ui/SearchBar';
import { DateRangePicker } from '../ui/DateRangePicker';
import { cn } from '../../utils/cn';
import { Select } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { Dialog } from '../ui/Dialog';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';

import { currentBusinessMonth, getBusinessDateKey, monthBounds } from '../../utils/businessDate';
import { summarizeSales } from '../../utils/salesSummary';
import { looksLikeDeviceCode, normalizeScanCode } from '../../utils/scanLookup';
import { useStoreContext, formatStoreName } from '../../utils/storeContext';

type DialogView = 'details' | 'refund' | 'pick-exchange' | 'pick-repair';

export const SalesHistoryPage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const navigate = useNavigate();
  const {
    currentUser,
    sales,
    fetchSalesRange,
    stores,
    openScanner,
    setActivePage,
    processRefund,
    isInitialLoading,
    selectedStoreId: globalSelectedStoreId,
  } = useAppFields(
    'currentUser',
    'sales',
    'fetchSalesRange',
    'stores',
    'openScanner',
    'setActivePage',
    'processRefund',
    'isInitialLoading',
    'selectedStoreId'
  );

  const todayStr = getBusinessDateKey();
  const thisMonthStr = currentBusinessMonth();
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'CUSTOM' | 'MONTH'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonthStr);
  const [selectedStartDate, setSelectedStartDate] = useState<string>(() => monthBounds(thisMonthStr).start);
  const [selectedEndDate, setSelectedEndDate] = useState<string>(() => monthBounds(thisMonthStr).end);
  const resetToCurrentMonth = () => {
    const { start, end } = monthBounds(thisMonthStr);
    setSelectedMonth(thisMonthStr);
    setSelectedStartDate(start);
    setSelectedEndDate(end);
    setPeriodFilter('MONTH');
  };

  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse), [stores]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<DialogView>('details');
  const selectedSale = sales.find((s) => s.id === selectedSaleId) || null;

  const [refundReason, setRefundReason] = useState('');
  const [penaltyFeeTjs, setPenaltyFeeTjs] = useState<string>('0');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  const isSeller = currentUser?.role === 'SELLER';
  const isPartner = currentUser?.role === 'PARTNER';
  const isStoreScoped = isSeller || isPartner;
  const isAdmin = currentUser?.role === 'ADMIN';
  // Admin inside a store sees only that store; Central Cash shows every store.
  const storeCtx = useStoreContext();

  // If store-scoped (seller/partner): bound to their own store.
  // If admin: defaults to whichever retail store is currently selected globally,
  // or 'ALL' if in Central Cash mode (selectedStoreId === 'all' or empty).
  // Changing this filter is purely local to SalesHistoryPage and does NOT switch the global store.
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>(() => {
    if (isStoreScoped) return currentUser?.storeId || '';
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all') {
      return globalSelectedStoreId;
    }
    return 'ALL';
  });

  useEffect(() => {
    if (!isStoreScoped) {
      if (globalSelectedStoreId && globalSelectedStoreId !== 'all') {
        setSelectedStoreFilter(globalSelectedStoreId);
      } else {
        setSelectedStoreFilter('ALL');
      }
    } else {
      setSelectedStoreFilter(currentUser?.storeId || '');
    }
  }, [globalSelectedStoreId, isStoreScoped, currentUser?.storeId]);

  const effectiveFetchStoreId = isStoreScoped
    ? (currentUser?.storeId || undefined)
    : (selectedStoreFilter === 'ALL' ? undefined : selectedStoreFilter);

  // The period's own load state: without it a slow network showed «Продажи не найдены» while
  // the period was still loading, and a failed load only reached the console.
  const [periodLoad, setPeriodLoad] = useState<'loading' | 'done' | 'error'>('loading');
  const [periodLoadAttempt, setPeriodLoadAttempt] = useState(0);

  // Fetch sales for the selected period & store filter (or all stores if selectedStoreFilter === 'ALL')
  useEffect(() => {
    if (isStoreScoped && !effectiveFetchStoreId) { setPeriodLoad('done'); return; }
    let cancelled = false;
    setPeriodLoad('loading');
    fetchSalesRange({
      period: periodFilter === 'TODAY' ? 'TODAY' : (periodFilter === 'MONTH' && selectedMonth ? 'SPECIFIC_MONTH' : undefined),
      month: periodFilter === 'MONTH' ? selectedMonth : undefined,
      startDate: periodFilter === 'CUSTOM' && selectedStartDate ? selectedStartDate : undefined,
      endDate: periodFilter === 'CUSTOM' && selectedEndDate ? selectedEndDate : undefined,
      storeId: effectiveFetchStoreId,
    })
      .then(() => { if (!cancelled) setPeriodLoad('done'); })
      .catch((e) => {
        if (cancelled) return;
        console.error('Failed to load sales for period', e);
        setPeriodLoad('error');
      });
    return () => { cancelled = true; };
  }, [periodFilter, selectedStartDate, selectedEndDate, selectedMonth, effectiveFetchStoreId, fetchSalesRange, dataRefreshRevision, isStoreScoped, periodLoadAttempt]);

  const filteredSales = useMemo(() => {
    if (isStoreScoped && !currentUser?.storeId) return [];
    const todayStr = getBusinessDateKey();

    return sales.filter((sale) => {
      if (currentUser?.role === 'SELLER' && sale.sellerId !== currentUser.id) return false;
      if (isStoreScoped && currentUser?.storeId && sale.storeId !== currentUser.storeId) return false;
      if (!isStoreScoped && selectedStoreFilter !== 'ALL' && sale.storeId !== selectedStoreFilter) return false;

      const saleDateStr = getBusinessDateKey(new Date(sale.date));
      if (periodFilter === 'TODAY' && saleDateStr !== todayStr) return false;
      if (periodFilter === 'MONTH' && selectedMonth && !saleDateStr.startsWith(selectedMonth)) return false;
      if (periodFilter === 'CUSTOM') {
        if (selectedStartDate) {
          const start = selectedStartDate;
          const end = selectedEndDate || selectedStartDate;
          const minDate = start < end ? start : end;
          const maxDate = start < end ? end : start;
          if (saleDateStr < minDate || saleDateStr > maxDate) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          sale.receiptNumber.toString().includes(q) ||
          sale.sellerName.toLowerCase().includes(q) ||
          sale.storeName.toLowerCase().includes(q) ||
          sale.customerName?.toLowerCase().includes(q) ||
          sale.items.some(
            item =>
              item.brand.toLowerCase().includes(q) ||
              item.model.toLowerCase().includes(q) ||
              item.imei.toLowerCase().includes(q) ||
              (item.imei2 && item.imei2.toLowerCase().includes(q))
          );
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, currentUser, isSeller, selectedStoreFilter, periodFilter, selectedStartDate, selectedEndDate, selectedMonth, searchQuery]);

  const periodSummary = useMemo(() => summarizeSales(filteredSales), [filteredSales]);

  const findByReceiptOrImei = (list: typeof sales, code: string) =>
    list.find(s => s.receiptNumber.toString() === code || s.items.some(i => i.imei === code || i.imei2 === code));

  /** Camera scan or Enter (USB/Bluetooth scanner): opens the receipt by number or IMEI. */
  const openSaleByCode = async (rawCode: string, source: 'camera' | 'enter') => {
      const code = normalizeScanCode(rawCode);
      if (!code) return;
      // Enter on a text search ("Ахмад", "iPhone") keeps filtering the list.
      if (source === 'enter' && !/^\d+$/.test(code)) return;
      const matched = findByReceiptOrImei(sales, code);
      if (matched) {
        setSelectedSaleId(matched.id);
        setDialogView('details');
        return;
      }

      // Not in the locally-loaded window — an older receipt still resolves via a
      // targeted server search before falling back to plain text search.
      try {
        const found = await fetchSalesRange({ search: code });
        const serverMatch = findByReceiptOrImei(found, code);
        if (serverMatch) {
          setSelectedSaleId(serverMatch.id);
          setDialogView('details');
          return;
        }
      } catch {
        // fall through
      }

      setSearchQuery(code);
      if (source === 'camera' || looksLikeDeviceCode(code)) {
        setStatus({ tone: 'error', text: `Чек или IMEI «${code}» не найден` });
      }
  };

  const handleScanFinder = () => {
    openScanner((scannedCode) => { void openSaleByCode(scannedCode, 'camera'); });
  };

  const openSale = (id: string) => {
    setSelectedSaleId(id);
    setDialogView('details');
    setStatus(null);
  };

  const closeDialog = () => {
    setSelectedSaleId(null);
  };

  const navigateWithItem = (page: 'EXCHANGE' | 'REPAIR', item: SaleItem) => {
    if (!selectedSale) return;
    const saleReceiptNumber = selectedSale.receiptNumber;
    const customerName = selectedSale.customerName;
    const saleId = selectedSale.id;
    const saleStoreId = selectedSale.storeId;
    const saleStoreName = selectedSale.storeName;
    const saleDate = selectedSale.date;
    setSelectedSaleId(null);
    setActivePage(page);
    navigate(page === 'EXCHANGE' ? '/exchange' : '/repair', {
      state: { saleReceiptNumber, item, customerName, saleId, saleStoreId, saleStoreName, saleDate }
    });
  };

  const handlePickAction = (page: 'EXCHANGE' | 'REPAIR') => {
    if (!selectedSale) return;
    if (selectedSale.items.length === 1) {
      navigateWithItem(page, selectedSale.items[0]);
    } else {
      setDialogView(page === 'EXCHANGE' ? 'pick-exchange' : 'pick-repair');
    }
  };

  const handleExecuteRefund = async () => {
    if (!selectedSale || isSubmittingRefund) return;
    if (!refundReason.trim()) {
      setStatus({ tone: 'error', text: 'Укажите причину возврата' });
      return;
    }

    const penaltyVal = Math.max(0, parseFloat(penaltyFeeTjs) || 0);
    const amountActuallyCollectedTjs = selectedSale.totalTjs - (selectedSale.debtAmountTjs ?? 0);
    const actualRefundVal = Math.max(0, amountActuallyCollectedTjs - penaltyVal);

    setIsSubmittingRefund(true);
    try {
      const res = await processRefund({
        saleId: selectedSale.id,
        reason: refundReason.trim(),
        refundAmountTjs: actualRefundVal,
        penaltyFeeTjs: penaltyVal,
        paymentMethod: refundMethod
      });

      if (res.success) {
        setSelectedSaleId(null);
        setRefundReason('');
        setPenaltyFeeTjs('0');
        setStatus({ tone: 'success', text: `Возврат по чеку #${selectedSale.receiptNumber} оформлен` });
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка возврата' });
      }
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const canRefund = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="p-2.5 sm:p-3 border-b border-border bg-surface space-y-2 shrink-0">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onScan={handleScanFinder}
          onSubmit={(value) => { void openSaleByCode(value, 'enter'); }}
          placeholder="Номер чека / IMEI / модель / продавец..."
        />

        <div className="flex items-center justify-between gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            {/* Сегодня */}
            <button
              type="button"
              onClick={() => {
                setSelectedStartDate(todayStr);
                setSelectedEndDate(todayStr);
                setSelectedMonth('');
                setPeriodFilter('TODAY');
              }}
              className={cn(
                'h-8 px-2.5 rounded-xl border text-xs font-semibold shrink-0 transition-all select-none shadow-xs cursor-pointer',
                periodFilter === 'TODAY'
                  ? 'border-accent/50 bg-accent/10 text-accent font-bold hover:bg-accent/15'
                  : 'border-border/80 bg-surface text-fg-muted hover:text-fg hover:border-accent/40'
              )}
            >
              Сегодня
            </button>

            {/* Календарь: текущий месяц по умолчанию + выбор дня или диапазона */}
            <DateRangePicker
              startDate={periodFilter === 'CUSTOM' ? selectedStartDate : ''}
              endDate={periodFilter === 'CUSTOM' ? selectedEndDate : ''}
              selectedMonth={periodFilter === 'MONTH' ? selectedMonth : undefined}
              currentMonthStr={thisMonthStr}
              isToday={periodFilter === 'TODAY'}
              isActive={periodFilter === 'MONTH' || periodFilter === 'CUSTOM'}
              onChange={(start, end, monthStr) => {
                if (monthStr) {
                  setSelectedMonth(monthStr);
                  setSelectedStartDate(start);
                  setSelectedEndDate(end);
                  setPeriodFilter('MONTH');
                } else if (start === todayStr && end === todayStr) {
                  setSelectedMonth('');
                  setSelectedStartDate(start);
                  setSelectedEndDate(end);
                  setPeriodFilter('TODAY');
                } else {
                  setSelectedMonth('');
                  setSelectedStartDate(start);
                  setSelectedEndDate(end);
                  setPeriodFilter('CUSTOM');
                }
              }}
              onResetMonth={resetToCurrentMonth}
              className="shrink-0"
            />

            {(searchQuery || periodFilter !== 'MONTH' || selectedMonth !== thisMonthStr || (selectedStoreFilter !== 'ALL' && !isStoreScoped && storeCtx.mode === 'CENTRAL')) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  resetToCurrentMonth();
                  if (!isStoreScoped) setSelectedStoreFilter('ALL');
                }}
                className="h-8 px-2 text-fg-subtle hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="Сбросить фильтры"
              >
                <X className="w-3 h-3" />
                <span className="text-[11px]">Сброс</span>
              </button>
            )}
          </div>

          {isAdmin && storeCtx.mode === 'CENTRAL' ? (
            <div className="relative inline-flex items-center shrink-0">
              <div
                className={cn(
                  'h-8 pl-2.5 pr-7 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all select-none shadow-xs',
                  selectedStoreFilter !== 'ALL'
                    ? 'border-accent/50 bg-accent/10 text-accent font-bold hover:bg-accent/15'
                    : 'border-border/80 bg-surface text-fg-muted hover:text-fg hover:border-accent/40'
                )}
                title={`Точка продаж: ${selectedStoreFilter === 'ALL' ? 'Все магазины' : formatStoreName(retailStores.find(s => s.id === selectedStoreFilter)?.name) || 'Магазин'}`}
              >
                <Store className={cn('w-3.5 h-3.5 shrink-0', selectedStoreFilter !== 'ALL' ? 'text-accent' : 'text-fg-subtle')} />
                <span className="truncate max-w-32 sm:max-w-44">
                  {selectedStoreFilter === 'ALL'
                    ? 'Все магазины'
                    : formatStoreName(retailStores.find(s => s.id === selectedStoreFilter)?.name) || 'Магазин'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-fg-subtle shrink-0 pointer-events-none absolute right-2" />
              </div>
              <select
                value={selectedStoreFilter}
                onChange={(e) => setSelectedStoreFilter(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
                title="Фильтр по точке продаж"
                aria-label="Фильтр по точке продаж"
              >
                <option value="ALL" className="text-fg bg-surface">
                  Все магазины
                </option>
                {retailStores.map((s) => (
                  <option key={s.id} value={s.id} className="text-fg bg-surface font-medium">
                    {formatStoreName(s.name)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {filteredSales.length > 0 ? (
          <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle overflow-x-auto pb-0.5 scrollbar-none" aria-label="Итоги за период">
            <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-fg-muted font-medium shrink-0">
              Чеков: <strong className="text-fg font-semibold">{periodSummary.receipts}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent font-bold shrink-0">
              {formatMoney(periodSummary.totalTjs)} TJS
            </span>
            <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border shrink-0">
              Нал: <strong className="text-fg-muted font-medium">{formatMoney(periodSummary.cashTjs)}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border shrink-0">
              Карта: <strong className="text-fg-muted font-medium">{formatMoney(periodSummary.cardTjs)}</strong>
            </span>
            {periodSummary.refunded > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-danger/10 border border-danger/20 text-danger font-medium shrink-0">
                Возвратов: <strong>{periodSummary.refunded}</strong>
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-fg-muted font-medium">0 чеков</span>
            <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border font-semibold text-fg">0.00 TJS</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {isSeller && !currentUser?.storeId ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-4 shadow-sm">
              <Store className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-fg mb-1">Магазин не привязан</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              Ваш аккаунт не привязан к торговой точке
            </p>
          </div>
        ) : isInitialLoading || (periodLoad === 'loading' && filteredSales.length === 0) ? (
          <LoadingState label="Загрузка продаж…" />
        ) : periodLoad === 'error' && filteredSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Не удалось загрузить продажи"
            description="Проверьте подключение к интернету и повторите. Показанный список мог быть неполным."
            action={<Button onClick={() => setPeriodLoadAttempt((n) => n + 1)}>Повторить</Button>}
          />
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Продажи не найдены"
            description={
              searchQuery
                ? `По запросу «${searchQuery}» ничего не найдено`
                : periodFilter === 'TODAY'
                ? 'За сегодня еще нет оформленных продаж'
                : `За ${selectedMonth ? selectedMonth : 'выбранный период'} продаж нет`
            }
            action={
              searchQuery ? (
                <Button
                  variant="secondary"
                  size="md"
                  className="!h-9 !px-3 text-xs"
                  onClick={() => setSearchQuery('')}
                >
                  Сбросить поиск
                </Button>
              ) : periodFilter === 'TODAY' ? (
                <Button
                  variant="secondary"
                  size="md"
                  className="!h-9 !px-3 text-xs"
                  onClick={resetToCurrentMonth}
                >
                  Показать продажи за месяц
                </Button>
              ) : (
                <Button
                  size="md"
                  className="!h-9 !px-3 text-xs"
                  onClick={() => {
                    setActivePage('SALE');
                    navigate('/');
                  }}
                >
                  Перейти к кассе (POS)
                </Button>
              )
            }
          />
        ) : (
          filteredSales.map((sale) => {
            const timeStr = new Date(sale.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const dateStr = new Date(sale.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

            return (
              <button
                key={sale.id}
                onClick={() => openSale(sale.id)}
                className="w-full text-left px-4 py-3 active:bg-surface-raised flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-accent">#{sale.receiptNumber}</span>
                    <span className="text-xs text-fg-subtle">{dateStr} {timeStr}</span>
                    {sale.status === 'EXCHANGED' && <Badge tone="accent">Обмен</Badge>}
                    {sale.status === 'REFUNDED' && <Badge tone="danger">Возврат</Badge>}
                  </div>
                  <p className="text-sm font-medium text-fg-muted mt-0.5 truncate">
                    {sale.items.map(i => `${i.brand} ${i.model}`).join(', ')}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-fg-subtle mt-0.5">
                    {!isStoreScoped && <><span>{formatStoreName(sale.storeName)}</span><span>·</span></>}
                    <span>{sale.sellerName}</span>
                    {sale.customerName && <><span>·</span><span>{sale.customerName}</span></>}
                  </div>
                </div>

                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    {sale.status === 'REFUNDED' ? (
                      <>
                        <p className="text-sm font-semibold line-through text-fg-subtle">{formatMoney(sale.totalTjs)} TJS</p>
                        <p className="text-xs text-danger font-semibold">Возвращено: {formatMoney(sale.actualRefundAmountTjs ?? sale.totalTjs)} TJS</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-fg-muted">{formatMoney(sale.totalTjs)} TJS</p>
                        <p className={`text-xs ${sale.paymentMethod === 'DEBT' && (sale.debtAmountTjs ?? 0) > 0 ? 'text-danger font-semibold' : 'text-fg-subtle'}`}>
                          {sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : sale.paymentMethod === 'DEBT' ? ((sale.debtAmountTjs ?? 0) > 0 ? `В долг (${formatMoney(sale.debtAmountTjs ?? 0)} TJS)` : 'В долг (погашено)') : 'Смешанная'}
                        </p>
                      </>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-fg-subtle" />
                </div>
              </button>
            );
          })
        )}
      </div>

      <Dialog
        open={!!selectedSale}
        onClose={closeDialog}
        title={selectedSale ? `Чек #${selectedSale.receiptNumber}` : ''}
        subtitle={selectedSale ? new Date(selectedSale.date).toLocaleString('ru-RU') : undefined}
        maxWidth="lg"
        footer={
          !selectedSale ? undefined : dialogView === 'details' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
              <Button variant="secondary" leftIcon={RefreshCw} onClick={() => handlePickAction('EXCHANGE')}>Обмен</Button>
              <Button variant="secondary" leftIcon={Wrench} onClick={() => handlePickAction('REPAIR')}>Ремонт</Button>
              {canRefund && selectedSale.status !== 'REFUNDED' && (
                <Button
                  variant="danger"
                  leftIcon={RotateCcw}
                  className="col-span-2 sm:col-span-1"
                  onClick={() => {
                    setStatus(null);
                    setRefundReason('');
                    setPenaltyFeeTjs('0');
                    setDialogView('refund');
                  }}
                >
                  Возврат
                </Button>
              )}
            </div>
          ) : dialogView === 'refund' ? (
            <>
              <Button variant="secondary" fullWidth disabled={isSubmittingRefund} onClick={() => setDialogView('details')}>Отмена</Button>
              <Button variant="danger" fullWidth loading={isSubmittingRefund} onClick={handleExecuteRefund}>Подтвердить возврат</Button>
            </>
          ) : (
            <Button variant="secondary" fullWidth leftIcon={ArrowLeft} onClick={() => setDialogView('details')}>Назад</Button>
          )
        }
      >
        {!selectedSale ? null : dialogView === 'details' ? (
          <div className="space-y-3.5">
            <div className="bg-surface p-3 rounded-lg border border-border space-y-1 text-sm">
              {!isStoreScoped && <div className="text-fg-muted">{formatStoreName(selectedSale.storeName)}</div>}
              <div className="text-accent font-semibold">Оператор: {selectedSale.sellerName}</div>
              {selectedSale.customerName && (
                <div className="text-fg-subtle text-xs pt-1 border-t border-border mt-1">Клиент: {selectedSale.customerName}</div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-fg-muted tracking-wide">Товары в чеке</p>
              <div className="divide-y divide-border border border-border rounded-lg bg-surface">
                {selectedSale.items.map((item, i) => (
                  <div key={i} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg-muted">{item.brand} {item.model}</p>
                      <p className="text-xs text-fg-subtle">{item.ram ? `${item.ram} · ` : ''}{item.storage} · {item.color}</p>
                      <p className="text-xs text-fg-subtle mt-0.5">
                        IMEI: {item.imei}{item.imei2 ? ` / ${item.imei2}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-fg-muted">{formatMoney(item.salePriceTjs)} TJS</p>
                      <p className="text-xs text-fg-subtle">≈ ${formatMoney(item.salePriceUsd)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedSale.exchangeEvents && selectedSale.exchangeEvents.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-accent tracking-wide">История обменов</p>
                <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg space-y-2 text-sm">
                  {selectedSale.exchangeEvents.map((ev, i) => (
                    <div key={i} className="border-b border-accent/20 pb-2 last:border-b-0 last:pb-0">
                      <p className="text-accent font-semibold text-xs">Обмен от {new Date(ev.date).toLocaleDateString('ru-RU')}</p>
                      <p className="text-fg-subtle text-xs">Сдан: {ev.returnedModel} (IMEI {ev.returnedImei}) за {formatMoney(ev.exchangeInValueTjs)} TJS</p>
                      <p className="text-fg-subtle text-xs">Выдан: {ev.replacementModel} (IMEI {ev.replacementImei}) за {formatMoney(ev.newPriceTjs)} TJS</p>
                      <p className="text-accent text-xs font-semibold mt-0.5">
                        Доплата: {ev.differenceTjs >= 0 ? `+${formatMoney(ev.differenceTjs)} TJS` : `${formatMoney(ev.differenceTjs)} TJS`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-surface p-3 rounded-lg border border-border space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-fg-subtle text-xs ">Способ оплаты</span>
                <span className="font-semibold text-fg-muted">
                  {selectedSale.paymentMethod === 'CASH' ? 'Наличные' : selectedSale.paymentMethod === 'CARD' ? 'Карта' : selectedSale.paymentMethod === 'DEBT' ? 'В долг' : 'Смешанная'}
                </span>
              </div>
              {selectedSale.cashAmountTjs > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-fg-subtle ">Наличными</span>
                  <span className="text-fg-muted">{formatMoney(selectedSale.cashAmountTjs)} TJS</span>
                </div>
              )}
              {selectedSale.cardAmountTjs > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-fg-subtle ">Картой</span>
                  <span className="text-fg-muted">{formatMoney(selectedSale.cardAmountTjs)} TJS</span>
                </div>
              )}
              {(selectedSale.debtAmountTjs ?? 0) > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-danger ">Остаток долга</span>
                  <span className="text-danger font-semibold">{formatMoney(selectedSale.debtAmountTjs ?? 0)} TJS</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border font-semibold">
                <span className="text-fg-muted text-xs">Итого</span>
                <span className="text-accent text-base">{formatMoney(selectedSale.totalTjs)} TJS</span>
              </div>
            </div>

            {selectedSale.status === 'REFUNDED' && (
              <div className="bg-danger/10 border border-danger/30 p-3 rounded-lg space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-danger tracking-wide">
                  Возврат {selectedSale.refundedAt ? `от ${new Date(selectedSale.refundedAt).toLocaleString('ru-RU')}` : ''}
                </p>
                {selectedSale.refundReason && (
                  <p className="text-xs text-fg-subtle">Причина: {selectedSale.refundReason}</p>
                )}
                {(selectedSale.penaltyFeeTjs ?? 0) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-fg-subtle ">Штраф удержан</span>
                    <span className="text-warning font-semibold">{formatMoney(selectedSale.penaltyFeeTjs ?? 0)} TJS</span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-danger/20 font-semibold">
                  <span className="text-fg-muted text-xs">Возвращено клиенту</span>
                  <span className="text-danger text-base">
                    {formatMoney(selectedSale.actualRefundAmountTjs ?? selectedSale.totalTjs)} TJS
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : dialogView === 'refund' ? (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-subtle">Товары будут оприходованы на склад по исходной себестоимости закупки ($).</p>

            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1">Причина возврата <span className="text-danger">*</span></label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Брак / Отказ покупателя / Ошибка"
                className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger"
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-medium text-fg-muted mb-1">
                <span>Удержать штраф за возврат (TJS)</span>
                <span className="text-warning font-normal">100% в чистую прибыль</span>
              </label>
              <div className="flex items-center gap-1.5 mb-2">
                <input step="0.01"
                  type="number"
                  min="0"
                  max={selectedSale.totalTjs - (selectedSale.debtAmountTjs ?? 0)}
                  value={penaltyFeeTjs}
                  onChange={(e) => setPenaltyFeeTjs(e.target.value)}
                  placeholder="0"
                  className="flex-1 h-11 rounded-lg bg-bg border border-border px-3 text-sm font-semibold text-warning focus:outline-none focus:border-warning focus:ring-1 focus:ring-warning"
                />
                {[0, 5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPenaltyFeeTjs(Math.round(((selectedSale.totalTjs - (selectedSale.debtAmountTjs ?? 0)) * pct) / 100).toString())}
                    className="h-11 px-2.5 bg-surface hover:bg-surface-raised border border-border text-xs font-semibold text-fg-muted rounded-lg transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              <div className="p-3 rounded-lg bg-surface border border-border space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Сумма в чеке</span>
                  <span className="text-fg-muted">{formatMoney(selectedSale.totalTjs)} TJS</span>
                </div>
                {(selectedSale.debtAmountTjs ?? 0) > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>Непогашенный долг (будет списан)</span>
                    <span>{formatMoney(selectedSale.debtAmountTjs ?? 0)} TJS</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span className="text-fg-muted">Возврат покупателю</span>
                  <span className="text-accent">{formatMoney(Math.max(0, (selectedSale.totalTjs - (selectedSale.debtAmountTjs ?? 0)) - (parseFloat(penaltyFeeTjs) || 0)))} TJS</span>
                </div>
                {(parseFloat(penaltyFeeTjs) || 0) > 0 && (
                  <div className="flex justify-between pt-1 border-t border-border font-semibold">
                    <span className="text-warning">Штраф за возврат</span>
                    <span className="text-warning">+{formatMoney(parseFloat(penaltyFeeTjs) || 0)} TJS</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1">Способ возврата денег</label>
              <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as 'CASH' | 'CARD')} className="w-full">
                <option value="CASH">Наличные из кассы</option>
                <option value="CARD">Безналичный возврат</option>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-fg-subtle mb-1">
              В чеке несколько товаров — выберите, какой из них {dialogView === 'pick-exchange' ? 'обменять' : 'принять в ремонт'}.
            </p>
            {selectedSale.items.map((item, i) => (
              <button
                key={i}
                onClick={() => navigateWithItem(dialogView === 'pick-exchange' ? 'EXCHANGE' : 'REPAIR', item)}
                className="w-full p-3 rounded-lg border border-border bg-surface active:bg-surface-raised text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg-muted">{item.brand} {item.model}</p>
                  <p className="text-xs text-fg-subtle">{item.ram ? `${item.ram} · ` : ''}{item.storage} · {item.color} · IMEI: {item.imei}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
};
