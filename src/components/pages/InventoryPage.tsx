import React, { useState, useMemo, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { Device, DeviceStatus, Store as StoreType } from '../../types';
import {
  Smartphone,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Store,
  Warehouse,
  History,
  DollarSign,
  Layers,
  List,
  Package,
  Boxes
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
import { isStoreScoped } from '../../utils/roles';

const IN_STOCK_STATUSES: DeviceStatus[] = ['STORE_STOCK', 'MAIN_WAREHOUSE', 'IN_STOCK_AFTER_EXCHANGE'];

const STATUS_LABELS: Record<DeviceStatus, string> = {
  MAIN_WAREHOUSE: 'Главный склад',
  STORE_STOCK: 'В магазине',
  SOLD: 'Продан',
  IN_STOCK_AFTER_EXCHANGE: 'После обмена',
  IN_REPAIR: 'В ремонте',
  TRANSFER_PENDING: 'В транзите',
};

const STATUS_TONE: Record<DeviceStatus, BadgeTone> = {
  MAIN_WAREHOUSE: 'neutral',
  STORE_STOCK: 'success',
  SOLD: 'neutral',
  IN_STOCK_AFTER_EXCHANGE: 'info',
  IN_REPAIR: 'warning',
  TRANSFER_PENDING: 'warning',
};

interface DeviceRowProps {
  device: Device;
  isAdminOrPartner: boolean;
  onClick: () => void;
}

const DeviceRow: React.FC<DeviceRowProps> = ({ device, isAdminOrPartner, onClick }) => (
  <button onClick={onClick} className="w-full text-left px-4 py-3 active:bg-surface-raised flex items-center justify-between gap-3 transition-colors">
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-fg-muted truncate">{device.brand} {device.model}</p>
        <Badge tone="neutral">{device.storage}</Badge>
        <Badge tone="neutral">{device.color}</Badge>
      </div>
      <p className="text-xs text-fg-subtle mt-0.5 truncate">
        IMEI: {device.imei}{device.imei2 ? ` / ${device.imei2}` : ''}
      </p>
    </div>

    <div className="text-right shrink-0 flex items-center gap-2">
      {(device.purchaseCostUsd === 0 || device.isBonus) ? (
        <Badge tone="accent">Подарок</Badge>
      ) : isAdminOrPartner && device.purchaseCostUsd > 0 ? (
        <span className="text-xs font-semibold text-fg-muted">${device.purchaseCostUsd}</span>
      ) : null}
      <Badge tone={STATUS_TONE[device.status]}>{STATUS_LABELS[device.status] || device.status}</Badge>
      <ChevronRight className="w-4 h-4 text-fg-subtle" />
    </div>
  </button>
);

interface StoreCardProps {
  store: StoreType;
  unitCount: number;
  valueUsd: number;
  showValue: boolean;
  onClick: () => void;
}

const StoreCard: React.FC<StoreCardProps> = ({ store, unitCount, valueUsd, showValue, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left rounded-xl border border-border bg-surface p-3.5 active:bg-surface-raised transition-colors space-y-3"
  >
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
        {store.isMainWarehouse ? <Warehouse className="w-4.5 h-4.5" /> : <Store className="w-4.5 h-4.5" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg-muted truncate">{store.name}</p>
        {store.isMainWarehouse && <p className="text-[11px] text-fg-subtle">Главный склад</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-fg-subtle ml-auto shrink-0" />
    </div>
    <div className={`grid gap-2 ${showValue ? 'grid-cols-2' : 'grid-cols-1'}`}>
      <StatCard label="Единиц" value={String(unitCount)} icon={Boxes} />
      {showValue && <StatCard label="Стоимость" value={`$${valueUsd.toLocaleString()}`} icon={DollarSign} tone="accent" />}
    </div>
  </button>
);

export const InventoryPage: React.FC = () => {
  const { currentUser, devices, findDeviceByImei, stores, openScanner, isInitialLoading, selectedStoreId: globalSelectedStoreId } = useAppFields('currentUser', 'devices', 'findDeviceByImei', 'stores', 'openScanner', 'isInitialLoading', 'selectedStoreId');

  // Defaults to whichever store is currently active on the POS Terminal page —
  // an admin picking a store there should land here already on that store instead
  // of hitting the store-picker screen again; they can still switch it locally.
  const [pickedStoreId, setPickedStoreId] = useState<string | null>(
    globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : null
  );
  // Follow the global store switcher in the TopBar.
  useEffect(() => {
    setPickedStoreId(globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : null);
  }, [globalSelectedStoreId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [groupByModel, setGroupByModel] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const isSeller = isStoreScoped(currentUser);
  // A store manager sees stock value too — it's part of their store's P&L.
  const isAdminOrPartner = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER' || currentUser?.role === 'STORE_MANAGER';
  const activeStoreId = isSeller ? (currentUser?.storeId || '') : pickedStoreId;
  const activeStore = stores.find(s => s.id === activeStoreId) || null;
  const showPicker = !isSeller && !activeStoreId;

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

  const devicesInActiveStore = useMemo(
    () => devices.filter(d => d.locationId === activeStoreId && IN_STOCK_STATUSES.includes(d.status)),
    [devices, activeStoreId]
  );

  const distinctModelCount = useMemo(() => {
    const set = new Set<string>();
    devicesInActiveStore.forEach(d => set.add(`${d.brand}__${d.model}`));
    return set.size;
  }, [devicesInActiveStore]);

  const stockValueUsd = useMemo(
    () => devicesInActiveStore.reduce((acc, d) => acc + (d.purchaseCostUsd || 0), 0),
    [devicesInActiveStore]
  );

  const filteredDevices = useMemo(() => {
    return devicesInActiveStore.filter((d) => {
      if (selectedBrand !== 'ALL' && d.brand !== selectedBrand) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          d.imei.toLowerCase().includes(q) ||
          d.imei2?.toLowerCase().includes(q) ||
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q) ||
          d.storage.toLowerCase().includes(q) ||
          d.supplierName?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [devicesInActiveStore, selectedBrand, searchQuery]);

  const groups = useGroupedDevices(filteredDevices);

  const brands = useMemo(() => {
    const set = new Set<string>();
    devicesInActiveStore.forEach((d) => set.add(d.brand));
    return [{ value: 'ALL', label: 'Все бренды' }, ...Array.from(set).map(b => ({ value: b, label: b }))];
  }, [devicesInActiveStore]);

  const handleScanDevice = () => {
    openScanner(async (scannedCode) => {
      const code = scannedCode.trim();
      const match = devices.find(d =>
        (d.imei === code || d.imei2 === code) &&
        (!isSeller || d.locationId === currentUser?.storeId)
      );
      if (match) {
        setSelectedDevice(match);
        return;
      }

      // In-stock devices are always in `devices` (see fetchDevices) — reaching here means
      // this is either an unregistered code or a SOLD device, which the default list
      // excludes. Check the server before falling back to a plain text search.
      try {
        const [found] = await findDeviceByImei(code);
        if (found && (!isSeller || found.locationId === currentUser?.storeId)) {
          setSelectedDevice(found);
          return;
        }
      } catch {
        // fall through
      }
      setSearchQuery(code);
    });
  };

  const handleBackToPicker = () => {
    setPickedStoreId(null);
    setSearchQuery('');
    setSelectedBrand('ALL');
  };

  if (showPicker) {
    const activeStores = stores.filter(s => s.active);
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
        <div className="flex-1 overflow-y-auto p-3">
          {activeStores.length === 0 ? (
            <EmptyState icon={Package} title="Нет активных складов" description="Добавьте магазин в настройках" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeStores.map(s => {
                const stat = storeStats.get(s.id) || { unitCount: 0, valueUsd: 0 };
                return (
                  <StoreCard
                    key={s.id}
                    store={s}
                    unitCount={stat.unitCount}
                    valueUsd={stat.valueUsd}
                    showValue={isAdminOrPartner}
                    onClick={() => setPickedStoreId(s.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <div className="p-2.5 sm:p-3 border-b border-border bg-surface space-y-2 shrink-0">
        {/* Row 1: current store + back (admin/partner only) */}
        <div className="flex items-center gap-2">
          {!isSeller && (
            <button
              type="button"
              onClick={handleBackToPicker}
              className="flex items-center gap-1 h-8 px-2 rounded-lg text-fg-subtle hover:text-fg-muted shrink-0 transition-colors"
              aria-label="Выбрать другой склад"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <span className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted truncate">
            {activeStore?.isMainWarehouse ? <Warehouse className="w-4 h-4 text-accent shrink-0" /> : <Store className="w-4 h-4 text-accent shrink-0" />}
            {isSeller ? (currentUser?.storeName || 'Мой магазин') : (activeStore?.name || 'Склад')}
          </span>
        </div>

        {/* Row 2: at-a-glance stats */}
        <div className={`grid gap-2 ${isAdminOrPartner ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <StatCard label="Единиц" value={String(devicesInActiveStore.length)} icon={Boxes} />
          <StatCard label="Моделей" value={String(distinctModelCount)} icon={Layers} />
          {isAdminOrPartner && <StatCard label="Стоимость" value={`$${stockValueUsd.toLocaleString()}`} icon={DollarSign} tone="accent" />}
        </div>

        <SearchBar value={searchQuery} onChange={setSearchQuery} onScan={handleScanDevice} placeholder="Поиск по IMEI / штрихкоду / модели..." />

        {/* Row 3: Brand select, group toggle & filtered count */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 shrink-0">
          <Select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="h-8 py-0 px-2 text-[11px] w-auto shrink-0">
            {brands.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </Select>

          <button
            type="button"
            onClick={() => setGroupByModel((prev) => !prev)}
            title={groupByModel ? 'Показать полным списком' : 'Сгруппировать по модели'}
            className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border bg-surface-raised text-[11px] font-medium text-fg-muted hover:text-fg-muted shrink-0 whitespace-nowrap transition-colors"
          >
            {groupByModel ? <List className="w-3.5 h-3.5 text-accent" /> : <Layers className="w-3.5 h-3.5 text-accent" />}
            <span className="hidden sm:inline">{groupByModel ? 'Список' : 'Группы'}</span>
          </button>

          <span className="text-[11px] text-fg-subtle ml-auto shrink-0 whitespace-nowrap pl-2">
            Найдено: <strong className="text-accent font-bold">{filteredDevices.length}</strong>
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isInitialLoading ? (
          <LoadingState label="Загрузка склада…" />
        ) : filteredDevices.length === 0 ? (
          <EmptyState icon={Smartphone} title="Устройства не найдены" description="Попробуйте изменить параметры поиска или фильтров" />
        ) : !groupByModel ? (
          <div className="divide-y divide-border">
            {filteredDevices.map((dev) => (
              <DeviceRow key={dev.id} device={dev} isAdminOrPartner={isAdminOrPartner} onClick={() => setSelectedDevice(dev)} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((group) => {
              const isExpanded = expandedGroups[group.key];
              const allDevices = group.storageGroups.flatMap(sg => sg.colorGroups.flatMap(cg => cg.devices));
              return (
                <div key={group.key}>
                  <button
                    onClick={() => setExpandedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 active:bg-surface-raised transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Smartphone className="w-4 h-4 text-accent shrink-0" />
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-semibold text-fg-muted truncate">{group.brand} {group.model}</p>
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
                      {allDevices.map((dev) => (
                        <DeviceRow key={dev.id} device={dev} isAdminOrPartner={isAdminOrPartner} onClick={() => setSelectedDevice(dev)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedDevice}
        onClose={() => setSelectedDevice(null)}
        title={selectedDevice ? `${selectedDevice.brand} ${selectedDevice.model}` : ''}
        subtitle="Карточка устройства"
        maxWidth="lg"
        footer={<Button variant="secondary" fullWidth onClick={() => setSelectedDevice(null)}>Закрыть</Button>}
      >
        {selectedDevice && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3 text-sm bg-surface p-3 rounded-lg border border-border">
              <div>
                <span className="text-fg-subtle block text-xs uppercase">Память / цвет</span>
                <span className="font-semibold text-fg-muted">{selectedDevice.storage} · {selectedDevice.color}</span>
              </div>
              <div>
                <span className="text-fg-subtle block text-xs uppercase">Локация</span>
                <span className="font-semibold text-accent flex items-center gap-1 mt-0.5 truncate">
                  <Store className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{selectedDevice.locationName}</span>
                </span>
              </div>

              <div className="col-span-2 pt-2 border-t border-border">
                <span className="text-fg-subtle block text-xs uppercase">IMEI 1</span>
                <span className="text-sm font-semibold text-fg-muted select-all break-all">{selectedDevice.imei}</span>
              </div>
              <div className="col-span-2 pt-2 border-t border-border">
                <span className="text-fg-subtle block text-xs uppercase">IMEI 2</span>
                <span className={`text-sm font-semibold select-all break-all ${selectedDevice.imei2 ? 'text-fg-muted' : 'text-fg-subtle font-normal'}`}>
                  {selectedDevice.imei2 || '— не указан'}
                </span>
              </div>
              <div className="col-span-2 pt-2 border-t border-border flex items-center justify-between">
                <span className="text-fg-subtle text-xs uppercase">Статус</span>
                <Badge tone={STATUS_TONE[selectedDevice.status]}>{STATUS_LABELS[selectedDevice.status] || selectedDevice.status}</Badge>
              </div>
            </div>

            {isAdminOrPartner && (
              <div className="bg-surface p-3 rounded-lg border border-border space-y-2 text-sm">
                <p className="font-semibold text-fg-muted flex items-center gap-1.5 uppercase text-xs tracking-wide">
                  <DollarSign className="w-3.5 h-3.5 text-accent" />
                  Финансовый аудит
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-fg-subtle block text-xs uppercase">Поставщик</span>
                    <span className="text-fg-muted truncate block">{selectedDevice.supplierName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-fg-subtle block text-xs uppercase">Накладная</span>
                    <span className="text-fg-muted truncate block">{selectedDevice.invoiceNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-fg-subtle block text-xs uppercase">Цена закупки</span>
                    <span className="font-semibold text-accent">${selectedDevice.purchaseCostUsd}</span>
                  </div>
                  <div>
                    <span className="text-fg-subtle block text-xs uppercase">Себестоимость</span>
                    <span className="font-semibold text-fg-muted">${selectedDevice.costBasisUsd}</span>
                  </div>
                </div>
                {selectedDevice.isBonus && <Badge tone="accent">Бонус поставщика</Badge>}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                История перемещений и событий
              </p>
              <div className="border border-border rounded-lg bg-surface p-3 space-y-2.5">
                {selectedDevice.timeline && selectedDevice.timeline.length > 0 ? (
                  selectedDevice.timeline.map((event, idx) => (
                    <div key={event.id || idx} className="relative pl-4 before:absolute before:left-1 before:top-1.5 before:bottom-0 before:w-px before:bg-border last:before:hidden">
                      <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-accent" />
                      <div className="text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-fg-muted text-xs uppercase">{event.type}</span>
                          <span className="text-xs text-fg-subtle shrink-0">{event.date}</span>
                        </div>
                        <p className="text-fg-subtle text-xs mt-0.5">{event.description}</p>
                        <p className="text-xs text-fg-subtle mt-0.5">Оператор: {event.user}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-fg-subtle">История событий пуста</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
