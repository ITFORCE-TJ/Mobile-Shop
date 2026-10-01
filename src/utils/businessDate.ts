export function getBusinessDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

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

