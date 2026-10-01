import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Landmark, Store as StoreIcon, Undo2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatMoney, formatTjs, formatUsd } from '../../utils/money';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';

interface RegisterBalance {
  storeId: string;
  storeName: string;
  cashUsd: string;
  cashTjs: string;
  unreconciledUsd: string;
}

interface CashCollection {
  id: string;
  transactionNumber: string;
  storeName: string;
  amountTjs: number;
  amountUsd: number;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
  createdByName: string;
}

const isZero = (value: string) => Number(value) === 0;

/**
 * «Инкассация» (ADMIN): a store register's whole cash goes to Central Cash in one step. Amounts
 * come from the server: the USD register and its TJS made of each operation's own-day amount.
 */
export const CashCollectionPanel: React.FC<{ month: string; storeId?: string | null }> = ({ month, storeId }) => {
  const [balances, setBalances] = useState<{ stores: RegisterBalance[]; central: RegisterBalance | null } | null>(null);
  const [history, setHistory] = useState<CashCollection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [collecting, setCollecting] = useState<RegisterBalance | null>(null);
  const [cancelling, setCancelling] = useState<CashCollection | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const refresh = useCallback(() => setRevision((v) => v + 1), []);

  useEffect(() => {
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([
      apiClient<{ stores: RegisterBalance[]; central: RegisterBalance | null }>('/cash-collections/balances'),
      apiClient<CashCollection[]>(`/cash-collections?period=SPECIFIC_MONTH&month=${encodeURIComponent(month)}${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ''}`),
    ])
      .then(([b, h]) => {
        if (cancelled) return;
        setBalances(b);
        setHistory(h);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить кассы');
      });
    return () => { cancelled = true; };
  }, [month, revision, storeId]);

  const confirmCollect = async () => {
    if (!collecting || busy) return;
    setBusy(true);
    try {
      const result = await apiClient<CashCollection>('/cash-collections', {
        method: 'POST',
        body: JSON.stringify({ storeId: collecting.storeId, expectedCashUsd: collecting.cashUsd }),
      });
      setStatus({ tone: 'success', text: `Инкассация ${result.transactionNumber}: ${formatTjs(result.amountTjs)} (${formatUsd(result.amountUsd)}) переданы в Центральную кассу` });
      setCollecting(null);
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Инкассация не выполнена' });
      setCollecting(null);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const confirmCancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true);
    try {
      await apiClient(`/cash-collections/${cancelling.id}/cancel`, { method: 'POST' });
      setStatus({ tone: 'success', text: `Инкассация ${cancelling.transactionNumber} отменена, наличные возвращены в кассу «${cancelling.storeName}»` });
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Отмена не выполнена' });
    } finally {
      setCancelling(null);
      setBusy(false);
      refresh();
    }
  };

  if (loadError && !balances) {
    return (
      <div className="p-6">
        <EmptyState icon={AlertTriangle} title="Не удалось загрузить кассы" description={loadError} action={<Button onClick={refresh}>Повторить</Button>} />
      </div>
    );
  }
  if (!balances) return <LoadingState label="Загрузка касс…" />;

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-3xl mx-auto">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {balances.central && !storeId && (
        <section className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-fg-subtle">Центральная касса</p>
            <p className="text-lg font-bold text-fg tabular-nums">{formatTjs(balances.central.cashTjs)}</p>
            <p className="text-xs text-fg-subtle tabular-nums">{formatUsd(balances.central.cashUsd)}</p>
          </div>
        </section>
      )}

      <section className="space-y-2" aria-label="Кассы магазинов">
        <h2 className="text-sm font-semibold text-fg-muted">Наличные в магазинах</h2>
        {balances.stores.length === 0 ? (
          <p className="text-xs text-fg-subtle">Магазинов нет</p>
        ) : balances.stores.filter((s) => !storeId || s.storeId === storeId).map((store) => {
          const empty = isZero(store.cashUsd);
          const unreconciled = !isZero(store.unreconciledUsd);
          return (
            <div key={store.storeId} className="rounded-xl border border-border bg-surface p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <StoreIcon className="w-4 h-4 text-accent shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg-muted truncate">{store.storeName}</p>
                  <p className="text-sm font-bold text-fg tabular-nums">{formatTjs(store.cashTjs)}</p>
                  <p className="text-xs text-fg-subtle tabular-nums">{formatUsd(store.cashUsd)}</p>
                  {unreconciled && (
                    <p className="text-xs text-warning mt-0.5">Касса не сверена (расхождение {formatUsd(store.unreconciledUsd)})</p>
                  )}
                </div>
              </div>
              <Button
                size="md"
                leftIcon={ArrowDownToLine}
                disabled={empty || unreconciled || busy}
                onClick={() => setCollecting(store)}
              >
                {empty ? 'Касса пуста' : 'Инкассировать'}
              </Button>
            </div>
          );
        })}
        <p className="text-xs text-fg-subtle">Оплаты картой в кассу не поступают и не инкассируются. Сумма в сомони — по курсу дня каждой операции.</p>
      </section>

      <section className="space-y-2" aria-label="История инкассаций">
        <h2 className="text-sm font-semibold text-fg-muted">История за месяц</h2>
        {history.length === 0 ? (
          <p className="text-xs text-fg-subtle">Инкассаций в этом месяце не было</p>
        ) : (
          <div className="rounded-xl border border-border bg-surface divide-y divide-border">
            {history.map((item) => (
              <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-fg-muted truncate">{item.storeName} · {item.transactionNumber}</p>
                  <p className="text-xs text-fg-subtle">
                    {new Date(item.createdAt).toLocaleString('ru-RU')} · {item.createdByName}
                    {item.status === 'CANCELLED' && <span className="text-danger"> · отменена</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right tabular-nums">
                    <p className={`font-semibold ${item.status === 'CANCELLED' ? 'line-through text-fg-subtle' : 'text-fg'}`}>{formatTjs(item.amountTjs)}</p>
                    <p className="text-xs text-fg-subtle">{formatUsd(item.amountUsd)}</p>
                  </div>
                  {item.status === 'POSTED' && (
                    <Button size="md" variant="secondary" leftIcon={Undo2} disabled={busy} onClick={() => setCancelling(item)} aria-label={`Отменить инкассацию ${item.transactionNumber}`}>
                      Отменить
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={collecting !== null}
        tone="default"
        title="Инкассировать кассу?"
        confirmLabel="Инкассировать"
        loading={busy}
        onConfirm={confirmCollect}
        onCancel={() => { if (!busy) setCollecting(null); }}
        message={collecting && (
          <div className="space-y-1">
            <p>Все наличные кассы «{collecting.storeName}» будут переданы в Центральную кассу:</p>
            <p className="text-base font-bold text-fg tabular-nums">{formatTjs(collecting.cashTjs)} · {formatUsd(collecting.cashUsd)}</p>
            <p>После инкассации касса магазина будет равна нулю. Продажи и прибыль не меняются.</p>
          </div>
        )}
      />
      <ConfirmDialog
        open={cancelling !== null}
        title="Отменить инкассацию?"
        confirmLabel="Отменить инкассацию"
        loading={busy}
        onConfirm={confirmCancel}
        onCancel={() => { if (!busy) setCancelling(null); }}
        message={cancelling && (
          <p>
            {formatTjs(cancelling.amountTjs)} ({formatUsd(cancelling.amountUsd)}) вернутся из Центральной кассы в кассу «{cancelling.storeName}».
            Сумма {formatMoney(cancelling.amountUsd)} должна быть в Центральной кассе.
          </p>
        )}
      />
    </div>
  );
};
