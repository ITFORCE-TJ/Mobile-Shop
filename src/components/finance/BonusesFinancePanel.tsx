import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { decimal, moneyNumber } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { mapSale, buildNameLookup } from '../../api/mappers';
import { Sale, Device, SupplierBonus } from '../../types';
import {
  Award,
  Gift,
  Smartphone,
  DollarSign,
  PackageCheck,
  Search,
  Calendar,
  User,
  Receipt,
  Store as StoreIcon,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Layers,
  Info,
  X
} from 'lucide-react';
import { MonthPicker } from '../ui/MonthPicker';
import { StatCard } from '../ui/StatCard';
import { Badge } from '../ui/Badge';
import { useReportsSummary, usd, tjs, monthLabel } from './reportTypes';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { BonusPoolEntry, BonusDistributionLog } from '../../types';

interface BonusesFinancePanelProps {
  month: string;
  onMonthChange: (month: string) => void;
}

type SubTab = 'ALL' | 'CASH' | 'SOLD_DEVICES' | 'STOCK_DEVICES';

interface SoldBonusDevice {
  saleId: string;
  receiptNumber: number;
  saleDate: string;
  storeName: string;
  sellerName: string;
  customerName?: string;
  deviceId: string;
  imei: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  salePriceUsd: number;
  salePriceTjs: number;
  profitUsd: number;
  profitTjs: number;
}

interface BonusPoolResponse {
  pendingProfitUsd: number;
  pendingProfitTjs: number;
  pendingCount: number;
  pendingEntries: BonusPoolEntry[];
  history: BonusDistributionLog[];
}

