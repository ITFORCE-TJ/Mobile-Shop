import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, PackageCheck, PackagePlus, Repeat, Scan, Smartphone, Trash2 } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { mapStoreReceipt } from '../../api/mappers';
import type { StoreReceipt } from '../../types';
import { normalizeScanCode } from '../../utils/scanLookup';
import { soundEffects } from '../../utils/sound';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { EmptyState } from '../ui/EmptyState';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { LoadingState } from '../ui/Skeleton';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { useStoreContext } from '../../utils/storeContext';

interface ScannedDevice {
  id: string;
  imei: string;
  imei2?: string | null;
  brand: string;
  model: string;
  ram?: string | null;
  storage: string;
  color: string;
}

const specLine = (d: { ram?: string | null; storage: string; color: string }) =>
  [d.ram ? (d.ram.toUpperCase().includes('GB') ? d.ram : `${d.ram} GB RAM`) : null, d.storage, d.color].filter(Boolean).join(' · ');

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function useReceipts(revision: number, storeFilter: string) {
  const [items, setItems] = useState<StoreReceipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    const query = storeFilter && storeFilter !== 'all' ? `?storeId=${encodeURIComponent(storeFilter)}` : '';
    apiClient<any[]>(`/store-receipts${query}`)
      .then((rows) => { if (!cancelled) setItems(rows.map(mapStoreReceipt)); })
      .catch((e) => { if (!cancelled) setError(errorText(e, 'Не удалось загрузить приходы')); });
    return () => { cancelled = true; };
  }, [revision, storeFilter]);
  return { items, error };
}

const ReceiptRow: React.FC<{ receipt: StoreReceipt; showStore: boolean; onOpen: () => void }> = ({ receipt, showStore, onOpen }) => (
  <button type="button" onClick={onOpen} className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-surface-raised/60 active:bg-surface-raised">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-fg-muted truncate">
        {showStore && receipt.storeName ? `${receipt.storeName} · ` : ''}{receipt.itemCount} шт.
      </p>
      <p className="text-xs text-fg-subtle truncate">{receipt.receiptNumber} · {new Date(receipt.createdAt).toLocaleString('ru-RU')} · {receipt.createdByName}</p>
    </div>
    {receipt.acknowledgedAt
      ? <Badge tone="success">Просмотрен</Badge>
      : <Badge tone="warning">Не просмотрен</Badge>}
  </button>
);

