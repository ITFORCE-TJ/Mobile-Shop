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
      className="h-9 px-3 rounded-lg border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none"
    />
  );

  return (
    <div className="flex flex-col min-h-full">
      {/* Top Filter Bar */}
      <div className="px-3 py-2.5 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2">
          {monthPicker}
          <span className="text-xs text-fg-subtle hidden sm:inline">
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
            placeholder="Поиск по IMEI, модели, поставщику..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-surface-raised border border-border text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className={`p-3 sm:p-4 space-y-4 ${summaryLoading ? 'opacity-70 transition-opacity' : ''}`}>
        {/* KPI Summary Cards */}
        <div>
          <div className="flex items-center justify-between mb-2 px-0.5">
            <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wide flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-accent" />
              <span>Финансовые итоги по бонусам за {periodLabel}</span>
            </h3>
            <Badge tone="neutral">
              Не входит в прибыль
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: Total bonus profit */}
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent">Всего бонусов</span>
                  <Sparkles className="w-4 h-4 text-accent shrink-0" />
                </div>
                <div className="text-xl font-bold font-mono tracking-tight text-accent">
                  {usd(totalBonusProfitUsd)}
                </div>
                <div className="text-xs font-semibold text-accent/80 mt-0.5">
                  ≈ {tjs(totalBonusProfitTjs)}
                </div>
              </div>
              <div className="text-[11px] text-fg-subtle mt-2 pt-2 border-t border-accent/20">
                Не входят в прибыль и никому не начисляются; деньги на Бонусном счёте
              </div>
            </div>

            {/* Card 2: Cash discounts */}
            <StatCard
              label="Денежные бонусы (скидки)"
              value={usd(cashBonusUsd)}
              subvalue={`≈ ${tjs(cashBonusTjs)} · ${cashBonusesForMonth.length} начислений`}
              icon={DollarSign}
              tone="success"
            />

            {/* Card 3: Sold gift phones */}
            <StatCard
              label="Прибыль с бонусных телефонов"
              value={usd(soldProfitUsd)}
              subvalue={`≈ ${tjs(soldProfitTjs)} · ${soldUnits} шт. продано`}
              icon={Smartphone}
              tone="warning"
            />

            {/* Card 4: Gift phones in stock */}
            <StatCard
              label="Бонусные телефоны на складе"
              value={`${inStockUnits} шт.`}
              subvalue="В наличии ($0 себестоимость)"
              icon={PackageCheck}
              tone="info"
            />
          </div>
        </div>

        {/* Bonus pool of the current quarter (read-only; closed on the Bonuses page) */}
        <div className="rounded-2xl border-2 border-emerald-500/30 bg-linear-to-br from-emerald-500/10 via-surface to-surface overflow-hidden shadow-xs">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 font-mono">
                  <Gift className="w-3.5 h-3.5" />
                  Квартал бонусов
                </span>
                {poolPendingUsd > 0 ? (
                  <Badge tone="success">Ждёт закрытия квартала</Badge>
                ) : (
                  <Badge tone="neutral">Пул пуст</Badge>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-bold text-fg flex items-center gap-2">
                Бонусные телефоны за квартал
              </h3>
              <p className="text-xs text-fg-subtle max-w-2xl leading-relaxed">
                Прибыль от проданных бонусных телефонов учитывается отдельно и никому не начисляется. При инкассации эти деньги уходят на Бонусный счёт. После квартального отчёта администратор обнуляет счётчик на странице «Бонусы».
              </p>
            </div>

            <div className="text-xs text-fg-subtle bg-surface-raised/50 border border-border px-3 py-1.5 rounded-lg shrink-0">
              Закрытие квартала — на странице «Бонусы»
            </div>
          </div>

          {/* Metric cards */}
          <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface-raised/30">
            <div className="p-3.5 rounded-xl bg-surface border border-emerald-500/20 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                Прибыль бонусных телефонов
              </span>
              <div className="text-2xl font-black font-mono text-emerald-400">
                {usd(poolPendingUsd)}
              </div>
              <div className="text-xs font-semibold text-emerald-400/80 mt-0.5">
                ≈ {tjs(Number(bonusPool?.pendingProfitTjs) || poolPendingUsd * rate)}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-surface border border-border shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block mb-1">
                Продано бонусных устройств
              </span>
              <div className="text-2xl font-black font-mono text-fg">
                {bonusPool?.pendingCount || 0} шт.
              </div>
              <div className="text-xs text-fg-subtle mt-0.5">
                Ожидают закрытия периода
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-surface border border-border shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block mb-1">
                Предыдущих закрытий / операций
              </span>
              <div className="text-2xl font-black font-mono text-fg">
                {bonusPool?.history?.length || 0}
              </div>
              <div className="text-xs text-fg-subtle mt-0.5">
                Зафиксировано в истории
              </div>
            </div>
          </div>

          {/* Collapsible Details Drawer: Entries & History */}
          <div className="border-t border-border/80">
            <div className="px-4 py-2 bg-surface flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setPoolDetailsTab('ENTRIES'); setIsPoolExpanded(true); }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    isPoolExpanded && poolDetailsTab === 'ENTRIES'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-fg-subtle hover:text-fg'
                  }`}
                >
                  Устройства в пуле ({bonusPool?.pendingEntries?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => { setPoolDetailsTab('HISTORY'); setIsPoolExpanded(true); }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    isPoolExpanded && poolDetailsTab === 'HISTORY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-fg-subtle hover:text-fg'
                  }`}
                >
                  История закрытий ({bonusPool?.history?.length || 0})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsPoolExpanded(!isPoolExpanded)}
                className="p-1 text-fg-subtle hover:text-fg flex items-center gap-1 text-xs"
              >
                <span>{isPoolExpanded ? 'Скрыть' : 'Показать'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isPoolExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isPoolExpanded && (
              <div className="p-4 border-t border-border bg-surface-raised/20 max-h-80 overflow-y-auto">
                {poolDetailsTab === 'ENTRIES' ? (
                  !bonusPool?.pendingEntries || bonusPool.pendingEntries.length === 0 ? (
                    <div className="text-center py-6 text-xs text-fg-subtle">
                      В активном пуле нет устройств. При продаже товаров, отмеченных как бонус, они автоматически появятся здесь.
                    </div>
                  ) : (
                    <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden">
                      {bonusPool.pendingEntries.map((e) => (
                        <div key={e.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-fg">{e.brand} {e.model}</span>
                              <span className="font-mono text-[11px] text-fg-subtle">IMEI: {e.imei}</span>
                            </div>
                            <div className="text-[11px] text-fg-subtle font-mono mt-0.5 flex items-center gap-2">
                              {e.sale?.receiptNumber && (
                                <span>Чек #{e.sale.receiptNumber}</span>
                              )}
                              <span>Дата: {e.createdAt.substring(0, 10)}</span>
                              <Badge tone="warning">Бонус ($0 себестоимость)</Badge>
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
                    <div className="space-y-2.5">
                      {bonusPool.history.map((log) => {
                        const isDist = log.type === 'DISTRIBUTION';
                        const allocs = Array.isArray(log.allocations) ? log.allocations : [];
                        return (
                          <div key={log.id} className="p-3 rounded-xl border border-border bg-surface text-xs space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge tone={isDist ? 'success' : 'neutral'}>
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
                              <div className="flex flex-wrap gap-2 pt-1">
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

        {/* Informational Explainer Banner */}
        <div className="rounded-xl bg-surface border border-border p-3 flex items-start gap-2.5 text-xs text-fg-muted">
          <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-fg">
              Раздельный учёт бонусных доходов от поставщиков
            </p>
            <p className="text-fg-subtle text-[11px] leading-relaxed">
              Бонусы не являются доходом: <strong>денежные бонусы</strong> и прибыль от <strong>бонусных телефонов</strong> ($0 себестоимость) не входят в прибыль и никому не начисляются. Их деньги — у компании на Бонусном счёте, ими распоряжается администратор: денежный бонус зачисляется туда при регистрации, прибыль бонусных телефонов — при инкассации магазина. Счётчики обнуляются при закрытии квартала на странице «Бонусы».
            </p>
          </div>
        </div>

        {/* Sub-tabs / Segmented Switcher */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2 pt-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'ALL'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'bg-surface hover:bg-surface-raised text-fg-muted border border-border'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Все операции</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('CASH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'CASH'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'bg-surface hover:bg-surface-raised text-fg-muted border border-border'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Денежные бонусы</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-raised/80 font-mono">
              {filteredCashBonuses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('SOLD_DEVICES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'SOLD_DEVICES'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'bg-surface hover:bg-surface-raised text-fg-muted border border-border'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Проданные телефоны</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-raised/80 font-mono">
              {filteredSoldDevices.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('STOCK_DEVICES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'STOCK_DEVICES'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'bg-surface hover:bg-surface-raised text-fg-muted border border-border'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Бонусы на складе</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-raised/80 font-mono">
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
                      className="p-3.5 hover:bg-surface-raised cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-fg">
                            {bonus.campaignTitle || bonus.campaignName || `Бонус от ${bonus.supplierName}`}
                          </span>
                          <Badge tone="success">
                            Денежная скидка
                          </Badge>
                          <span className="text-[11px] text-fg-subtle flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {dateStr}
                          </span>
                        </div>
                        <div className="text-xs text-fg-muted flex items-center gap-3 flex-wrap">
                          <span>
                            Поставщик: <strong className="text-fg">{bonus.supplierName}</strong>
                          </span>
                          <span>·</span>
                          <span>Курс: {bonusRate}</span>
                          <span>·</span>
                          <span className="text-success font-medium">100% зачислено в прибыль</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto text-right">
                        <div>
                          <div className="text-sm font-bold font-mono text-success">
                            +{usd(bonusUsd)}
                          </div>
                          <div className="text-[11px] font-semibold text-fg-subtle">
                            ≈ {tjs(bonusTjs)}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-fg-subtle group-hover:text-accent transition-colors" />
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
                    className="p-3.5 hover:bg-surface-raised cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-fg">
                          {item.brand} {item.model}
                        </span>
                        <span className="text-[11px] text-fg-subtle">
                          {item.storage} {item.color}
                        </span>
                        <Badge tone="warning">
                          Подарочный ($0 себестоимость)
                        </Badge>
                      </div>

                      <div className="text-[11px] text-fg-subtle font-mono flex items-center gap-2 flex-wrap">
                        <span>IMEI: {item.imei}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Receipt className="w-3 h-3 text-fg-subtle" />
                          Чек #{item.receiptNumber}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <StoreIcon className="w-3 h-3 text-fg-subtle" />
                          {item.storeName}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-fg-subtle" />
                          {item.sellerName}
                        </span>
                        <span>·</span>
                        <span>{item.saleDate}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto text-right">
                      <div>
                        <div className="text-sm font-bold font-mono text-accent">
                          +{usd(item.salePriceUsd)}
                        </div>
                        <div className="text-[11px] font-semibold text-accent/80">
                          {tjs(item.salePriceTjs)} · 100% прибыль
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-fg-subtle group-hover:text-accent transition-colors" />
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
                    className="p-3.5 hover:bg-surface-raised cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-fg">
                          {d.brand} {d.model}
                        </span>
                        <span className="text-[11px] text-fg-subtle">
                          {d.storage} {d.color}
                        </span>
                        <Badge tone="neutral">
                          Себестоимость $0
                        </Badge>
                        {d.bonusCampaign && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised border border-border text-fg-muted font-medium">
                            {d.bonusCampaign}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-fg-subtle font-mono flex items-center gap-2 flex-wrap">
                        <span>IMEI: {d.imei}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <StoreIcon className="w-3 h-3 text-fg-subtle" />
                          {d.locationName || 'Главный склад'}
                        </span>
                        {d.supplierName && (
                          <>
                            <span>·</span>
                            <span>Поставщик: {d.supplierName}</span>
                          </>
                        )}
                        {d.receivedDate && (
                          <>
                            <span>·</span>
                            <span>Поступил: {d.receivedDate}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto text-right">
                      <div>
                        <div className="text-xs font-bold text-info">
                          В наличии
                        </div>
                        <div className="text-[11px] text-fg-subtle">
                          Прибыль при продаже: 100%
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-fg-subtle group-hover:text-accent transition-colors" />
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
