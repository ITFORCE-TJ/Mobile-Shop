import React, { useCallback, useEffect, useState } from 'react';
import { Landmark, HandCoins, History, Undo2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { formatTjs, formatUsd } from '../../utils/money';

interface Operation {
  id: string;
  kind: 'TRANSFER' | 'PAYOUT';
  transactionNumber: string;
  amountUsd: number;
  amountTjs: number;
  comment: string | null;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
}
type Kind = 'transfer' | 'payout';

const KIND_TEXT: Record<Kind, { title: string; action: string; done: string }> = {
  transfer: { title: 'Перевод в Центральную кассу', action: 'Перевести', done: 'Переведено в Центральную кассу' },
  payout: { title: 'Выдача с Бонусного счёта', action: 'Выдать', done: 'Выдано с Бонусного счёта' },
};

/**
 * The Bonus Account, managed by the admin: its money (cash supplier bonuses and bonus-phone
 * profit) is the company's — nobody's income. The admin moves it to Central Cash or pays it out
 * for a stated purpose; every operation is a ledger posting and can be cancelled.
 */
export const BonusAccountCard: React.FC = () => {
  const [balance, setBalance] = useState<{ balanceUsd: string; balanceTjs: string } | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [form, setForm] = useState<Kind | null>(null);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<Operation | null>(null);
  const revision = useDataRefreshRevision();

  const load = useCallback(async () => {
    try {
      const [balances, ops] = await Promise.all([
        apiClient<{ bonusAccount: { balanceUsd: string; balanceTjs: string } }>('/cash-collections/balances'),
        apiClient<Operation[]>('/bonus-account/operations'),
      ]);
      setBalance(balances.bonusAccount);
      setOperations(ops);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить Бонусный счёт');
    }
  }, []);
  useEffect(() => { void load(); }, [load, revision]);

  const available = Number(balance?.balanceUsd ?? 0);
  const amountNumber = Number(amount);
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber <= available;

  const openForm = (kind: Kind) => { setForm(kind); setAmount(''); setComment(''); };
  const submit = async () => {
    if (!form || busy || !amountValid) return;
    if (form === 'payout' && !comment.trim()) return;
    setBusy(true);
    try {
      await apiClient(`/bonus-account/${form}`, { method: 'POST', body: JSON.stringify({ amountUsd: amount, comment: comment.trim() || undefined }) });
      setStatus({ tone: 'success', text: `${KIND_TEXT[form].done}: ${formatUsd(amountNumber)}` });
      setForm(null);
      await load();
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Операция не выполнена' });
    } finally {
      setBusy(false);
    }
  };
  const confirmCancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true);
    try {
      await apiClient(`/bonus-account/operations/${cancelling.id}/cancel`, { method: 'POST' });
      setStatus({ tone: 'success', text: `Операция ${cancelling.transactionNumber} отменена, ${formatUsd(cancelling.amountUsd)} вернулись на Бонусный счёт` });
      setCancelling(null);
      await load();
    } catch (err) {
      setCancelling(null);
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Не удалось отменить операцию' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 space-y-3" aria-labelledby="bonus-account-title">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="bonus-account-title" className="text-sm font-bold text-fg">Бонусный счёт</h2>
          <p className="text-xs text-fg-subtle leading-relaxed max-w-xl">
            Деньги компании от бонусов поставщиков. Никому не начисляются; ими распоряжается администратор.
          </p>
          {error ? (
            <p className="text-xs text-danger">{error}</p>
          ) : (
            <p className="tabular-nums">
              <span className="text-lg font-bold text-fg">{balance ? formatTjs(balance.balanceTjs) : '—'}</span>
              <span className="text-xs text-fg-subtle ml-2">{balance ? formatUsd(balance.balanceUsd) : ''}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Button variant="primary" leftIcon={Landmark} disabled={available <= 0} onClick={() => openForm('transfer')}>В Центральную кассу</Button>
          <Button variant="secondary" leftIcon={HandCoins} disabled={available <= 0} onClick={() => openForm('payout')}>Выдать</Button>
        </div>
      </div>

      {operations.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-fg-subtle hover:text-fg inline-flex items-center gap-1.5 min-h-11">
            <History className="w-3.5 h-3.5" />
            Операции по счёту ({operations.length})
          </summary>
          <ul className="mt-2 divide-y divide-border border border-border rounded-xl overflow-hidden">
            {operations.map((op) => (
              <li key={op.id} className={`p-3 bg-surface-raised/40 flex items-center justify-between gap-3 ${op.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-fg">
                    {op.kind === 'TRANSFER' ? 'В Центральную кассу' : 'Выдача'} · <span className="tabular-nums">{formatUsd(op.amountUsd)}</span>
                    <span className="text-fg-subtle font-normal"> ({formatTjs(op.amountTjs)})</span>
                  </p>
                  <p className="text-[11px] text-fg-subtle truncate">
                    {new Date(op.createdAt).toLocaleString('ru-RU')} · {op.transactionNumber}{op.comment ? ` · ${op.comment}` : ''}
                    {op.status === 'CANCELLED' ? ' · отменена' : ''}
                  </p>
                </div>
                {op.status === 'POSTED' && (
                  <Button variant="ghost" leftIcon={Undo2} aria-label={`Отменить операцию ${op.transactionNumber}`} onClick={() => setCancelling(op)}>
                    Отменить
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog
        open={form !== null}
        onClose={() => !busy && setForm(null)}
        title={form ? KIND_TEXT[form].title : ''}
        subtitle={`Доступно: ${formatUsd(available)}`}
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setForm(null)} disabled={busy}>Отмена</Button>
            <Button variant="primary" fullWidth loading={busy} disabled={!amountValid || (form === 'payout' && !comment.trim())} onClick={submit}>
              {form ? `${KIND_TEXT[form].action}${amountValid ? ` ${formatUsd(amountNumber)}` : ''}` : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-fg-subtle mb-1 font-semibold">Сумма, $</span>
            <input
              type="number" inputMode="decimal" min="0.01" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full min-h-11 rounded-xl bg-surface-raised border border-border px-3 text-sm text-fg focus:border-accent focus:outline-none"
            />
            {amount && !amountValid && <span className="block text-xs text-danger mt-1">Сумма от $0.01 до {formatUsd(available)}</span>}
          </label>
          <label className="block">
            <span className="block text-xs text-fg-subtle mb-1 font-semibold">{form === 'payout' ? 'Кому и за что *' : 'Комментарий'}</span>
            <input
              type="text" value={comment} onChange={(e) => setComment(e.target.value)}
              className="w-full min-h-11 rounded-xl bg-surface-raised border border-border px-3 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </label>
          <p className="text-xs text-fg-subtle">Сумма в сомони берётся по курсам, по которым деньги поступили на счёт. Прибылью владельцев это не становится.</p>
        </div>
      </Dialog>

      <ConfirmDialog
        open={cancelling !== null}
        title="Отменить операцию?"
        tone="danger"
        confirmLabel="Отменить операцию"
        loading={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={confirmCancel}
        message={cancelling ? <>{formatUsd(cancelling.amountUsd)} ({formatTjs(cancelling.amountTjs)}) вернутся на Бонусный счёт{cancelling.kind === 'TRANSFER' ? ' из Центральной кассы' : ''}.</> : ''}
      />
    </section>
  );
};
