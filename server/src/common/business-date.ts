export type ReportPeriod = 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL';

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter() {
  const zone = process.env.BUSINESS_TIME_ZONE || 'Asia/Tashkent';
  let result = formatters.get(zone);
  if (!result) {
    result = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    formatters.set(zone, result);
  }
  return result;
}

export function getBusinessDateKey(date = new Date()): string {
  const parts = formatter().formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

// Find the first instant of this local date. Handles DST without assuming 24-hour days.
function startOfBusinessDate(key: string): Date {
  const nominal = Date.parse(`${key}T00:00:00.000Z`);
  let low = nominal - 36 * 3600000;
  let high = nominal + 36 * 3600000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (getBusinessDateKey(new Date(middle)) < key) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}

export function dateRangeForPeriod(period: ReportPeriod, month?: string): { gte: Date; lt: Date } | undefined {
  if (period === 'ALL') return undefined;
  if (period === 'TODAY') {
    const key = getBusinessDateKey();
    const next = new Date(Date.parse(`${key}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    return { gte: startOfBusinessDate(key), lt: startOfBusinessDate(next) };
  }
  if (period !== 'MONTH' && period !== 'SPECIFIC_MONTH') throw new Error('Некорректный период отчёта');
  const key = period === 'MONTH' ? getBusinessDateKey().slice(0, 7) : month;
  if (!key || !/^\d{4}-(0[1-9]|1[0-2])$/.test(key) || Number(key.slice(0, 4)) < 1000) {
    throw new Error('Укажите корректный месяц в формате YYYY-MM');
  }
  const next = new Date(`${key}-01T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { gte: startOfBusinessDate(`${key}-01`), lt: startOfBusinessDate(next.toISOString().slice(0, 10)) };
}

export function dateRangeForCustomDates(startDate: string, endDate?: string): { gte: Date; lt: Date } {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('Укажите корректную дату начала в формате YYYY-MM-DD');
  }
  let startKey = startDate;
  let endKey = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : startDate;
  if (startKey > endKey) {
    const tmp = startKey;
    startKey = endKey;
    endKey = tmp;
  }
  const next = new Date(Date.parse(`${endKey}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { gte: startOfBusinessDate(startKey), lt: startOfBusinessDate(next) };
}