/** Receipt detail; the ADMIN can mark it reviewed — that changes nothing in stock or money. */
const ReceiptDialog: React.FC<{ receiptId: string | null; isAdmin: boolean; onClose: () => void; onChanged: () => void }> = ({ receiptId, isAdmin, onClose, onChanged }) => {
  const [receipt, setReceipt] = useState<StoreReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!receiptId) { setReceipt(null); return; }
    let cancelled = false;
    setError(null);
    apiClient<any>(`/store-receipts/${receiptId}`)
      .then((r) => { if (!cancelled) setReceipt(mapStoreReceipt(r)); })
      .catch((e) => { if (!cancelled) setError(errorText(e, 'Приход не найден')); });
    return () => { cancelled = true; };
  }, [receiptId]);

  const acknowledge = async () => {
    if (!receipt || busy) return;
    setBusy(true);
    try {
      const updated = await apiClient<any>(`/store-receipts/${receipt.id}/acknowledge`, { method: 'POST' });
      setReceipt(mapStoreReceipt(updated));
      onChanged();
    } catch (e) {
      setError(errorText(e, 'Не удалось отметить приход'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={receiptId !== null}
      onClose={onClose}
      title={receipt ? `Приход ${receipt.receiptNumber}` : 'Приход'}
      subtitle={receipt ? `${receipt.storeName ?? ''} · ${new Date(receipt.createdAt).toLocaleString('ru-RU')}` : undefined}
      maxWidth="lg"
      footer={isAdmin && receipt && !receipt.acknowledgedAt ? (
        <Button fullWidth size="lg" leftIcon={Eye} loading={busy} onClick={acknowledge}>Ознакомлен / Подтвердить просмотр</Button>
      ) : undefined}
    >
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      {!receipt && !error && <LoadingState label="Загрузка прихода…" />}
      {receipt && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-fg-subtle">Принял: <span className="text-fg-muted">{receipt.createdByName}</span></span>
            <Badge tone="accent">{receipt.itemCount} шт.</Badge>
          </div>
          {receipt.acknowledgedAt ? (
            <p className="flex items-center gap-1.5 text-success text-xs">
              <CheckCircle2 className="w-4 h-4" /> Просмотрен: {receipt.acknowledgedByName}, {new Date(receipt.acknowledgedAt).toLocaleString('ru-RU')}
            </p>
          ) : isAdmin ? (
            <p className="text-xs text-fg-subtle">Телефоны уже в магазине и продаются. Отметка только фиксирует, что вы проверили приход.</p>
          ) : null}
          <div className="rounded-lg border border-border divide-y divide-border">
            {receipt.items.map((item) => (
              <div key={item.id} className="px-3 py-2">
                <p className="font-medium text-fg-muted">{item.brand} {item.model}</p>
                <p className="text-xs text-fg-subtle">{specLine(item)} · IMEI {item.imei}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
};

export const ReceiptsPage: React.FC = () => {
  const { currentUser, openScanner, stores } = useAppFields('currentUser', 'openScanner', 'stores');
  const isAdmin = currentUser?.role === 'ADMIN';
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [revision, setRevision] = useState(0);
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(() => new URLSearchParams(location.search).get('receipt'));
  useEffect(() => {
    const fromLink = new URLSearchParams(location.search).get('receipt');
    if (fromLink) setOpenReceiptId(fromLink);
  }, [location.search]);
  const closeReceipt = () => {
    setOpenReceiptId(null);
    if (location.search) navigate('/receipts', { replace: true });
  };

  // ---------- store staff: scanning ----------
  const [tab, setTab] = useState<'NEW' | 'HISTORY'>('NEW');
  const [scanned, setScanned] = useState<ScannedDevice[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [continuous, setContinuous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<StoreReceipt | null>(null);
  const inFlight = useRef(new Set<string>());
  const scannedRef = useRef(scanned);
  scannedRef.current = scanned;
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const manualInput = useRef<HTMLInputElement>(null);

  const addCode = useCallback(async (raw: string): Promise<void> => {
    const code = normalizeScanCode(raw);
    if (!code) return;
    const already = scannedRef.current.find((d) => d.imei === code || d.imei2 === code);
    if (already || inFlight.current.has(code)) {
      soundEffects.playError();
      setStatus({ tone: 'warning', text: `${already ? `${already.brand} ${already.model}` : `IMEI ${code}`} уже в списке` });
      return;
    }
    inFlight.current.add(code);
    try {
      const device = await apiClient<ScannedDevice>('/store-receipts/lookup', { method: 'POST', body: JSON.stringify({ imei: code }) });
      setScanned((prev) => (prev.some((d) => d.id === device.id) ? prev : [device, ...prev]));
      soundEffects.playAddToCartSuccess();
      setStatus({ tone: 'success', text: `Добавлен: ${device.brand} ${device.model}` });
    } catch (e) {
      soundEffects.playError();
      setStatus({ tone: 'error', text: errorText(e, `IMEI ${code} не принят`) });
    } finally {
      inFlight.current.delete(code);
    }
  }, []);

  const startScan = useCallback(() => {
    openScanner(async (code) => {
      await addCode(code);
      // Continuous mode: the camera opens again for the next phone; closing it stops the loop.
      if (continuousRef.current) setTimeout(startScan, 600);
    });
  }, [openScanner, addCode]);

  const submit = async () => {
    if (submitting || scanned.length === 0) return;
    setSubmitting(true);
    try {
      const receipt = await apiClient<any>('/store-receipts', { method: 'POST', body: JSON.stringify({ imeis: scanned.map((d) => d.imei) }) });
      setCompleted(mapStoreReceipt(receipt));
      setScanned([]);
      setRevision((v) => v + 1);
    } catch (e) {
      setStatus({ tone: 'error', text: errorText(e, 'Приход не оформлен. Проверьте список и повторите') });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- lists ----------
  const [storeFilterChoice, setStoreFilter] = useState('all');
  const storeCtx = useStoreContext();
  const storeFilter = storeCtx.mode === 'STORE' && isAdmin ? storeCtx.storeId : storeFilterChoice;
  const { items: receipts, error: listError } = useReceipts(revision, isAdmin ? storeFilter : 'all');
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse), [stores]);

  const list = (
    <div className="space-y-2">
      {listError ? (
        <EmptyState icon={PackagePlus} title="Не удалось загрузить приходы" description={listError} action={<Button onClick={() => setRevision((v) => v + 1)}>Повторить</Button>} />
      ) : receipts === null ? (
        <LoadingState label="Загрузка приходов…" />
      ) : receipts.length === 0 ? (
        <EmptyState icon={PackagePlus} title="Приходов пока нет" description={isAdmin ? 'Здесь появятся приходы, которые магазины оформили по IMEI' : 'Оформленные вами приходы появятся здесь'} />
      ) : (
        <div className="rounded-xl border border-border bg-surface divide-y divide-border">
          {receipts.map((r) => <ReceiptRow key={r.id} receipt={r} showStore={isAdmin} onOpen={() => setOpenReceiptId(r.id)} />)}
        </div>
      )}
    </div>
  );

  if (isAdmin) {
    return (
      <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
        <StatusBanner message={status} onDismiss={() => setStatus(null)} />
        <div className="p-3 border-b border-border shrink-0 flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold text-fg">{storeCtx.mode === 'STORE' ? `Приходы: ${storeCtx.storeName}` : 'Приходы магазинов'}</h1>
          {storeCtx.mode === 'CENTRAL' && <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label="Магазин"
            className="rounded-lg bg-surface border border-border px-3 text-fg-muted"
          >
            <option value="all">Все магазины</option>
            {retailStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>}
        </div>
        <div className="flex-1 overflow-y-auto p-3 max-w-3xl w-full mx-auto">{list}</div>
        <ReceiptDialog receiptId={openReceiptId} isAdmin onClose={closeReceipt} onChanged={() => setRevision((v) => v + 1)} />
      </div>
    );
  }

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="p-3 border-b border-border shrink-0 space-y-3">
        <FilterPillGroup options={[{ value: 'NEW', label: 'Новый приход' }, { value: 'HISTORY', label: 'Мои приходы' }]} value={tab} onChange={setTab} />
        {tab === 'NEW' && (
          <>
            <Button fullWidth size="lg" leftIcon={Scan} onClick={startScan} className="h-14 text-base">Сканировать IMEI</Button>
            <div className="flex items-center gap-2">
              <input
                ref={manualInput}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const code = manualCode;
                  setManualCode('');
                  void addCode(code);
                }}
                placeholder="IMEI вручную или ручным сканером"
                aria-label="IMEI вручную или ручным сканером"
                className="flex-1 min-w-0 h-11 rounded-lg bg-surface border border-border px-3 text-fg-muted placeholder:text-fg-subtle focus:outline-none focus:border-accent"
              />
              <Button variant="secondary" disabled={!manualCode.trim()} onClick={() => { const code = manualCode; setManualCode(''); void addCode(code); manualInput.current?.focus(); }}>Добавить</Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-fg-subtle select-none">
              <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} className="w-4 h-4 accent-[var(--color-accent)]" />
              <Repeat className="w-3.5 h-3.5" /> Непрерывное сканирование (камера открывается снова после каждого телефона)
            </label>
          </>
        )}
      </div>

      {tab === 'NEW' ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-fg-muted">Отсканировано</h2>
              <span className="text-2xl font-bold tabular-nums text-accent" aria-live="polite">{scanned.length}</span>
            </div>
            {scanned.length === 0 ? (
              <EmptyState icon={Smartphone} title="Список пуст" description="Отсканируйте телефоны, которые привёз администратор. Каждый проверяется по главному складу." />
            ) : (
              <ul className="rounded-xl border border-border bg-surface divide-y divide-border">
                {scanned.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 pl-3 pr-1 py-1.5">
                    <div className="min-w-0 py-1">
                      <p className="text-sm font-semibold text-fg-muted truncate">{d.brand} {d.model}</p>
                      <p className="text-xs text-fg-subtle truncate">{specLine(d)}</p>
                      <p className="text-xs text-fg-subtle tabular-nums">IMEI {d.imei}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScanned((prev) => prev.filter((x) => x.id !== d.id))}
                      aria-label={`Убрать ${d.brand} ${d.model} (${d.imei}) из прихода`}
                      className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* In-flow bottom bar (above the bottom nav and its safe area, clear of its raised button). */}
          <div className="shrink-0 px-3 pt-2 pb-7 md:pb-3 border-t border-border bg-bg">
            <Button fullWidth size="lg" leftIcon={PackageCheck} loading={submitting} disabled={scanned.length === 0 || submitting} onClick={submit} className="h-14 text-base max-w-2xl mx-auto">
              {submitting ? 'Оприходование…' : `Оприходовать ${scanned.length} шт.`}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">{list}</div>
      )}

      <Dialog
        open={completed !== null}
        onClose={() => setCompleted(null)}
        title="Приход оформлен"
        footer={<Button fullWidth size="lg" onClick={() => setCompleted(null)}>Новый приход</Button>}
      >
        {completed && (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-success font-semibold"><CheckCircle2 className="w-5 h-5" /> {completed.itemCount} шт. в магазине и уже в продаже</p>
            <p className="text-xs text-fg-subtle">{completed.receiptNumber} · {new Date(completed.createdAt).toLocaleString('ru-RU')}</p>
            <ul className="rounded-lg border border-border divide-y divide-border">
              {completed.items.map((i) => <li key={i.id} className="px-3 py-1.5 text-xs"><span className="text-fg-muted font-medium">{i.brand} {i.model}</span> · IMEI {i.imei}</li>)}
            </ul>
          </div>
        )}
      </Dialog>
      <ReceiptDialog receiptId={openReceiptId} isAdmin={false} onClose={closeReceipt} onChanged={() => setRevision((v) => v + 1)} />
    </div>
  );
};
