import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { formatUsd } from '../../utils/money';

interface LegacyAccruals {
  totalUsd: number;
  cashBonuses: { id: string; supplierName: string; campaignTitle: string | null; amountUsd: number; dateReceived: string }[];
  distributedPool: { entries: number; amountUsd: number };
  perOwner: { ownerId: string; name: string; amountUsd: number; availableProfitUsd: number; availableAfterUsd: number }[];
}

/**
 * Bonus amounts an earlier version booked as owner profit. Bonuses are nobody's income, so the
 * admin takes them back here after reviewing the amounts. Shown only while any remain.
 */
export const LegacyBonusAccrualsCard: React.FC = () => {
  const [data, setData] = useState<LegacyAccruals | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const revision = useDataRefreshRevision();

  const load = useCallback(async () => {
    try { setData(await apiClient<LegacyAccruals>('/bonuses/legacy-accruals')); } catch { setData(null); }
  }, []);
  useEffect(() => { void load(); }, [load, revision]);

  const reverse = async () => {
    if (!data || busy) return;
    setBusy(true);
    try {
      await apiClient('/bonuses/legacy-accruals/reverse', { method: 'POST', body: JSON.stringify({ expectedTotalUsd: data.totalUsd }) });
      setStatus({ tone: 'success', text: `Старые начисления бонусов сняты: ${formatUsd(data.totalUsd)}` });
      setConfirming(false);
      await load();
    } catch (err) {
      setConfirming(false);
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Не удалось снять начисления' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!data || Number(data.totalUsd) <= 0) return <StatusBanner message={status} onDismiss={() => setStatus(null)} />;

  return (
    <section className="rounded-2xl border border-warning/40 bg-warning/5 p-4 space-y-3" aria-labelledby="legacy-accruals-title">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <h2 id="legacy-accruals-title" className="text-sm font-bold text-fg">Старые начисления бонусов владельцам: {formatUsd(data.totalUsd)}</h2>
          <p className="text-xs text-fg-subtle leading-relaxed">
            Прежняя версия зачисляла бонусы в прибыль владельцев. Бонусы никому не начисляются — эти суммы можно снять. Деньги не перемещаются, бонусы остаются в истории.
          </p>
        </div>
      </div>
      <ul className="text-xs space-y-1">
        {data.cashBonuses.map((b) => (
          <li key={b.id} className="flex justify-between gap-2">
            <span className="text-fg-muted truncate">Денежный бонус: {b.supplierName}{b.campaignTitle ? ` · ${b.campaignTitle}` : ''} · {new Date(b.dateReceived).toLocaleDateString('ru-RU')}</span>
            <span className="tabular-nums text-fg">{formatUsd(b.amountUsd)}</span>
          </li>
        ))}
        {data.distributedPool.entries > 0 && (
          <li className="flex justify-between gap-2">
            <span className="text-fg-muted">Распределённая прибыль бонусных телефонов ({data.distributedPool.entries} шт.)</span>
            <span className="tabular-nums text-fg">{formatUsd(data.distributedPool.amountUsd)}</span>
          </li>
        )}
      </ul>
      <div className="flex justify-end">
        <Button variant="danger" onClick={() => setConfirming(true)}>Снять начисления</Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Снять старые начисления бонусов?"
        tone="danger"
        confirmLabel={`Снять ${formatUsd(data.totalUsd)}`}
        loading={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={reverse}
        message={
          <div className="space-y-2">
            <p>Прибыль владельцев уменьшится (в журнал будет записано сторно):</p>
            <ul className="space-y-1">
              {data.perOwner.map((o) => (
                <li key={o.ownerId} className="flex justify-between gap-2 tabular-nums">
                  <span>{o.name}: −{formatUsd(o.amountUsd)}</span>
                  <span className={Number(o.availableAfterUsd) < 0 ? 'text-danger' : 'text-fg-subtle'}>останется {formatUsd(o.availableAfterUsd)}</span>
                </li>
              ))}
            </ul>
            {data.perOwner.some((o) => Number(o.availableAfterUsd) < 0) && (
              <p className="text-xs text-danger">Отрицательный остаток означает, что эти бонусы уже были переведены в капитал при закрытии квартала.</p>
            )}
          </div>
        }
      />
    </section>
  );
};
