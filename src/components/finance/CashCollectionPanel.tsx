import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Receipt,
  Sparkles,
  Store as StoreIcon,
  TrendingUp,
  Undo2,
  Vault,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { isNetworkRole, isStoreScoped } from '../../utils/roles';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { FormField } from '../ui/FormField';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Badge } from '../ui/Badge';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { StatCard } from '../ui/StatCard';
import { tjs, usd, useReportsSummary, type StoreBreakdown } from './reportTypes';
import type { Store } from '../../types';

interface CashCollection {
  id: string;
  transactionNumber: string;
  storeId: string | null;
  storeName: string;
  destinationName: string;
  amountTjs: number;
  amountUsd: number;
  comment: string | null;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
  createdByName: string;
  cancelledAt: string | null;
}

interface CashCollectionPanelProps {
  /** A retail store id, or 'all' for every store (the form then asks which store). */
  storeId: string;
  month: string;
}

/**
 * «Инкассация»: hand a store register's cash over to the central safe (main warehouse cash).
 * The store's cash in reports goes down, the central cash goes up, profit is untouched — so
 * the report of every store matches the physical money left in its register.
 */
export const CashCollectionPanel: React.FC<CashCollectionPanelProps> = ({ storeId, month }) => {
  const { currentUser, stores } = useAppFields('currentUser', 'stores');
  const scoped = isStoreScoped(currentUser);
  const canCancel = isNetworkRole(currentUser?.role);
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  const retailStores = useMemo(
    () => stores.filter((s: Store) => !s.isMainWarehouse && s.active !== false),
    [stores]
  );
  const mainWarehouse = stores.find((s: Store) => s.isMainWarehouse);

  // Load monthly summary data for revenue and breakdown
  const { summary, loading: summaryLoading } = useReportsSummary(month, 'all');

  // The main warehouse (or an unknown id) isn't a register to collect from — fall back to a picker.
  const retailScope = retailStores.some((s: Store) => s.id === storeId) ? storeId : 'all';
  const fixedStoreId = scoped ? currentUser?.storeId || '' : retailScope !== 'all' ? retailScope : '';
  const [formStoreId, setFormStoreId] = useState(fixedStoreId || retailStores[0]?.id || '');
  useEffect(() => {
    if (fixedStoreId) setFormStoreId(fixedStoreId);
  }, [fixedStoreId]);
  useEffect(() => {
    if (!formStoreId && retailStores[0]) setFormStoreId(retailStores[0].id);
  }, [formStoreId, retailStores]);
  const formStore = stores.find((s: Store) => s.id === formStoreId);

  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState<CashCollection | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Quick preset button clicked state for feedback
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const [items, setItems] = useState<CashCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [historyStoreFilter, setHistoryStoreFilter] = useState<string>('all');

  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ period: 'SPECIFIC_MONTH', month });
    if (!scoped && retailScope !== 'all') params.set('storeId', retailScope);
    setLoading(true);
    apiClient<CashCollection[]>(`/cash-collections?${params.toString()}`)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, retailScope, scoped, revision]);

  const posted = items.filter((i: CashCollection) => i.status === 'POSTED');
  const totalCollectedThisMonth = posted.reduce((sum: number, i: CashCollection) => sum + i.amountUsd, 0);
  const amountValue = parseFloat(amount) || 0;
  const cashNow = formStore?.cashBalanceUsd ?? 0;

  // Auto-fill entire till balance whenever selecting a store (if amount is empty or was from previous store)
  useEffect(() => {
    if (formStore && formStore.cashBalanceUsd > 0 && !amount) {
      setAmount(String(formStore.cashBalanceUsd));
      setActivePreset('full');
    }
  }, [formStoreId]);

  // Aggregate network cash stats across all retail registers
  const totalRetailTillCash = useMemo(() => {
    return retailStores.reduce((sum: number, s: Store) => sum + (Number(s.cashBalanceUsd) || 0), 0);
  }, [retailStores]);

  const centralSafeCash = mainWarehouse?.cashBalanceUsd ?? 0;

  // Store metrics map from reports summary
  const storeMetricsMap = useMemo(() => {
    const map = new Map<string, StoreBreakdown>();
    if (summary?.storeBreakdown) {
      summary.storeBreakdown.forEach((b: StoreBreakdown) => {
        map.set(b.storeId, b);
      });
    }
    return map;
  }, [summary]);

  const handleSelectStoreForCollection = (store: Store, fullAmount?: boolean) => {
    setFormStoreId(store.id);
    const targetAmt = store.cashBalanceUsd ?? 0;
    if (fullAmount && targetAmt > 0) {
      setAmount(String(targetAmt));
      setActivePreset('full');
      setConfirmOpen(true);
    } else if (targetAmt > 0) {
      setAmount(String(targetAmt));
      setActivePreset('full');
    }
  };

  const handleSetPreset = (type: 'full' | 'leave20' | 'leave50') => {
    setActivePreset(type);
    if (type === 'full') {
      setAmount(String(cashNow));
    } else if (type === 'leave20') {
      const val = Math.max(0, cashNow - 20);
      setAmount(String(val));
    } else if (type === 'leave50') {
      const val = Math.max(0, cashNow - 50);
      setAmount(String(val));
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await apiClient('/cash-collections', {
        method: 'POST',
        body: JSON.stringify({
          storeId: formStoreId,
          amountUsd: amountValue,
          comment: comment.trim() || undefined,
        }),
      });
      setStatus({
        tone: 'success',
        text: `✓ Инкассация ${usd(amountValue)} из кассы «${formStore?.name ?? ''}» в центральную кассу успешно проведена`,
      });
      setAmount('');
      setComment('');
      setActivePreset(null);
    } catch (error) {
      setStatus({ tone: 'error', text: (error as Error).message || 'Не удалось провести инкассацию' });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const handleCollectAllStores = async () => {
    const storesWithCash = retailStores.filter((s: Store) => (s.cashBalanceUsd ?? 0) > 0);
    if (storesWithCash.length === 0) {
      setStatus({ tone: 'warning', text: 'Во всех кассах магазинов сейчас нулевой остаток' });
      return;
    }
    setBusy(true);
    let successCount = 0;
    let failedCount = 0;
    for (const st of storesWithCash) {
      try {
        await apiClient('/cash-collections', {
          method: 'POST',
          body: JSON.stringify({
            storeId: st.id,
            amountUsd: st.cashBalanceUsd,
            comment: 'Автоматическая пакетная инкассация всей сети',
          }),
        });
        successCount++;
      } catch {
        failedCount++;
      }
    }
    setBusy(false);
    if (successCount > 0) {
      setStatus({
        tone: 'success',
        text: `✓ Пакетная инкассация завершена: успешно инкассировано точек: ${successCount}${failedCount > 0 ? `, ошибок: ${failedCount}` : ''}`,
      });
    } else {
      setStatus({ tone: 'error', text: 'Ошибка пакетной инкассации' });
    }
  };

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await apiClient(`/cash-collections/${cancelling.id}/cancel`, { method: 'POST' });
      setStatus({
        tone: 'success',
        text: `Инкассация ${cancelling.transactionNumber} отменена, ${usd(cancelling.amountUsd)} возвращены в кассу магазина`,
      });
    } catch (error) {
      setStatus({ tone: 'error', text: (error as Error).message || 'Не удалось отменить инкассацию' });
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  };

  const filteredHistoryItems = useMemo(() => {
    if (historyStoreFilter === 'all') return items;
    return items.filter((i: CashCollection) => i.storeId === historyStoreFilter);
  }, [items, historyStoreFilter]);

  return (
    <div className="space-y-4">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Network Cash Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Выручка сети за месяц"
          value={summary ? usd(summary.revenueUsd) : '—'}
          subvalue={summary ? tjs(summary.revenueTjs) : undefined}
          icon={TrendingUp}
          tone="accent"
        />
        <StatCard
          label="Наличные в кассах точек"
          value={usd(totalRetailTillCash)}
          subvalue={`В ${retailStores.length} точках`}
          icon={Wallet}
          tone={totalRetailTillCash > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Инкассировано за месяц"
          value={usd(totalCollectedThisMonth)}
          subvalue={`${posted.length} операций`}
          icon={ArrowRightLeft}
          tone="success"
        />
        <StatCard
          label="Центральный сейф"
          value={usd(centralSafeCash)}
          subvalue={mainWarehouse?.name || 'Главный склад'}
          icon={Vault}
        />
      </div>

      {/* Store Breakdown & Quick Cash Collection Cards */}
      {isAdmin && (
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-fg-muted flex items-center gap-2">
                <StoreIcon className="w-4 h-4 text-accent" />
                Выручка и остатки в кассах по магазинам
              </h3>
              <p className="text-xs text-fg-subtle">
                Нажмите на карточку для мгновенной инкассации кассы точки
              </p>
            </div>
            {totalRetailTillCash > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={handleCollectAllStores}
                className="px-3 py-1.5 rounded-lg bg-surface-raised border border-border hover:border-accent text-xs font-semibold text-accent flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                Инкассировать все кассы ({usd(totalRetailTillCash)})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {retailStores.map((st: Store) => {
              const metrics = storeMetricsMap.get(st.id);
              const storeRevenueTjs = metrics?.revenueTjs ?? 0;
              const storeRevenueUsd = metrics?.revenueUsd ?? 0;
              const storeSalesCount = metrics?.salesCount ?? 0;
              const storeCash = st.cashBalanceUsd ?? 0;
              const storeCollected = metrics?.cashCollectedTjs ?? 0;
              const isSelected = formStoreId === st.id;

              return (
                <div
                  key={st.id}
                  onClick={() => handleSelectStoreForCollection(st)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                    isSelected
                      ? 'border-accent bg-accent/5 ring-1 ring-accent'
                      : 'border-border bg-surface-raised/40 hover:bg-surface-raised hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-fg-muted truncate">{st.name}</p>
                      <p className="text-[11px] text-fg-subtle">
                        Выручка: {usd(storeRevenueUsd)} · {tjs(storeRevenueTjs)}
                      </p>
                    </div>
                    {storeCash > 0 ? (
                      <Badge tone="warning" className="shrink-0 text-[10px]">
                        В кассе: {usd(storeCash)}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" className="shrink-0 text-[10px]">
                        Касса пуста
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] py-1 border-t border-b border-border/50">
                    <div>
                      <span className="text-fg-subtle">Продажи:</span>{' '}
                      <span className="font-semibold text-fg-muted">{storeSalesCount} чеков</span>
                    </div>
                    <div className="text-right">
                      <span className="text-fg-subtle">Сдано:</span>{' '}
                      <span className="font-semibold text-fg-muted">{tjs(storeCollected)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-xs font-semibold text-fg-muted flex items-center gap-1">
                      <Wallet className="w-3.5 h-3.5 text-accent" />
                      {usd(storeCash)}
                    </span>
                    {storeCash > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectStoreForCollection(st, true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-accent text-accent-fg hover:bg-accent-strong text-[11px] font-bold transition-colors shrink-0 flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3" />
                        Сдать всё
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Collection Action Form */}
      <div className="p-4 rounded-2xl bg-surface border border-border space-y-3.5 shadow-xs">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-fg-muted flex items-center gap-2">
              <Vault className="w-4.5 h-4.5 text-accent" />
              Оформление инкассации кассы
            </h4>
            <p className="text-xs text-fg-subtle mt-0.5">
              Сумма списывается из кассы магазина и поступает в центральный сейф «
              {mainWarehouse?.name ?? 'Главный склад'}». Прибыль магазина остается неизменной.
            </p>
          </div>
          {formStore && (
            <div className="text-right shrink-0 p-2 rounded-xl bg-surface-raised border border-border">
              <p className="text-[10px] text-fg-subtle uppercase tracking-wider font-semibold">
                В кассе точки
              </p>
              <p className="text-sm font-black text-accent">{usd(cashNow)}</p>
            </div>
          )}
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (amountValue > 0 && formStoreId) setConfirmOpen(true);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!fixedStoreId ? (
              <FormField label="Магазин для инкассации" required>
                <Select
                  value={formStoreId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const st = stores.find((s: Store) => s.id === id);
                    if (st) handleSelectStoreForCollection(st);
                  }}
                  className="w-full"
                >
                  {retailStores.map((s: Store) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (В кассе: {usd(s.cashBalanceUsd ?? 0)})
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label="Магазин">
                <div className="h-11 flex items-center px-3 rounded-lg bg-surface-raised border border-border text-sm font-semibold text-fg-muted truncate">
                  {formStore?.name ?? '—'} (В кассе: {usd(cashNow)})
                </div>
              </FormField>
            )}

            <FormField label="Сумма к инкассации (USD)" required>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setActivePreset(null);
                  }}
                  placeholder="0.00"
                  className="w-full h-11 rounded-lg bg-bg border border-border px-3 pr-16 text-sm font-bold text-fg-muted focus:outline-none focus:border-accent"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
                  USD
                </span>
              </div>
            </FormField>

            <FormField label="Комментарий / Инкассатор">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="ФИО инкассатора, номер мешка…"
                className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent"
              />
            </FormField>
          </div>

          {/* Quick presets for till balance */}
          {cashNow > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-fg-subtle font-medium">Быстрый выбор:</span>
              <button
                type="button"
                onClick={() => handleSetPreset('full')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  activePreset === 'full'
                    ? 'bg-accent text-accent-fg border-accent'
                    : 'bg-surface-raised text-fg-muted border-border hover:border-accent/50'
                }`}
              >
                Вся касса ({usd(cashNow)})
              </button>
              {cashNow > 20 && (
                <button
                  type="button"
                  onClick={() => handleSetPreset('leave20')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    activePreset === 'leave20'
                      ? 'bg-accent text-accent-fg border-accent'
                      : 'bg-surface-raised text-fg-muted border-border hover:border-accent/50'
                  }`}
                >
                  Оставить $20 на размен (сдать {usd(cashNow - 20)})
                </button>
              )}
              {cashNow > 50 && (
                <button
                  type="button"
                  onClick={() => handleSetPreset('leave50')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    activePreset === 'leave50'
                      ? 'bg-accent text-accent-fg border-accent'
                      : 'bg-surface-raised text-fg-muted border-border hover:border-accent/50'
                  }`}
                >
                  Оставить $50 на размен (сдать {usd(cashNow - 50)})
                </button>
              )}
            </div>
          )}

          {amountValue > cashNow && (
            <p className="text-xs text-danger font-medium">
              Внимание: сумма инкассации превышает текущий остаток в кассе ({usd(cashNow)}).
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              variant="primary"
              leftIcon={ArrowRightLeft}
              disabled={busy || amountValue <= 0 || !formStoreId || amountValue > cashNow}
            >
              Инкассировать {amountValue > 0 ? usd(amountValue) : ''}
            </Button>
          </div>
        </form>
      </div>

      {/* Collection History Table with Store Filter */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-accent" />
            <h4 className="text-xs font-bold text-fg-muted uppercase tracking-wider">
              История инкассаций за месяц
            </h4>
          </div>

          <div className="flex items-center gap-2.5">
            {retailStores.length > 1 && !scoped && (
              <select
                value={historyStoreFilter}
                onChange={(e) => setHistoryStoreFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg bg-surface-raised border border-border text-xs text-fg-muted focus:outline-none focus:border-accent"
              >
                <option value="all">Все магазины</option>
                {retailStores.map((st: Store) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            )}
            <span className="text-xs font-bold text-accent">
              {filteredHistoryItems.filter((i: CashCollection) => i.status === 'POSTED').length} опер. ·{' '}
              {usd(
                filteredHistoryItems
                  .filter((i: CashCollection) => i.status === 'POSTED')
                  .reduce((sum: number, i: CashCollection) => sum + i.amountUsd, 0)
              )}
            </span>
          </div>
        </div>

        {loading ? (
          <p className="p-4 text-xs text-fg-subtle">Загрузка истории инкассаций…</p>
        ) : filteredHistoryItems.length === 0 ? (
          <p className="p-4 text-xs text-fg-subtle text-center">Инкассаций за выбранный период нет</p>
        ) : (
          <div className="divide-y divide-border">
            {filteredHistoryItems.map((item: CashCollection) => (
              <div
                key={item.id}
                className="px-4 py-3 flex items-center justify-between gap-3 text-xs hover:bg-surface-raised/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-fg-muted truncate">
                      {item.storeName} → {item.destinationName}
                    </p>
                    {item.status === 'CANCELLED' ? (
                      <Badge tone="neutral">Отменена</Badge>
                    ) : (
                      <Badge tone="success">Проведена</Badge>
                    )}
                  </div>
                  <p className="text-fg-subtle text-[11px] truncate mt-0.5">
                    {item.transactionNumber} ·{' '}
                    {new Date(item.createdAt).toLocaleString('ru-RU', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}{' '}
                    · {item.createdByName}
                    {item.comment ? ` · ${item.comment}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={`font-bold text-sm ${
                      item.status === 'CANCELLED' ? 'text-fg-subtle line-through' : 'text-accent'
                    }`}
                  >
                    {usd(item.amountUsd)}
                  </span>
                  {canCancel && item.status === 'POSTED' && (
                    <button
                      type="button"
                      aria-label="Отменить инкассацию"
                      onClick={() => setCancelling(item)}
                      title="Отменить и вернуть средства в кассу точки"
                      className="p-1.5 rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Провести инкассацию?"
        message={`${usd(amountValue)} будут списаны из кассы «${
          formStore?.name ?? ''
        }» и переданы в центральный сейф «${mainWarehouse?.name ?? 'Главный склад'}».`}
        confirmLabel="Инкассировать"
        tone="default"
        loading={busy}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={!!cancelling}
        title="Отменить инкассацию?"
        message={
          cancelling
            ? `${usd(
                cancelling.amountUsd
              )} будут списаны из центрального сейфа и возвращены в кассу «${cancelling.storeName}».`
            : ''
        }
        confirmLabel="Отменить инкассацию"
        tone="danger"
        loading={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
};
