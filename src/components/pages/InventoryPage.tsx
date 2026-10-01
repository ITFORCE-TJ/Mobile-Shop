import React, { useState, useMemo, useEffect } from 'react';
import { formatMoney } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { Device, DeviceStatus, Store as StoreType } from '../../types';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
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
  Package,
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
  X,
  Tag
} from 'lucide-react';
import { useGroupedDevices } from '../../hooks/useGroupedDevices';
import { SearchBar } from '../ui/SearchBar';
import { Select } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge, BadgeTone } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { Dialog } from '../ui/Dialog';
import { StatCard } from '../ui/StatCard';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useNavigationLayout } from '../../hooks/useNavigationLayout';
import { DEVICE_STATUS_LABELS, findDeviceByCode, looksLikeDeviceCode, normalizeScanCode } from '../../utils/scanLookup';

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

function getTimelineBadge(type: string) {
  const upper = (type || '').toUpperCase();
  if (upper === 'BONUS') {
    return {
      label: 'БОНУС ПОСТАВЩИКА',
      tone: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      dot: 'bg-amber-500',
    };
  }
  if (upper === 'PURCHASE') {
    return {
      label: 'ПОСТУПЛЕНИЕ / ПРИХОД',
      tone: 'bg-accent/15 text-accent border-accent/30',
      dot: 'bg-accent',
    };
  }
  if (upper === 'TRANSFER') {
    return {
      label: 'ПЕРЕМЕЩЕНИЕ',
      tone: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      dot: 'bg-purple-500',
    };
  }
  if (upper === 'SALE') {
    return {
      label: 'ПРОДАЖА',
      tone: 'bg-success/15 text-success border-success/30',
      dot: 'bg-success',
    };
  }
  if (upper === 'REPAIR') {
    return {
      label: 'РЕМОНТ',
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
  rate: number;
  onClick: () => void;
}

const DeviceRow: React.FC<DeviceRowProps> = ({ device, isAdmin, storeName, isMainWarehouse, rate, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left px-3.5 sm:px-4 py-3 active:bg-surface-raised flex items-center justify-between gap-3 transition-colors hover:bg-surface-raised/50"
  >
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <p className="text-xs sm:text-sm font-bold text-fg-muted truncate">{device.brand} {device.model}</p>
        {device.ram && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/15 text-accent border border-accent/30 font-mono">
            {device.ram.toUpperCase().includes('GB') ? device.ram : `${device.ram} GB`}
          </span>
        )}
        <Badge tone="neutral">{device.storage}</Badge>
        <Badge tone="neutral">{device.color}</Badge>
        {storeName && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            isMainWarehouse
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/25'
              : 'bg-accent/10 text-accent border-accent/25'
          }`}>
            {isMainWarehouse ? <Warehouse className="w-3 h-3 text-amber-500 shrink-0" /> : <Store className="w-3 h-3 text-accent shrink-0" />}
            <span className="truncate max-w-32">{storeName}</span>
          </span>
        )}
      </div>
      <p className="text-xs text-fg-subtle mt-0.5 truncate font-mono">
        IMEI: {device.imei}{device.imei2 ? ` / ${device.imei2}` : ''}
      </p>
    </div>

    <div className="text-right shrink-0 flex items-center gap-2">
      {(device.purchaseCostUsd === 0 || device.isBonus) ? (
        <Badge tone="accent">Бонус</Badge>
      ) : isAdmin && device.purchaseCostUsd > 0 ? (
        <div className="text-right">
          <span className="text-xs font-bold text-fg-muted block">${formatMoney(device.purchaseCostUsd)}</span>
          <span className="text-[10px] text-fg-subtle block">≈ {formatMoney(device.purchaseCostUsd * rate)} TJS</span>
        </div>
      ) : null}
      {!isAdmin && (device.retailPriceTjs ?? 0) > 0 && (
        <span className="text-xs font-bold tabular-nums text-accent whitespace-nowrap">{formatMoney(device.retailPriceTjs)} TJS</span>
      )}
      <Badge tone={STATUS_TONE[device.status]}>{STATUS_LABELS[device.status] || device.status}</Badge>
      <ChevronRight className="w-4 h-4 text-fg-subtle" />
    </div>
  </button>
);

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

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;
  const isSeller = currentUser?.role === 'SELLER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isAdminOrPartner = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';
  const isStoreScoped = currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER';

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
      entry.valueUsd += d.purchaseCostUsd || 0;
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
    () => devicesInActiveLocation.reduce((acc, d) => acc + (d.purchaseCostUsd || 0), 0),
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
        if (!d.isBonus && d.purchaseCostUsd !== 0) return false;
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
    () => filteredDevices.reduce((acc, d) => acc + (d.purchaseCostUsd || 0), 0),
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
      bGroup.totalValueUsd += dev.purchaseCostUsd || 0;
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
      mGroup.valueUsd += dev.purchaseCostUsd || 0;
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
      setPageStatus({ tone: 'error', text: `Устройство с IMEI ${code} не найдено` });
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
        existing.valueUsd += d.purchaseCostUsd || 0;
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
              <span className="font-bold text-fg text-sm sm:text-base mt-0.5 block">${formatMoney(stat.valueUsd)}</span>
              <span className="text-[10px] text-fg-subtle block">≈ {formatMoney(stat.valueUsd * rate)} TJS</span>
            </div>
          )}
          <div className="p-2.5 rounded-xl bg-surface border border-border">
            <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Моделей в наличии</span>
            <span className="font-bold text-fg text-sm sm:text-base mt-0.5 block">{modelsList.length}</span>
          </div>
          {!targetStore.isMainWarehouse && (
            <div className="p-2.5 rounded-xl bg-surface border border-border">
              <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Касса точки</span>
              <span className="font-bold text-accent text-sm sm:text-base mt-0.5 block">${formatMoney(targetStore.cashBalanceUsd)}</span>
            </div>
          )}
        </div>

        {/* Models in stock */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] uppercase font-bold text-fg-subtle">
              Товары и остатки точки ({modelsList.length} позиций):
            </span>
          </div>

          {modelsList.length === 0 ? (
            <div className="p-4 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-fg-subtle">
              В данной локации сейчас нет товаров в наличии
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
                      <span className="text-[10px] text-fg-subtle block">${formatMoney(m.valueUsd)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-fg-subtle">
            Просмотр подробного каталога без смены активного магазина
          </span>
          <button
            type="button"
            onClick={() => handleSelectLocationAndSwitch(targetStore.id)}
            className="px-3 py-1.5 rounded-lg bg-accent text-accent-fg hover:bg-accent-strong font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <span>Открыть в списке товаров ({stat.unitCount} шт.)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const filterFields = (
    <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* Filter 1: Brand */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-fg-subtle mb-1">
                      Бренд
                    </label>
                    <select
                      value={selectedBrand}
                      onChange={(e) => setSelectedBrand(e.target.value)}
                      className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-fg-muted text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                    >
                      {brands.map(b => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Filter 2: RAM */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-fg-subtle mb-1">
                      Оперативная память (RAM)
                    </label>
                    <select
                      value={selectedRam}
                      onChange={(e) => setSelectedRam(e.target.value)}
                      className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-fg-muted text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">Любая оперативная память</option>
                      {availableRams.map(ram => (
                        <option key={ram} value={ram}>{ram} GB</option>
                      ))}
                    </select>
                  </div>

                  {/* Filter 3: Storage */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-fg-subtle mb-1">
                      Встроенная память (Накопитель)
                    </label>
                    <select
                      value={selectedStorage}
                      onChange={(e) => setSelectedStorage(e.target.value)}
                      className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-fg-muted text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">Любой объем памяти</option>
                      {availableStorages.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  {/* Filter 4: Status / Type */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-fg-subtle mb-1">
                      Статус / Тип наличия
                    </label>
                    <select
                      value={selectedStatusFilter}
                      onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                      className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-fg-muted text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">Все товары {activeStore ? `(в «${activeStore.name}»)` : 'в наличии'}</option>
                      {selectedLocationId === 'ALL' && (
                        <>
                          <option value="MAIN_WAREHOUSE">🏢 Только на Центральном складе</option>
                          <option value="STORE_STOCK">🏬 Только в розничных магазинах</option>
                        </>
                      )}
                      <option value="BONUS_ONLY">🎁 Только бонусы поставщиков ($0)</option>
                      <option value="EXCHANGE_ONLY">🔄 Только после обмена (Trade-in)</option>
                    </select>
                  </div>
                </div>

                {/* Second row of filters: Price range & Sort */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-border text-xs">
                  {/* Price Range */}
                  {isAdmin && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-fg-subtle mb-1">
                        Себестоимость ($ USD)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          placeholder="От $"
                          value={minPriceUsd}
                          onChange={(e) => setMinPriceUsd(e.target.value)}
                          className="w-1/2 rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                        />
                        <span className="text-fg-subtle">—</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="До $"
                          value={maxPriceUsd}
                          onChange={(e) => setMaxPriceUsd(e.target.value)}
                          className="w-1/2 rounded-xl bg-surface border border-border px-3 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Quick price presets */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-fg-subtle mb-1">
                      Быстрый диапазон цен
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {[
                        { label: '< $200', min: '', max: '200' },
                        { label: '$200 - $500', min: '200', max: '500' },
                        { label: '$500 - $1000', min: '500', max: '1000' },
                        { label: '> $1000', min: '1000', max: '' },
                      ].map((preset) => {
                        const isActive = minPriceUsd === preset.min && maxPriceUsd === preset.max;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              if (isActive) {
                                setMinPriceUsd('');
                                setMaxPriceUsd('');
                              } else {
                                setMinPriceUsd(preset.min);
                                setMaxPriceUsd(preset.max);
                              }
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-accent text-accent-fg border-accent'
                                : 'bg-surface hover:bg-surface-raised border-border text-fg-muted'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sorting */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-fg-subtle mb-1">
                      Сортировка
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-fg-muted text-xs font-semibold focus:border-accent focus:outline-none cursor-pointer"
                    >
                      <option value="COUNT_DESC">По количеству: больше → меньше</option>
                      <option value="COUNT_ASC">По количеству: меньше → больше</option>
                      <option value="NAME_ASC">По названию бренда: А → Я</option>
                      <option value="NAME_DESC">По названию бренда: Я → А</option>
                      {isAdmin && (
                        <>
                          <option value="PRICE_DESC">По себестоимости: дорогие → дешевые</option>
                          <option value="PRICE_ASC">По себестоимости: дешевые → дорогие</option>
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
      <div className="p-2.5 sm:p-3 border-b border-border bg-surface space-y-2.5 shrink-0 shadow-xs">
        {/* Row 1: Mode Switcher (List of Goods vs Locations List) & Location Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!isStoreScoped ? (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-raised border border-border shrink-0">
              <button
                type="button"
                onClick={() => setViewTab('DEVICES')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewTab === 'DEVICES'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-fg-subtle hover:text-fg-muted'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Список товаров</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  viewTab === 'DEVICES' ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface text-fg-subtle'
                }`}>
                  {filteredUnitsCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewTab('LOCATIONS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
          {!isStoreScoped && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-fg-subtle font-medium hidden sm:inline">Локация:</span>
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value);
                  if (selectedStatusFilter === 'MAIN_WAREHOUSE' && e.target.value !== mainWarehouse?.id) {
                    setSelectedStatusFilter('ALL');
                  }
                }}
                className="bg-surface-raised border border-border text-fg text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
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

        {/* Row 2: Dynamic Summary Stats Cards */}
        <div className={`grid gap-2 sm:gap-3 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
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
              value={`$${formatMoney(filteredStockValueUsd)}`}
              subvalue={isFiltered ? `из $${formatMoney(stockValueUsd)} всего` : undefined}
              icon={DollarSign}
              tone="accent"
            />
          )}
        </div>

        {/* Row 3: Professional Search, Filters & Grouping Toolbar */}
        {viewTab === 'DEVICES' && (
          <div className="space-y-2.5">
            {/* Search Bar + Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onScan={handleScanDevice}
                  onSubmit={(value) => { void openDeviceByCode(value, 'enter'); }}
                  placeholder="Поиск по IMEI, штрихкоду, модели, бренду, цвету, поставщику..."
                />
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-xl border border-border shrink-0 self-start sm:self-auto">
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

              {/* Advanced Filter Toggle Button */}
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(prev => !prev)}
                aria-expanded={showAdvancedFilters}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
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

            {/* Quick Horizontal Brand Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              <button
                type="button"
                onClick={() => setSelectedBrand('ALL')}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
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
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer shrink-0 flex items-center gap-1.5 ${
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

            {/* Advanced Filters Panel */}
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

            {/* Active Filters Badges & Summary Line */}
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
                      {' '}· ${formatMoney(filteredDevices.reduce((acc, d) => acc + (d.purchaseCostUsd || 0), 0))} USD
                    </span>
                  )}
                </span>

                {/* Active filter badges */}
                {selectedBrand !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                    <span>Бренд: {selectedBrand}</span>
                    <button type="button" onClick={() => setSelectedBrand('ALL')} className="hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {selectedRam !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                    <span>RAM: {selectedRam} GB</span>
                    <button type="button" onClick={() => setSelectedRam('ALL')} className="hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {selectedStorage !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/30">
                    <span>Память: {selectedStorage}</span>
                    <button type="button" onClick={() => setSelectedStorage('ALL')} className="hover:opacity-70">
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
                    <button type="button" onClick={() => setSelectedStatusFilter('ALL')} className="hover:opacity-70">
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
                      className="hover:opacity-70"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {searchQuery.trim() && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-raised border border-border text-fg-muted">
                    <span>Поиск: «{searchQuery}»</span>
                    <button type="button" onClick={() => setSearchQuery('')} className="hover:opacity-70">
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
              <span className="text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-accent" />
                <span>СПИСОК ЛОКАЦИЙ (ЦЕНТРАЛЬНЫЙ СКЛАД И МАГАЗИНЫ)</span>
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
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-500 font-bold uppercase tracking-wider">
                            ЕДИНСТВЕННЫЙ СКЛАД
                          </span>
                        </div>
                        <p className="text-xs text-fg-subtle">
                          Центральный склад компании: приемка от поставщиков, хранение и резерв для распределения по магазинам сети.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <div className="text-right mr-1">
                        <span className="text-sm font-bold text-amber-400 block">
                          {stat.unitCount} шт.
                        </span>
                        {isAdmin && (
                          <span className="text-[11px] text-fg-subtle block">
                            ${stat.valueUsd.toLocaleString()} · ≈ {Math.round(stat.valueUsd * rate).toLocaleString()} TJS
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
                <span className="font-bold uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-accent" />
                  <span>Магазины сети ({retailStores.length})</span>
                </span>
                <span>Розничные точки продаж</span>
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
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-raised border border-border text-fg-subtle font-semibold">
                                  МАГАЗИН
                                </span>
                              </div>
                              <p className="text-[11px] text-fg-subtle truncate">
                                Розничная торговая точка · Касса: ${formatMoney(store.cashBalanceUsd)}
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
                                  ${formatMoney(stat.valueUsd)} · ≈ {formatMoney(stat.valueUsd * rate)} TJS
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
            <div className="p-3 sm:px-4 bg-surface-raised/40 flex items-center justify-between gap-2 border-b border-border">
              <span className="text-xs font-semibold text-fg-subtle flex items-center gap-1.5 flex-wrap">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>Всего брендов: <strong className="text-fg">{brandGroups.length}</strong></span>
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
                className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                {brandGroups.every(b => expandedBrandKeys[b.key]) ? 'Свернуть все бренды' : 'Развернуть все бренды'}
              </button>
            </div>

            {brandGroups.map((bGroup) => {
              const isBrandExpanded = !!expandedBrandKeys[bGroup.key];
              const totalDevicesInView = filteredDevices.length || 1;
              const percent = Math.round((bGroup.totalCount / totalDevicesInView) * 100);

              return (
                <div key={bGroup.key} className="transition-colors">
                  {/* Brand Row Button */}
                  <div
                    onClick={() => setExpandedBrandKeys(prev => ({ ...prev, [bGroup.key]: !prev[bGroup.key] }))}
                    className="w-full px-3.5 sm:px-4 py-3.5 flex items-center justify-between gap-3 active:bg-surface-raised transition-colors hover:bg-surface-raised/50 cursor-pointer select-none"
                  >
                    {/* Left: Brand name, badge, and model count */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0 font-black text-sm tracking-wider shadow-xs">
                        {bGroup.brand.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-extrabold text-fg tracking-wide uppercase">
                            {bGroup.brand}
                          </h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-raised text-fg-subtle border border-border">
                            {bGroup.distinctModelsCount} {bGroup.distinctModelsCount === 1 ? 'модель' : bGroup.distinctModelsCount < 5 ? 'модели' : 'моделей'}
                          </span>
                        </div>
                        {/* Progress bar and breakdown preview */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-24 sm:w-36 h-1.5 rounded-full bg-surface-raised overflow-hidden border border-border shrink-0">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(percent, 4)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-fg-subtle whitespace-nowrap">
                            {percent}% от {activeStore ? `остатка «${activeStore.name}»` : 'общего остатка'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Phone count & financial value */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-base sm:text-lg font-black text-accent font-mono">
                            {bGroup.totalCount}
                          </span>
                          <span className="text-xs text-fg-subtle font-semibold">
                            {bGroup.totalCount === 1 ? 'телефон' : bGroup.totalCount < 5 ? 'телефона' : 'телефонов'}
                          </span>
                        </div>
                        {isAdmin && (
                          <div className="text-[10px] text-fg-subtle font-mono mt-0.5">
                            <span className="font-bold text-fg-muted">${formatMoney(bGroup.totalValueUsd)}</span>
                            <span className="hidden sm:inline"> · ≈ {formatMoney(bGroup.totalValueUsd * rate)} TJS</span>
                          </div>
                        )}
                      </div>

                      <div className={`p-1.5 rounded-lg bg-surface-raised text-fg-subtle transition-transform duration-200 ${isBrandExpanded ? 'rotate-180 text-accent' : ''}`}>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Brand Models Accordion Body */}
                  {isBrandExpanded && (
                    <div className="bg-surface/50 border-t border-border divide-y divide-border/60 pl-3 sm:pl-6 pr-2 sm:pr-4 py-1">
                      {bGroup.modelGroups.map((mGroup) => {
                        const isModelExpanded = !!expandedModelKeys[mGroup.key];
                        return (
                          <div key={mGroup.key} className="py-1">
                            <button
                              type="button"
                              onClick={() => setExpandedModelKeys(prev => ({ ...prev, [mGroup.key]: !prev[mGroup.key] }))}
                              className="w-full py-2.5 px-3 rounded-xl flex items-center justify-between gap-2.5 hover:bg-surface-raised/70 active:bg-surface-raised transition-colors text-left"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Smartphone className="w-3.5 h-3.5 text-accent shrink-0" />
                                  <span className="text-xs sm:text-sm font-bold text-fg-muted">
                                    {mGroup.model}
                                  </span>
                                  {mGroup.ramList.length > 0 && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-accent/15 text-accent border border-accent/30 font-mono">
                                      {mGroup.ramList.map(r => r.toUpperCase().includes('GB') ? r : `${r} GB`).join(' / ')}
                                    </span>
                                  )}
                                </div>

                                {/* Storages breakdown chips */}
                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                  {mGroup.storageList.map((sg) => (
                                    <span
                                      key={sg.storage}
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-raised text-fg-subtle border border-border"
                                    >
                                      {sg.storage}: <strong className="text-fg">{sg.count}</strong> шт.
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <Badge tone="accent">{mGroup.count} шт.</Badge>
                                  {isAdmin && (
                                    <span className="block text-[10px] text-fg-subtle font-mono mt-0.5">
                                      ${formatMoney(mGroup.valueUsd)}
                                    </span>
                                  )}
                                </div>
                                <ChevronDown className={`w-3.5 h-3.5 text-fg-subtle transition-transform duration-200 ${isModelExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </button>

                            {/* Specific Devices List for this Model */}
                            {isModelExpanded && (
                              <div className="mt-1 mb-2 rounded-xl bg-surface border border-border divide-y divide-border overflow-hidden">
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
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 active:bg-surface-raised transition-colors hover:bg-surface-raised/40"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Smartphone className="w-4 h-4 text-accent shrink-0" />
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-bold text-fg-muted truncate">{group.brand} {group.model}</p>
                        <div className="flex items-center gap-1 flex-wrap mt-1">
                          {group.storageGroups.map((sg) => (
                            <span
                              key={sg.key}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-raised text-fg-subtle border border-border whitespace-nowrap"
                            >
                              {sg.storage}×{sg.count}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone="accent">{group.count} шт.</Badge>
                      <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="bg-surface/60 border-t border-border divide-y divide-border">
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
          /* FLAT LIST OF GOODS (DESKTOP TABLE + MOBILE ROWS) */
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border sticky top-0 z-10 backdrop-blur-xs">
                  <tr>
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3">Товар (Бренд / Модель)</th>
                    <th className="p-3">ОЗУ / Память / Цвет</th>
                    <th className="p-3">IMEI / Штрихкод</th>
                    <th className="p-3">Локация</th>
                    {isAdmin && <th className="p-3 text-right">Себестоимость</th>}
                    <th className="p-3">Статус</th>
                    <th className="p-3 text-center">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {filteredDevices.map((dev, idx) => {
                    const store = stores.find(s => s.id === dev.locationId);
                    const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
                    return (
                      <tr
                        key={dev.id}
                        onClick={() => setSelectedDevice(dev)}
                        className="hover:bg-surface-raised/70 active:bg-surface-raised cursor-pointer transition-colors"
                      >
                        <td className="p-3 text-center text-fg-subtle text-[11px] font-mono">
                          {idx + 1}
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
                                  <Sparkles className="w-3 h-3" /> Подарок / Бонус
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
                              <Badge tone="accent">Бонус ($0)</Badge>
                            ) : (
                              <div>
                                <span className="font-bold text-fg-muted block text-xs">
                                  ${dev.purchaseCostUsd}
                                </span>
                                <span className="text-[10px] text-fg-subtle block">
                                  ≈ {Math.round(dev.purchaseCostUsd * rate).toLocaleString()} TJS
                                </span>
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
                </tbody>
              </table>
            </div>

            {/* Mobile List View */}
            <div className="md:hidden divide-y divide-border">
              {filteredDevices.map((dev) => {
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
                    onClick={() => setSelectedDevice(dev)}
                  />
                );
              })}
            </div>
          </div>
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
                        className="text-fg-subtle hover:text-fg text-xs"
                      >
                        ✕
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
                      <Badge tone="accent">Бонус ($0)</Badge>
                    ) : (
                      <span className="text-[10px] text-fg-subtle font-mono">
                        Курс: 1$ = {formatMoney(rate)} TJS
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
                        ${formatMoney(selectedDevice.purchaseCostUsd)}
                      </span>
                      <span className="text-[10px] text-fg-subtle block font-mono">
                        ≈ {formatMoney(selectedDevice.purchaseCostUsd * rate)} TJS
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface border border-border">
                      <span className="text-[10px] text-fg-subtle uppercase block font-bold">Себестоимость</span>
                      <span className="font-extrabold text-fg font-mono block mt-0.5">
                        ${formatMoney(selectedDevice.costBasisUsd)}
                      </span>
                      <span className="text-[10px] text-fg-subtle block font-mono">
                        ≈ {formatMoney(selectedDevice.costBasisUsd * rate)} TJS
                      </span>
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
