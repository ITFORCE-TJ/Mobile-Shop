import { describe, expect, it } from 'vitest';
import { addMonths, currentBusinessMonth, getBusinessDateKey, monthBounds, resolveTimeZone, wholeMonthOf } from './businessDate';

describe('business month helpers', () => {
  it('gives the first and last day of any month, including leap February', () => {
    expect(monthBounds('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(monthBounds('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthBounds('2023-02')).toEqual({ start: '2023-02-01', end: '2023-02-28' });
    expect(monthBounds('2019-04')).toEqual({ start: '2019-04-01', end: '2019-04-30' });
  });

  it('recognises a range covering exactly one whole month', () => {
    expect(wholeMonthOf('2025-08-01', '2025-08-31')).toBe('2025-08');
    expect(wholeMonthOf('2025-08-01', '2025-08-30')).toBeUndefined();
    expect(wholeMonthOf('2025-08-01', '2025-09-30')).toBeUndefined();
  });

  it('steps across year boundaries', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(addMonths('2026-10', -14)).toBe('2025-08');
  });

  it('uses the business time zone (UTC+5), not the device clock', () => {
    // 2026-09-30 20:30 UTC is already 1 October in Tashkent/Dushanbe.
    const lateUtc = new Date('2026-09-30T20:30:00Z');
    expect(getBusinessDateKey(lateUtc)).toBe('2026-10-01');
    expect(currentBusinessMonth(lateUtc)).toBe('2026-10');
  });
});

describe('resolveTimeZone', () => {
  it('uses a valid configured zone and falls back on a missing or invalid one', () => {
    expect(resolveTimeZone('Europe/Moscow')).toBe('Europe/Moscow');
    expect(resolveTimeZone(undefined)).toBe('Asia/Tashkent');
    expect(resolveTimeZone('Not/AZone')).toBe('Asia/Tashkent');
  });
});
