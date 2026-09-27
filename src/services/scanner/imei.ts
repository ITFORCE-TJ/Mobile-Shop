/**
 * IMEI recognition for camera scans. A phone box carries several barcodes (IMEI 1/2,
 * EAN, serial, part number); only a 15-digit value whose last digit passes the Luhn
 * check is an IMEI. EAN-13 (13 digits), serials (letters) and IMEISV (16 digits) never
 * pass, and a misread IMEI fails the check digit instead of reaching a lookup.
 */
export function isValidImei(value: string): boolean {
  if (!/^\d{15}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = value.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Every distinct IMEI in a decoded barcode, in order. Handles a plain barcode value,
 * one printed with separators ("35-209900-176148-1") and QR/DataMatrix payloads such as
 * "IMEI1:351234567890123;IMEI2:351234567890131;SN:R58N…".
 */
export function extractImeis(raw: string): string[] {
  const compact = raw.trim().replace(/[\s-]/g, '');
  if (/^\d{15}$/.test(compact)) return isValidImei(compact) ? [compact] : [];
  // Avoid lookbehind: iOS 15.x–16.3 cannot parse it, even before scanning starts.
  const found = (raw.match(/\d+/g) ?? []).filter(value => value.length === 15);
  return [...new Set(found.filter(isValidImei))];
}

/** Scanner guidance shared by the native (ML Kit) and web camera scanners. */
export const SCAN_HINTS = {
  aim: 'Наведите рамку на штрих-код IMEI',
  notImei: 'Это не IMEI — наведите на штрих-код с подписью IMEI',
  several: 'В кадре несколько IMEI — наведите рамку на нужный',
  hold: 'IMEI найден — держите камеру неподвижно',
};
