import React, { useState, useMemo, useEffect } from 'react';
import { decimal, formatMoney, formatTjs, formatUsd, moneyNumber, sumMoney } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { Device, DeviceStatus, Store as StoreType } from '../../types';
import {
  Smartphone,
  ChevronRight,
  ChevronDown,
  Store,
  Warehouse,
  History,
  DollarSign,
  Layers,
  List,
  Boxes,
  Building2,
  ArrowRight,
  Sparkles,
  Cpu,
  HardDrive,
  Palette,
  Copy,
  Check,
  QrCode,
  Edit2,
  ChevronUp,
  SlidersHorizontal,
  Filter,
  RotateCcw,
  X
} from 'lucide-react';
import { useGroupedDevices } from '../../hooks/useGroupedDevices';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { Badge, BadgeTone } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { Dialog } from '../ui/Dialog';
import { StatCard } from '../ui/StatCard';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useNavigationLayout } from '../../hooks/useNavigationLayout';
import { useVirtualRows } from '../../hooks/useVirtualRows';
import { DEVICE_STATUS_LABELS, findDeviceByCode, looksLikeDeviceCode, normalizeScanCode } from '../../utils/scanLookup';
import { useStoreContext } from '../../utils/storeContext';

const IN_STOCK_STATUSES: DeviceStatus[] = ['STORE_STOCK', 'MAIN_WAREHOUSE', 'IN_STOCK_AFTER_EXCHANGE'];

const STATUS_LABELS: Record<DeviceStatus, string> = DEVICE_STATUS_LABELS;

const STATUS_TONE: Record<DeviceStatus, BadgeTone> = {
  MAIN_WAREHOUSE: 'warning',
  STORE_STOCK: 'success',
  SOLD: 'neutral',
  IN_STOCK_AFTER_EXCHANGE: 'info',
  IN_REPAIR: 'warning',
  TRANSFER_PENDING: 'warning',
};

function formatTimelineDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${mins}`;
  } catch {
    return dateStr;
  }
}

/** «≈ 1,234 TJS» for a USD amount at today's rate, or nothing when today's rate is not set. */
function approxTjs(usd: number, rate?: number): string | null {
  if (!rate) return null;
  const tjsAmount = Math.round(decimal(usd).mul(rate).toNumber());
  return `≈ ${formatMoney(tjsAmount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TJS`;
}

function getBrandBadgeStyle(brand: string): { bg: string; text: string; border: string } {
  const b = brand.toLowerCase();
  if (b.includes('apple') || b.includes('iphone')) {
    return { bg: 'bg-zinc-800 text-zinc-100 border-zinc-700', text: 'text-zinc-100', border: 'border-zinc-700' };
  }
  if (b.includes('samsung')) {
    return { bg: 'bg-blue-500/15 text-blue-500 border-blue-500/30', text: 'text-blue-500', border: 'border-blue-500/30' };
  }
  if (b.includes('xiaomi') || b.includes('redmi') || b.includes('poco')) {
    return { bg: 'bg-orange-500/15 text-orange-500 border-orange-500/30', text: 'text-orange-500', border: 'border-orange-500/30' };
  }
  if (b.includes('honor')) {
    return { bg: 'bg-sky-500/15 text-sky-500 border-sky-500/30', text: 'text-sky-500', border: 'border-sky-500/30' };
  }
  if (b.includes('huawei')) {
    return { bg: 'bg-red-500/15 text-red-500 border-red-500/30', text: 'text-red-500', border: 'border-red-500/30' };
  }
  if (b.includes('google') || b.includes('pixel')) {
    return { bg: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30', text: 'text-emerald-500', border: 'border-emerald-500/30' };
  }
  if (b.includes('realme')) {
    return { bg: 'bg-amber-500/15 text-amber-500 border-amber-500/30', text: 'text-amber-500', border: 'border-amber-500/30' };
  }
  return { bg: 'bg-accent/15 text-accent border-accent/30', text: 'text-accent', border: 'border-accent/30' };
}

function getPhoneColorHex(color?: string): string | null {
  if (!color) return null;
  const c = color.toLowerCase();
  if (c.includes('black') || c.includes('черн') || c.includes('темн') || c.includes('midnight') || c.includes('phantom')) return '#1e293b';
  if (c.includes('white') || c.includes('бел') || c.includes('starlight') || c.includes('pearl')) return '#f8fafc';
  if (c.includes('gold') || c.includes('золот')) return '#eab308';
  if (c.includes('silver') || c.includes('серебр')) return '#cbd5e1';
  if (c.includes('gray') || c.includes('grey') || c.includes('серый') || c.includes('титан') || c.includes('titanium') || c.includes('graphite') || c.includes('графит')) return '#64748b';
  if (c.includes('blue') || c.includes('син') || c.includes('голуб')) return '#3b82f6';
  if (c.includes('green') || c.includes('зелен') || c.includes('изумруд')) return '#22c55e';
  if (c.includes('purple') || c.includes('фиолет') || c.includes('лаванд') || c.includes('violet')) return '#a855f7';
  if (c.includes('red') || c.includes('красн')) return '#ef4444';
  if (c.includes('pink') || c.includes('розов')) return '#ec4899';
  if (c.includes('yellow') || c.includes('желт')) return '#eab308';
  if (c.includes('orange') || c.includes('оранж')) return '#f97316';
  return '#94a3b8';
}

function getTimelineBadge(type: string) {
  const upper = (type || '').toUpperCase();
  if (upper === 'BONUS') {
    return {
      label: 'Бонус поставщика',
      tone: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      dot: 'bg-amber-500',
    };
  }
  if (upper === 'PURCHASE') {
    return {
      label: 'Поступление',
      tone: 'bg-accent/15 text-accent border-accent/30',
      dot: 'bg-accent',
    };
  }
  if (upper === 'TRANSFER') {
    return {
      label: 'Перемещение',
      tone: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      dot: 'bg-purple-500',
    };
  }
  if (upper === 'SALE') {
    return {
      label: 'Продажа',
      tone: 'bg-success/15 text-success border-success/30',
      dot: 'bg-success',
    };
  }
  if (upper === 'REPAIR') {
    return {
      label: 'Ремонт',
      tone: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      dot: 'bg-orange-500',
    };
  }
  return {
    label: upper,
    tone: 'bg-surface text-fg-muted border-border',
    dot: 'bg-accent',
  };
}

interface DeviceRowProps {
  device: Device;
  isAdmin?: boolean;
  storeName?: string;
  isMainWarehouse?: boolean;
  rate?: number;
  hideModelName?: boolean;
  onClick: () => void;
}

const DeviceRow = React.forwardRef<HTMLButtonElement, DeviceRowProps>(({ device, isAdmin, storeName, isMainWarehouse, rate, hideModelName, onClick }, ref) => {
  const isSpecialStatus = device.status !== 'STORE_STOCK' && device.status !== 'MAIN_WAREHOUSE';
  const showStatusBadge = isSpecialStatus || !storeName;
  const colorHex = getPhoneColorHex(device.color);
  const formattedRam = device.ram
    ? (device.ram.toUpperCase().includes('GB') ? device.ram : `${device.ram} GB`)
    : null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="group w-full text-left p-2.5 sm:p-3 rounded-xl bg-surface border border-border/80 hover:border-accent/40 active:bg-surface-raised flex items-center justify-between gap-3 transition-all hover:shadow-2xs cursor-pointer"
    >
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        {/* Left: Device icon / visual anchor */}
        <div className="w-9 h-9 rounded-xl bg-surface-raised border border-border/80 flex items-center justify-center shrink-0 text-fg-subtle group-hover:text-accent group-hover:border-accent/30 group-hover:bg-accent/10 transition-colors shadow-2xs">
          <Smartphone className="w-4.5 h-4.5" />
        </div>

        <div className="min-w-0 flex-1">
          {/* Line 1: Model (if visible) + Specs (Storage, RAM, Color) */}
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {!hideModelName && (
              <span className="text-xs sm:text-sm font-extrabold text-fg truncate mr-1">
                {device.brand} {device.model}
              </span>
            )}

            {device.storage && (
              <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-xs font-black font-mono text-fg shadow-2xs shrink-0">
                {device.storage}
              </span>
            )}

            {formattedRam && (
              <span className="px-1.5 py-0.5 rounded-md bg-surface-raised/80 border border-border/70 text-[10px] font-bold font-mono text-fg-subtle shrink-0">
                {formattedRam}
              </span>
            )}

            {device.color && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-raised/60 border border-border/60 text-[11px] font-medium text-fg-muted shrink-0 max-w-36 truncate">
                {colorHex && (
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                    style={{ backgroundColor: colorHex }}
                  />
                )}
                <span className="truncate">{device.color}</span>
              </span>
            )}

            {device.isBonus && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-accent/15 text-accent border border-accent/25 shrink-0">
                <Sparkles className="w-3 h-3" />
                Бонус
              </span>
            )}
          </div>

          {/* Line 2: Monospace IMEI + Location + Special Status */}
          <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 font-mono text-[10px] sm:text-[11px] bg-surface-raised/80 px-2 py-0.5 rounded-md border border-border/60 text-fg-muted">
              <span className="text-[9px] font-bold text-fg-subtle uppercase tracking-wider">IMEI</span>
              <span className="font-semibold text-fg tracking-wide">{device.imei}</span>
              {device.imei2 && <span className="opacity-60 text-[10px]">/{device.imei2}</span>}
            </span>

            {storeName && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                isMainWarehouse
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/25'
                  : 'bg-accent/10 text-accent border-accent/25'
              }`}>
                {isMainWarehouse ? <Warehouse className="w-3 h-3 shrink-0" /> : <Store className="w-3 h-3 shrink-0" />}
                <span className="truncate max-w-36">{storeName}</span>
              </span>
            )}

            {showStatusBadge && (
              <Badge tone={STATUS_TONE[device.status] || 'neutral'}>
                {STATUS_LABELS[device.status] || device.status}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Right: Price & Chevron */}
      <div className="text-right shrink-0 flex items-center gap-2">
        {device.isBonus || (isAdmin && device.purchaseCostUsd === 0) ? (
          <span className="text-xs font-black text-accent font-mono px-2 py-0.5 rounded-lg bg-accent/10 border border-accent/20">
            Бонус ($0)
          </span>
        ) : isAdmin && device.purchaseCostUsd > 0 ? (
          <div className="text-right">
            <span className="text-xs sm:text-sm font-extrabold text-fg font-mono block leading-tight">
              {formatUsd(device.purchaseCostUsd)}
            </span>
            {approxTjs(device.purchaseCostUsd, rate) && (
              <span className="text-[10px] text-fg-subtle font-mono block leading-none mt-0.5 font-medium">
                {approxTjs(device.purchaseCostUsd, rate)}
              </span>
            )}
          </div>
        ) : !isAdmin && (device.retailPriceTjs ?? 0) > 0 ? (
          <span className="text-xs sm:text-sm font-extrabold font-mono text-accent whitespace-nowrap">
            {formatTjs(device.retailPriceTjs)}
          </span>
        ) : null}

        <div className="w-6 h-6 rounded-lg bg-surface-raised flex items-center justify-center text-fg-subtle group-hover:text-accent group-hover:bg-accent/10 transition-colors">
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </button>
  );
});
DeviceRow.displayName = 'DeviceRow';

