import type { Device, DeviceStatus } from '../types';

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  MAIN_WAREHOUSE: 'Центральный склад',
  STORE_STOCK: 'В магазине',
  SOLD: 'Продан',
  IN_STOCK_AFTER_EXCHANGE: 'После обмена',
  IN_REPAIR: 'В ремонте',
  TRANSFER_PENDING: 'В транзите',
};

const SELLABLE: DeviceStatus[] = ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'];

/** A scanned or typed code: trimmed, inner spaces dropped (some scanners group IMEI digits). */
export function normalizeScanCode(code: string): string {
  return code.trim().replace(/\s+/g, '');
}

/** Long digit strings are IMEIs/barcodes; anything else typed into search is a text query. */
export function looksLikeDeviceCode(code: string): boolean {
  return /^\d{8,}$/.test(normalizeScanCode(code));
}

export function findDeviceByCode(devices: Device[], code: string): Device | undefined {
  const c = normalizeScanCode(code);
  if (!c) return undefined;
  return devices.find((d) => d.imei === c || d.imei2 === c);
}

export type SaleScanResult =
  | { kind: 'add'; device: Device }
  | { kind: 'in-cart'; device: Device }
  | { kind: 'other-location'; device: Device; locationName: string }
  | { kind: 'unavailable'; device: Device; statusLabel: string }
  | { kind: 'not-found'; code: string };

/**
 * What a scan at the sales counter means: the phone goes into the cart only when it is
 * in stock in this store and not already in the cart; otherwise the cashier gets the reason.
 */
export function resolveSaleScan(input: {
  devices: Device[];
  code: string;
  storeId?: string | null;
  cartDeviceIds: string[];
  storeName: (id: string) => string | undefined;
}): SaleScanResult {
  const code = normalizeScanCode(input.code);
  const device = findDeviceByCode(input.devices, code);
  if (!device) return { kind: 'not-found', code };
  if (input.cartDeviceIds.includes(device.id)) return { kind: 'in-cart', device };
  if (!SELLABLE.includes(device.status)) {
    return { kind: 'unavailable', device, statusLabel: DEVICE_STATUS_LABELS[device.status] || device.status };
  }
  if (input.storeId && device.locationId !== input.storeId) {
    return { kind: 'other-location', device, locationName: input.storeName(device.locationId) || device.locationName || 'другой точке' };
  }
  return { kind: 'add', device };
}

/** Russian text for every outcome except a successful add. */
export function saleScanMessage(result: Exclude<SaleScanResult, { kind: 'add' }>): string {
  switch (result.kind) {
    case 'in-cart':
      return `${result.device.brand} ${result.device.model} уже в корзине`;
    case 'other-location':
      return `${result.device.brand} ${result.device.model} числится в «${result.locationName}», а не в этом магазине. Сначала оформите перемещение`;
    case 'unavailable':
      return `${result.device.brand} ${result.device.model} нельзя продать: статус «${result.statusLabel}»`;
    case 'not-found':
      return `Устройство с IMEI ${result.code} не найдено среди телефонов в наличии`;
  }
}
