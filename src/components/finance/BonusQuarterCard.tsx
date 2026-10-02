import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, History } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { usd, tjs } from './reportTypes';

interface QuarterSummary {
  since: string | null;
  cashBonusesCount: number;
  cashBonusesUsd: number;
  cashBonusesTjs: number;
  bonusDevicesReceived: number;
  bonusDevicesSold: number;
  bonusDeviceProfitUsd: number;
  bonusDeviceProfitTjs: number;
}

interface QuarterClose {
  id: string;
  periodName: string;
  totalAmountUsd: number;
  note?: string | null;
  performedByName?: string | null;
  createdAt: string;
}

const ROMAN = ['I', 'II', 'III', 'IV'];
const currentQuarterName = () => {
  const now = new Date();
  return `${ROMAN[Math.floor(now.getMonth() / 3)]} квартал ${now.getFullYear()}`;
};
const dateRu = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');

/**
 * Bonuses of the current quarter and the quarterly close (admin only). Bonuses are nobody's
 * income: the close only zeroes the quarter's counters after the quarterly report — nothing
 * is credited to an owner, a register or a payout.
 */
export const BonusQuarterCard: React.FC = () => {
  const [quarter, setQuarter] = useState<QuarterSummary | null>(null);
  const [history, setHistory] = useState<QuarterClose[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [periodName, setPeriodName] = useState(currentQuarterName);
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const revision = useDataRefreshRevision();

  const load = useCallback(async () => {
    try {
      const [summary, closes] = await Promise.all([
        apiClient<QuarterSummary>('/bonuses/quarter'),
        apiClient<QuarterClose[]>('/bonuses/quarter-history'),
      ]);
      setQuarter(summary);
      setHistory(closes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить бонусы квартала');
    }
  }, []);

  useEffect(() => { void load(); }, [load, revision]);

  const isEmpty = !quarter || (quarter.cashBonusesCount === 0 && quarter.bonusDevicesSold === 0 && quarter.bonusDevicesReceived === 0);

  const handleClose = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await apiClient('/bonuses/annul-pool', { method: 'POST', body: JSON.stringify({ periodName: periodName.trim() || undefined }) });
      setConfirmOpen(false);
      setStatus({ tone: 'success', text: `Квартал бонусов «${periodName.trim()}» закрыт, счётчики обнулены` });
      await load();
    } catch (err) {
      setConfirmOpen(false);
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Не удалось закрыть квартал бонусов' });
    } finally {
      setClosing(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-2.5 sm:p-3 space-y-2" aria-labelledby="bonus-quarter-title">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <h2 id="bonus-quarter-title" className="text-xs sm:text-sm font-bold text-fg truncate">Бонусы квартала</h2>
          {quarter?.since && (
            <p className="text-[10px] text-fg-subtle truncate">
              С последнего закрытия ({dateRu(quarter.since)})
            </p>
          )}
        </div>
        <Button
          variant="primary"
          className="!h-7.5 !px-2.5 text-xs font-bold shrink-0 shadow-xs"
          disabled={!quarter || isEmpty}
          leftIcon={CalendarCheck}
          onClick={() => { setPeriodName(currentQuarterName()); setConfirmOpen(true); }}
        >
          <span className="sm:hidden">Закрыть</span>
          <span className="hidden sm:inline">Закрыть квартал</span>
        </Button>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded-xl p-2.5">
          <span>{error}</span>
          <Button variant="secondary" onClick={() => void load()}>Повторить</Button>
        </div>
      ) : (
        <dl className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <div className="rounded-xl bg-surface-raised border border-border/80 p-2 sm:p-2.5">
            <dt className="text-[10px] font-semibold text-fg-subtle truncate">Денежные бонусы</dt>
            <dd className="text-xs sm:text-base font-black text-accent tabular-nums mt-0.5">{quarter ? usd(Number(quarter.cashBonusesUsd)) : '—'}</dd>
            <dd className="text-[9px] sm:text-[10px] text-fg-subtle tabular-nums truncate">{quarter ? `≈ ${tjs(Number(quarter.cashBonusesTjs))} · ${quarter.cashBonusesCount} шт.` : ''}</dd>
          </div>
          <div className="rounded-xl bg-surface-raised border border-border/80 p-2 sm:p-2.5">
            <dt className="text-[10px] font-semibold text-fg-subtle truncate">Прибыль телефонов</dt>
            <dd className="text-xs sm:text-base font-black text-fg tabular-nums mt-0.5">{quarter ? usd(Number(quarter.bonusDeviceProfitUsd)) : '—'}</dd>
            <dd className="text-[9px] sm:text-[10px] text-fg-subtle tabular-nums truncate">{quarter ? `≈ ${tjs(Number(quarter.bonusDeviceProfitTjs))} · прод. ${quarter.bonusDevicesSold} шт.` : ''}</dd>
          </div>
          <div className="rounded-xl bg-surface-raised border border-border/80 p-2 sm:p-2.5">
            <dt className="text-[10px] font-semibold text-fg-subtle truncate">Бонусные телефоны</dt>
            <dd className="text-xs sm:text-base font-black text-fg tabular-nums mt-0.5">{quarter ? `${quarter.bonusDevicesReceived} шт.` : '—'}</dd>
            <dd className="text-[9px] sm:text-[10px] text-fg-subtle truncate">От поставщиков</dd>
          </div>
        </dl>
      )}

      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-fg-subtle hover:text-fg inline-flex items-center gap-1.5 min-h-11">
            <History className="w-3.5 h-3.5" />
            Закрытые кварталы ({history.length})
          </summary>
          <ul className="mt-2 divide-y divide-border border border-border rounded-xl overflow-hidden">
            {history.map((close) => (
              <li key={close.id} className="p-3 bg-surface-raised/40 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg">{close.periodName}</span>
                  <span className="text-fg-subtle tabular-nums">{dateRu(close.createdAt)}</span>
                </div>
                {close.note && <p className="text-[11px] text-fg-subtle">{close.note}</p>}
                {close.performedByName && <p className="text-[11px] text-fg-subtle">Закрыл: {close.performedByName}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Закрыть квартал бонусов?"
        tone="danger"
        confirmLabel="Закрыть и обнулить"
        loading={closing}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleClose}
        message={
          <div className="space-y-3">
            <p>
              Денежные бонусы <strong className="text-fg">{usd(Number(quarter?.cashBonusesUsd ?? 0))}</strong> и прибыль бонусных телефонов{' '}
              <strong className="text-fg">{usd(Number(quarter?.bonusDeviceProfitUsd ?? 0))}</strong> будут обнулены в отчётах. Деньги на Бонусном счёте не меняются. Отменить нельзя.
            </p>
            <label className="block">
              <span className="block text-[11px] font-semibold text-fg-subtle mb-1">Название квартала</span>
              <input
                value={periodName}
                onChange={(e) => setPeriodName(e.target.value)}
                className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-sm focus:border-accent focus:outline-none"
              />
            </label>
          </div>
        }
      />
    </section>
  );
};