export const InventoryPage: React.FC = () => {
  const {
    currentUser,
    devices,
    findDeviceByImei,
    stores,
    openScanner,
    isInitialLoading,
    selectedStoreId: globalSelectedStoreId,
    todayRate,
    updateDevice
  } = useAppFields(
    'currentUser',
    'devices',
    'findDeviceByImei',
    'stores',
    'openScanner',
    'isInitialLoading',
    'selectedStoreId',
    'todayRate',
    'updateDevice'
  );

  // No fallback rate: a TJS equivalent is only shown when today's rate is actually set.
  const rate = todayRate?.rate || undefined;
  const isSeller = currentUser?.role === 'SELLER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isAdminOrPartner = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';
  const isStoreScoped = currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER';
  // Admin inside a store sees only that store; Central Cash shows every store.
  const storeCtx = useStoreContext();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isEditingRam, setIsEditingRam] = useState(false);
  const [editRamValue, setEditRamValue] = useState('');
  const [isSavingRam, setIsSavingRam] = useState(false);

  const [pageStatus, setPageStatus] = useState<StatusMessage | null>(null);
  const isMobileLayout = useNavigationLayout() === 'mobile';

  const handleCopy = async (text: string, key: string) => {
    try {
      // The Clipboard API is missing over plain http and in some WebViews.
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setPageStatus({ tone: 'warning', text: `Не удалось скопировать автоматически. IMEI: ${text}` });
    }
  };

  const handleStartEditRam = (currentRam?: string) => {
    setEditRamValue(currentRam || '');
    setIsEditingRam(true);
  };

  const handleSaveRam = async () => {
    if (!selectedDevice || !updateDevice || !editRamValue.trim()) return;
    setIsSavingRam(true);
    const res = await updateDevice(selectedDevice.id, { ram: editRamValue.trim() });
    setIsSavingRam(false);
    if (res.success && res.device) {
      setSelectedDevice(res.device);
      setIsEditingRam(false);
    } else {
      setPageStatus({ tone: 'error', text: (res as { message?: string }).message || 'Не удалось сохранить объём памяти' });
    }
  };

  const mainWarehouse = useMemo(() => stores.find(s => s.isMainWarehouse), [stores]);
  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);

  // Tab mode: 'DEVICES' (list of goods) or 'LOCATIONS' (list of warehouse and stores)
  const [viewTab, setViewTab] = useState<'DEVICES' | 'LOCATIONS'>('DEVICES');
  // Inside a store there is only that store's stock — no per-location overview.
  useEffect(() => { if (storeCtx.mode === 'STORE') setViewTab('DEVICES'); }, [storeCtx.mode]);
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);

  // Selected location: 'ALL' (all goods in company), or specific store/warehouse ID
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => {
    if (isStoreScoped) return currentUser?.storeId || '';
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all') return globalSelectedStoreId;
    return 'ALL';
  });

  useEffect(() => {
    if (isStoreScoped) {
      if (currentUser?.storeId) {
        setSelectedLocationId(currentUser.storeId);
      }
      return;
    }
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all') {
      setSelectedLocationId(globalSelectedStoreId);
    } else {
      setSelectedLocationId('ALL');
    }
  }, [globalSelectedStoreId, isStoreScoped, currentUser?.storeId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedRam, setSelectedRam] = useState<string>('ALL');
  const [selectedStorage, setSelectedStorage] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'MAIN_WAREHOUSE' | 'STORE_STOCK' | 'BONUS_ONLY' | 'EXCHANGE_ONLY'>('ALL');
  const [minPriceUsd, setMinPriceUsd] = useState<string>('');
  const [maxPriceUsd, setMaxPriceUsd] = useState<string>('');
  const [sortBy, setSortBy] = useState<'COUNT_DESC' | 'COUNT_ASC' | 'NAME_ASC' | 'NAME_DESC' | 'PRICE_DESC' | 'PRICE_ASC'>('COUNT_DESC');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  type InventoryViewMode = 'BY_BRAND' | 'BY_MODEL' | 'FLAT_LIST';
  const [inventoryViewMode, setInventoryViewMode] = useState<InventoryViewMode>('BY_BRAND');
  const [expandedBrandKeys, setExpandedBrandKeys] = useState<Record<string, boolean>>({});
  const [expandedModelKeys, setExpandedModelKeys] = useState<Record<string, boolean>>({});

  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const activeStore = useMemo(() => {
    if (selectedLocationId === 'ALL') return null;
    return stores.find(s => s.id === selectedLocationId) || null;
  }, [stores, selectedLocationId]);

  // Store statistics (unit counts and inventory value)
  const storeStats = useMemo(() => {
    const map = new Map<string, { unitCount: number; valueUsd: number }>();
    for (const s of stores) map.set(s.id, { unitCount: 0, valueUsd: 0 });
    for (const d of devices) {
      if (!IN_STOCK_STATUSES.includes(d.status)) continue;
      const entry = map.get(d.locationId);
      if (!entry) continue;
      entry.unitCount++;
      entry.valueUsd = moneyNumber(decimal(entry.valueUsd).plus(d.purchaseCostUsd || 0));
    }
    return map;
  }, [devices, stores]);

  // Filter devices according to the active location selection
  const devicesInActiveLocation = useMemo(() => {
    return devices.filter(d => {
      if (!IN_STOCK_STATUSES.includes(d.status)) return false;
      if (isStoreScoped) {
        return d.locationId === currentUser?.storeId;
      }
      if (selectedLocationId === 'ALL') {
        return true;
      }
      return d.locationId === selectedLocationId;
    });
  }, [devices, isSeller, currentUser?.storeId, selectedLocationId]);

  const distinctBrandCount = useMemo(() => {
    const set = new Set<string>();
    devicesInActiveLocation.forEach(d => {
      if (d.brand?.trim()) set.add(d.brand.trim());
    });
    return set.size;
  }, [devicesInActiveLocation]);

  const distinctModelCount = useMemo(() => {
    const set = new Set<string>();
    devicesInActiveLocation.forEach(d => set.add(`${d.brand}__${d.model}`));
    return set.size;
  }, [devicesInActiveLocation]);

  const stockValueUsd = useMemo(
    () => sumMoney(devicesInActiveLocation.map(d => d.purchaseCostUsd || 0)),
    [devicesInActiveLocation]
  );

  const brandCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    devicesInActiveLocation.forEach(d => {
      const b = d.brand?.trim() || 'Другие';
      map.set(b, (map.get(b) || 0) + 1);
    });
    return map;
  }, [devicesInActiveLocation]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    devicesInActiveLocation.forEach((d) => {
      if (d.brand?.trim()) set.add(d.brand.trim());
    });
    return [
      { value: 'ALL', label: `Все бренды (${devicesInActiveLocation.length})` },
      ...Array.from(set).sort().map(b => ({
        value: b,
        label: `${b} (${brandCountsMap.get(b) || 0} шт.)`
      }))
    ];
  }, [devicesInActiveLocation, brandCountsMap]);

  const availableRams = useMemo(() => {
    const set = new Set<string>();
    devicesInActiveLocation.forEach(d => {
      if (d.ram && d.ram.trim()) {
        const clean = d.ram.trim().toUpperCase().replace(/GB/gi, '').trim();
        if (clean) set.add(clean);
      }
    });
    return Array.from(set).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
  }, [devicesInActiveLocation]);

  const availableStorages = useMemo(() => {
    const set = new Set<string>();
    devicesInActiveLocation.forEach(d => {
      if (d.storage && d.storage.trim()) {
        set.add(d.storage.trim());
      }
    });
    return Array.from(set).sort((a, b) => {
      const numA = a.toUpperCase().includes('TB') ? parseInt(a) * 1024 : parseInt(a) || 0;
      const numB = b.toUpperCase().includes('TB') ? parseInt(b) * 1024 : parseInt(b) || 0;
      return numA - numB;
    });
  }, [devicesInActiveLocation]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedBrand !== 'ALL') count++;
    if (selectedRam !== 'ALL') count++;
    if (selectedStorage !== 'ALL') count++;
    if (selectedStatusFilter !== 'ALL') count++;
    if (minPriceUsd || maxPriceUsd) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedBrand, selectedRam, selectedStorage, selectedStatusFilter, minPriceUsd, maxPriceUsd, searchQuery]);

  const handleResetAllFilters = () => {
    setSelectedBrand('ALL');
    setSelectedRam('ALL');
    setSelectedStorage('ALL');
    setSelectedStatusFilter('ALL');
    setMinPriceUsd('');
    setMaxPriceUsd('');
    setSearchQuery('');
  };

  const filteredDevices = useMemo(() => {
    const minP = minPriceUsd ? parseFloat(minPriceUsd) : null;
    const maxP = maxPriceUsd ? parseFloat(maxPriceUsd) : null;

    const result = devicesInActiveLocation.filter((d) => {
      // Brand filter
      if (selectedBrand !== 'ALL' && d.brand.trim() !== selectedBrand.trim()) return false;

      // RAM filter
      if (selectedRam !== 'ALL') {
        const cleanDevRam = (d.ram || '').trim().toUpperCase().replace(/GB/gi, '').trim();
        if (cleanDevRam !== selectedRam) return false;
      }

      // Storage filter
      if (selectedStorage !== 'ALL' && d.storage.trim() !== selectedStorage.trim()) return false;

      // Status / Type filter
      if (selectedStatusFilter === 'MAIN_WAREHOUSE') {
        const isWh = stores.find(s => s.id === d.locationId)?.isMainWarehouse || d.status === 'MAIN_WAREHOUSE';
        if (!isWh) return false;
      } else if (selectedStatusFilter === 'STORE_STOCK') {
        const isWh = stores.find(s => s.id === d.locationId)?.isMainWarehouse || d.status === 'MAIN_WAREHOUSE';
        if (isWh) return false;
      } else if (selectedStatusFilter === 'BONUS_ONLY') {
        if (!d.isBonus && !(isAdmin && d.purchaseCostUsd === 0)) return false;
      } else if (selectedStatusFilter === 'EXCHANGE_ONLY') {
        if (d.status !== 'IN_STOCK_AFTER_EXCHANGE') return false;
      }

      // Price filter
      const cost = d.purchaseCostUsd || 0;
      if (minP !== null && !isNaN(minP) && cost < minP) return false;
      if (maxP !== null && !isNaN(maxP) && cost > maxP) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const locName = stores.find(s => s.id === d.locationId)?.name || d.locationName || '';
        const matches =
          d.imei.toLowerCase().includes(q) ||
          d.imei2?.toLowerCase().includes(q) ||
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.ram?.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q) ||
          d.storage.toLowerCase().includes(q) ||
          locName.toLowerCase().includes(q) ||
          d.supplierName?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });

    // Sorting devices
    if (sortBy === 'NAME_ASC') {
      result.sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, 'ru'));
    } else if (sortBy === 'NAME_DESC') {
      result.sort((a, b) => `${b.brand} ${b.model}`.localeCompare(`${a.brand} ${a.model}`, 'ru'));
    } else if (sortBy === 'PRICE_DESC') {
      result.sort((a, b) => (b.purchaseCostUsd || 0) - (a.purchaseCostUsd || 0));
    } else if (sortBy === 'PRICE_ASC') {
      result.sort((a, b) => (a.purchaseCostUsd || 0) - (b.purchaseCostUsd || 0));
    }

    return result;
  }, [
    devicesInActiveLocation,
    selectedBrand,
    selectedRam,
    selectedStorage,
    selectedStatusFilter,
    minPriceUsd,
    maxPriceUsd,
    searchQuery,
    stores,
    sortBy
  ]);

  // Dynamic stats that update automatically when filtering
  const isFiltered = activeFiltersCount > 0;
  const filteredUnitsCount = filteredDevices.length;

  const filteredDistinctBrandsCount = useMemo(() => {
    const set = new Set<string>();
    filteredDevices.forEach(d => {
      if (d.brand?.trim()) set.add(d.brand.trim());
    });
    return set.size;
  }, [filteredDevices]);

  const filteredDistinctModelsCount = useMemo(() => {
    const set = new Set<string>();
    filteredDevices.forEach(d => set.add(`${d.brand}__${d.model}`));
    return set.size;
  }, [filteredDevices]);

  const filteredStockValueUsd = useMemo(
    () => sumMoney(filteredDevices.map(d => d.purchaseCostUsd || 0)),
    [filteredDevices]
  );

  interface BrandGroupItem {
    key: string;
    brand: string;
    totalCount: number;
    totalValueUsd: number;
    distinctModelsCount: number;
    modelGroups: {
      key: string;
      model: string;
      count: number;
      valueUsd: number;
      storageList: { storage: string; count: number }[];
      ramList: string[];
      devices: Device[];
    }[];
    devices: Device[];
  }

  const brandGroups = useMemo<BrandGroupItem[]>(() => {
    const map = new Map<string, BrandGroupItem>();

    for (const dev of filteredDevices) {
      const bName = dev.brand.trim() || 'Без бренда';
      let bGroup = map.get(bName);
      if (!bGroup) {
        bGroup = {
          key: bName,
          brand: bName,
          totalCount: 0,
          totalValueUsd: 0,
          distinctModelsCount: 0,
          modelGroups: [],
          devices: [],
        };
        map.set(bName, bGroup);
      }

      bGroup.totalCount++;
      bGroup.totalValueUsd = moneyNumber(decimal(bGroup.totalValueUsd).plus(dev.purchaseCostUsd || 0));
      bGroup.devices.push(dev);

      // Model group within brand
      const mName = dev.model.trim() || 'Без модели';
      let mGroup = bGroup.modelGroups.find(m => m.model === mName);
      if (!mGroup) {
        mGroup = {
          key: `${bName}__${mName}`,
          model: mName,
          count: 0,
          valueUsd: 0,
          storageList: [],
          ramList: [],
          devices: [],
        };
        bGroup.modelGroups.push(mGroup);
      }
      mGroup.count++;
      mGroup.valueUsd = moneyNumber(decimal(mGroup.valueUsd).plus(dev.purchaseCostUsd || 0));
      mGroup.devices.push(dev);

      // Storage breakdown
      const sName = dev.storage.trim() || 'Стандарт';
      let sEntry = mGroup.storageList.find(s => s.storage === sName);
      if (!sEntry) {
        sEntry = { storage: sName, count: 0 };
        mGroup.storageList.push(sEntry);
      }
      sEntry.count++;

      // RAM breakdown
      if (dev.ram && dev.ram.trim() && !mGroup.ramList.includes(dev.ram.trim())) {
        mGroup.ramList.push(dev.ram.trim());
      }
    }

    const list = Array.from(map.values());
    for (const b of list) {
      b.distinctModelsCount = b.modelGroups.length;
      // Sort models within each brand by count descending
      b.modelGroups.sort((a, b) => b.count - a.count);
    }

    // Apply sorting to brands
    if (sortBy === 'COUNT_DESC') {
      list.sort((a, b) => b.totalCount - a.totalCount);
    } else if (sortBy === 'COUNT_ASC') {
      list.sort((a, b) => a.totalCount - b.totalCount);
    } else if (sortBy === 'NAME_ASC') {
      list.sort((a, b) => a.brand.localeCompare(b.brand, 'ru'));
    } else if (sortBy === 'NAME_DESC') {
      list.sort((a, b) => b.brand.localeCompare(a.brand, 'ru'));
    } else if (sortBy === 'PRICE_DESC') {
      list.sort((a, b) => b.totalValueUsd - a.totalValueUsd);
    } else if (sortBy === 'PRICE_ASC') {
      list.sort((a, b) => a.totalValueUsd - b.totalValueUsd);
    } else {
      list.sort((a, b) => b.totalCount - a.totalCount);
    }

    return list;
  }, [filteredDevices, sortBy]);

  const groups = useGroupedDevices(filteredDevices);

  /**
   * Opens the scanned phone. One found at another location is opened there for the admin
   * (with a note) and named for store-bound users, instead of a blocking window.alert.
   */
  const openDeviceByCode = async (rawCode: string, source: 'camera' | 'enter') => {
    const code = normalizeScanCode(rawCode);
    if (!code) return;
    const inLocation = findDeviceByCode(devicesInActiveLocation, code);
    if (inLocation) {
      setPageStatus(null);
      setSelectedDevice(inLocation);
      return;
    }
    if (source === 'enter' && !looksLikeDeviceCode(code)) return;

    let found = findDeviceByCode(devices, code);
    if (!found) {
      try {
        [found] = await findDeviceByImei(code);
      } catch {
        // Network trouble: fall through to "not found" with the code kept in search.
      }
    }
    if (!found) {
      setSearchQuery(code);
      // Store-bound users only receive their own store's phones from the server.
      setPageStatus({ tone: 'error', text: isStoreScoped ? `Устройство с IMEI ${code} не найдено в вашем магазине` : `Устройство с IMEI ${code} не найдено` });
      return;
    }
    const where = stores.find(s => s.id === found!.locationId)?.name || found.locationName || 'другой точке';
    if (isStoreScoped) {
      setPageStatus({ tone: 'warning', text: `${found.brand} ${found.model} числится в «${where}» (${STATUS_LABELS[found.status] || found.status}), а не в вашем магазине` });
      return;
    }
    setSelectedLocationId(selectedLocationId === 'ALL' ? 'ALL' : found.locationId);
    setViewTab('DEVICES');
    setSelectedDevice(found);
    setPageStatus({ tone: 'info', text: `${found.brand} ${found.model} числится в «${where}» — открыта эта локация` });
  };

  const handleScanDevice = () => {
    openScanner((scannedCode) => { void openDeviceByCode(scannedCode, 'camera'); });
  };

  const handleSelectLocationAndSwitch = (storeId: string) => {
    setSelectedLocationId(storeId);
    setViewTab('DEVICES');
    if (selectedStatusFilter === 'MAIN_WAREHOUSE' && storeId !== mainWarehouse?.id) {
      setSelectedStatusFilter('ALL');
    }
  };

  const renderLocationExpandedDetails = (targetStore: StoreType) => {
    const locDevices = devices.filter(
      d => d.locationId === targetStore.id && IN_STOCK_STATUSES.includes(d.status)
    );

    const stat = storeStats.get(targetStore.id) || { unitCount: locDevices.length, valueUsd: 0 };

    // Group by Brand & Model
    const modelMap = new Map<string, { brand: string; model: string; count: number; valueUsd: number; storages: { storage: string; count: number }[] }>();
    locDevices.forEach(d => {
      const key = `${d.brand} ${d.model}`.trim();
      const existing = modelMap.get(key);
      const storageStr = (d.storage || '').trim();
      if (existing) {
        existing.count++;
        existing.valueUsd = moneyNumber(decimal(existing.valueUsd).plus(d.purchaseCostUsd || 0));
        if (storageStr) {
          const sEntry = existing.storages.find(s => s.storage === storageStr);
          if (sEntry) sEntry.count++;
          else existing.storages.push({ storage: storageStr, count: 1 });
        }
      } else {
        modelMap.set(key, {
          brand: d.brand,
          model: d.model,
          count: 1,
          valueUsd: d.purchaseCostUsd || 0,
          storages: storageStr ? [{ storage: storageStr, count: 1 }] : [],
        });
      }
    });

    const modelsList = Array.from(modelMap.values()).sort((a, b) => b.count - a.count);

    return (
      <div className="p-3.5 sm:p-4 border-t border-border bg-surface-raised/40 space-y-3 animate-in fade-in-50 duration-200">
        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-surface border border-border">
            <span className="text-[10px] text-fg-subtle uppercase font-semibold block">В наличии</span>
            <span className="font-bold text-fg text-sm sm:text-base mt-0.5 block">{stat.unitCount} шт.</span>
          </div>
          {isAdmin && (
            <div className="p-2.5 rounded-xl bg-surface border border-border">
              <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Себестоимость</span>
              <span className="font-bold text-fg text-sm sm:text-base mt-0.5 block">{formatUsd(stat.valueUsd)}</span>
              {approxTjs(stat.valueUsd, rate) && <span className="text-[10px] text-fg-subtle block">{approxTjs(stat.valueUsd, rate)}</span>}
            </div>
          )}
          <div className="p-2.5 rounded-xl bg-surface border border-border">
            <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Моделей в наличии</span>
            <span className="font-bold text-fg text-sm sm:text-base mt-0.5 block">{modelsList.length}</span>
          </div>
          {!targetStore.isMainWarehouse && (
            <div className="p-2.5 rounded-xl bg-surface border border-border">
              <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Касса точки</span>
              <span className="font-bold text-accent text-sm sm:text-base mt-0.5 block">{formatUsd(targetStore.cashBalanceUsd)}</span>
            </div>
          )}
        </div>

        {/* Models in stock */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-xs font-semibold text-fg-subtle">
              Модели в наличии: {modelsList.length}
            </span>
          </div>

          {modelsList.length === 0 ? (
            <div className="p-4 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-fg-subtle">
              Здесь сейчас нет телефонов в наличии
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface overflow-hidden max-h-56 overflow-y-auto divide-y divide-border">
              {modelsList.map(m => (
                <div key={`${m.brand}_${m.model}`} className="px-3 py-2 flex items-center justify-between text-xs gap-2 hover:bg-surface-raised/50 transition-colors">
                  <div className="min-w-0">
                    <span className="font-semibold text-fg truncate block">
                      {m.brand} {m.model}
                    </span>
                    {m.storages.length > 0 && (
                      <span className="text-[10px] text-fg-subtle block">
                        {m.storages.map(s => `${s.storage} (${s.count} шт.)`).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-fg block text-xs">{m.count} шт.</span>
                    {isAdmin && (
                      <span className="text-[10px] text-fg-subtle block">{formatUsd(m.valueUsd)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => handleSelectLocationAndSwitch(targetStore.id)}
            className="px-3 py-1.5 rounded-lg bg-accent text-accent-fg hover:bg-accent-strong font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <span>Показать в списке ({stat.unitCount} шт.)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  // Windowed rendering for the flat list; heights are re-measured when the rows change meaning.
  const flatRows = useVirtualRows<HTMLElement>({
    count: inventoryViewMode === 'FLAT_LIST' && viewTab === 'DEVICES' ? filteredDevices.length : 0,
    estimateSize: isMobileLayout ? 52 : 54,
    resetKey: `${isMobileLayout ? 'm' : 'd'}|${filteredDevices.length}|${filteredDevices[0]?.id ?? ''}|${sortBy}`,
  });

  const filterFields = (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 text-xs">
        {/* Filter 1: Brand */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Бренд
          </label>
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1.5 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            {brands.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>

        {/* Filter 2: Status / Type */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Наличие
          </label>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1.5 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            <option value="ALL">Все {activeStore ? `(«${activeStore.name}»)` : 'в наличии'}</option>
            {selectedLocationId === 'ALL' && (
              <>
                <option value="MAIN_WAREHOUSE">Центральный склад</option>
                <option value="STORE_STOCK">В магазинах</option>
              </>
            )}
            <option value="BONUS_ONLY">Бонусы поставщиков</option>
            <option value="EXCHANGE_ONLY">После обмена</option>
          </select>
        </div>

        {/* Filter 3: RAM */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Оперативная память
          </label>
          <select
            value={selectedRam}
            onChange={(e) => setSelectedRam(e.target.value)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1.5 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            <option value="ALL">Любая память</option>
            {availableRams.map(ram => (
              <option key={ram} value={ram}>{ram} GB</option>
            ))}
          </select>
        </div>

        {/* Filter 4: Storage */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Встроенная память
          </label>
          <select
            value={selectedStorage}
            onChange={(e) => setSelectedStorage(e.target.value)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1.5 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            <option value="ALL">Любой объем</option>
            {availableStorages.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* Filter 5: Sorting */}
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[11px] font-semibold text-fg-subtle mb-1 truncate">
            Сортировка
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full h-9 rounded-xl bg-surface border border-border px-2.5 py-1 text-fg text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer truncate"
          >
            <option value="COUNT_DESC">По количеству: больше → меньше</option>
            <option value="COUNT_ASC">По количеству: меньше → больше</option>
            <option value="NAME_ASC">По названию бренда: А → Я</option>
            <option value="NAME_DESC">По названию бренда: Я → А</option>
            {isAdmin && (
              <>
                <option value="PRICE_DESC">По цене: дорогие → дешевые</option>
                <option value="PRICE_ASC">По цене: дешевые → дорогие</option>
              </>
            )}
          </select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-y-auto md:overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={pageStatus} onDismiss={() => setPageStatus(null)} />
      {/* Top Header & Navigation Bar. On phones it scrolls away with the list (it is taller than
          half the screen there); from tablet width up it stays and only the list scrolls. */}
      <div className="p-2 sm:p-3 border-b border-border bg-surface space-y-2 sm:space-y-2.5 shrink-0 shadow-xs">
        {/* Row 1: Mode Switcher (List of Goods vs Locations List) & Location Selector */}
        <div className="flex items-center justify-between gap-2">
          {!isStoreScoped && storeCtx.mode === 'CENTRAL' ? (
            <div className="flex-1 sm:flex-initial flex items-center gap-1 p-0.5 sm:p-1 rounded-xl bg-surface-raised border border-border">
              <button
                type="button"
                onClick={() => setViewTab('DEVICES')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewTab === 'DEVICES'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-fg-subtle hover:text-fg-muted'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span className="sm:hidden">Товары</span>
                <span className="hidden sm:inline">Список товаров</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  viewTab === 'DEVICES' ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface text-fg-subtle'
                }`}>
                  {filteredUnitsCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewTab('LOCATIONS')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewTab === 'LOCATIONS'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-fg-subtle hover:text-fg-muted'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span className="sm:hidden">По точкам</span>
                <span className="hidden sm:inline">Остатки по складам и магазинам</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  viewTab === 'LOCATIONS' ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface text-fg-subtle'
                }`}>
                  {stores.length}
                </span>
              </button>
            </div>
          ) : null}

          {/* Quick Location Dropdown Filter */}
          {!isStoreScoped && storeCtx.mode === 'CENTRAL' && (
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <span className="text-xs text-fg-subtle font-medium hidden sm:inline">Локация:</span>
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value);
                  if (selectedStatusFilter === 'MAIN_WAREHOUSE' && e.target.value !== mainWarehouse?.id) {
                    setSelectedStatusFilter('ALL');
                  }
                }}
                className="bg-surface-raised border border-border text-fg text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-accent cursor-pointer max-w-[130px] sm:max-w-none truncate"
              >
                <option value="ALL">Все локации</option>
                {mainWarehouse && (
                  <option value={mainWarehouse.id}>{mainWarehouse.name} (Центр)</option>
                )}
                {retailStores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Desktop/Tablet Summary Stats Cards */}
        <div className={`hidden sm:grid gap-2 sm:gap-3 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
          <StatCard
            label="Единиц в наличии"
            value={`${filteredUnitsCount} шт.`}
            subvalue={isFiltered ? `из ${devicesInActiveLocation.length} всего` : undefined}
            icon={Boxes}
          />
          <StatCard
            label="Брендов"
            value={String(filteredDistinctBrandsCount)}
            subvalue={isFiltered ? `из ${distinctBrandCount} всего` : undefined}
            icon={Sparkles}
            tone="accent"
          />
          <StatCard
            label="Моделей"
            value={String(filteredDistinctModelsCount)}
            subvalue={isFiltered ? `из ${distinctModelCount} всего` : undefined}
            icon={Layers}
          />
          {isAdmin && (
            <StatCard
              label="Стоимость склада"
              value={formatUsd(filteredStockValueUsd)}
              subvalue={isFiltered ? `из ${formatUsd(stockValueUsd)} всего` : undefined}
              icon={DollarSign}
              tone="accent"
            />
          )}
        </div>

        {/* Mobile Sleek Compact Metric Bar (saves ~120px of vertical space) */}
        <div className={`grid sm:hidden bg-surface-raised border border-border rounded-xl py-1.5 px-0.5 text-center divide-x divide-border shadow-2xs ${
          isAdmin ? 'grid-cols-4' : 'grid-cols-3'
        }`}>
          <div className="px-1 min-w-0">
            <span className="text-[9px] font-semibold text-fg-subtle uppercase tracking-wider block truncate">Наличие</span>
            <span className="text-xs font-black text-fg block truncate mt-0.5">{filteredUnitsCount} шт.</span>
          </div>
          <div className="px-1 min-w-0">
            <span className="text-[9px] font-semibold text-fg-subtle uppercase tracking-wider block truncate">Брендов</span>
            <span className="text-xs font-black text-accent block truncate mt-0.5">{filteredDistinctBrandsCount}</span>
          </div>
          <div className="px-1 min-w-0">
            <span className="text-[9px] font-semibold text-fg-subtle uppercase tracking-wider block truncate">Моделей</span>
            <span className="text-xs font-black text-fg block truncate mt-0.5">{filteredDistinctModelsCount}</span>
          </div>
          {isAdmin && (
            <div className="px-1 min-w-0">
              <span className="text-[9px] font-semibold text-fg-subtle uppercase tracking-wider block truncate">Склад</span>
              <span className="text-xs font-black text-accent block truncate mt-0.5 font-mono">{formatUsd(filteredStockValueUsd)}</span>
            </div>
          )}
        </div>

        {/* Row 3: Professional Search, Filters & Grouping Toolbar */}
        {viewTab === 'DEVICES' && (
          <div className="space-y-2 sm:space-y-2.5">
            {/* Search Bar + Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onScan={handleScanDevice}
                  onSubmit={(value) => { void openDeviceByCode(value, 'enter'); }}
                  placeholder="Поиск по IMEI, штрихкоду, модели, бренду, цвету..."
                />
              </div>

              {/* Desktop view mode switcher + filter button */}
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setInventoryViewMode('BY_BRAND')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      inventoryViewMode === 'BY_BRAND'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-fg-subtle hover:text-fg-muted'
                    }`}
                    title="Группировать по брендам"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>По брендам</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInventoryViewMode('BY_MODEL')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      inventoryViewMode === 'BY_MODEL'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-fg-subtle hover:text-fg-muted'
                    }`}
                    title="Группировать по моделям"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>По моделям</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInventoryViewMode('FLAT_LIST')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      inventoryViewMode === 'FLAT_LIST'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-fg-subtle hover:text-fg-muted'
                    }`}
                    title="Полный список товаров"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Список</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(prev => !prev)}
                  aria-expanded={showAdvancedFilters}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    showAdvancedFilters || activeFiltersCount > 0
                      ? 'bg-accent/15 border-accent text-accent shadow-xs'
                      : 'bg-surface-raised border-border text-fg-muted hover:border-fg-subtle'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Фильтры</span>
                  {activeFiltersCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-accent text-accent-fg text-[9px] font-black flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                  {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Mobile Subrow: View Mode Switcher on Left + Filter Button on Right with full width distribution (no empty spaces) */}
              <div className="flex sm:hidden items-center gap-1.5">
                <div className="flex-1 grid grid-cols-3 p-0.5 rounded-xl bg-surface-raised border border-border">
                  <button
                    type="button"
                    onClick={() => setInventoryViewMode('BY_BRAND')}
                    className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      inventoryViewMode === 'BY_BRAND'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-fg-subtle hover:text-fg-muted'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Бренды</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInventoryViewMode('BY_MODEL')}
                    className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      inventoryViewMode === 'BY_MODEL'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-fg-subtle hover:text-fg-muted'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    <span>Модели</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInventoryViewMode('FLAT_LIST')}
                    className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      inventoryViewMode === 'FLAT_LIST'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-fg-subtle hover:text-fg-muted'
                    }`}
                  >
                    <List className="w-3 h-3" />
                    <span>Список</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(prev => !prev)}
                  aria-expanded={showAdvancedFilters}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                    showAdvancedFilters || activeFiltersCount > 0
                      ? 'bg-accent/15 border-accent text-accent shadow-xs'
                      : 'bg-surface-raised border-border text-fg-muted hover:border-fg-subtle'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Фильтры</span>
                  {activeFiltersCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-accent text-accent-fg text-[9px] font-black flex items-center justify-center">
                      {activeFiltersCount}
                    </span>
                  )}
                  {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Quick Horizontal Brand Chips - rendered only when multiple brands exist */}
            {brandCountsMap.size > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedBrand('ALL')}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                    selectedBrand === 'ALL'
                      ? 'bg-accent text-accent-fg border-accent shadow-xs'
                      : 'bg-surface-raised hover:bg-surface border-border text-fg-muted'
                  }`}
                >
                  Все бренды ({devicesInActiveLocation.length})
                </button>

                {Array.from(brandCountsMap.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([bName, count]) => {
                    const isSelected = selectedBrand === bName;
                    return (
                      <button
                        key={bName}
                        type="button"
                        onClick={() => setSelectedBrand(isSelected ? 'ALL' : bName)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer shrink-0 flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-accent text-accent-fg border-accent shadow-xs font-bold'
                            : 'bg-surface-raised hover:bg-surface border-border text-fg-muted'
                        }`}
                      >
                        <span>{bName}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface text-fg-subtle'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Advanced Filters Panel (Desktop Inline) */}
            {showAdvancedFilters && !isMobileLayout && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-surface-raised border border-border space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-accent" />
                    <span className="text-xs font-bold text-fg-muted">Фильтры</span>
                  </div>
                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetAllFilters}
                      className="text-[11px] text-accent hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Сбросить всё ({activeFiltersCount})</span>
                    </button>
                  )}
                </div>

                {filterFields}
              </div>
            )}

            {/* Active Filters Badges & Summary Line (only rendered when filters or search are active) */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-[11px] text-fg-subtle font-medium">
                    Найдено: <strong className="text-accent font-bold">{filteredDevices.length}</strong> шт.
                    {filteredDevices.length > 0 && (
                      <span className="opacity-80">
                        {' '}· {brandGroups.length} {brandGroups.length === 1 ? 'бренд' : 'брендов'}
                      </span>
                    )}
                    {isAdmin && filteredDevices.length > 0 && (
                      <span className="opacity-80">
                        {' '}· {formatUsd(filteredStockValueUsd)}
                      </span>
                    )}
                  </span>

                  {/* Active filter badges */}
                  {selectedBrand !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                      <span>Бренд: {selectedBrand}</span>
                      <button type="button" onClick={() => setSelectedBrand('ALL')} className="hover:opacity-70 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {selectedRam !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                      <span>RAM: {selectedRam} GB</span>
                      <button type="button" onClick={() => setSelectedRam('ALL')} className="hover:opacity-70 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {selectedStorage !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                      <span>Память: {selectedStorage}</span>
                      <button type="button" onClick={() => setSelectedStorage('ALL')} className="hover:opacity-70 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {selectedStatusFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                      <span>
                        {selectedStatusFilter === 'MAIN_WAREHOUSE' ? 'Центральный склад' :
                         selectedStatusFilter === 'STORE_STOCK' ? 'В магазинах' :
                         selectedStatusFilter === 'BONUS_ONLY' ? 'Бонусы' : 'После обмена'}
                      </span>
                      <button type="button" onClick={() => setSelectedStatusFilter('ALL')} className="hover:opacity-70 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {(minPriceUsd || maxPriceUsd) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                      <span>Цена: ${minPriceUsd || '0'} – ${maxPriceUsd || '∞'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMinPriceUsd('');
                          setMaxPriceUsd('');
                        }}
                        className="hover:opacity-70 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {searchQuery.trim() && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-raised border border-border text-fg-muted">
                      <span>Поиск: «{searchQuery}»</span>
                      <button type="button" onClick={() => setSearchQuery('')} className="hover:opacity-70 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetAllFilters}
                      className="text-[10px] font-bold text-accent hover:underline ml-1 cursor-pointer"
                    >
                      Сбросить все
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-none md:flex-1 md:min-h-0 md:overflow-y-auto">
        {isInitialLoading ? (
          <LoadingState label="Загрузка склада товаров…" />
        ) : viewTab === 'LOCATIONS' ? (
          /* LOCATIONS LIST VIEW */
          <div className="p-3 sm:p-4 space-y-4 max-w-5xl mx-auto">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-sm font-bold text-fg-muted flex items-center gap-2">
                <Building2 className="w-4 h-4 text-accent" />
                <span>Склад и магазины</span>
              </span>
              <span className="text-xs text-fg-subtle">
                Всего в компании: <strong>{devices.filter(d => IN_STOCK_STATUSES.includes(d.status)).length}</strong> шт.
              </span>
            </div>

            {/* Central Warehouse Block */}
            {mainWarehouse && (() => {
              const stat = storeStats.get(mainWarehouse.id) || { unitCount: 0, valueUsd: 0 };
              const isSelected = selectedLocationId === mainWarehouse.id;
              const isExpanded = expandedLocationId === mainWarehouse.id;
              return (
                <div className={`rounded-xl border overflow-hidden transition-all ${
                  isSelected ? 'bg-amber-500/10 border-amber-500' : 'bg-surface border-amber-500/30 hover:border-amber-500/60'
                }`}>
                  <div
                    onClick={() => setExpandedLocationId(isExpanded ? null : mainWarehouse.id)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 shrink-0">
                        <Warehouse className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-fg-muted">Центральный склад ({mainWarehouse.name})</h4>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <div className="text-right mr-1">
                        <span className="text-sm font-bold text-amber-400 block">
                          {stat.unitCount} шт.
                        </span>
                        {isAdmin && (
                          <span className="text-[11px] text-fg-subtle block">
                            {formatUsd(stat.valueUsd)}{approxTjs(stat.valueUsd, rate) ? ` · ${approxTjs(stat.valueUsd, rate)}` : ''}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedLocationId(isExpanded ? null : mainWarehouse.id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{isExpanded ? 'Свернуть' : 'Детали склада'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectLocationAndSwitch(mainWarehouse.id);
                        }}
                        className="p-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs transition-colors cursor-pointer shadow-xs"
                        title="Открыть товары склада в общем списке"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && renderLocationExpandedDetails(mainWarehouse)}
                </div>
              );
            })()}

            {/* Retail Stores List */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-fg-subtle px-1">
                <span className="font-bold text-fg-muted flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-accent" />
                  <span>Магазины ({retailStores.length})</span>
                </span>
              </div>

              {retailStores.length === 0 ? (
                <div className="p-8 text-center text-fg-subtle text-xs border border-dashed border-border rounded-xl">
                  Нет добавленных магазинов. Добавьте магазин в настройках.
                </div>
              ) : (
                <div className="space-y-2">
                  {retailStores.map(store => {
                    const stat = storeStats.get(store.id) || { unitCount: 0, valueUsd: 0 };
                    const isSelected = selectedLocationId === store.id;
                    const isExpanded = expandedLocationId === store.id;
                    return (
                      <div
                        key={store.id}
                        className={`rounded-xl border overflow-hidden transition-all ${
                          isSelected ? 'bg-accent/10 border-accent/40' : 'bg-surface border-border hover:border-fg-subtle/40'
                        }`}
                      >
                        <div
                          onClick={() => setExpandedLocationId(isExpanded ? null : store.id)}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="p-2 rounded-xl bg-accent/10 border border-accent/25 text-accent shrink-0">
                              <Store className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h5 className="font-bold text-xs sm:text-sm text-fg-muted truncate">
                                  {store.name}
                                </h5>
                              </div>
                              <p className="text-[11px] text-fg-subtle truncate">
                                Касса: {formatUsd(store.cashBalanceUsd)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <div className="text-right mr-1">
                              <span className="text-xs sm:text-sm font-bold text-fg-muted block">
                                {stat.unitCount} шт.
                              </span>
                              {isAdmin && (
                                <span className="text-[10px] text-fg-subtle block">
                                  {formatUsd(stat.valueUsd)}{approxTjs(stat.valueUsd, rate) ? ` · ${approxTjs(stat.valueUsd, rate)}` : ''}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLocationId(isExpanded ? null : store.id);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <span>{isExpanded ? 'Свернуть' : 'Детали товаров'}</span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectLocationAndSwitch(store.id);
                              }}
                              className="p-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 font-bold text-xs transition-colors cursor-pointer"
                              title="Открыть товары магазина в общем списке"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Detail Panel */}
                        {isExpanded && renderLocationExpandedDetails(store)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : filteredDevices.length === 0 ? (
          /* EMPTY STATE */
          <EmptyState
            icon={Smartphone}
            title="Устройства не найдены"
            description="Попробуйте изменить параметры поиска или выбрать другую локацию"
          />
        ) : inventoryViewMode === 'BY_BRAND' ? (
          /* GROUPED BY BRAND VIEW */
          <div className="divide-y divide-border">
            {/* Header controls: Expand/Collapse All */}
            <div className="py-1.5 px-3 sm:py-2 sm:px-4 bg-surface-raised/40 flex items-center justify-between gap-2 border-b border-border">
              <span className="text-xs font-semibold text-fg-subtle flex items-center gap-1.5 flex-wrap">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>Брендов: <strong className="text-fg">{brandGroups.length}</strong></span>
                <span className="opacity-60">·</span>
                <span>Телефонов: <strong className="text-accent">{filteredDevices.length}</strong> шт.</span>
                {activeStore && (
                  <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 text-[10px] font-bold">
                    {activeStore.name}
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => {
                  const allExpanded = brandGroups.every(b => expandedBrandKeys[b.key]);
                  const next: Record<string, boolean> = {};
                  if (!allExpanded) {
                    brandGroups.forEach(b => { next[b.key] = true; });
                  }
                  setExpandedBrandKeys(next);
                }}
                className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span className="sm:hidden">{brandGroups.every(b => expandedBrandKeys[b.key]) ? 'Свернуть' : 'Развернуть'}</span>
                <span className="hidden sm:inline">{brandGroups.every(b => expandedBrandKeys[b.key]) ? 'Свернуть все бренды' : 'Развернуть все бренды'}</span>
              </button>
            </div>

            {brandGroups.map((bGroup) => {
              const isBrandExpanded = !!expandedBrandKeys[bGroup.key];
              const totalDevicesInView = filteredDevices.length || 1;
              const percent = Math.round((bGroup.totalCount / totalDevicesInView) * 100);
              const brandBadgeStyle = getBrandBadgeStyle(bGroup.brand);

              return (
                <div key={bGroup.key} className="transition-colors">
                  {/* Brand Row Button */}
                  <div
                    onClick={() => setExpandedBrandKeys(prev => ({ ...prev, [bGroup.key]: !prev[bGroup.key] }))}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 active:bg-surface-raised transition-colors hover:bg-surface-raised/40 cursor-pointer select-none"
                  >
                    {/* Left: Brand name, badge, and model count */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 font-black text-xs tracking-wider shadow-2xs ${brandBadgeStyle.bg} ${brandBadgeStyle.border}`}>
                        <span className={brandBadgeStyle.text}>{bGroup.brand.substring(0, 2).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-extrabold text-fg truncate">
                            {bGroup.brand}
                          </h3>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-raised text-fg-subtle border border-border">
                            {bGroup.distinctModelsCount} {bGroup.distinctModelsCount === 1 ? 'модель' : bGroup.distinctModelsCount < 5 ? 'модели' : 'моделей'}
                          </span>
                          {brandGroups.length > 1 && (
                            <span className="text-[10px] font-semibold text-fg-subtle font-mono">
                              · {percent}%
                            </span>
                          )}
                        </div>
                        {brandGroups.length > 1 && (
                          <div className="flex items-center gap-2 mt-1 max-w-[120px] sm:max-w-[160px]">
                            <div className="flex-1 h-1 rounded-full bg-surface-raised overflow-hidden border border-border">
                              <div
                                className="h-full bg-accent rounded-full transition-all duration-300"
                                style={{ width: `${Math.max(percent, 4)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Phone count & financial value */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-sm sm:text-base font-black text-accent font-mono">
                            {bGroup.totalCount}
                          </span>
                          <span className="text-xs text-fg-subtle font-medium">
                            {bGroup.totalCount === 1 ? 'телефон' : bGroup.totalCount < 5 ? 'телефона' : 'телефонов'}
                          </span>
                        </div>
                        {isAdmin && (
                          <div className="text-[11px] text-fg-subtle font-mono mt-0.5">
                            <span className="font-bold text-fg-muted">{formatUsd(bGroup.totalValueUsd)}</span>
                            {approxTjs(bGroup.totalValueUsd, rate) && <span className="hidden sm:inline"> · {approxTjs(bGroup.totalValueUsd, rate)}</span>}
                          </div>
                        )}
                      </div>

                      <div className={`w-7 h-7 rounded-xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle transition-transform duration-200 ${isBrandExpanded ? 'rotate-180 text-accent border-accent/40' : ''}`}>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* Brand Models Accordion Body */}
                  {isBrandExpanded && (
                    <div className="bg-surface/30 border-t border-border px-2 sm:px-3 py-2 space-y-1.5">
                      {bGroup.modelGroups.map((mGroup) => {
                        const isModelExpanded = !!expandedModelKeys[mGroup.key];
                        return (
                          <div key={mGroup.key} className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedModelKeys(prev => ({ ...prev, [mGroup.key]: !prev[mGroup.key] }))}
                              className="w-full py-2 px-3 rounded-xl flex items-center justify-between gap-2.5 bg-surface-raised/50 hover:bg-surface-raised active:bg-surface-raised border border-border/70 hover:border-border transition-colors text-left cursor-pointer"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="w-6 h-6 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent">
                                    <Smartphone className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-xs sm:text-sm font-extrabold text-fg">
                                    {mGroup.model}
                                  </span>
                                  {mGroup.ramList.length > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-surface-raised text-fg-subtle border border-border font-mono">
                                      {mGroup.ramList.map(r => r.toUpperCase().includes('GB') ? r : `${r} GB`).join('/')}
                                    </span>
                                  )}
                                  {/* Storages breakdown chips inline */}
                                  {mGroup.storageList.map((sg) => (
                                    <span
                                      key={sg.storage}
                                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-surface-raised text-fg-muted border border-border font-mono"
                                    >
                                      {sg.storage}{mGroup.storageList.length > 1 || sg.count > 1 ? `: ${sg.count}` : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-accent/10 text-accent border border-accent/20">
                                    {mGroup.count} шт.
                                  </span>
                                  {isAdmin && (
                                    <span className="block text-[10px] text-fg-subtle font-mono leading-none mt-0.5 font-medium">
                                      {formatUsd(mGroup.valueUsd)}
                                    </span>
                                  )}
                                </div>
                                <div className={`p-1 rounded-md text-fg-subtle transition-transform duration-200 ${isModelExpanded ? 'rotate-180 text-accent' : ''}`}>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </button>

                            {/* Specific Devices List for this Model */}
                            {isModelExpanded && (
                              <div className="space-y-1.5 pl-2 sm:pl-3 my-1">
                                {mGroup.devices.map((dev) => {
                                  const store = stores.find(s => s.id === dev.locationId);
                                  const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
                                  const storeName = isWh ? 'Центральный склад' : dev.locationName || store?.name || 'Магазин';
                                  return (
                                    <DeviceRow
                                      key={dev.id}
                                      device={dev}
                                      isAdmin={isAdmin}
                                      storeName={selectedLocationId === 'ALL' ? storeName : undefined}
                                      isMainWarehouse={isWh}
                                      rate={rate}
                                      hideModelName
                                      onClick={() => setSelectedDevice(dev)}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : inventoryViewMode === 'BY_MODEL' ? (
          /* GROUPED BY MODEL VIEW */
          <div className="divide-y divide-border">
            {groups.map((group) => {
              const isExpanded = expandedGroups[group.key];
              const allDevices = group.storageGroups.flatMap(sg => sg.colorGroups.flatMap(cg => cg.devices));
              return (
                <div key={group.key}>
                  <button
                    onClick={() => setExpandedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2.5 active:bg-surface-raised transition-colors hover:bg-surface-raised/40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 text-left flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs sm:text-sm font-extrabold text-fg truncate">{group.brand} {group.model}</p>
                        {group.storageGroups.map((sg) => (
                          <span
                            key={sg.key}
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-surface-raised text-fg-muted border border-border whitespace-nowrap font-mono"
                          >
                            {sg.storage}{group.storageGroups.length > 1 || sg.count > 1 ? `: ${sg.count}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-accent/10 text-accent border border-accent/20">
                        {group.count} шт.
                      </span>
                      <div className={`p-1 rounded-md text-fg-subtle transition-transform duration-200 ${isExpanded ? 'rotate-180 text-accent' : ''}`}>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="bg-surface/30 border-t border-border p-2 sm:p-3 space-y-1.5">
                      {allDevices.map((dev) => {
                        const store = stores.find(s => s.id === dev.locationId);
                        const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
                        const storeName = isWh ? 'Центральный склад' : dev.locationName || store?.name || 'Магазин';
                        return (
                          <DeviceRow
                            key={dev.id}
                            device={dev}
                            isAdmin={isAdmin}
                            storeName={selectedLocationId === 'ALL' ? storeName : undefined}
                            isMainWarehouse={isWh}
                            rate={rate}
                            hideModelName
                            onClick={() => setSelectedDevice(dev)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* FLAT LIST: a table from tablet width up, rows on phones. Only one of them is rendered,
             and only the rows near the viewport (thousands of units stay fast on weak Android). */
          isMobileLayout ? (
            <div ref={flatRows.listRef as React.RefObject<HTMLDivElement | null>} className="p-2 sm:p-3 space-y-1.5">
              {flatRows.padTop > 0 && <div aria-hidden="true" style={{ height: flatRows.padTop }} />}
              {filteredDevices.slice(flatRows.from, flatRows.to).map((dev, i) => {
                const index = flatRows.from + i;
                const store = stores.find(s => s.id === dev.locationId);
                const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
                const storeName = isWh ? 'Центральный склад' : dev.locationName || store?.name || 'Магазин';
                return (
                  <DeviceRow
                    key={dev.id}
                    ref={flatRows.measure(index)}
                    device={dev}
                    isAdmin={isAdmin}
                    storeName={selectedLocationId === 'ALL' ? storeName : undefined}
                    isMainWarehouse={isWh}
                    rate={rate}
                    onClick={() => setSelectedDevice(dev)}
                  />
                );
              })}
              {flatRows.padBottom > 0 && <div aria-hidden="true" style={{ height: flatRows.padBottom }} />}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" aria-rowcount={filteredDevices.length + 1}>
                <thead className="bg-surface text-[11px] text-fg-subtle border-b border-border sticky top-0 z-10 backdrop-blur-xs">
                  <tr aria-rowindex={1}>
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3">Товар</th>
                    <th className="p-3">Память / цвет</th>
                    <th className="p-3">IMEI</th>
                    <th className="p-3">Локация</th>
                    {isAdmin && <th className="p-3 text-right">Себестоимость</th>}
                    <th className="p-3">Статус</th>
                    <th className="p-3 text-center">Действие</th>
                  </tr>
                </thead>
                <tbody ref={flatRows.listRef as React.RefObject<HTMLTableSectionElement | null>} className="divide-y divide-border text-xs">
                  {flatRows.padTop > 0 && <tr aria-hidden="true"><td colSpan={isAdmin ? 8 : 7} style={{ height: flatRows.padTop, padding: 0 }} /></tr>}
                  {filteredDevices.slice(flatRows.from, flatRows.to).map((dev, i) => {
                    const index = flatRows.from + i;
                    const store = stores.find(s => s.id === dev.locationId);
                    const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
                    return (
                      <tr
                        key={dev.id}
                        ref={flatRows.measure(index)}
                        aria-rowindex={index + 2}
                        onClick={() => setSelectedDevice(dev)}
                        className="hover:bg-surface-raised/70 active:bg-surface-raised cursor-pointer transition-colors"
                      >
                        <td className="p-3 text-center text-fg-subtle text-[11px] font-mono">
                          {index + 1}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-surface border border-border text-accent shrink-0">
                              <Smartphone className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-fg-muted block text-xs truncate">
                                {dev.brand} {dev.model}
                              </span>
                              {dev.isBonus && (
                                <span className="text-[10px] text-accent font-semibold inline-flex items-center gap-0.5">
                                  <Sparkles className="w-3 h-3" /> Бонус
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {dev.ram && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/15 text-accent border border-accent/30 font-mono">
                                {dev.ram.toUpperCase().includes('GB') ? dev.ram : `${dev.ram} GB`}
                              </span>
                            )}
                            <Badge tone="neutral">{dev.storage}</Badge>
                            <Badge tone="neutral">{dev.color}</Badge>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-mono text-xs font-semibold text-fg-muted block select-all">
                            {dev.imei}
                          </span>
                          {dev.imei2 && (
                            <span className="font-mono text-[10px] text-fg-subtle block select-all">
                              2: {dev.imei2}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            isWh
                              ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                              : 'bg-accent/10 text-accent border-accent/30'
                          }`}>
                            {isWh ? <Warehouse className="w-3 h-3 text-amber-500 shrink-0" /> : <Store className="w-3 h-3 text-accent shrink-0" />}
                            <span>{isWh ? 'Центральный склад' : dev.locationName || store?.name || 'Магазин'}</span>
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="p-3 text-right">
                            {dev.purchaseCostUsd === 0 || dev.isBonus ? (
                              <Badge tone="accent">Бонус</Badge>
                            ) : (
                              <div>
                                <span className="font-bold text-fg-muted block text-xs">
                                  {formatUsd(dev.purchaseCostUsd)}
                                </span>
                                {approxTjs(dev.purchaseCostUsd, rate) && (
                                  <span className="text-[10px] text-fg-subtle block">{approxTjs(dev.purchaseCostUsd, rate)}</span>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="p-3">
                          <Badge tone={STATUS_TONE[dev.status]}>
                            {STATUS_LABELS[dev.status] || dev.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedDevice(dev)}
                            className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-raised border border-border text-[11px] font-semibold text-fg-muted transition-colors"
                          >
                            Инфо
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {flatRows.padBottom > 0 && <tr aria-hidden="true"><td colSpan={isAdmin ? 8 : 7} style={{ height: flatRows.padBottom, padding: 0 }} /></tr>}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Device Details Dialog */}
      <Dialog
        open={isMobileLayout && showAdvancedFilters && viewTab === 'DEVICES'}
        onClose={() => setShowAdvancedFilters(false)}
        title="Фильтры"
        subtitle={`Найдено: ${filteredDevices.length} шт.`}
        footer={
          <div className="w-full grid grid-cols-2 gap-2">
            <Button variant="secondary" fullWidth disabled={activeFiltersCount === 0} onClick={handleResetAllFilters}>
              Сбросить{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
            </Button>
            <Button fullWidth onClick={() => setShowAdvancedFilters(false)}>Показать {filteredDevices.length} шт.</Button>
          </div>
        }
      >
        {filterFields}
      </Dialog>

      <Dialog
        open={!!selectedDevice}
        onClose={() => { setSelectedDevice(null); setIsEditingRam(false); }}
        title={selectedDevice ? `${selectedDevice.brand} ${selectedDevice.model}` : ''}
        subtitle="Карточка устройства"
        maxWidth="lg"
        footer={<Button variant="secondary" fullWidth onClick={() => { setSelectedDevice(null); setIsEditingRam(false); }}>Закрыть</Button>}
      >
        {selectedDevice && (() => {
          const store = stores.find(s => s.id === selectedDevice.locationId);
          const isWh = store?.isMainWarehouse || selectedDevice.status === 'MAIN_WAREHOUSE';
          const formattedRam = selectedDevice.ram
            ? (selectedDevice.ram.toUpperCase().includes('GB') ? selectedDevice.ram : `${selectedDevice.ram} GB`)
            : null;

          return (
            <div className="space-y-3.5">
              {/* Device Quick Hero Banner */}
              <div className="p-3.5 rounded-2xl bg-linear-to-r from-surface to-surface-raised border border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0 shadow-xs">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-extrabold text-fg truncate">
                      {selectedDevice.brand} {selectedDevice.model}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <Badge tone={STATUS_TONE[selectedDevice.status]}>
                        {STATUS_LABELS[selectedDevice.status] || selectedDevice.status}
                      </Badge>
                      {selectedDevice.isBonus && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                          <Sparkles className="w-3 h-3" />
                          Бонус поставщика
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                    isWh ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'bg-accent/10 text-accent border-accent/30'
                  }`}>
                    {isWh ? <Warehouse className="w-3.5 h-3.5 text-amber-500 shrink-0" /> : <Store className="w-3.5 h-3.5 text-accent shrink-0" />}
                    <span className="truncate max-w-40">{isWh ? 'Центральный склад' : selectedDevice.locationName || store?.name || 'Магазин'}</span>
                  </span>
                </div>
              </div>

              {/* Hardware Specifications Grid (RAM is prominently highlighted!) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-fg-subtle tracking-wider flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-accent" />
                    Характеристики устройства
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* RAM SPEC (Key Requirement) */}
                  <div className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                    formattedRam
                      ? 'bg-accent/10 border-accent/30 shadow-xs'
                      : 'bg-surface-raised border-border'
                  }`}>
                    <div className="flex items-center justify-between text-fg-subtle mb-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-accent">ОЗУ (RAM)</span>
                      <Cpu className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div>
                      {formattedRam ? (
                        <span className="text-sm sm:text-base font-extrabold text-accent font-mono block">
                          {formattedRam}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-fg-subtle italic block">
                          — не указана
                        </span>
                      )}
                    </div>
                    {isAdminOrPartner && (
                      <button
                        type="button"
                        onClick={() => handleStartEditRam(selectedDevice.ram)}
                        className="mt-2 text-[10px] font-bold text-accent hover:underline flex items-center gap-1 self-start"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>{formattedRam ? 'Изменить' : '+ Указать RAM'}</span>
                      </button>
                    )}
                  </div>

                  {/* STORAGE SPEC */}
                  <div className="p-3 rounded-xl bg-surface-raised border border-border flex flex-col justify-between">
                    <div className="flex items-center justify-between text-fg-subtle mb-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider">Память (ROM)</span>
                      <HardDrive className="w-3.5 h-3.5 text-fg-subtle" />
                    </div>
                    <div>
                      <span className="text-sm sm:text-base font-extrabold text-fg font-mono block">
                        {selectedDevice.storage}
                      </span>
                    </div>
                    <span className="text-[10px] text-fg-subtle mt-2 block">Встроенная память</span>
                  </div>

                  {/* COLOR SPEC */}
                  <div className="p-3 rounded-xl bg-surface-raised border border-border flex flex-col justify-between">
                    <div className="flex items-center justify-between text-fg-subtle mb-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider">Цвет</span>
                      <Palette className="w-3.5 h-3.5 text-fg-subtle" />
                    </div>
                    <div>
                      <span className="text-sm sm:text-base font-extrabold text-fg truncate block">
                        {selectedDevice.color}
                      </span>
                    </div>
                    <span className="text-[10px] text-fg-subtle mt-2 block">Цвет корпуса</span>
                  </div>

                  {/* LOCATION SPEC */}
                  <div className="p-3 rounded-xl bg-surface-raised border border-border flex flex-col justify-between">
                    <div className="flex items-center justify-between text-fg-subtle mb-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider">Локация</span>
                      {isWh ? <Warehouse className="w-3.5 h-3.5 text-amber-500" /> : <Store className="w-3.5 h-3.5 text-accent" />}
                    </div>
                    <div>
                      <span className={`text-xs font-bold truncate block ${isWh ? 'text-amber-500' : 'text-accent'}`}>
                        {isWh ? 'Центральный склад' : selectedDevice.locationName || store?.name || 'Магазин'}
                      </span>
                    </div>
                    <span className="text-[10px] text-fg-subtle mt-2 block">Текущий склад</span>
                  </div>
                </div>

                {/* Inline RAM Editor Drawer (if open) */}
                {isEditingRam && (
                  <div className="p-3 rounded-xl bg-surface border border-accent/40 shadow-xs space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-accent" />
                        Укажите объём оперативной памяти (RAM):
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingRam(false)}
                        aria-label="Отменить изменение памяти"
                        className="p-1 rounded-md text-fg-subtle hover:text-fg"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setEditRamValue(preset)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                            editRamValue === preset
                              ? 'bg-accent text-accent-fg border-accent'
                              : 'bg-surface-raised hover:bg-surface border-border text-fg-muted'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={editRamValue}
                        onChange={(e) => setEditRamValue(e.target.value)}
                        placeholder="Например: 8 GB"
                        className="flex-1 rounded-xl bg-surface-raised border border-border px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={isSavingRam || !editRamValue.trim()}
                        onClick={handleSaveRam}
                        className="px-3 py-1.5 rounded-xl bg-accent text-accent-fg hover:bg-accent-strong text-xs font-bold transition-colors disabled:opacity-50 shrink-0"
                      >
                        {isSavingRam ? 'Сохранение…' : 'Сохранить'}
                      </button>
                      <button
                        type="button"
                        disabled={isSavingRam}
                        onClick={() => setIsEditingRam(false)}
                        className="px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-raised border border-border text-fg-muted hover:text-fg text-xs font-bold transition-colors shrink-0"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* IMEI Identifiers with 1-click copy */}
              <div className="p-3.5 rounded-xl bg-surface-raised border border-border space-y-2.5">
                <span className="text-[10px] uppercase font-bold text-fg-subtle tracking-wider flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-accent" />
                  Идентификаторы устройства
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* IMEI 1 */}
                  <div className="p-2.5 rounded-xl bg-surface border border-border flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-fg-subtle block">IMEI 1</span>
                      <span className="font-mono font-bold text-fg select-all text-xs tracking-wider truncate block mt-0.5">
                        {selectedDevice.imei}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedDevice.imei, 'imei1')}
                      className="p-1.5 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-accent transition-colors shrink-0"
                      title="Скопировать IMEI 1"
                    >
                      {copiedKey === 'imei1' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* IMEI 2 */}
                  <div className="p-2.5 rounded-xl bg-surface border border-border flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-fg-subtle block">IMEI 2 (Второй слот)</span>
                      <span className={`font-mono text-xs tracking-wider truncate block mt-0.5 ${
                        selectedDevice.imei2 ? 'font-bold text-fg select-all' : 'text-fg-subtle font-normal'
                      }`}>
                        {selectedDevice.imei2 || '— не указан'}
                      </span>
                    </div>
                    {selectedDevice.imei2 && (
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedDevice.imei2!, 'imei2')}
                        className="p-1.5 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-accent transition-colors shrink-0"
                        title="Скопировать IMEI 2"
                      >
                        {copiedKey === 'imei2' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Financial Audit for Admin Only */}
              {isAdmin && (
                <div className="p-3.5 rounded-xl bg-surface-raised border border-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-fg-subtle flex items-center gap-1.5 tracking-wider">
                      <DollarSign className="w-3.5 h-3.5 text-accent" />
                      Финансовый аудит
                    </span>
                    {selectedDevice.isBonus ? (
                      <Badge tone="accent">Бонус</Badge>
                    ) : (
                      <span className="text-[10px] text-fg-subtle font-mono">
                        {rate ? `Курс: $1 = ${formatMoney(rate)} TJS` : 'Курс на сегодня не задан'}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-surface border border-border">
                      <span className="text-[10px] text-fg-subtle uppercase block font-bold">Поставщик</span>
                      <span className="font-bold text-fg truncate block mt-0.5" title={selectedDevice.supplierName || '—'}>
                        {selectedDevice.supplierName || '—'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface border border-border">
                      <span className="text-[10px] text-fg-subtle uppercase block font-bold">Накладная</span>
                      <span className="font-bold text-fg font-mono truncate block mt-0.5">
                        {selectedDevice.invoiceNumber || '—'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface border border-border">
                      <span className="text-[10px] text-fg-subtle uppercase block font-bold">Цена закупки</span>
                      <span className="font-extrabold text-accent font-mono block mt-0.5">
                        {formatUsd(selectedDevice.purchaseCostUsd)}
                      </span>
                      {approxTjs(selectedDevice.purchaseCostUsd, rate) && (
                        <span className="text-[10px] text-fg-subtle block font-mono">{approxTjs(selectedDevice.purchaseCostUsd, rate)}</span>
                      )}
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface border border-border">
                      <span className="text-[10px] text-fg-subtle uppercase block font-bold">Себестоимость</span>
                      <span className="font-extrabold text-fg font-mono block mt-0.5">
                        {formatUsd(selectedDevice.costBasisUsd)}
                      </span>
                      {approxTjs(selectedDevice.costBasisUsd, rate) && (
                        <span className="text-[10px] text-fg-subtle block font-mono">{approxTjs(selectedDevice.costBasisUsd, rate)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Movement & Event Timeline */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-fg-subtle tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-accent" />
                    История перемещений и событий
                  </span>
                  <span className="text-[10px] text-fg-subtle">
                    {selectedDevice.timeline?.length || 0} {selectedDevice.timeline?.length === 1 ? 'запись' : 'записей'}
                  </span>
                </div>

                <div className="border border-border rounded-xl bg-surface-raised p-3.5 max-h-56 overflow-y-auto space-y-3">
                  {selectedDevice.timeline && selectedDevice.timeline.length > 0 ? (
                    selectedDevice.timeline.map((event, idx) => {
                      const badge = getTimelineBadge(event.type);
                      return (
                        <div key={event.id || idx} className="relative pl-5 before:absolute before:left-1.5 before:top-2 before:bottom-0 before:w-px before:bg-border last:before:hidden">
                          <div className={`absolute left-0 top-1.5 w-3 h-3 rounded-full border-2 border-surface ${badge.dot}`} />
                          <div className="text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] uppercase font-mono tracking-wider border ${badge.tone}`}>
                                {badge.label}
                              </span>
                              <span className="text-[11px] text-fg-subtle font-mono">
                                {formatTimelineDate(event.date)}
                              </span>
                            </div>
                            <p className="text-fg text-xs font-semibold leading-relaxed">
                              {event.description}
                            </p>
                            {event.user && (
                              <p className="text-[11px] text-fg-subtle">
                                Оператор: <span className="font-semibold text-fg-muted">{event.user}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-fg-subtle text-center py-2">История событий пуста</p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
};
