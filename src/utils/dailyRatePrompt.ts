import type { DailyRate } from '../types';
import { getBusinessDateKey } from './businessDate';

export function hasCurrentDailyRate(rate: Pick<DailyRate, 'date' | 'rate'> | null, now = new Date()) {
  return !!rate && rate.date === getBusinessDateKey(now) && Number.isFinite(Number(rate.rate)) && Number(rate.rate) > 0;
}
