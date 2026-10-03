import React, { useState, useMemo, useEffect } from 'react';
import { decimal, moneyNumber, sumMoney } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { Device, DeviceStatus } from '../../types';
import {
  List,
  Building2,
  Smartphone,
} from 'lucide-react';
import { useGroupedDevices } from '../../hooks/useGroupedDevices';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useNavigationLayout } from '../../hooks/useNavigationLayout';
import { useVirtualRows } from '../../hooks/useVirtualRows';
import { findDeviceByCode, looksLikeDeviceCode, normalizeScanCode } from '../../utils/scanLookup';
import { useStoreContext } from '../../utils/storeContext';
import { IN_STOCK_STATUSES, InventoryViewMode, BrandGroupItem, STATUS_LABELS } from '../inventory/types';
import { InventoryStatsBar } from '../inventory/InventoryStatsBar';
import { InventoryFiltersBar } from '../inventory/InventoryFiltersBar';
import { InventoryLocationsView } from '../inventory/InventoryLocationsView';
import { BrandGroupedList } from '../inventory/BrandGroupedList';
import { ModelGroupedList } from '../inventory/ModelGroupedList';
import { FlatDevicesTable } from '../inventory/FlatDevicesTable';
import { DeviceDetailsModal } from '../inventory/DeviceDetailsModal';

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

  const [pageStatus, setPageStatus] = useState<StatusMessage | null>(null);
  const isMobileLayout = useNavigationLayout() === 'mobile';

  const mainWarehouse = useMemo(() => stores.find(s => s.isMainWarehouse), [stores]);
  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);

  // Tab mode: 'DEVICES' (list of goods) or 'LOCATIONS' (list of warehouse and stores)
  const [viewTab, setViewTab] = useState<'DEVICES' | 'LOCATIONS'>('DEVICES');
  // Inside a store there is only that store's stock — no per-location overview.
  useEffect(() => {
    if (storeCtx.mode === 'STORE') setViewTab('DEVICES');
  }, [storeCtx.mode]);

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

  const [inventoryViewMode, setInventoryViewMode] = useState<InventoryViewMode>('BY_BRAND');
  const [expandedBrandKeys, setExpandedBrandKeys] = useState<Record<string, boolean>>({});
  const [expandedModelKeys, setExpandedModelKeys] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

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
   * Opens the scanned phone.
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
        // Network trouble: fall through to "not found"
      }
    }
    if (!found) {
      setSearchQuery(code);
      setPageStatus({
        tone: 'error',
        text: isStoreScoped
          ? `Устройство с IMEI ${code} не найдено в вашем магазине`
          : `Устройство с IMEI ${code} не найдено`
      });
      return;
    }
    const where = stores.find(s => s.id === found!.locationId)?.name || found.locationName || 'другой точке';
    if (isStoreScoped) {
      setPageStatus({
        tone: 'warning',
        text: `${found.brand} ${found.model} числится в «${where}» (${STATUS_LABELS[found.status] || found.status}), а не в вашем магазине`
      });
      return;
    }
    setSelectedLocationId(selectedLocationId === 'ALL' ? 'ALL' : found.locationId);
    setViewTab('DEVICES');
    setSelectedDevice(found);
    setPageStatus({
      tone: 'info',
      text: `${found.brand} ${found.model} числится в «${where}» — открыта эта локация`
    });
  };

  const handleScanDevice = () => {
    openScanner((scannedCode) => {
      void openDeviceByCode(scannedCode, 'camera');
    });
  };

  const handleSelectLocationAndSwitch = (storeId: string) => {
    setSelectedLocationId(storeId);
    setViewTab('DEVICES');
    if (selectedStatusFilter === 'MAIN_WAREHOUSE' && storeId !== mainWarehouse?.id) {
      setSelectedStatusFilter('ALL');
    }
  };

  // Windowed rendering for the flat list
  const flatRows = useVirtualRows<HTMLElement>({
    count: inventoryViewMode === 'FLAT_LIST' && viewTab === 'DEVICES' ? filteredDevices.length : 0,
    estimateSize: isMobileLayout ? 52 : 54,
    resetKey: `${isMobileLayout ? 'm' : 'd'}|${filteredDevices.length}|${filteredDevices[0]?.id ?? ''}|${sortBy}`,
  });

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-y-auto md:overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={pageStatus} onDismiss={() => setPageStatus(null)} />

      {/* Top Header & Navigation Bar */}
      <div className="p-2 sm:p-3 border-b border-border bg-surface space-y-2 sm:space-y-2.5 shrink-0 shadow-xs">
        {/* Row 1: Mode Switcher & Location Selector */}
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
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    viewTab === 'DEVICES' ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface text-fg-subtle'
                  }`}
                >
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
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    viewTab === 'LOCATIONS' ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface text-fg-subtle'
                  }`}
                >
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

        {/* Desktop & Mobile Summary Stats Cards */}
        <InventoryStatsBar
          filteredUnitsCount={filteredUnitsCount}
          isFiltered={isFiltered}
          totalUnitsCount={devicesInActiveLocation.length}
          filteredDistinctBrandsCount={filteredDistinctBrandsCount}
          distinctBrandCount={distinctBrandCount}
          filteredDistinctModelsCount={filteredDistinctModelsCount}
          distinctModelCount={distinctModelCount}
          isAdmin={isAdmin}
          filteredStockValueUsd={filteredStockValueUsd}
          stockValueUsd={stockValueUsd}
        />

        {/* Search, Filters & Grouping Toolbar */}
        {viewTab === 'DEVICES' && (
          <InventoryFiltersBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onScan={handleScanDevice}
            onSubmitSearch={(val) => {
              void openDeviceByCode(val, 'enter');
            }}
            inventoryViewMode={inventoryViewMode}
            onViewModeChange={setInventoryViewMode}
            showAdvancedFilters={showAdvancedFilters}
            onToggleAdvancedFilters={() => setShowAdvancedFilters(prev => !prev)}
            activeFiltersCount={activeFiltersCount}
            isMobileLayout={isMobileLayout}
            selectedBrand={selectedBrand}
            onSelectBrand={setSelectedBrand}
            brands={brands}
            brandCountsMap={brandCountsMap}
            devicesInActiveLocationCount={devicesInActiveLocation.length}
            selectedStatusFilter={selectedStatusFilter}
            onSelectStatusFilter={setSelectedStatusFilter}
            activeStore={activeStore}
            selectedLocationId={selectedLocationId}
            selectedRam={selectedRam}
            onSelectRam={setSelectedRam}
            availableRams={availableRams}
            selectedStorage={selectedStorage}
            onSelectStorage={setSelectedStorage}
            availableStorages={availableStorages}
            minPriceUsd={minPriceUsd}
            maxPriceUsd={maxPriceUsd}
            onMinPriceChange={setMinPriceUsd}
            onMaxPriceChange={setMaxPriceUsd}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            isAdmin={isAdmin}
            filteredDevicesCount={filteredDevices.length}
            brandGroupsCount={brandGroups.length}
            filteredStockValueUsd={filteredStockValueUsd}
            onResetAllFilters={handleResetAllFilters}
          />
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-none md:flex-1 md:min-h-0 md:overflow-y-auto">
        {isInitialLoading ? (
          <LoadingState label="Загрузка склада товаров…" />
        ) : viewTab === 'LOCATIONS' ? (
          <InventoryLocationsView
            devices={devices}
            mainWarehouse={mainWarehouse}
            retailStores={retailStores}
            storeStats={storeStats}
            selectedLocationId={selectedLocationId}
            isAdmin={isAdmin}
            rate={rate}
            onSelectLocationAndSwitch={handleSelectLocationAndSwitch}
          />
        ) : filteredDevices.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="Устройства не найдены"
            description="Попробуйте изменить параметры поиска или выбрать другую локацию"
          />
        ) : inventoryViewMode === 'BY_BRAND' ? (
          <BrandGroupedList
            brandGroups={brandGroups}
            expandedBrandKeys={expandedBrandKeys}
            onToggleBrandKey={(key) =>
              setExpandedBrandKeys(prev => ({ ...prev, [key]: !prev[key] }))
            }
            onSetAllBrandKeys={setExpandedBrandKeys}
            expandedModelKeys={expandedModelKeys}
            onToggleModelKey={(key) =>
              setExpandedModelKeys(prev => ({ ...prev, [key]: !prev[key] }))
            }
            stores={stores}
            selectedLocationId={selectedLocationId}
            activeStore={activeStore}
            isAdmin={isAdmin}
            rate={rate}
            totalFilteredDevicesCount={filteredDevices.length}
            onSelectDevice={(device) => setSelectedDevice(device)}
          />
        ) : inventoryViewMode === 'BY_MODEL' ? (
          <ModelGroupedList
            groups={groups}
            expandedGroups={expandedGroups}
            onToggleGroup={(key) =>
              setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }))
            }
            stores={stores}
            selectedLocationId={selectedLocationId}
            isAdmin={isAdmin}
            rate={rate}
            onSelectDevice={(device) => setSelectedDevice(device)}
          />
        ) : (
          <FlatDevicesTable
            isMobileLayout={isMobileLayout}
            filteredDevices={filteredDevices}
            flatRows={flatRows}
            stores={stores}
            selectedLocationId={selectedLocationId}
            isAdmin={isAdmin}
            rate={rate}
            onSelectDevice={(device) => setSelectedDevice(device)}
          />
        )}
      </div>

      {/* Device Details Dialog */}
      <DeviceDetailsModal
        device={selectedDevice}
        stores={stores}
        rate={rate}
        isAdmin={isAdmin}
        isAdminOrPartner={isAdminOrPartner}
        onClose={() => setSelectedDevice(null)}
        onUpdateRam={(deviceId, ram) => updateDevice(deviceId, { ram })}
        onNotify={(msg) => setPageStatus(msg)}
      />
    </div>
  );
};
