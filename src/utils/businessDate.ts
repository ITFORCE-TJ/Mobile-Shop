/** A valid IANA zone name, or the fallback (a wrong value must not break every date on the page). */
export function resolveTimeZone(zone: string | undefined, fallback = 'Asia/Tashkent'): string {
  if (!zone) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}

/**
 * Business days and months follow the server's BUSINESS_TIME_ZONE. Set VITE_BUSINESS_TIME_ZONE to
 * the same value at build time when the server does not use the default Asia/Tashkent.
 */
export const BUSINESS_TIME_ZONE = resolveTimeZone(import.meta.env?.VITE_BUSINESS_TIME_ZONE);

export function getBusinessDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** 'YYYY-MM' of the current business day. */
export function currentBusinessMonth(date: Date = new Date()): string {
  return getBusinessDateKey(date).slice(0, 7);
}

/** First and last day ('YYYY-MM-DD') of a 'YYYY-MM' month — pure calendar math, no time zone. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** The 'YYYY-MM' month a date range covers exactly, or undefined when it is not one whole month. */
export function wholeMonthOf(start: string, end: string): string | undefined {
  const month = start.slice(0, 7);
  const bounds = monthBounds(month);
  return start === bounds.start && end === bounds.end ? month : undefined;
}

/** 'YYYY-MM' shifted by a number of months, across years. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const RU_MONTHS_SHORT =['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatBusinessDate(dateStr: string, includeYear = true): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [year, month, day] = dateStr.split('-');
  const mIndex = parseInt(month, 10) - 1;
  const mName = RU_MONTHS_SHORT[mIndex] || month;
  return includeYear ? `${parseInt(day, 10)} ${mName} ${year}` : `${parseInt(day, 10)} ${mName}`;
}

export function formatDateRange(startDate?: string, endDate?: string): string {
  if (!startDate) return '';
  const isSingle = !endDate || startDate === endDate;
  if (isSingle) {
    return formatBusinessDate(startDate, true);
  }
  const min = startDate < endDate ? startDate : endDate;
  const max = startDate < endDate ? endDate : startDate;
  const [minY] = min.split('-');
  const [maxY] = max.split('-');
  if (minY === maxY) {
    return `${formatBusinessDate(min, false)} — ${formatBusinessDate(max, true)}`;
  }
  return `${formatBusinessDate(min, true)} — ${formatBusinessDate(max, true)}`;
}

