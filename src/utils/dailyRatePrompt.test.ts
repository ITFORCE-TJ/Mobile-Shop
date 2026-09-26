import { expect, it } from 'vitest';
import { hasCurrentDailyRate } from './dailyRatePrompt';

it('recognizes a saved rate throughout the business day', () => {
  const rate = { date: '2026-09-26', rate: 10 };
  expect(hasCurrentDailyRate(rate, new Date('2026-09-25T19:00:00Z'))).toBe(true);
  expect(hasCurrentDailyRate(rate, new Date('2026-09-26T18:59:59Z'))).toBe(true);
  expect(hasCurrentDailyRate(rate, new Date('2026-09-26T19:00:00Z'))).toBe(false);
});
it('does not confuse a previous rate or invalid response with a current daily rate', () => {
  const now = new Date('2026-09-26T10:00:00Z');
  expect(hasCurrentDailyRate(null, now)).toBe(false);
  expect(hasCurrentDailyRate({ date: '2026-09-25', rate: 10 }, now)).toBe(false);
  expect(hasCurrentDailyRate({ date: '2026-09-26', rate: 0 }, now)).toBe(false);
});
