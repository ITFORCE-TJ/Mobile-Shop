import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Landmark, Store as StoreIcon, Undo2, Gift } from 'lucide-react';
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
  bonusCashUsd?: string;
  bonusCashTjs?: string;
  regularCashUsd?: string;
  regularCashTjs?: string;
  bonusCount?: number;
}

interface BonusAccountBalance {
  /** null until the account's first credit. */
  id: string | null;
  name: string;
  balanceUsd: string;
  balanceTjs: string;
}

interface CashCollection {
  id: string;
  transactionNumber: string;
  storeName: string;
  amountTjs: number;
  amountUsd: number;
  regularAmountUsd?: number;
  bonusAmountUsd?: number;
  bonusCount?: number;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
  createdByName: string;
}

const isZero = (value: string) => Number(value) === 0;

/**
 * «Инкассация» (ADMIN): a store register's whole cash is collected in one step.
 * - Store register is completely cleared to 0.
 * - Regular revenue goes to Central Cash.
 * - Bonus device proceeds automatically route to the dedicated Bonus Account.
 */
export const CashCollectionPanel: React.FC<{ month: string; storeId?: string | null }> = ({ month, storeId }) => {
  const [balances, setBalances] = useState<{
    stores: RegisterBalance[];
    central: RegisterBalance | null;
    bonusAccount: BonusAccountBalance | null;
  } | null>(null);
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
      apiClient<{ stores: RegisterBalance[]; central: RegisterBalance | null; bonusAccount: BonusAccountBalance | null }>('/cash-collections/balances'),
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
      const bonusText = result.bonusAmountUsd && result.bonusAmountUsd > 0
        ? ` (${formatUsd(result.regularAmountUsd ?? 0)} в Центр. кассу, ${formatUsd(result.bonusAmountUsd)} на Бонусный счёт)`
        : ' переданы в Центральную кассу';
      setStatus({ tone: 'success', text: `Инкассация ${result.transactionNumber}: ${formatTjs(result.amountTjs)} (${formatUsd(result.amountUsd)})${bonusText}` });
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

      {/* Top Balances: Central Cash & Bonus Account */}
      {!storeId && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {balances.central && (
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

          {balances.bonusAccount && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-fg-subtle">Бонусный счёт (поставщики)</p>
                <p className="text-lg font-bold text-amber-400 tabular-nums">{formatTjs(balances.bonusAccount.balanceTjs)}</p>
                <p className="text-xs text-fg-subtle tabular-nums">{formatUsd(balances.bonusAccount.balanceUsd)} · денежные бонусы и прибыль бонусных телефонов</p>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Store registers list */}
      <section className="space-y-2" aria-label="Кассы магазинов">
        <h2 className="text-sm font-semibold text-fg-muted">Наличные в магазинах</h2>
        {balances.stores.length === 0 ? (
          <p className="text-xs text-fg-subtle">Магазинов нет</p>
        ) : balances.stores.filter((s) => !storeId || s.storeId === storeId).map((store) => {
          const empty = isZero(store.cashUsd);
          const unreconciled = !isZero(store.unreconciledUsd);
          const hasBonus = Number(store.bonusCashUsd || 0) > 0;

          return (
            <div key={store.storeId} className="rounded-xl border border-border bg-surface p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <StoreIcon className="w-4 h-4 text-accent shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-fg-muted truncate">{store.storeName}</p>
                    {hasBonus && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold shrink-0">
                        Бонусы: {formatUsd(store.bonusCashUsd || 0)} ({store.bonusCount} шт.)
                      </span>
                    )}
                  </div>
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
        <p className="text-xs text-fg-subtle">
          Кассир сдаёт всю выручку полностью, и касса магазина обнуляется. Доля от бонусных телефонов автоматически поступает на «Бонусный счёт», а остальная сумма — в Центральную кассу.
        </p>
      </section>

      {/* History */}
      <section className="space-y-2" aria-label="История инкассаций">
        <h2 className="text-sm font-semibold text-fg-muted">История за месяц</h2>
        {history.length === 0 ? (
          <p className="text-xs text-fg-subtle">Инкассаций в этом месяце не было</p>
        ) : (
          <div className="rounded-xl border border-border bg-surface divide-y divide-border">
            {history.map((item) => {
              const hasBonus = item.bonusAmountUsd !== undefined && item.bonusAmountUsd > 0;
              return (
                <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-fg-muted truncate">{item.storeName} · {item.transactionNumber}</p>
                    <p className="text-xs text-fg-subtle">
                      {new Date(item.createdAt).toLocaleString('ru-RU')} · {item.createdByName}
                      {item.status === 'CANCELLED' && <span className="text-danger"> · отменена</span>}
                    </p>
                    {hasBonus && item.status !== 'CANCELLED' && (
                      <p className="text-[11px] text-amber-400 mt-0.5">
                        Центр. касса: {formatUsd(item.regularAmountUsd ?? 0)} · Бонусный счёт: {formatUsd(item.bonusAmountUsd ?? 0)} ({item.bonusCount ?? 0} шт.)
                      </p>
                    )}
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
              );
            })}
          </div>
        )}
      </section>

      {/* Confirmation modal with bonus split preview */}
      <ConfirmDialog
        open={collecting !== null}
        tone="default"
        title="Инкассировать кассу?"
        confirmLabel="Инкассировать"
        loading={busy}
        onConfirm={confirmCollect}
        onCancel={() => { if (!busy) setCollecting(null); }}
        message={collecting && (
          <div className="space-y-3 text-xs">
            <p className="text-fg-subtle">
              Вся выручка кассы «{collecting.storeName}» будет полностью сдана, а касса магазина обнулится:
            </p>
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
              <div className="flex justify-between items-center text-sm font-bold text-fg">
                <span>Инкассируется всего:</span>
                <span className="tabular-nums">{formatTjs(collecting.cashTjs)} · {formatUsd(collecting.cashUsd)}</span>
              </div>
              {Number(collecting.bonusCashUsd || 0) > 0 ? (
                <div className="pt-2 border-t border-border/60 space-y-1.5 text-fg-subtle">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-accent" />
                      В Центральную кассу:
                    </span>
                    <span className="font-semibold text-fg tabular-nums">{formatTjs(collecting.regularCashTjs || 0)} · {formatUsd(collecting.regularCashUsd || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center text-amber-400">
                    <span className="flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5" />
                      На Бонусный счёт ({collecting.bonusCount || 0} шт.):
                    </span>
                    <span className="font-semibold tabular-nums">{formatTjs(collecting.bonusCashTjs || 0)} · {formatUsd(collecting.bonusCashUsd || 0)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-fg-subtle pt-1 border-t border-border/60">
                  Вся сумма поступит в Основную центральную кассу (бонусных продаж нет).
                </p>
              )}
            </div>
            <p className="text-[11px] text-fg-subtle">
              Кассир сдает всю сумму целиком — система автоматически распределит средства по счетам.
            </p>
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
          <div className="space-y-2 text-xs">
            <p>
              {formatTjs(cancelling.amountTjs)} ({formatUsd(cancelling.amountUsd)}) вернутся в кассу «{cancelling.storeName}».
            </p>
            {cancelling.bonusAmountUsd !== undefined && cancelling.bonusAmountUsd > 0 ? (
              <p className="text-fg-subtle">
                Из Центральной кассы будет списано {formatUsd(cancelling.regularAmountUsd ?? 0)}, а с Бонусного счёта — {formatUsd(cancelling.bonusAmountUsd)}.
              </p>
            ) : (
              <p className="text-fg-subtle">
                Сумма {formatMoney(cancelling.amountUsd)} должна быть в Центральной кассе.
              </p>
            )}
          </div>
        )}
      />
    </div>
  );
};
