import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateRangeForPeriod, dateRangeForCustomDates, getBusinessDateKey } from './business-date';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('business report boundaries', () => {
  it('includes the first five local hours in today', () => {
    vi.stubEnv('BUSINESS_TIME_ZONE', 'Asia/Tashkent');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T20:00:00Z'));
    expect(getBusinessDateKey()).toBe('2026-09-15');
    const range = dateRangeForPeriod('TODAY')!;
    expect(range.gte.toISOString()).toBe('2026-09-14T19:00:00.000Z');
    expect(range.lt.toISOString()).toBe('2026-09-15T19:00:00.000Z');
  });
  it('handles year and leap-month boundaries', () => {
    vi.stubEnv('BUSINESS_TIME_ZONE', 'Asia/Tashkent');
    expect(dateRangeForPeriod('SPECIFIC_MONTH', '2026-12')!.lt.toISOString()).toBe('2026-12-31T19:00:00.000Z');
    expect(dateRangeForPeriod('SPECIFIC_MONTH', '2024-02')!.lt.toISOString()).toBe('2024-02-29T19:00:00.000Z');
    expect(dateRangeForPeriod('ALL')).toBeUndefined();
  });
  it('supports a configured timezone with a 23-hour DST day', () => {
    vi.stubEnv('BUSINESS_TIME_ZONE', 'America/New_York');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T12:00:00Z'));
    const range = dateRangeForPeriod('TODAY')!;
    expect(range.lt.getTime() - range.gte.getTime()).toBe(23 * 3600000);
  });
  it.each([undefined, '', '2026-00', '2026-13', '2026-1', 'invalid'])('rejects invalid months instead of returning all history: %s', (month) => {
    expect(() => dateRangeForPeriod('SPECIFIC_MONTH', month)).toThrow('месяц');
  });

  it('handles custom single date and date range intervals', () => {
    vi.stubEnv('BUSINESS_TIME_ZONE', 'Asia/Tashkent');
    // Single date (only 1 date given or same start & end)
    const single = dateRangeForCustomDates('2026-09-25');
    expect(single.gte.toISOString()).toBe('2026-09-24T19:00:00.000Z');
    expect(single.lt.toISOString()).toBe('2026-09-25T19:00:00.000Z');

    // Date range (interval between 2 dates)
    const range = dateRangeForCustomDates('2026-09-20', '2026-09-25');
    expect(range.gte.toISOString()).toBe('2026-09-19T19:00:00.000Z');
    expect(range.lt.toISOString()).toBe('2026-09-25T19:00:00.000Z');

    // Reversed dates are automatically sorted
    const reversed = dateRangeForCustomDates('2026-09-25', '2026-09-20');
    expect(reversed.gte.toISOString()).toBe(range.gte.toISOString());
    expect(reversed.lt.toISOString()).toBe(range.lt.toISOString());
  });
});