export const BonusesFinancePanel: React.FC<BonusesFinancePanelProps> = ({ month, onMonthChange }) => {
  const {
    supplierBonuses,
    devices,
    users,
    todayRate,
  } = useAppFields('supplierBonuses', 'devices', 'users', 'todayRate');

  const namesLookup = useMemo(() => buildNameLookup(users), [users]);
  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;
  const periodLabel = monthLabel(month);

  // Authoritative server aggregates for the month
  const { summary, loading: summaryLoading, error: summaryError } = useReportsSummary(month, 'all');

  const [activeSubTab, setActiveSubTab] = useState<SubTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBonus, setSelectedBonus] = useState<SupplierBonus | null>(null);
  const [selectedSoldDevice, setSelectedSoldDevice] = useState<SoldBonusDevice | null>(null);
  const [selectedStockDevice, setSelectedStockDevice] = useState<Device | null>(null);

  const dataRefreshRevision = useDataRefreshRevision();

  // Bonus pool of the current quarter (read-only here: the quarter is closed on the Bonuses page)
  const [bonusPool, setBonusPool] = useState<BonusPoolResponse | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolDetailsTab, setPoolDetailsTab] = useState<'ENTRIES' | 'HISTORY'>('ENTRIES');
  const [isPoolExpanded, setIsPoolExpanded] = useState(false);
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);

  const fetchBonusPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const data = await apiClient<BonusPoolResponse>('/bonuses/pool');
      setBonusPool(data);
    } catch (e: any) {
      console.error('Failed to load bonus pool:', e);
    } finally {
      setPoolLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBonusPool();
  }, [fetchBonusPool, dataRefreshRevision]);

  const poolPendingUsd = Number(bonusPool?.pendingProfitUsd) || 0;

  // Load itemized sales for this month to isolate sold bonus devices
  const [monthSales, setMonthSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSalesLoading(true);
    setSalesError(null);

    const params = new URLSearchParams({ period: 'SPECIFIC_MONTH', month });
    apiClient<any[]>(`/sales?${params.toString()}`, { signal: controller.signal })
      .then((rawSales) => {
        if (!cancelled) {
          setMonthSales(rawSales.map((s) => mapSale(s, namesLookup)));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load sales for bonuses panel:', err);
          setSalesError(err.message || 'Не удалось загрузить продажи');
        }
      })
      .finally(() => {
        if (!cancelled) setSalesLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [month]);

  // Fast device lookup map to identify bonus devices by ID or IMEI
  const bonusDeviceIds = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((d) => {
      if (d.isBonus || d.costBasisUsd === 0) {
        set.add(d.id);
        if (d.imei) set.add(d.imei);
      }
    });
    return set;
  }, [devices]);

  // Extract all sold bonus phones in the month
  const soldBonusDevices = useMemo<SoldBonusDevice[]>(() => {
    const results: SoldBonusDevice[] = [];
    for (const sale of monthSales) {
      if (sale.status === 'REFUNDED') continue;
      for (const item of sale.items) {
        const itemCost = item.costBasisUsd ?? item.purchaseCostUsd ?? 0;
        const isBonusDevice = itemCost === 0 || bonusDeviceIds.has(item.deviceId) || bonusDeviceIds.has(item.imei);
        if (isBonusDevice) {
          const salePriceUsd = item.salePriceUsd || moneyNumber(decimal(item.salePriceTjs).div(sale.exchangeRate || rate));
          const salePriceTjs = item.salePriceTjs || moneyNumber(decimal(salePriceUsd).mul(sale.exchangeRate || rate));
          results.push({
            saleId: sale.id,
            receiptNumber: sale.receiptNumber,
            saleDate: sale.date,
            storeName: sale.storeName,
            sellerName: sale.sellerName,
            customerName: sale.customerName,
            deviceId: item.deviceId,
            imei: item.imei,
            brand: item.brand,
            model: item.model,
            storage: item.storage,
            color: item.color,
            salePriceUsd: +salePriceUsd.toFixed(2),
            salePriceTjs: +salePriceTjs.toFixed(2),
            profitUsd: +salePriceUsd.toFixed(2),
            profitTjs: +salePriceTjs.toFixed(2),
          });
        }
      }
    }
    return results.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  }, [monthSales, bonusDeviceIds, rate]);

  // Monetary bonuses for the selected month
  const cashBonusesForMonth = useMemo<SupplierBonus[]>(() => {
    return supplierBonuses
      .filter((b) => {
        if (b.bonusType !== 'CASH_DISCOUNT') return false;
        const dateStr = b.dateReceived || b.date || '';
        return dateStr.startsWith(month);
      })
      .sort((a, b) => {
        const da = new Date(a.dateReceived || a.date || 0).getTime();
        const db = new Date(b.dateReceived || b.date || 0).getTime();
        return db - da;
      });
  }, [supplierBonuses, month]);

  // Bonus devices currently in stock
  const inStockBonusDevices = useMemo<Device[]>(() => {
    return devices
      .filter((d) => {
        if (!d.isBonus && d.costBasisUsd !== 0) return false;
        return d.status === 'STORE_STOCK' || d.status === 'MAIN_WAREHOUSE' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
      })
      .sort((a, b) => {
        const da = new Date(a.receivedDate || a.createdAt || 0).getTime();
        const db = new Date(b.receivedDate || b.createdAt || 0).getTime();
        return db - da;
      });
  }, [devices]);

  // Filtered lists according to search query
  const q = searchQuery.trim().toLowerCase();

  const filteredCashBonuses = useMemo(() => {
    if (!q) return cashBonusesForMonth;
    return cashBonusesForMonth.filter((b) => {
      const title = (b.campaignTitle || b.campaignName || '').toLowerCase();
      const sup = (b.supplierName || '').toLowerCase();
      return title.includes(q) || sup.includes(q);
    });
  }, [cashBonusesForMonth, q]);

  const filteredSoldDevices = useMemo(() => {
    if (!q) return soldBonusDevices;
    return soldBonusDevices.filter((item) => {
      const matchImei = item.imei.toLowerCase().includes(q);
      const matchModel = `${item.brand} ${item.model}`.toLowerCase().includes(q);
      const matchStore = item.storeName.toLowerCase().includes(q);
      const matchSeller = item.sellerName.toLowerCase().includes(q);
      const matchReceipt = String(item.receiptNumber).includes(q);
      return matchImei || matchModel || matchStore || matchSeller || matchReceipt;
    });
  }, [soldBonusDevices, q]);

  const filteredStockDevices = useMemo(() => {
    if (!q) return inStockBonusDevices;
    return inStockBonusDevices.filter((d) => {
      const matchImei = d.imei.toLowerCase().includes(q);
      const matchModel = `${d.brand} ${d.model}`.toLowerCase().includes(q);
      const matchLoc = (d.locationName || '').toLowerCase().includes(q);
      const matchSup = (d.supplierName || '').toLowerCase().includes(q);
      const matchCampaign = (d.bonusCampaign || '').toLowerCase().includes(q);
      return matchImei || matchModel || matchLoc || matchSup || matchCampaign;
    });
  }, [inStockBonusDevices, q]);

  // Aggregate numbers
  const cashBonusUsd = summary?.periodCashBonusesUsd ?? cashBonusesForMonth.reduce((s, b) => s + (b.amountUsd || 0), 0);
  const cashBonusTjs = summary?.periodCashBonusesTjs ?? cashBonusesForMonth.reduce((s, b) => s + (b.amountUsd || 0) * (b.exchangeRate || rate), 0);

  const soldProfitUsd = summary?.giftDeviceProfitUsd ?? soldBonusDevices.reduce((s, d) => s + d.profitUsd, 0);
  const soldProfitTjs = summary?.giftDeviceProfitTjs ?? soldBonusDevices.reduce((s, d) => s + d.profitTjs, 0);
  const soldUnits = summary?.giftDeviceUnitsSold ?? soldBonusDevices.length;

  const totalBonusProfitUsd = +(cashBonusUsd + soldProfitUsd).toFixed(2);
  const totalBonusProfitTjs = +(cashBonusTjs + soldProfitTjs).toFixed(2);
  const inStockUnits = summary?.freeDeviceBonusesInStock ?? inStockBonusDevices.length;

  const monthPicker = (
    <MonthPicker
      value={month}
      onChange={onMonthChange}
      className="h-8 px-2.5 rounded-lg border border-accent/40 bg-surface text-xs font-semibold text-accent focus:outline-none"
    />
  );

  return (
    <div className="flex flex-col min-h-full">
      {/* Top Filter Bar */}
      <div className="px-3 py-2 border-b border-border bg-surface flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {monthPicker}
          <span className="text-xs text-fg-subtle hidden sm:inline truncate">
            Учёт бонусов за {periodLabel}
          </span>
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:w-64 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по IMEI, модели..."
            className="w-full h-8 pl-8 pr-7 rounded-lg bg-surface-raised border border-border text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className={`p-2.5 sm:p-4 space-y-3 sm:space-y-4 ${summaryLoading ? 'opacity-70 transition-opacity' : ''}`}>
        {/* KPI Summary Cards */}
        <div>
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wide flex items-center gap-1.5 truncate">
              <Award className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">Итоги по бонусам за {periodLabel}</span>
            </h3>
            <Badge tone="neutral" className="text-[10px] py-0 px-2 shrink-0">
              Не входит в прибыль
            </Badge>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {/* Card 1: Total bonus profit */}
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-2.5 sm:p-3 flex flex-col justify-between shadow-2xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-accent truncate">Всего бонусов</span>
                  <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
                </div>
                <div className="text-base sm:text-lg font-bold font-mono tracking-tight text-accent truncate">
                  {usd(totalBonusProfitUsd)}
                </div>
              </div>
              <div className="text-[10px] sm:text-[11px] font-semibold text-accent/80 mt-1 truncate">
                ≈ {tjs(totalBonusProfitTjs)}
              </div>
            </div>

            {/* Card 2: Cash discounts */}
            <div className="rounded-xl border border-border bg-surface p-2.5 sm:p-3 flex flex-col justify-between shadow-2xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-fg-subtle truncate">Денежные скидки</span>
                  <DollarSign className="w-3.5 h-3.5 text-success shrink-0" />
                </div>
                <div className="text-base sm:text-lg font-bold font-mono text-success truncate">
                  {usd(cashBonusUsd)}
                </div>
              </div>
              <div className="text-[10px] sm:text-[11px] text-fg-subtle mt-1 truncate">
                {cashBonusesForMonth.length} начисл. · {tjs(cashBonusTjs)}
              </div>
            </div>

            {/* Card 3: Sold gift phones */}
            <div className="rounded-xl border border-border bg-surface p-2.5 sm:p-3 flex flex-col justify-between shadow-2xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-fg-subtle truncate">Бонусные телефоны</span>
                  <Smartphone className="w-3.5 h-3.5 text-warning shrink-0" />
                </div>
                <div className="text-base sm:text-lg font-bold font-mono text-warning truncate">
                  {usd(soldProfitUsd)}
                </div>
              </div>
              <div className="text-[10px] sm:text-[11px] text-fg-subtle mt-1 truncate">
                {soldUnits} шт. продано
              </div>
            </div>

            {/* Card 4: Gift phones in stock */}
            <div className="rounded-xl border border-border bg-surface p-2.5 sm:p-3 flex flex-col justify-between shadow-2xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-fg-subtle truncate">Остаток на складе</span>
                  <PackageCheck className="w-3.5 h-3.5 text-info shrink-0" />
                </div>
                <div className="text-base sm:text-lg font-bold font-mono text-info truncate">
                  {inStockUnits} шт.
                </div>
              </div>
              <div className="text-[10px] sm:text-[11px] text-fg-subtle mt-1 truncate">
                Себестоимость $0
              </div>
            </div>
          </div>
        </div>

        {/* Bonus pool of the current quarter (read-only; closed on the Bonuses page) */}
        <div className="rounded-2xl border border-emerald-500/30 bg-linear-to-br from-emerald-500/10 via-surface to-surface overflow-hidden shadow-xs">
          {/* Header */}
          <div className="p-3 sm:p-3.5 border-b border-border/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-bold text-fg truncate">Квартальный пул бонусов</h4>
                  {poolPendingUsd > 0 ? (
                    <Badge tone="success" className="text-[10px] py-0 px-1.5">Ждёт закрытия</Badge>
                  ) : (
                    <Badge tone="neutral" className="text-[10px] py-0 px-1.5">Пул пуст</Badge>
                  )}
                </div>
                <p className="text-[11px] text-fg-subtle truncate">
                  При инкассации средства поступают на Бонусный счёт
                </p>
              </div>
            </div>

            <span className="text-[10px] text-fg-subtle bg-surface border border-border px-2 py-1 rounded-md shrink-0 hidden sm:inline">
              Управление на странице «Бонусы»
            </span>
          </div>

          {/* Metric cards */}
          <div className="p-2.5 sm:p-3 grid grid-cols-3 gap-2 bg-surface-raised/30">
            <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-emerald-500/20 shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5 truncate">
                Прибыль пула
              </span>
              <div className="text-sm sm:text-lg font-black font-mono text-emerald-400 truncate">
                {usd(poolPendingUsd)}
              </div>
              <div className="text-[10px] font-semibold text-emerald-400/80 truncate">
                ≈ {tjs(Number(bonusPool?.pendingProfitTjs) || poolPendingUsd * rate)}
              </div>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-fg-subtle block mb-0.5 truncate">
                Устройств
              </span>
              <div className="text-sm sm:text-lg font-black font-mono text-fg truncate">
                {bonusPool?.pendingCount || 0} шт.
              </div>
              <div className="text-[10px] text-fg-subtle truncate">
                В ожидании
              </div>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border shadow-2xs">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-fg-subtle block mb-0.5 truncate">
                Закрытий
              </span>
              <div className="text-sm sm:text-lg font-black font-mono text-fg truncate">
                {bonusPool?.history?.length || 0}
              </div>
              <div className="text-[10px] text-fg-subtle truncate">
                В истории
              </div>
            </div>
          </div>

          {/* Collapsible Details Drawer: Entries & History */}
          <div className="border-t border-border/80">
            <div className="px-3 py-1.5 bg-surface flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setPoolDetailsTab('ENTRIES'); setIsPoolExpanded(true); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    isPoolExpanded && poolDetailsTab === 'ENTRIES'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-fg-subtle hover:text-fg'
                  }`}
                >
                  Устройства ({bonusPool?.pendingEntries?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => { setPoolDetailsTab('HISTORY'); setIsPoolExpanded(true); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    isPoolExpanded && poolDetailsTab === 'HISTORY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-fg-subtle hover:text-fg'
                  }`}
                >
                  История ({bonusPool?.history?.length || 0})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsPoolExpanded(!isPoolExpanded)}
                className="p-1 text-fg-subtle hover:text-fg flex items-center gap-1 text-xs cursor-pointer"
              >
                <span>{isPoolExpanded ? 'Скрыть' : 'Показать'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isPoolExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isPoolExpanded && (
              <div className="p-3 sm:p-4 border-t border-border bg-surface-raised/20 max-h-80 overflow-y-auto">
                {poolDetailsTab === 'ENTRIES' ? (
                  !bonusPool?.pendingEntries || bonusPool.pendingEntries.length === 0 ? (
                    <div className="text-center py-6 text-xs text-fg-subtle">
                      В активном пуле нет устройств. При продаже товаров, отмеченных как бонус, они автоматически появятся здесь.
                    </div>
                  ) : (
                    <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
                      {bonusPool.pendingEntries.map((e) => (
                        <div key={e.id} className="p-2.5 sm:p-3 flex items-center justify-between gap-2.5 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-fg truncate">{e.brand} {e.model}</span>
                              <span className="font-mono text-[11px] text-fg-subtle">IMEI: {e.imei}</span>
                            </div>
                            <div className="text-[11px] text-fg-subtle font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                              {e.sale?.receiptNumber && (
                                <span>Чек #{e.sale.receiptNumber}</span>
                              )}
                              <span>Дата: {e.createdAt.substring(0, 10)}</span>
                              <Badge tone="warning" className="text-[10px] py-0 px-1.5">Бонус ($0 себестоимость)</Badge>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-bold font-mono text-emerald-400">
                              +{usd(e.profitUsd)}
                            </div>
                            <div className="text-[10px] text-fg-subtle">
                              ≈ {tjs(e.profitTjs)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  !bonusPool?.history || bonusPool.history.length === 0 ? (
                    <div className="text-center py-6 text-xs text-fg-subtle">
                      Кварталы бонусов ещё не закрывались.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {bonusPool.history.map((log) => {
                        const isDist = log.type === 'DISTRIBUTION';
                        const allocs = Array.isArray(log.allocations) ? log.allocations : [];
                        return (
                          <div key={log.id} className="p-2.5 sm:p-3 rounded-xl border border-border bg-surface text-xs space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge tone={isDist ? 'success' : 'neutral'} className="text-[10px] py-0 px-1.5">
                                  {isDist ? 'Распределение (до правила)' : 'Закрытие квартала'}
                                </Badge>
                                <span className="font-bold text-fg">{log.periodName}</span>
                                <span className="text-[11px] text-fg-subtle">
                                  {log.createdAt ? new Date(log.createdAt).toLocaleDateString('ru-RU') : ''}
                                </span>
                              </div>
                              <div className="font-mono font-bold text-fg">
                                {isDist ? `+${usd(log.totalAmountUsd)}` : `$${Number(log.totalAmountUsd || 0).toFixed(2)}`}
                              </div>
                            </div>
                            {log.note && (
                              <p className="text-[11px] text-fg-subtle italic">
                                {log.note}
                              </p>
                            )}
                            {isDist && allocs.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {allocs.map((a: any, idx: number) => (
                                  <span key={idx} className="px-2 py-0.5 rounded bg-surface-raised border border-border text-[11px] text-fg-muted font-mono">
                                    {a.ownerName || a.ownerId}: <strong className="text-emerald-400">${a.amountUsd}</strong>
                                  </span>
                                ))}
                              </div>
                            )}
                            {log.performedByName && (
                              <div className="text-[10px] text-fg-subtle pt-0.5">
                                Выполнил: {log.performedByName}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Informational Explainer Banner (Compact & Collapsible) */}
        <div className="rounded-xl bg-surface border border-border p-2.5 text-xs text-fg-muted space-y-1">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setIsExplainerOpen(!isExplainerOpen)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Info className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="font-semibold text-fg text-xs truncate">
                Правило раздельного учёта бонусов
              </span>
            </div>
            <span className="text-[11px] text-accent flex items-center gap-1 shrink-0 font-medium">
              <span>{isExplainerOpen ? 'Скрыть' : 'Подробнее'}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isExplainerOpen ? 'rotate-180' : ''}`} />
            </span>
          </div>
          {isExplainerOpen && (
            <p className="text-fg-subtle text-[11px] leading-relaxed pt-1.5 border-t border-border/50">
              Бонусы не являются операционным доходом магазина: <strong>денежные бонусы</strong> и прибыль от <strong>бонусных телефонов</strong> ($0 себестоимость) не входят в прибыль и учитываются на отдельном Бонусном счёте компании. Денежный бонус зачисляется при регистрации, прибыль с телефонов — при инкассации. Счётчики обнуляются при закрытии квартала на странице «Бонусы».
            </p>
          )}
        </div>

        {/* Sub-tabs / Segmented Switcher */}
        <div className="p-1 rounded-xl bg-surface-raised border border-border flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSubTab('ALL')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap cursor-pointer ${
              activeSubTab === 'ALL'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-fg-muted hover:text-fg hover:bg-surface/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Все</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('CASH')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap cursor-pointer ${
              activeSubTab === 'CASH'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-fg-muted hover:text-fg hover:bg-surface/60'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Денежные</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeSubTab === 'CASH' ? 'bg-black/20 text-accent-fg' : 'bg-surface border border-border text-fg-subtle'
            }`}>
              {filteredCashBonuses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('SOLD_DEVICES')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap cursor-pointer ${
              activeSubTab === 'SOLD_DEVICES'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-fg-muted hover:text-fg hover:bg-surface/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Проданные</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeSubTab === 'SOLD_DEVICES' ? 'bg-black/20 text-accent-fg' : 'bg-surface border border-border text-fg-subtle'
            }`}>
              {filteredSoldDevices.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('STOCK_DEVICES')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap cursor-pointer ${
              activeSubTab === 'STOCK_DEVICES'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-fg-muted hover:text-fg hover:bg-surface/60'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>На складе</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeSubTab === 'STOCK_DEVICES' ? 'bg-black/20 text-accent-fg' : 'bg-surface border border-border text-fg-subtle'
            }`}>
              {filteredStockDevices.length}
            </span>
          </button>
        </div>

        {/* SECTION 1: Cash Discounts */}
        {(activeSubTab === 'ALL' || activeSubTab === 'CASH') && (
          <div className="rounded-2xl bg-surface border border-border overflow-hidden">
            <div className="p-3.5 border-b border-border bg-surface-raised/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-success" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-fg">
                  Денежные бонусы от поставщиков ({filteredCashBonuses.length})
                </h4>
              </div>
              <div className="text-xs font-bold text-success font-mono">
                +{usd(cashBonusUsd)} ({tjs(cashBonusTjs)})
              </div>
            </div>

            {filteredCashBonuses.length === 0 ? (
              <div className="p-8 text-center text-fg-subtle text-xs">
                {searchQuery
                  ? 'Денежные бонусы по заданному запросу не найдены'
                  : `За ${periodLabel} денежных бонусов не зафиксировано`}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredCashBonuses.map((bonus) => {
                  const bonusUsd = bonus.amountUsd || 0;
                  const bonusRate = bonus.exchangeRate || rate;
                  const bonusTjs = Math.round(bonusUsd * bonusRate);
                  const dateStr = bonus.dateReceived || bonus.date || '';

                  return (
                    <div
                      key={bonus.id}
                      onClick={() => setSelectedBonus(bonus)}
                      className="p-2.5 sm:p-3 hover:bg-surface-raised cursor-pointer transition-colors flex items-center justify-between gap-2.5 group"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-fg truncate">
                            {bonus.campaignTitle || bonus.campaignName || `Бонус от ${bonus.supplierName}`}
                          </span>
                          <Badge tone="success" className="text-[10px] py-0 px-1.5">
                            Скидка
                          </Badge>
                          <span className="text-[10px] text-fg-subtle flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {dateStr}
                          </span>
                        </div>
                        <div className="text-[11px] text-fg-subtle flex items-center gap-2 flex-wrap">
                          <span>
                            Поставщик: <strong className="text-fg">{bonus.supplierName}</strong>
                          </span>
                          <span>·</span>
                          <span>Курс: {bonusRate}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-right">
                        <div>
                          <div className="text-xs sm:text-sm font-bold font-mono text-success">
                            +{usd(bonusUsd)}
                          </div>
                          <div className="text-[10px] sm:text-[11px] font-semibold text-fg-subtle">
                            ≈ {tjs(bonusTjs)}
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-fg-subtle group-hover:text-accent transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: Sold Gift Phones (Pure profit) */}
        {(activeSubTab === 'ALL' || activeSubTab === 'SOLD_DEVICES') && (
          <div className="rounded-2xl bg-surface border border-border overflow-hidden">
            <div className="p-3.5 border-b border-border bg-surface-raised/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-warning" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-fg">
                  Проданные бонусные телефоны ({filteredSoldDevices.length})
                </h4>
              </div>
              <div className="text-xs font-bold text-accent font-mono">
                +{usd(soldProfitUsd)} ({tjs(soldProfitTjs)})
              </div>
            </div>

            {salesLoading ? (
              <div className="p-8 text-center text-fg-subtle text-xs animate-pulse">
                Загрузка продаж бонусных устройств…
              </div>
            ) : filteredSoldDevices.length === 0 ? (
              <div className="p-8 text-center text-fg-subtle text-xs">
                {searchQuery
                  ? 'Проданные бонусные телефоны по запросу не найдены'
                  : `За ${periodLabel} бонусные телефоны не продавались`}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredSoldDevices.map((item, idx) => (
                  <div
                    key={`${item.saleId}-${item.deviceId}-${idx}`}
                    onClick={() => setSelectedSoldDevice(item)}
                    className="p-2.5 sm:p-3 hover:bg-surface-raised cursor-pointer transition-colors flex items-center justify-between gap-2.5 group"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-fg truncate">
                          {item.brand} {item.model}
                        </span>
                        <span className="text-[10px] text-fg-subtle">
                          {item.storage} {item.color}
                        </span>
                        <Badge tone="warning" className="text-[10px] py-0 px-1.5">
                          Подарочный
                        </Badge>
                      </div>

                      <div className="text-[11px] text-fg-subtle font-mono flex items-center gap-1.5 flex-wrap">
                        <span>IMEI: {item.imei}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Receipt className="w-3 h-3 text-fg-subtle" />
                          #{item.receiptNumber}
                        </span>
                        <span>·</span>
                        <span>{item.storeName}</span>
                        <span>·</span>
                        <span>{item.saleDate}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-right">
                      <div>
                        <div className="text-xs sm:text-sm font-bold font-mono text-accent">
                          +{usd(item.salePriceUsd)}
                        </div>
                        <div className="text-[10px] sm:text-[11px] font-semibold text-accent/80">
                          {tjs(item.salePriceTjs)}
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-fg-subtle group-hover:text-accent transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: Free Devices in Stock */}
        {(activeSubTab === 'ALL' || activeSubTab === 'STOCK_DEVICES') && (
          <div className="rounded-2xl bg-surface border border-border overflow-hidden">
            <div className="p-3.5 border-b border-border bg-surface-raised/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-info" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-fg">
                  Бонусные телефоны в наличии на складе ({filteredStockDevices.length})
                </h4>
              </div>
              <Badge tone="info">
                Готовы к продаже
              </Badge>
            </div>

            {filteredStockDevices.length === 0 ? (
              <div className="p-8 text-center text-fg-subtle text-xs">
                {searchQuery
                  ? 'Бонусные телефоны на складе по запросу не найдены'
                  : 'На складе сейчас нет нераспроданных бонусных телефонов'}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredStockDevices.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => setSelectedStockDevice(d)}
                    className="p-2.5 sm:p-3 hover:bg-surface-raised cursor-pointer transition-colors flex items-center justify-between gap-2.5 group"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-fg truncate">
                          {d.brand} {d.model}
                        </span>
                        <span className="text-[10px] text-fg-subtle">
                          {d.storage} {d.color}
                        </span>
                        <Badge tone="neutral" className="text-[10px] py-0 px-1.5">
                          $0 себестоимость
                        </Badge>
                        {d.bonusCampaign && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-raised border border-border text-fg-muted font-medium">
                            {d.bonusCampaign}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-fg-subtle font-mono flex items-center gap-1.5 flex-wrap">
                        <span>IMEI: {d.imei}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <StoreIcon className="w-3 h-3 text-fg-subtle" />
                          {d.locationName || 'Главный склад'}
                        </span>
                        {d.supplierName && (
                          <>
                            <span>·</span>
                            <span>{d.supplierName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-right">
                      <div>
                        <div className="text-xs font-bold text-info">
                          В наличии
                        </div>
                        <div className="text-[10px] text-fg-subtle">
                          100% в прибыль
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-fg-subtle group-hover:text-accent transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: Cash Bonus Details */}
      {selectedBonus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-success" />
                <div>
                  <h4 className="text-sm font-bold">Денежный бонус от поставщика</h4>
                  <p className="text-[11px] text-fg-subtle">{selectedBonus.supplierName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBonus(null)}
                className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-success/10 border border-success/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-success">Начислено в прибыль</span>
                  <div className="text-lg font-bold font-mono text-success">
                    +{usd(selectedBonus.amountUsd || 0)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-success/80">В сомони (TJS)</span>
                  <div className="text-sm font-bold font-mono text-success">
                    ≈ {tjs(Math.round((selectedBonus.amountUsd || 0) * (selectedBonus.exchangeRate || rate)))}
                  </div>
                </div>
              </div>

              <div className="space-y-2 border border-border rounded-xl p-3 bg-surface-raised/40">
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-fg-subtle">Название акции / кампании:</span>
                  <span className="font-semibold text-fg text-right">
                    {selectedBonus.campaignTitle || selectedBonus.campaignName || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-fg-subtle">Поставщик:</span>
                  <span className="font-semibold text-fg">{selectedBonus.supplierName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-fg-subtle">Дата начисления:</span>
                  <span className="font-semibold text-fg">{selectedBonus.dateReceived || selectedBonus.date || '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-fg-subtle">Курс валюты на момент операции:</span>
                  <span className="font-semibold font-mono text-fg">{selectedBonus.exchangeRate || rate} TJS/$</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedBonus(null)}
                className="w-full py-2 rounded-xl bg-surface-raised border border-border text-xs font-semibold text-fg hover:bg-surface-raised/80 transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Sold Bonus Device Details */}
      {selectedSoldDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-warning" />
                <div>
                  <h4 className="text-sm font-bold">
                    {selectedSoldDevice.brand} {selectedSoldDevice.model}
                  </h4>
                  <p className="text-[11px] text-fg-subtle">
                    Чек #{selectedSoldDevice.receiptNumber} · {selectedSoldDevice.saleDate}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSoldDevice(null)}
                className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-accent">Чистая прибыль (100%)</span>
                  <div className="text-lg font-bold font-mono text-accent">
                    +{usd(selectedSoldDevice.profitUsd)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-accent/80">Себестоимость</span>
                  <div className="text-sm font-bold font-mono text-fg">
                    $0.00 (Подарок)
                  </div>
                </div>
              </div>

              <div className="space-y-2 border border-border rounded-xl p-3 bg-surface-raised/40">
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-fg-subtle">Память / Цвет:</span>
                  <span className="font-semibold text-fg">
                    {selectedSoldDevice.storage} {selectedSoldDevice.color}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60 font-mono">
                  <span className="text-fg-subtle">IMEI:</span>
                  <span className="font-semibold text-fg">{selectedSoldDevice.imei}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-fg-subtle">Точка продажи:</span>
                  <span className="font-semibold text-fg">{selectedSoldDevice.storeName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-fg-subtle">Продавец:</span>
                  <span className="font-semibold text-fg">{selectedSoldDevice.sellerName}</span>
                </div>
                {selectedSoldDevice.customerName && (
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-fg-subtle">Покупатель:</span>
                    <span className="font-semibold text-fg">{selectedSoldDevice.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-fg-subtle">Сумма в сомони (TJS):</span>
                  <span className="font-bold font-mono text-accent">{tjs(selectedSoldDevice.salePriceTjs)}</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedSoldDevice(null)}
                className="w-full py-2 rounded-xl bg-surface-raised border border-border text-xs font-semibold text-fg hover:bg-surface-raised/80 transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: In-Stock Bonus Device Details */}
      {selectedStockDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-info" />
                <div>
                  <h4 className="text-sm font-bold">
                    {selectedStockDevice.brand} {selectedStockDevice.model}
                  </h4>
                  <p className="text-[11px] text-fg-subtle">Бонусное устройство в наличии</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStockDevice(null)}
                className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-info/10 border border-info/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-info">Статус</span>
                  <div className="text-sm font-bold text-info">
                    На складе (готово к продаже)
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-info/80">Себестоимость</span>
                  <div className="text-sm font-bold font-mono text-fg">
                    $0.00
                  </div>
                </div>
              </div>

              <div className="space-y-2 border border-border rounded-xl p-3 bg-surface-raised/40">
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-fg-subtle">Память / Цвет:</span>
                  <span className="font-semibold text-fg">
                    {selectedStockDevice.storage} {selectedStockDevice.color}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60 font-mono">
                  <span className="text-fg-subtle">IMEI:</span>
                  <span className="font-semibold text-fg">{selectedStockDevice.imei}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-fg-subtle">Текущее местоположение:</span>
                  <span className="font-semibold text-fg">{selectedStockDevice.locationName || 'Главный склад'}</span>
                </div>
                {selectedStockDevice.supplierName && (
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-fg-subtle">Поставщик:</span>
                    <span className="font-semibold text-fg">{selectedStockDevice.supplierName}</span>
                  </div>
                )}
                {selectedStockDevice.bonusCampaign && (
                  <div className="flex justify-between py-1 border-b border-border/60">
                    <span className="text-fg-subtle">Акция:</span>
                    <span className="font-semibold text-fg">{selectedStockDevice.bonusCampaign}</span>
                  </div>
                )}
                {selectedStockDevice.receivedDate && (
                  <div className="flex justify-between py-1">
                    <span className="text-fg-subtle">Дата поступления:</span>
                    <span className="font-semibold text-fg">{selectedStockDevice.receivedDate}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedStockDevice(null)}
                className="w-full py-2 rounded-xl bg-surface-raised border border-border text-xs font-semibold text-fg hover:bg-surface-raised/80 transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
