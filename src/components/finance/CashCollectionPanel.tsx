import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Banknote, Undo2, Vault } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { isNetworkRole, isStoreScoped } from '../../utils/roles';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { FormField } from '../ui/FormField';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Badge } from '../ui/Badge';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { tjs } from './reportTypes';

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
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse && s.active !== false), [stores]);
  const mainWarehouse = stores.find((s) => s.isMainWarehouse);

  // The main warehouse (or an unknown id) isn't a register to collect from — fall back to a picker.
  const retailScope = retailStores.some((s) => s.id === storeId) ? storeId : 'all';
  const fixedStoreId = scoped ? currentUser?.storeId || '' : retailScope !== 'all' ? retailScope : '';
  const [formStoreId, setFormStoreId] = useState(fixedStoreId || retailStores[0]?.id || '');
  useEffect(() => { if (fixedStoreId) setFormStoreId(fixedStoreId); }, [fixedStoreId]);
  useEffect(() => { if (!formStoreId && retailStores[0]) setFormStoreId(retailStores[0].id); }, [formStoreId, retailStores]);
  const formStore = stores.find((s) => s.id === formStoreId);

  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState<CashCollection | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const [items, setItems] = useState<CashCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
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
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, retailScope, scoped, revision]);

  const posted = items.filter((i) => i.status === 'POSTED');
  const totalTjs = posted.reduce((sum, i) => sum + i.amountTjs, 0);
  const amountValue = parseFloat(amount) || 0;
  const cashNow = formStore?.cashBalanceTjs ?? 0;

  const submit = async () => {
    setBusy(true);
    try {
      await apiClient('/cash-collections', { method: 'POST', body: JSON.stringify({ storeId: formStoreId, amountTjs: amountValue, comment: comment.trim() || undefined }) });
      setStatus({ tone: 'success', text: `Инкассация ${tjs(amountValue)} из кассы «${formStore?.name ?? ''}» проведена` });
      setAmount('');
      setComment('');
    } catch (error) {
      setStatus({ tone: 'error', text: (error as Error).message || 'Не удалось провести инкассацию' });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await apiClient(`/cash-collections/${cancelling.id}/cancel`, { method: 'POST' });
      setStatus({ tone: 'success', text: `Инкассация ${cancelling.transactionNumber} отменена, деньги возвращены в кассу магазина` });
    } catch (error) {
      setStatus({ tone: 'error', text: (error as Error).message || 'Не удалось отменить инкассацию' });
    } finally {
      setBusy(false);
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-3">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-fg-muted flex items-center gap-1.5">
              <Vault className="w-4 h-4 text-accent" />
              Инкассация в центральную кассу
            </h4>
            <p className="text-xs text-fg-subtle mt-0.5">
              Касса магазина уменьшается, касса «{mainWarehouse?.name ?? 'Главный склад'}» увеличивается. Прибыль не меняется.
            </p>
          </div>
          {formStore && (
            <div className="text-right shrink-0">
              <p className="text-[10px] text-fg-subtle uppercase">В кассе сейчас</p>
              <p className="text-sm font-bold text-fg-muted">{tjs(cashNow)}</p>
            </div>
          )}
        </div>

        <form
          className="grid gap-2.5 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); if (amountValue > 0 && formStoreId) setConfirmOpen(true); }}
        >
          {!fixedStoreId ? (
            <FormField label="Магазин" required>
              <Select value={formStoreId} onChange={(e) => setFormStoreId(e.target.value)} className="w-full">
                {retailStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FormField>
          ) : (
            <FormField label="Магазин">
              <div className="h-11 flex items-center px-3 rounded-lg bg-surface-raised border border-border text-sm font-semibold text-fg-muted truncate">{formStore?.name ?? '—'}</div>
            </FormField>
          )}
          <FormField label="Сумма (TJS)" required>
            <div className="relative">
              <input
                type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-11 rounded-lg bg-bg border border-border px-3 pr-16 text-sm font-semibold text-fg-muted focus:outline-none focus:border-accent"
              />
              {cashNow > 0 && (
                <button type="button" onClick={() => setAmount(String(cashNow))} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-accent hover:underline">
                  Всю
                </button>
              )}
            </div>
          </FormField>
          <FormField label="Комментарий">
            <input
              type="text" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Кто принял, номер пакета…"
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent"
            />
          </FormField>
          <Button type="submit" variant="primary" leftIcon={ArrowRightLeft} disabled={busy || amountValue <= 0 || !formStoreId || amountValue > cashNow}>
            Сдать
          </Button>
        </form>
        {amountValue > cashNow && <p className="text-xs text-danger">Сумма больше остатка в кассе ({tjs(cashNow)}).</p>}
      </div>

      <div className="rounded-xl bg-surface border border-border overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5 text-accent" />
            История инкассаций за месяц
          </h4>
          <span className="text-xs font-semibold text-fg-muted">{posted.length} · {tjs(totalTjs)}</span>
        </div>
        {loading ? (
          <p className="p-3.5 text-xs text-fg-subtle">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="p-3.5 text-xs text-fg-subtle">Инкассаций за период нет</p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-fg-muted truncate">
                    {item.storeName} → {item.destinationName}
                    {item.status === 'CANCELLED' && <Badge tone="neutral" className="ml-1.5">Отменена</Badge>}
                  </p>
                  <p className="text-fg-subtle truncate">
                    {item.transactionNumber} · {new Date(item.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} · {item.createdByName}
                    {item.comment ? ` · ${item.comment}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`font-bold ${item.status === 'CANCELLED' ? 'text-fg-subtle line-through' : 'text-fg-muted'}`}>{tjs(item.amountTjs)}</span>
                  {canCancel && item.status === 'POSTED' && (
                    <button type="button" aria-label="Отменить инкассацию" onClick={() => setCancelling(item)} className="p-1.5 rounded-md text-fg-subtle hover:text-danger hover:bg-danger/10">
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
        message={`${tjs(amountValue)} будут переданы из кассы «${formStore?.name ?? ''}» в центральную кассу «${mainWarehouse?.name ?? 'Главный склад'}».`}
        confirmLabel="Провести"
        tone="default"
        loading={busy}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={!!cancelling}
        title="Отменить инкассацию?"
        message={cancelling ? `${tjs(cancelling.amountTjs)} вернутся из центральной кассы в кассу «${cancelling.storeName}».` : ''}
        confirmLabel="Отменить инкассацию"
        loading={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
};
