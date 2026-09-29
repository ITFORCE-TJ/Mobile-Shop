import React, { useMemo, useState } from 'react';
import type { DailyPoint } from './reportTypes';
import { usd, signedUsd } from './reportTypes';

interface DailySalesChartProps {
  /** 'YYYY-MM' — every day of the month gets a slot, so quiet days show as gaps. */
  month: string;
  daily: DailyPoint[];
}

/**
 * Revenue by day of the month — one series, so no legend: the heading names it. Bars are
 * anchored to the baseline with rounded data-ends and a 2px gap; hovering (or focusing) a
 * day shows its receipts, revenue and profit.
 */
export const DailySalesChart: React.FC<DailySalesChartProps> = ({ month, daily }) => {
  const [active, setActive] = useState<number | null>(null);

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const count = y && m ? new Date(y, m, 0).getDate() : 0;
    const byDate = new Map(daily.map((d) => [d.date, d]));
    return Array.from({ length: count }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      return byDate.get(date) ?? { date, salesCount: 0, revenueUsd: 0, profitUsd: 0 };
    });
  }, [month, daily]);

  const max = Math.max(1, ...days.map((d) => d.revenueUsd));
  const best = days.reduce<DailyPoint | null>((top, d) => (d.revenueUsd > (top?.revenueUsd ?? 0) ? d : top), null);
  const current = active !== null ? days[active] : null;

  if (days.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 min-h-5 text-xs">
        {current ? (
          <span className="text-fg-muted">
            <span className="font-semibold">{Number(current.date.slice(8))} число:</span>{' '}
            {usd(current.revenueUsd)} · {current.salesCount} чек. · прибыль {signedUsd(current.profitUsd)}
          </span>
        ) : (
          <span className="text-fg-subtle">
            {best ? <>Лучший день — {Number(best.date.slice(8))} число: {usd(best.revenueUsd)}</> : 'Продаж за месяц нет'}
          </span>
        )}
        <span className="text-fg-subtle shrink-0">макс. {usd(max)}</span>
      </div>

      <div className="relative h-32 flex items-end gap-[2px] border-b border-border" onMouseLeave={() => setActive(null)} role="list" aria-label="Выручка по дням">
        {days.map((d, i) => {
          const height = d.revenueUsd > 0 ? Math.max(3, (d.revenueUsd / max) * 100) : 0;
          return (
            <button
              key={d.date}
              type="button"
              role="listitem"
              aria-label={`${Number(d.date.slice(8))} число: выручка ${usd(d.revenueUsd)}, ${d.salesCount} чеков`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="flex-1 h-full flex items-end focus:outline-none group"
            >
              <span
                className={`w-full rounded-t-[4px] transition-colors ${active === i ? 'bg-accent-strong' : 'bg-accent group-hover:bg-accent-strong'}`}
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-fg-subtle tabular-nums">
        <span>1</span>
        <span>{Math.ceil(days.length / 2)}</span>
        <span>{days.length}</span>
      </div>
    </div>
  );
};
