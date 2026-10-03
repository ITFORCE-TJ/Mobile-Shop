import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  PackageCheck,
  PackagePlus,
  Repeat,
  Scan,
  Smartphone,
  Trash2,
  ChevronRight,
  Info,
  ArrowRight,
  Search,
  X,
  Store as StoreIcon
} from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { mapStoreReceipt } from '../../api/mappers';
import type { StoreReceipt } from '../../types';
import { normalizeScanCode } from '../../utils/scanLookup';
import { soundEffects } from '../../utils/sound';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { LoadingState } from '../ui/Skeleton';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { useStoreContext, formatStoreName } from '../../utils/storeContext';
import { useUnfinishedWork } from '../../utils/pwaUpdateSafety';
import { cn } from '../../utils/cn';

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
  <button
    type="button"
    onClick={onOpen}
    className="w-full text-left p-2.5 sm:p-3 rounded-xl bg-surface border border-border/80 hover:border-accent/40 hover:bg-surface-raised/50 active:bg-surface-raised transition-all flex items-center justify-between gap-3 shadow-2xs cursor-pointer"
  >
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-8.5 h-8.5 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-bold text-xs shrink-0 font-mono">
        {receipt.itemCount}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs sm:text-sm font-bold text-fg truncate">
            {receipt.receiptNumber}
          </span>
          {showStore && receipt.storeName && (
            <span className="text-[10px] font-semibold text-fg-muted px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/80 shrink-0 truncate max-w-[120px]">
              {receipt.storeName}
            </span>
          )}
        </div>
        <p className="text-[11px] text-fg-subtle truncate mt-0.5">
          {new Date(receipt.createdAt).toLocaleDateString('ru-RU')} • Принял: {receipt.createdByName}
        </p>
      </div>
    </div>

    <div className="flex items-center gap-1.5 shrink-0">
      {receipt.acknowledgedAt ? (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-accent/10 border border-accent/20 text-accent">
          Просмотрен
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-warning/15 border border-warning/30 text-warning">
          Новый
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-fg-subtle" />
    </div>
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
  useUnfinishedWork(scanned.length > 0, 'Незавершённая приёмка');
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNACKNOWLEDGED' | 'ACKNOWLEDGED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const storeCtx = useStoreContext();
  const storeFilter = storeCtx.mode === 'STORE' && isAdmin ? storeCtx.storeId : storeFilterChoice;
  const { items: receipts, error: listError } = useReceipts(revision, isAdmin ? storeFilter : 'all');
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse), [stores]);

  const totalReceipts = receipts?.length || 0;
  const totalDevicesReceived = (receipts || []).reduce((sum, r) => sum + (r.itemCount || 0), 0);
  const unacknowledgedCount = (receipts || []).filter((r) => !r.acknowledgedAt).length;
  const acknowledgedCount = totalReceipts - unacknowledgedCount;

  const filteredReceipts = useMemo(() => {
    return (receipts || []).filter((r) => {
      if (statusFilter === 'UNACKNOWLEDGED' && r.acknowledgedAt) return false;
      if (statusFilter === 'ACKNOWLEDGED' && !r.acknowledgedAt) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          r.receiptNumber.toLowerCase().includes(q) ||
          r.createdByName.toLowerCase().includes(q) ||
          (r.storeName && r.storeName.toLowerCase().includes(q)) ||
          r.items.some((item) => item.imei.toLowerCase().includes(q) || item.model.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [receipts, statusFilter, searchQuery]);

  const list = (
    <div className="flex-1 flex flex-col space-y-2">
      {listError ? (
        <div className="p-8 text-center space-y-3 my-auto">
          <p className="text-sm text-fg-muted">{listError}</p>
          <Button onClick={() => setRevision((v) => v + 1)}>Повторить</Button>
        </div>
      ) : receipts === null ? (
        <LoadingState label="Загрузка приходов…" />
      ) : filteredReceipts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto min-h-[300px]">
          <div className="w-13 h-13 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 shadow-xs">
            <PackagePlus className="w-6 h-6" />
          </div>

          <h3 className="text-sm sm:text-base font-bold text-fg">
            {searchQuery
              ? 'Приходы не найдены'
              : statusFilter !== 'ALL'
              ? 'Нет приходов в этом статусе'
              : 'Приходов пока нет'}
          </h3>

          <p className="text-xs text-fg-subtle mt-1.5 max-w-sm leading-relaxed">
            {searchQuery
              ? `По запросу «${searchQuery}» приходов не обнаружено.`
              : statusFilter !== 'ALL'
              ? 'В выбранной вкладке нет приходов.'
              : isAdmin
              ? 'Сюда поступают отчёты о приёмке товара, когда продавцы в магазине сканируют IMEI доставленных телефонов.'
              : 'Отсканируйте телефоны, поступившие со склада, чтобы принять их на баланс магазина.'}
          </p>

          <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
            {searchQuery && (
              <Button
                variant="secondary"
                size="md"
                className="!h-8.5 !px-3 text-xs"
                onClick={() => setSearchQuery('')}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Сбросить поиск
              </Button>
            )}
            {statusFilter !== 'ALL' && (
              <Button
                variant="secondary"
                size="md"
                className="!h-8.5 !px-3 text-xs"
                onClick={() => setStatusFilter('ALL')}
              >
                Все статусы
              </Button>
            )}
          </div>

          {/* Visual workflow step guide for Admin when 0 receipts */}
          {!searchQuery && statusFilter === 'ALL' && isAdmin && (
            <div className="mt-6 max-w-md w-full bg-surface border border-border/80 rounded-2xl p-3.5 text-left space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                <div className="w-5 h-5 rounded-md bg-info/10 border border-info/20 flex items-center justify-center text-info">
                  <Info className="w-3 h-3" />
                </div>
                <span className="text-xs font-bold text-fg">Как работает оприходование в магазине</span>
              </div>

              <div className="space-y-2 text-[11px] text-fg-subtle">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-surface-raised border border-border text-fg font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <p><strong className="text-fg-muted">Закупка:</strong> партия товара приходуется на главный склад в разделе «Закупки».</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-surface-raised border border-border text-fg font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <p><strong className="text-fg-muted">Перемещение:</strong> со склада телефоны отправляются в магазин через раздел «Перемещения».</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-accent/10 border border-accent/20 text-accent font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <p><strong className="text-accent">Приёмка:</strong> продавец открывает «Приход» в магазине, сканирует IMEI полученных телефонов, и они сразу поступают на витрину.</p>
                </div>
              </div>

              <div className="pt-2 border-t border-border/60 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/transfer')}
                  className="flex-1 h-8 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-accent" />
                  <span>Перемещения</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/purchase')}
                  className="flex-1 h-8 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <PackagePlus className="w-3.5 h-3.5 text-accent" />
                  <span>Закупки</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredReceipts.map((r) => (
            <ReceiptRow key={r.id} receipt={r} showStore={isAdmin && storeCtx.mode === 'CENTRAL'} onOpen={() => setOpenReceiptId(r.id)} />
          ))}
        </div>
      )}
    </div>
  );

  if (isAdmin) {
    return (
      <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
        <StatusBanner message={status} onDismiss={() => setStatus(null)} />

        {/* Admin Header Controls */}
        <div className="p-2.5 sm:p-3 border-b border-border bg-surface shrink-0 space-y-2">
          {/* Row 1: Title + Store Filter + KPI Chips */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
              <PackagePlus className="w-4 h-4 text-accent" />
              <span>{storeCtx.mode === 'STORE' ? `Приходы: ${formatStoreName(storeCtx.storeName)}` : 'Приходы в магазины'}</span>
            </h1>

            <div className="flex items-center gap-1.5 text-[11px] shrink-0">
              {storeCtx.mode === 'CENTRAL' && (
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  aria-label="Магазин"
                  className="h-7.5 rounded-lg bg-surface-raised border border-border px-2 text-fg text-xs font-semibold focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="all">Все магазины</option>
                  {retailStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-fg-muted font-medium">
                {totalReceipts} док.
              </span>
              <span className="px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent font-semibold">
                {totalDevicesReceived} шт.
              </span>
              {unacknowledgedCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-warning/15 border border-warning/30 text-warning font-bold">
                  {unacknowledgedCount} новых
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Status Tabs + Quick Search */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {[
                { id: 'ALL', label: 'Все', count: totalReceipts },
                { id: 'UNACKNOWLEDGED', label: 'Новые', count: unacknowledgedCount },
                { id: 'ACKNOWLEDGED', label: 'Просмотрены', count: acknowledgedCount },
              ].map((tab) => {
                const isSelected = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id as any)}
                    className={cn(
                      'h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer',
                      isSelected
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'bg-surface-raised border border-border/80 text-fg-muted hover:text-fg hover:bg-surface'
                    )}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                        isSelected
                          ? 'bg-black/20 text-accent-fg'
                          : tab.count > 0
                          ? 'bg-accent/10 text-accent border border-accent/20'
                          : 'bg-surface text-fg-subtle border border-border/60'
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {totalReceipts > 0 && (
              <div className="relative w-full sm:w-56 shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Номер, сотрудник, IMEI..."
                  className="w-full h-7.5 rounded-lg bg-surface-raised border border-border pl-8 pr-7 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 max-w-4xl xl:max-w-5xl w-full mx-auto flex flex-col">{list}</div>
        <ReceiptDialog receiptId={openReceiptId} isAdmin onClose={closeReceipt} onChanged={() => setRevision((v) => v + 1)} />
      </div>
    );
  }

  const currentStoreName = formatStoreName(
    currentUser?.storeName || (currentUser?.storeId ? stores.find((s) => s.id === currentUser.storeId)?.name : undefined)
  ) || 'Магазин';

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* ================================================================ */}
      {/* 1. DESKTOP WORKSPACE (>= 1024px, laptops & wide desktop monitors) */}
      {/* ================================================================ */}
      <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
        {tab === 'NEW' ? (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Column: Scanning Station & Control Panel */}
            <div className="w-80 xl:w-96 shrink-0 border-r border-border bg-surface flex flex-col justify-between overflow-y-auto p-4 space-y-4">
              <div className="space-y-4">
                <FilterPillGroup
                  options={[
                    { value: 'NEW', label: 'Новый приход' },
                    { value: 'HISTORY', label: 'Мои приходы' },
                  ]}
                  value={tab}
                  onChange={setTab}
                />

                {/* Scanning Controls Box */}
                <div className="rounded-2xl border border-border bg-surface-raised/40 p-3.5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                      <Scan className="w-3.5 h-3.5 text-accent" />
                      Сканирование товара
                    </span>
                    <span className="text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.2 rounded-md">
                      Камера / Сканер
                    </span>
                  </div>

                  <Button
                    fullWidth
                    size="md"
                    leftIcon={Scan}
                    onClick={startScan}
                    className="h-10 text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
                  >
                    Сканировать IMEI
                  </Button>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-fg-subtle">
                      Ручной ввод или сканер штрихкода:
                    </label>
                    <div className="flex items-center gap-1.5">
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
                        placeholder="Введите IMEI и нажмите Enter"
                        aria-label="IMEI вручную или ручным сканером"
                        className="flex-1 min-w-0 h-9 rounded-xl bg-surface border border-border px-3 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                      />
                      <Button
                        size="md"
                        variant="secondary"
                        disabled={!manualCode.trim()}
                        onClick={() => {
                          const code = manualCode;
                          setManualCode('');
                          void addCode(code);
                          manualInput.current?.focus();
                        }}
                        className="!h-9 !px-3 text-xs shrink-0 cursor-pointer"
                      >
                        Добавить
                      </Button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-[11px] text-fg-subtle select-none cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={continuous}
                      onChange={(e) => setContinuous(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[var(--color-accent)] cursor-pointer"
                    />
                    <Repeat className="w-3 h-3 text-accent shrink-0" />
                    <span>Непрерывное сканирование</span>
                  </label>
                </div>

                {/* Receipt Summary Card */}
                <div className="rounded-2xl border border-accent/25 bg-accent/5 p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1">
                      <StoreIcon className="w-3 h-3 text-accent" />
                      {currentStoreName}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent font-mono">
                      Приёмка
                    </span>
                  </div>

                  <div>
                    <p className="text-2xl font-black font-mono text-accent">
                      {scanned.length}{' '}
                      <span className="text-xs font-semibold text-fg-muted">шт.</span>
                    </p>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      {scanned.length === 0
                        ? 'Ожидание сканирования устройств'
                        : 'Готово к оприходованию на баланс'}
                    </p>
                  </div>

                  <p className="text-[11px] text-fg-subtle leading-relaxed border-t border-accent/15 pt-2">
                    Каждый IMEI сверяется с базой склада. После подтверждения устройства сразу появятся на витрине и в кассе.
                  </p>
                </div>
              </div>

              {/* Submit Button inside left control panel on Desktop */}
              <div className="pt-3 border-t border-border">
                <Button
                  fullWidth
                  size="md"
                  leftIcon={PackageCheck}
                  loading={submitting}
                  disabled={scanned.length === 0 || submitting}
                  onClick={submit}
                  className="h-11 text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
                >
                  {submitting ? 'Оприходование…' : `Оприходовать ${scanned.length} шт.`}
                </Button>
              </div>
            </div>

            {/* Right Column: Scanned Devices Review Grid / Empty State */}
            <div className="flex-1 min-w-0 bg-bg p-5 xl:p-6 overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/80">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-fg">Список поступивших устройств</h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent font-mono">
                    {scanned.length} шт.
                  </span>
                </div>

                {scanned.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setScanned([])}
                    className="text-xs text-fg-subtle hover:text-danger flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Очистить весь список приёмки"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Очистить всё</span>
                  </button>
                )}
              </div>

              {scanned.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[300px] max-w-md mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3.5 shadow-xs">
                    <Smartphone className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-fg">Список приёмки пуст</h3>
                  <p className="text-xs text-fg-subtle mt-1.5 max-w-sm leading-relaxed">
                    Отсканируйте телефоны, которые поступили со склада. Каждый телефон автоматически сверяется с базой.
                  </p>
                  <Button
                    size="md"
                    leftIcon={Scan}
                    onClick={startScan}
                    className="mt-4 !h-9 !px-4 text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Начать сканирование
                  </Button>
                  <p className="text-[11px] text-fg-subtle/80 mt-4 leading-normal">
                    💡 Поддерживаются проводные и Bluetooth сканеры штрихкодов в режиме HID-клавиатуры.
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                  {scanned.map((d, index) => (
                    <li
                      key={d.id}
                      className="p-3 rounded-xl bg-surface border border-border/80 hover:border-accent/40 hover:bg-surface-raised/40 transition-all flex items-start justify-between gap-3 shadow-2xs group"
                    >
                      <div className="min-w-0 flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-md bg-surface-raised border border-border/80 text-[10px] font-bold font-mono text-fg-subtle flex items-center justify-center shrink-0 mt-0.5">
                          #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-fg truncate">
                            {d.brand} {d.model}
                          </p>
                          <p className="text-[11px] text-fg-muted truncate mt-0.5">
                            {specLine(d)}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-accent font-mono bg-accent/10 border border-accent/20 px-1.5 py-0.2 rounded-md">
                              IMEI: {d.imei}
                            </span>
                            {d.imei2 && (
                              <span className="text-[10px] text-fg-subtle font-mono bg-surface-raised border border-border/60 px-1.5 py-0.2 rounded-md">
                                IMEI 2: {d.imei2}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setScanned((prev) => prev.filter((x) => x.id !== d.id))}
                        aria-label={`Убрать ${d.brand} ${d.model} (${d.imei}) из прихода`}
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        title="Удалить из списка"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          /* Desktop tab === 'HISTORY' */
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <FilterPillGroup
                options={[
                  { value: 'NEW', label: 'Новый приход' },
                  { value: 'HISTORY', label: 'Мои приходы' },
                ]}
                value={tab}
                onChange={setTab}
              />
              <span className="text-xs font-semibold text-fg-subtle">
                Точка: <strong className="text-fg">{currentStoreName}</strong>
              </span>
            </div>
            <div className="flex-1 flex flex-col">{list}</div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* 2. MOBILE / TABLET WORKSPACE (< 1024px)                          */}
      {/* ================================================================ */}
      <div className="lg:hidden flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="p-2.5 sm:p-3 border-b border-border shrink-0 space-y-2.5 bg-surface">
          <FilterPillGroup
            options={[
              { value: 'NEW', label: 'Новый приход' },
              { value: 'HISTORY', label: 'Мои приходы' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'NEW' && (
            <div className="space-y-2">
              <Button
                fullWidth
                size="md"
                leftIcon={Scan}
                onClick={startScan}
                className="h-10 text-xs sm:text-sm font-bold shadow-xs"
              >
                Сканировать IMEI
              </Button>
              <div className="flex items-center gap-1.5">
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
                  className="flex-1 min-w-0 h-9 rounded-xl bg-surface-raised border border-border px-3 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
                <Button
                  size="md"
                  variant="secondary"
                  disabled={!manualCode.trim()}
                  onClick={() => {
                    const code = manualCode;
                    setManualCode('');
                    void addCode(code);
                    manualInput.current?.focus();
                  }}
                  className="!h-9 !px-3 text-xs"
                >
                  Добавить
                </Button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-fg-subtle select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={(e) => setContinuous(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                />
                <Repeat className="w-3 h-3 text-accent" /> Непрерывное сканирование (камера открывается снова после каждого телефона)
              </label>
            </div>
          )}
        </div>

        {tab === 'NEW' ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-3 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold text-fg-muted">Отсканировано</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent font-mono" aria-live="polite">
                  {scanned.length} шт.
                </span>
              </div>
              {scanned.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto min-h-[240px]">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 shadow-xs">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-fg">Список приёмки пуст</h3>
                  <p className="text-xs text-fg-subtle mt-1.5 max-w-xs leading-relaxed">
                    Отсканируйте телефоны, которые поступили со склада. Каждый телефон автоматически сверяется с базой.
                  </p>
                  <Button size="md" leftIcon={Scan} onClick={startScan} className="mt-4 !h-8.5 !px-3.5 text-xs shadow-xs">
                    Начать сканирование
                  </Button>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {scanned.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface border border-border shadow-2xs">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-fg truncate">{d.brand} {d.model}</p>
                        <p className="text-[11px] text-fg-muted truncate">{specLine(d)}</p>
                        <p className="text-[10px] text-fg-subtle font-mono">IMEI: {d.imei}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScanned((prev) => prev.filter((x) => x.id !== d.id))}
                        aria-label={`Убрать ${d.brand} ${d.model} (${d.imei}) из прихода`}
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* In-flow bottom bar */}
            <div className="shrink-0 px-3 pt-2 pb-7 md:pb-3 border-t border-border bg-surface/80 backdrop-blur-xs">
              <Button
                fullWidth
                size="md"
                leftIcon={PackageCheck}
                loading={submitting}
                disabled={scanned.length === 0 || submitting}
                onClick={submit}
                className="h-10 text-xs sm:text-sm font-bold max-w-2xl mx-auto shadow-xs"
              >
                {submitting ? 'Оприходование…' : `Оприходовать ${scanned.length} шт.`}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 flex flex-col">{list}</div>
        )}
      </div>

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
