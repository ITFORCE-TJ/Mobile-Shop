import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { decimal, moneyNumber } from '../../utils/money';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { SupplierInvoice, Device } from '../../types';
import {
  Plus,
  Trash2,
  Scan,
  AlertCircle,
  CheckCircle2,
  Truck,
  Store as StoreIcon,
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  Package,
  FileText,
  Edit2,
  Loader2,
  Building
} from 'lucide-react';
import { soundEffects } from '../../utils/sound';
import { MonthPicker } from '../ui/MonthPicker';
import { Combobox } from '../ui/Combobox';
import { getBusinessDateKey } from '../../utils/businessDate';
import { useUnfinishedWork } from '../../utils/pwaUpdateSafety';

interface PurchaseItem {
  imei: string;
}

interface PurchaseItemGroup {
  id: string;
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  isBonus?: boolean;
  bonusCampaign?: string;
  items: PurchaseItem[];
}

interface PurchasePreviewGroup {
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  isBonus?: boolean;
  bonusCampaign?: string;
  items: PurchaseItem[];
  imeis: string[];
}

interface PurchasePreviewData {
  supplierId: string;
  invoiceNumber: string;
  date: string;
  isStorePurchase: boolean;
  storeId?: string;
  groups: PurchasePreviewGroup[];
}

export const PurchasePage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const {
    currentUser,
    suppliers,
    stores,
    supplierInvoices,
    devices,
    findDevicesByInvoice,
    findDeviceByImei,
    fetchInvoicesRange,
    createPurchase,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    createSupplier,
    openScanner
  } = useAppFields('currentUser', 'suppliers', 'stores', 'supplierInvoices', 'devices', 'findDevicesByInvoice', 'findDeviceByImei', 'fetchInvoicesRange', 'createPurchase', 'updateSupplierInvoice', 'deleteSupplierInvoice', 'createSupplier', 'openScanner');

  // Edit Invoice Modal state
  const [editingInvoiceModal, setEditingInvoiceModal] = useState<SupplierInvoice | null>(null);
  const [editInvoiceNum, setEditInvoiceNum] = useState('');
  const [editInvoiceDateStr, setEditInvoiceDateStr] = useState('');
  const [editInvoiceAmountUsd, setEditInvoiceAmountUsd] = useState('');

  const handleStartEditInvoiceModal = (inv: SupplierInvoice) => {
    setEditingInvoiceModal(inv);
    setEditInvoiceNum(inv.invoiceNumber);
    setEditInvoiceDateStr(inv.date ? inv.date.split('T')[0] : '');
    setEditInvoiceAmountUsd((inv.totalAmountUsd || 0).toString());
  };

  const handleSaveEditInvoiceModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoiceModal || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await updateSupplierInvoice(editingInvoiceModal.id, {
        invoiceNumber: editInvoiceNum.trim(),
        date: editInvoiceDateStr,
        totalAmountUsd: parseFloat(editInvoiceAmountUsd) || 0,
      });
      if (res.success) {
        setEditingInvoiceModal(null);
        setSelectedInvoiceId(null);
        setStatusMessage({ type: 'success', text: 'Накладная успешно обновлена!' });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления накладной' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteInvoiceModal = async (id: string) => {
    if (isSubmitting) return;
    if (!window.confirm('Вы действительно хотите удалить эту накладную и все её незапроданные устройства?')) return;
    setIsSubmitting(true);
    try {
      const res = await deleteSupplierInvoice(id);
      if (res.success) {
        setSelectedInvoiceId(null);
        setStatusMessage({ type: 'success', text: 'Накладная успешно удалена!' });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления накладной' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mode: 'list' (History of purchases) or 'form' (Register new purchase intake)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  useUnfinishedWork(viewMode === 'form', 'Незавершённый приход');
  const [expandedDeviceGroups, setExpandedDeviceGroups] = useState<Record<string, boolean>>({});

  // List search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const selectedInvoice = supplierInvoices.find((inv) => inv.id === selectedInvoiceId) || null;

  // `devices` excludes SOLD by default — an invoice's own devices (including any already
  // sold) are fetched on demand so the "which units sold" detail view stays accurate.
  useEffect(() => {
    if (!selectedInvoiceId) return;
    let cancelled = false;
    findDevicesByInvoice(selectedInvoiceId).catch((e) => { if (!cancelled) console.error('Failed to load invoice devices', e); });
    return () => { cancelled = true; };
  }, [selectedInvoiceId, findDevicesByInvoice]);

  // `supplierInvoices` only holds a recent bounded window by default — the current month
  // (this page's own default filter) is always inside it, but "весь период" or an older
  // month reaches further back, so fetch that exact range from the server and merge it in.
  useEffect(() => {
    let cancelled = false;
    fetchInvoicesRange({
      period: 'SPECIFIC_MONTH',
      month: selectedMonth,
    }).catch((e) => { if (!cancelled) console.error('Failed to load invoices for period', e); });
    return () => { cancelled = true; };
  }, [selectedMonth, fetchInvoicesRange, dataRefreshRevision]);

  // Form states - no default supplier, must be selected explicitly
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  // Inline "add new supplier" — lets a purchase be started even when the supplier doesn't
  // exist yet, instead of forcing a detour to the Suppliers page and back.
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierContact, setNewSupplierContact] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const handleAddSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim() || isSavingSupplier) return;
    setIsSavingSupplier(true);
    try {
      const res = await createSupplier({
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || undefined,
        contactPerson: newSupplierContact.trim() || undefined,
      });
      if (res.success) {
        setIsAddSupplierOpen(false);
        setNewSupplierName('');
        setNewSupplierPhone('');
        setNewSupplierContact('');
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка добавления поставщика' });
      }
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // Auto-generate sequential invoice number
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    return `INV-${((supplierInvoices?.length || 0) + 1).toString().padStart(4, '0')}`;
  });

  // If the currently selected supplier is deleted, clear selection
  useEffect(() => {
    if (selectedSupplierId && !suppliers.some(s => s.id === selectedSupplierId)) {
      setSelectedSupplierId('');
    }
  }, [suppliers, selectedSupplierId]);

  useEffect(() => {
    if (supplierInvoices) {
      setInvoiceNumber(`INV-${(supplierInvoices.length + 1).toString().padStart(4, '0')}`);
    }
    // Only the count matters for the next sequential number — depending on the
    // array reference re-ran this on every unrelated invoice update anywhere in
    // the company (e.g. a payment changing one invoice's status elsewhere).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierInvoices?.length]);
  const [purchaseDate] = useState<string>(getBusinessDateKey());
  
  // Destination mode (Main Warehouse intake is ADMIN ONLY)
  const [isStorePurchase, setIsStorePurchase] = useState<boolean>(currentUser?.role !== 'ADMIN');
  const [storeId, setStoreId] = useState<string>(stores.find(s => !s.isMainWarehouse)?.id || 'store-1');

  // Groups of devices
  const [groups, setGroups] = useState<PurchaseItemGroup[]>([
    {
      id: 'g-1',
      brand: '',
      model: '',
      ram: '',
      storage: '',
      color: '',
      purchasePriceUsd: 0,
      items: [{ imei: '' }]
    }
  ]);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSavedInvoice, setJustSavedInvoice] = useState<string | null>(null);

  // Autocomplete suggestion lists derived from database devices and standard presets
  const brandOptions = useMemo(() => {
    const set = new Set<string>(['Apple', 'Samsung', 'Xiaomi', 'Google', 'OnePlus', 'Honor', 'Realme', 'Huawei', 'Nothing']);
    (devices || []).forEach(d => { if (d.brand) set.add(d.brand.trim()); });
    return Array.from(set).sort();
  }, [devices]);

  const getModelOptions = useCallback((selectedBrand: string) => {
    const set = new Set<string>();
    const brandLower = (selectedBrand || '').trim().toLowerCase();
    (devices || []).forEach(d => {
      if (d.model && (!brandLower || (d.brand && d.brand.toLowerCase() === brandLower))) {
        set.add(d.model.trim());
      }
    });
    return Array.from(set).sort();
  }, [devices]);

  const ramOptions = useMemo(() => {
    const set = new Set<string>(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB']);
    (devices || []).forEach(d => {
      if (d.ram) set.add(d.ram.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const storageOptions = useMemo(() => {
    const set = new Set<string>(['64 GB', '128 GB', '256 GB', '512 GB', '1 TB']);
    (devices || []).forEach(d => {
      if (d.storage) set.add(d.storage.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>([
      'Black', 'White', 'Titanium', 'Natural Titanium', 'Black Titanium',
      'Desert Titanium', 'Midnight', 'Starlight', 'Silver', 'Gold',
      'Blue', 'Graphite', 'Purple', 'Green'
    ]);
    (devices || []).forEach(d => { if (d.color) set.add(d.color.trim()); });
    return Array.from(set).sort();
  }, [devices]);

  // Filtered list of purchase invoices
  const filteredInvoices = useMemo(() => {
    return (supplierInvoices || []).filter((inv) => {
      // 1. Period filter
      const invDateStr = getBusinessDateKey(new Date(inv.date));
      const rawDateStr = typeof inv.date === 'string' ? inv.date : '';
      if (!invDateStr.startsWith(selectedMonth) && !rawDateStr.startsWith(selectedMonth)) {
        return false;
      }

      // 2. Supplier filter
      if (selectedSupplierFilter !== 'all' && inv.supplierId !== selectedSupplierFilter) {
        return false;
      }

      // 3. Search query (by invoice number, supplier name, or contained device IMEI/model)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesInvoiceNum = inv.invoiceNumber.toLowerCase().includes(q);
        const matchesSupplier = inv.supplierName.toLowerCase().includes(q);
        
        // Match devices belonging to this invoice
        const invoiceDevices = devices.filter(
          d => d.invoiceNumber === inv.invoiceNumber || (inv.id && d.purchaseInvoiceId === inv.id)
        );
        const matchesDevice = invoiceDevices.some(
          d => d.imei.toLowerCase().includes(q) ||
               (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
               d.model.toLowerCase().includes(q) ||
               d.brand.toLowerCase().includes(q)
        );

        if (!matchesInvoiceNum && !matchesSupplier && !matchesDevice) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [supplierInvoices, devices, selectedMonth, selectedSupplierFilter, searchQuery]);

  // Scan finder to locate purchase
  const handleScanFinder = () => {
    openScanner(async (scannedCode) => {
      const code = scannedCode.trim();
      let matchedDevice = devices.find(d => d.imei === code || d.imei2 === code);
      // Not in the locally-loaded (SOLD-excluded) list — the device may already be sold,
      // which is exactly the common case for looking up an old purchase this way.
      if (!matchedDevice) {
        try {
          [matchedDevice] = await findDeviceByImei(code);
        } catch {
          // fall through
        }
      }
      if (matchedDevice && matchedDevice.invoiceNumber) {
        let matchedInv = supplierInvoices.find(inv => inv.invoiceNumber === matchedDevice!.invoiceNumber);
        if (!matchedInv) {
          try {
            const found = await fetchInvoicesRange({ search: matchedDevice.invoiceNumber });
            matchedInv = found.find(inv => inv.invoiceNumber === matchedDevice!.invoiceNumber);
          } catch {
            // fall through
          }
        }
        if (matchedInv) {
          setSelectedInvoiceId(matchedInv.id);
          return;
        }
      }

      let directInv = supplierInvoices.find(inv => inv.invoiceNumber.toLowerCase() === code.toLowerCase());
      if (!directInv) {
        try {
          const found = await fetchInvoicesRange({ search: code });
          directInv = found.find(inv => inv.invoiceNumber.toLowerCase() === code.toLowerCase());
        } catch {
          // fall through
        }
      }
      if (directInv) {
        setSelectedInvoiceId(directInv.id);
      } else {
        setSearchQuery(code);
      }
    });
  };

  // Form helpers
  const handleAddGroup = () => {
    setGroups(prev => [
      ...prev,
      {
        id: `g-${Date.now()}`,
        brand: '',
        model: '',
        ram: '',
        storage: '',
        color: '',
        purchasePriceUsd: 0,
        items: [{ imei: '' }]
      }
    ]);
  };

  const handleRemoveGroup = (idx: number) => {
    setGroups(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateGroup = (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => {
    setGroups(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleAddImeiToGroup = (groupIdx: number) => {
    soundEffects.playAddToCartSuccess();
    setGroups(prev => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items.push({ imei: '' });
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
  };

  const handleRemoveImeiFromGroup = (groupIdx: number, itemIdx: number) => {
    setGroups(prev => {
      const next = [...prev];
      const items = next[groupIdx].items.filter((_, i) => i !== itemIdx);
      next[groupIdx] = {
        ...next[groupIdx],
        items: items.length > 0 ? items : [{ imei: '' }]
      };
      return next;
    });
  };

  const handleUpdateImei = (groupIdx: number, itemIdx: number, val: string) => {
    setGroups(prev => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items[itemIdx] = { ...items[itemIdx], imei: val };
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
  };

  const getImeiPair = (value: string): [string, string] => {
    const [imei1 = '', imei2 = ''] = (value || '').split(/[\/,]/).map(part => part.trim());
    return [imei1, imei2];
  };

  const handleUpdateImei2 = (groupIdx: number, itemIdx: number, value: string) => {
    const [imei1] = getImeiPair(groups[groupIdx].items[itemIdx]?.imei || '');
    const imei2 = value.trim();
    handleUpdateImei(groupIdx, itemIdx, imei2 ? `${imei1} / ${imei2}` : imei1);
  };

  const handleScanImei = (groupIdx: number, itemIdx: number) => {
    openScanner((scannedCode) => {
      handleUpdateImei(groupIdx, itemIdx, scannedCode.trim());
    });
  };

  // Quick batch paste IMEI helper
  const handleBatchImeiPaste = (groupIdx: number, text: string) => {
    const rawLines = text.match(/\d{15}\s*\/\s*\d{15}|[^\s,]+/g)?.map(s => s.trim()) ?? [];
    if (rawLines.length > 0) {
      soundEffects.playAddToCartSuccess();
      setGroups(prev => {
        const next = [...prev];
        const newItems: PurchaseItem[] = rawLines.map((imei) => ({ imei }));

        next[groupIdx] = {
          ...next[groupIdx],
          items: newItems
        };
        return next;
      });
    }
  };

  // Calculate totals for new intake form
  const totalFormUnits = groups.reduce((acc, g) => acc + g.items.filter(i => i.imei.trim().length > 0).length, 0);
  const totalFormUsd = moneyNumber(groups.reduce((acc, g) => {
    const count = g.items.filter(i => i.imei.trim().length > 0).length;
    return acc.plus(decimal(g.purchasePriceUsd || 0).mul(count));
  }, decimal(0)));

  // Building the invoice no longer saves it straight away — validating the form opens a
  // receipt-style preview (like a чек) first, and only confirming that preview actually
  // creates the devices/invoice, so a cashier can catch mistakes before they're committed.
  const [previewInvoice, setPreviewInvoice] = useState<PurchasePreviewData | null>(null);

  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setStatusMessage(null);

    if (!selectedSupplierId) {
      setStatusMessage({ type: 'error', text: 'Пожалуйста, выберите поставщика из списка (выбор поставщика обязателен)' });
      return;
    }
    if (!invoiceNumber.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите номер накладной' });
      return;
    }
    if (!isStorePurchase && currentUser?.role !== 'ADMIN') {
      setStatusMessage({ type: 'error', text: 'Приход на Главный Склад разрешен только Администратору' });
      return;
    }

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!g.brand.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1}: укажите бренд устройства` });
        return;
      }
      if (!g.model.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1}: укажите модель устройства` });
        return;
      }
      if (!g.ram || !g.ram.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1} (${g.brand || ''} ${g.model || ''}): обязательно укажите RAM (ОЗУ)` });
        return;
      }
      if (!g.storage.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1}: укажите память (ROM)` });
        return;
      }
      if (!g.color.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1}: укажите цвет` });
        return;
      }
    }

    const cleanGroups: PurchasePreviewGroup[] = groups.map(g => {
      const validItems = g.items
        .filter(i => i.imei.trim().length > 0)
        .map(i => ({ imei: i.imei.trim() }));

      const ramStr = g.ram.trim();
      const storageStr = g.storage.trim();

      return {
        brand: g.brand.trim(),
        model: g.model.trim(),
        ram: ramStr,
        storage: storageStr,
        color: g.color.trim(),
        purchasePriceUsd: g.isBonus ? 0 : g.purchasePriceUsd,
        isBonus: Boolean(g.isBonus),
        bonusCampaign: g.isBonus ? (g.bonusCampaign?.trim() || 'Бонус от поставщика') : undefined,
        items: validItems,
        imeis: validItems.map(i => i.imei)
      };
    }).filter(g => g.items.length > 0);

    if (cleanGroups.length === 0) {
      setStatusMessage({ type: 'error', text: 'Добавьте хотя бы одно устройство с заполненным IMEI' });
      return;
    }

    setPreviewInvoice({
      supplierId: selectedSupplierId,
      invoiceNumber: invoiceNumber.trim(),
      date: purchaseDate,
      isStorePurchase,
      storeId: isStorePurchase ? storeId : undefined,
      groups: cleanGroups
    });
  };

  const handleConfirmSavePurchase = async () => {
    if (!previewInvoice || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await createPurchase(previewInvoice);

      if (res.success) {
        const savedNum = previewInvoice.invoiceNumber;
        setJustSavedInvoice(savedNum);

        // invoiceNumber resets automatically via the useEffect watching supplierInvoices
        // once the post-save refetch lands, picking the next sequential INV-XXXX number.
        setGroups([
          {
            id: `g-${Date.now()}`,
            brand: '',
            model: '',
            ram: '',
            storage: '',
            color: '',
            purchasePriceUsd: 0,
            items: [{ imei: '' }]
          }
        ]);
        setPreviewInvoice(null);
        setSelectedSupplierId('');

        // Automatically switch back to the list of purchases as requested!
        setViewMode('list');
        setStatusMessage({
          type: 'success',
          text: `Приход по накладной ${savedNum} успешно сохранен (${previewInvoice.groups.reduce((a, b) => a + b.items.length, 0)} шт.)!`
        });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка сохранения прихода' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div className="p-8 text-center text-fg-subtle">
        <p className="text-sm font-medium text-fg-muted">Доступ ограничен</p>
        <p className="text-xs mt-1">Оформление и просмотр приходов и цен закупки разрешены только Администратору</p>
      </div>
    );
  }

  // =========================================================================
  // VIEW: HISTORY OF PURCHASES (ВСЕ ПРИХОДЫ)
  // =========================================================================
  if (viewMode === 'list') {
    return (
      <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
        {/* Search & Filters Bar */}
        <div className="p-3 border-b border-border bg-surface space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            {/* Compact Search Bar with Scanner inside right corner */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск: № накладной / IMEI..."
                className="w-full rounded-xl bg-surface-raised border border-border pl-9 pr-9 py-2 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-fg-subtle hover:text-fg-muted"
                  title="Очистить"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleScanFinder}
                  className="absolute right-2.5 top-2.5 text-accent hover:text-accent-strong transition-colors"
                  title="Сканировать IMEI или номер накладной"
                >
                  <Scan className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* New Purchase button right next to search */}
            <button
              onClick={() => {
                setStatusMessage(null);
                setSelectedSupplierId('');
                setViewMode('form');
              }}
              className="shrink-0 px-3.5 py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-accent-fg font-bold text-xs flex items-center space-x-1.5 transition-colors shadow-xs whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Новый приход</span>
            </button>
          </div>

          {/* Period selector & Supplier Filter */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <MonthPicker
              value={selectedMonth}
              onChange={setSelectedMonth}
              className="px-3 py-1.5 rounded-xl border border-accent text-accent text-xs font-semibold bg-surface focus:outline-none"
            />

            <select
              value={selectedSupplierFilter}
              onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              className="shrink-0 bg-surface border border-border text-fg-muted text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent"
            >
              <option value="all">Все поставщики</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Invoices List / Table */}
        <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
          {filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-fg-subtle">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-xs">Приходы не найдены</p>
              <p className="text-[11px] mt-1">
                Нажмите «Новый приход», чтобы зарегистрировать партию товара
              </p>
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const isPaid = inv.status === 'PAID';
              const isPartial = inv.status === 'PARTIALLY_PAID';
              const isJustSaved = justSavedInvoice === inv.invoiceNumber;
              const locationLabel = inv.isStorePurchase && inv.storeId
                ? (stores.find(s => s.id === inv.storeId)?.name || 'Магазин')
                : 'Главный склад';

              return (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoiceId(inv.id)}
                  className={`p-3 sm:p-3.5 hover:bg-surface-raised cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isJustSaved ? 'bg-accent/15 border-l-4 border-l-accent' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 rounded-lg bg-surface border border-border text-accent shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-fg-muted">
                          {inv.invoiceNumber}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                          isPaid ? 'bg-accent/15 text-accent border border-accent/30' :
                          isPartial ? 'bg-warning/15 text-warning border border-warning/30' :
                          'bg-danger/15 text-danger border border-danger/30'
                        }`}>
                          {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                        </span>
                        {(inv.totalAmountUsd === 0 || inv.invoiceNumber.includes('BONUS')) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-highlight/20 text-highlight border border-highlight/40">
                            🎁 Подарок ($0)
                          </span>
                        )}
                        {isJustSaved && (
                          <span className="text-[9px] bg-accent text-accent-fg px-1.5 py-0.2 rounded font-bold ">
                            Новое
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle mt-1">
                        <span className="text-fg-muted font-semibold flex items-center space-x-1">
                          <Truck className="w-3 h-3 text-fg-subtle" />
                          <span>{inv.supplierName}</span>
                        </span>
                        <span>•</span>
                        <span>{inv.date}</span>
                        <span>•</span>
                        <span className="flex items-center space-x-1 text-fg-muted">
                          <StoreIcon className="w-3 h-3 text-fg-subtle" />
                          <span>{locationLabel}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-4 pl-11 sm:pl-0">
                    <div className="text-left sm:text-right">
                      <div className="text-xs font-bold text-fg-muted">
                        {inv.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(inv.totalAmountUsd || 0).toLocaleString()}`}
                        {inv.totalAmountUsd > 0 && (
                          <span className="text-[10px] text-fg-subtle font-normal ml-1">
                            (~{Math.round((inv.totalAmountUsd || 0) * inv.exchangeRate).toLocaleString()} TJS, курс {inv.exchangeRate})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-fg-subtle flex items-center sm:justify-end space-x-2 mt-0.5">
                        <span className="text-accent font-bold">{inv.devicesCount || 0} шт.</span>
                        {inv.remainingAmountUsd > 0 && (
                          <span className="text-danger">Долг: ${inv.remainingAmountUsd.toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                      {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEditInvoiceModal(inv)}
                            className="p-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-accent border border-border transition-colors"
                            title="Редактировать накладную"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoiceModal(inv.id)}
                            className="p-1.5 rounded-lg bg-surface-raised hover:bg-danger/20 text-fg-subtle hover:text-danger border border-border transition-colors"
                            title="Удалить накладную"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedInvoiceId(inv.id)}
                        className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle hover:text-fg-muted border border-border"
                        title="Подробнее"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* INVOICE DETAILS MODAL */}
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
              {/* Modal Header */}
              <div className="p-3.5 sm:p-4 border-b border-border bg-surface flex items-center justify-between shrink-0 font-mono">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-accent" />
                  <div>
                    <h3 className="text-xs font-bold text-fg-muted flex items-center space-x-2">
                      <span>НАКЛАДНАЯ {selectedInvoice.invoiceNumber}</span>
                      {(selectedInvoice.totalAmountUsd === 0 || selectedInvoice.invoiceNumber.includes('BONUS')) && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-highlight/20 text-highlight border border-highlight/40 font-normal">
                          🎯 Target Bonus ($0)
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-fg-subtle">
                      Поставщик: {selectedInvoice.supplierName} • {selectedInvoice.date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                    <>
                      <button
                        onClick={() => handleStartEditInvoiceModal(selectedInvoice)}
                        className="p-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-accent border border-border transition-colors"
                        title="Редактировать накладную"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteInvoiceModal(selectedInvoice.id)}
                        className="p-1.5 rounded-lg bg-surface-raised hover:bg-danger/20 text-fg-subtle hover:text-danger border border-border transition-colors"
                        title="Удалить накладную"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedInvoiceId(null)}
                    className="p-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-fg-muted border border-border transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="p-3 bg-surface-raised border-b border-border grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <span className="text-[10px] text-fg-subtle block font-semibold ">Сумма накладной</span>
                  <strong className={selectedInvoice.totalAmountUsd === 0 ? "text-highlight font-bold" : "text-fg-muted font-bold"}>
                    {selectedInvoice.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(selectedInvoice.totalAmountUsd || 0).toLocaleString()}`}
                  </strong>
                </div>
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <span className="text-[10px] text-fg-subtle block font-semibold ">Оплачено</span>
                  <strong className="text-accent font-bold">${(selectedInvoice.paidAmountUsd || 0).toLocaleString()}</strong>
                </div>
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <span className="text-[10px] text-fg-subtle block font-semibold ">Остаток долга</span>
                  <strong className="text-danger font-bold">${(selectedInvoice.remainingAmountUsd || 0).toLocaleString()}</strong>
                </div>
              </div>

              {/* Contained Devices List */}
              {(() => {
                const containedDevices = devices.filter(d =>
                  (selectedInvoice.id && d.purchaseInvoiceId === selectedInvoice.id) ||
                  d.invoiceNumber === selectedInvoice.invoiceNumber
                );

                const renderDeviceRow = (dev: Device, idx: number) => (
                  <div
                    key={dev.id}
                    className="p-2.5 rounded-xl bg-surface-raised border border-border flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-fg-subtle text-[10px] font-bold">#{idx + 1}</span>
                        <strong className="text-fg-muted">{dev.brand} {dev.model}</strong>
                        <span className="text-fg-subtle text-[11px]">{dev.ram ? `${dev.ram} • ` : ''}{dev.storage} • {dev.color}</span>
                        {(dev.purchaseCostUsd === 0 || dev.isBonus) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-highlight/20 text-highlight border border-highlight/40 font-medium">
                            🎁 Подарок ($0)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-fg-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
                        <span>IMEI 1: <strong className="text-fg-muted">{dev.imei}</strong></span>
                        <span>IMEI 2: <strong className={dev.imei2 ? "text-fg-muted" : "text-fg-subtle font-normal"}>{dev.imei2 || '—'}</strong></span>
                        <span>Локация: <strong className="text-fg-muted">{dev.locationName}</strong></span>
                      </div>
                      {dev.bonusCampaign && (
                        <p className="text-[10px] text-highlight mt-0.5">
                          {dev.bonusCampaign}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`text-xs font-bold font-mono ${dev.purchaseCostUsd === 0 ? 'text-highlight' : 'text-accent'}`}>
                        {dev.purchaseCostUsd === 0 ? '$0 (ПОДАРОК)' : `$${dev.purchaseCostUsd}`}
                      </span>
                      <span className={`block text-[10px] px-1.5 py-0.2 rounded-md font-bold mt-0.5 ${
                        dev.status === 'SOLD' ? 'text-warning' : 'text-fg-subtle'
                      }`}>
                        {dev.status === 'SOLD' ? 'ПРОДАН' : 'НА СКЛАДЕ'}
                      </span>
                    </div>
                  </div>
                );

                // Group devices by variant (brand/ram/storage/color) whenever the
                // invoice actually recorded groups at intake — otherwise a flat list
                // is just as informative and avoids grouping single-item invoices.
                const hasGroups = Array.isArray(selectedInvoice.groups) && selectedInvoice.groups.length > 0;
                const variantGroups = new Map<string, { brand: string; model: string; ram?: string; storage: string; color: string; devices: Device[] }>();
                if (hasGroups) {
                  for (const dev of containedDevices) {
                    const key = `${dev.brand}|${dev.model}|${dev.ram || ''}|${dev.storage}|${dev.color}`;
                    let g = variantGroups.get(key);
                    if (!g) {
                      g = { brand: dev.brand, model: dev.model, ram: dev.ram, storage: dev.storage, color: dev.color, devices: [] };
                      variantGroups.set(key, g);
                    }
                    g.devices.push(dev);
                  }
                }

                return (
                  <>
                    <div className="p-3 bg-surface-raised border-b border-border flex items-center justify-between text-xs font-mono font-bold text-fg-muted shrink-0">
                      <span>Устройства в накладной</span>
                      <span className="text-accent">
                        {containedDevices.length} шт.
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-surface font-mono">
                      {hasGroups && variantGroups.size > 0 ? (
                        Array.from(variantGroups.entries()).map(([key, group]) => {
                          const isExpanded = expandedDeviceGroups[key] ?? false;
                          const soldCount = group.devices.filter(d => d.status === 'SOLD').length;
                          return (
                            <div key={key} className="rounded-xl border border-border bg-surface-raised overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setExpandedDeviceGroups(prev => ({ ...prev, [key]: !isExpanded }))}
                                className="w-full p-2.5 flex items-center justify-between text-xs hover:bg-surface transition-colors"
                              >
                                <div className="text-left">
                                  <strong className="text-fg-muted">{group.brand} {group.model}</strong>
                                  <span className="text-fg-subtle text-[11px] ml-2">{group.ram ? `${group.ram} • ` : ''}{group.storage} • {group.color}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-accent font-bold">{group.devices.length} шт.</span>
                                  {soldCount > 0 && <span className="text-[10px] text-warning">({soldCount} продано)</span>}
                                  <ChevronRight className={`w-4 h-4 text-fg-subtle transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </div>
                              </button>
                              {isExpanded && (
                                <div className="p-2 pt-0 space-y-2 border-t border-border">
                                  {group.devices.map((dev, idx) => renderDeviceRow(dev, idx))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        containedDevices.map((dev, idx) => renderDeviceRow(dev, idx))
                      )}

                      {containedDevices.length === 0 && (
                        <p className="text-xs text-fg-subtle text-center py-6">
                          Устройства для этой архивной накладной были оприходованы ранее
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Modal Footer */}
              <div className="p-3 border-t border-border bg-surface flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedInvoiceId(null)}
                  className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted transition-colors font-mono "
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EDIT INVOICE MODAL */}
        {editingInvoiceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-2xl p-5 space-y-4 font-mono">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-xs font-bold text-fg-muted ">Редактирование накладной</h3>
                <button
                  type="button"
                  onClick={() => setEditingInvoiceModal(null)}
                  className="text-fg-subtle hover:text-fg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditInvoiceModal} className="space-y-3 text-xs">
                <div>
                  <label className="block text-fg-subtle text-[10px] mb-1">Номер накладной</label>
                  <input
                    type="text"
                    required
                    value={editInvoiceNum}
                    onChange={(e) => setEditInvoiceNum(e.target.value)}
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted font-bold focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle text-[10px] mb-1">Дата накладной</label>
                  <input
                    type="date"
                    required
                    value={editInvoiceDateStr}
                    onChange={(e) => setEditInvoiceDateStr(e.target.value)}
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle text-[10px] mb-1">Сумма накладной ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0"
                    value={editInvoiceAmountUsd}
                    onChange={(e) => setEditInvoiceAmountUsd(e.target.value)}
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent font-bold focus:border-accent focus:outline-none font-mono"
                  />
                </div>

                <div className="flex space-x-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setEditingInvoiceModal(null)}
                    className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg-muted font-bold disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isSubmitting ? 'СОХРАНЕНИЕ…' : 'СОХРАНИТЬ'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW: NEW PURCHASE FORM (ФОРМА НОВОГО ПРИХОДА)
  // =========================================================================
  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-y-auto bg-bg text-fg-muted min-h-0">
      <form onSubmit={handleSubmitPurchase} className="flex-1 flex flex-col min-h-full">
        {/* Top Header with Back Button */}
        <div className="p-3.5 sm:p-4 border-b border-border bg-surface space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  setStatusMessage(null);
                  setViewMode('list');
                }}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-muted hover:text-fg-muted text-xs font-bold transition-colors border border-border"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Список приходов</span>
              </button>
              <span className="text-fg-subtle">/</span>
              <h3 className="text-xs font-bold text-fg-muted tracking-wider">
                Новый приход товаров
              </h3>
            </div>
          </div>

          <div className="text-xs">
            <div>
              <label className="block text-fg-subtle mb-1 font-semibold">
                Поставщик <span className="text-danger">* (обязательно выберите)</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className={`w-full rounded-lg bg-surface-raised border px-3 py-2 text-xs font-semibold focus:outline-none transition-colors ${
                    !selectedSupplierId
                      ? 'border-amber-500/70 text-fg-subtle focus:border-accent'
                      : 'border-border text-fg-muted focus:border-accent'
                  }`}
                >
                  <option value="">-- Выберите поставщика (обязательно) --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} (Долг: ${s.totalDebtUsd})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(true)}
                  title="Добавить нового поставщика"
                  className="shrink-0 p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-accent hover:border-accent transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {!selectedSupplierId && (
                <p className="text-[11px] text-amber-500 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Поставщик не выбран. Обязательно выберите поставщика из списка перед продолжением.</span>
                </p>
              )}
            </div>
            {/* Номер накладной и дата прихода формируются автоматически (INV-XXXX, сегодня) — не требуют ввода */}
          </div>

          {/* Destination location selector */}
          <div className="pt-2 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-4">
              {currentUser?.role === 'ADMIN' && (
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dest"
                    checked={!isStorePurchase}
                    onChange={() => setIsStorePurchase(false)}
                    className="text-accent focus:ring-accent"
                  />
                  <span className="text-fg-muted font-medium">Приход на Центральный склад</span>
                </label>
              )}

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="dest"
                  checked={isStorePurchase}
                  onChange={() => setIsStorePurchase(true)}
                  className="text-accent focus:ring-accent"
                />
                <span className="text-fg-muted font-medium">Прямой приход в магазин</span>
              </label>
            </div>

            {isStorePurchase && (
              <div className="flex items-center space-x-2">
                <span className="text-fg-subtle">Магазин:</span>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="rounded-lg bg-surface-raised border border-border px-3 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                >
                  {stores.filter(s => !s.isMainWarehouse).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Groups list */}
        <div className="flex-1 p-3.5 sm:p-4 space-y-4 bg-bg pb-8">
          {groups.map((group, groupIdx) => (
            <div
              key={group.id}
              className="rounded-xl border border-border bg-surface shadow-xs p-3.5 sm:p-4 space-y-3 relative"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-fg-muted tracking-wider font-mono">
                    Позиция #{groupIdx + 1}
                  </span>
                  <label className={`flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none px-2.5 py-0.5 rounded-md border transition-all ${
                    group.isBonus
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-surface-raised text-fg-subtle border-border hover:text-fg-muted'
                  }`}>
                    <input
                      type="checkbox"
                      checked={Boolean(group.isBonus)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        handleUpdateGroup(groupIdx, 'isBonus', checked);
                        if (checked) {
                          handleUpdateGroup(groupIdx, 'purchasePriceUsd', 0);
                        }
                      }}
                      className="rounded border-border text-emerald-500 focus:ring-emerald-400 w-3.5 h-3.5"
                    />
                    <span>🎁 Бонусный товар (0$)</span>
                  </label>
                </div>

                {groups.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveGroup(groupIdx)}
                    className="text-fg-subtle hover:text-danger p-1 transition-colors"
                    title="Удалить позицию"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {group.isBonus && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono">
                  <span className="text-emerald-400 font-medium shrink-0">Акция / примечание:</span>
                  <input
                    type="text"
                    value={group.bonusCampaign || ''}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'bonusCampaign', e.target.value)}
                    placeholder="Бонус от поставщика / Акция 10+1..."
                    className="flex-1 rounded-md bg-surface-raised border border-border px-2.5 py-1 text-xs text-fg-muted focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Group Specs Form */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs font-mono">
                <div>
                  <label className="block text-fg-subtle mb-1">Бренд</label>
                  <Combobox
                    required
                    options={brandOptions}
                    value={group.brand}
                    onChange={(v) => handleUpdateGroup(groupIdx, 'brand', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="Apple"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Модель</label>
                  <Combobox
                    required
                    options={getModelOptions(group.brand)}
                    value={group.model}
                    onChange={(v) => handleUpdateGroup(groupIdx, 'model', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="iPhone 16 Pro"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">
                    RAM (ОЗУ) <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <Combobox
                    required
                    options={ramOptions}
                    value={group.ram || ''}
                    onChange={(v) => handleUpdateGroup(groupIdx, 'ram', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="8 GB"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Память</label>
                  <Combobox
                    options={storageOptions}
                    value={group.storage}
                    onChange={(v) => handleUpdateGroup(groupIdx, 'storage', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="256 GB"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Цвет</label>
                  <Combobox
                    options={colorOptions}
                    value={group.color}
                    onChange={(v) => handleUpdateGroup(groupIdx, 'color', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="Black Titanium"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">
                    {group.isBonus ? 'Цена закупки (Бонус)' : 'Цена закупки ($)'}
                  </label>
                  {group.isBonus ? (
                    <div className="w-full rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1.5 text-xs text-emerald-400 font-bold font-mono flex items-center justify-between">
                      <span>$0.00</span>
                      <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded">Бонус</span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={group.purchasePriceUsd || ''}
                      onChange={(e) => handleUpdateGroup(groupIdx, 'purchasePriceUsd', parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-accent font-bold focus:border-accent focus:outline-none font-mono"
                      placeholder="0"
                    />
                  )}
                </div>
              </div>

              {/* IMEI Input List with Batch Paste */}
              <div className="pt-2 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-fg-muted font-mono">
                      Список IMEI ({group.items.filter(i => i.imei.trim().length > 0).length} шт.)
                    </span>
                    <span className="text-[10px] text-fg-subtle font-mono">
                      Сумма: ${group.items.filter(i => i.imei.trim().length > 0).length * group.purchasePriceUsd}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleAddImeiToGroup(groupIdx)}
                      className="px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted text-xs font-mono font-medium flex items-center space-x-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Добавить устройство</span>
                    </button>
                  </div>
                </div>

                {/* Batch Paste text helper */}
                <div className="pt-1">
                  <input
                    type="text"
                    placeholder="Быстрая вставка списка IMEI (через пробел, запятую или Dual SIM: IMEI 1 / IMEI 2)..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBatchImeiPaste(groupIdx, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value.trim().length > 15) {
                        handleBatchImeiPaste(groupIdx, e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full rounded-lg bg-surface-raised border border-dashed border-border px-3 py-1 text-[11px] font-mono text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-1 font-mono">
                  {group.items.map((item, itemIdx) => {
                    const [imei1, imei2] = getImeiPair(item.imei);
                    return (
                      <div key={itemIdx} className="grid grid-cols-1 md:grid-cols-2 gap-2">

                        <div>
                          <label className="block text-fg-subtle mb-1">IMEI 1</label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              value={imei1}
                              onChange={(e) => handleUpdateImei(groupIdx, itemIdx, `${e.target.value} / ${imei2}`.replace(/ \/ $/, ''))}
                              placeholder="IMEI 1"
                              className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted font-mono focus:border-accent focus:outline-none pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => handleScanImei(groupIdx, itemIdx)}
                              className="absolute right-1.5 top-1.5 text-fg-subtle hover:text-accent p-0.5"
                              title="Сканировать IMEI 1"
                              aria-label="Сканировать IMEI 1"
                            >
                              <Scan className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <label className="block text-fg-subtle mb-1">IMEI 2 <span className="text-fg-subtle/70">(необязательно)</span></label>
                            <div className="relative">
                              <input
                                type="text"
                                value={imei2}
                                onChange={(e) => handleUpdateImei2(groupIdx, itemIdx, e.target.value)}
                                placeholder="IMEI 2 (необязательно)"
                                className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted font-mono focus:border-accent focus:outline-none pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => openScanner((scannedCode) => handleUpdateImei2(groupIdx, itemIdx, scannedCode))}
                                className="absolute right-1.5 top-1.5 text-fg-subtle hover:text-accent p-0.5"
                                title="Сканировать IMEI 2"
                                aria-label="Сканировать IMEI 2"
                              >
                                <Scan className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {group.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveImeiFromGroup(groupIdx, itemIdx)}
                              className="text-fg-subtle hover:text-danger p-1"
                              title="Удалить устройство"
                              aria-label="Удалить устройство"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Button to add another position */}
          <button
            type="button"
            onClick={handleAddGroup}
            className="w-full py-2.5 rounded-xl border border-dashed border-border hover:border-accent bg-surface-raised hover:bg-surface text-fg-muted hover:text-accent text-xs font-mono font-bold flex items-center justify-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить модель</span>
          </button>
        </div>

        {/* Bottom Actions & Total Bar (Sticky at bottom) */}
        <div className="sticky bottom-0 z-20 p-3.5 sm:p-4 border-t border-border bg-surface/95 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-lg font-mono">
          {statusMessage ? (
            <div className={`flex items-center space-x-2 text-xs ${
              statusMessage.type === 'success' ? 'text-accent' : 'text-danger'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{statusMessage.text}</span>
            </div>
          ) : (
            <div className="text-xs text-fg-subtle">
              Позиций: <strong className="text-fg-muted">{groups.length}</strong> • 
              Устройств: <strong className="text-accent font-bold text-sm ml-1">{totalFormUnits} шт.</strong>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <div className="text-left mr-auto sm:mr-2">
              <span className="text-[10px] text-fg-subtle block font-medium">Итого</span>
              <span className="text-base font-bold text-accent font-mono">
                ${totalFormUsd.toLocaleString()}
              </span>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setStatusMessage(null);
                setViewMode('list');
              }}
              className="px-3 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-muted text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={totalFormUnits === 0 || isSubmitting}
              className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-accent-fg shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <FileText className="w-4 h-4" />
              <span>Просмотреть чек</span>
            </button>
          </div>
        </div>
      </form>

      {/* Receipt Preview Modal — shown before the invoice/devices are actually saved */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono">
          <div className="w-full max-w-lg rounded-2xl bg-surface border border-border shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-accent/15 text-accent border border-accent/30">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-fg-muted ">Чек прихода — проверьте перед сохранением</h3>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPreviewInvoice(null)}
                className="p-1 rounded text-fg-subtle hover:text-fg-muted disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-raised border border-border">
                <div>
                  <span className="block text-[10px] text-fg-subtle">Поставщик</span>
                  <span className="font-bold text-fg-muted">{suppliers.find(s => s.id === previewInvoice.supplierId)?.name || '—'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-fg-subtle">Накладная</span>
                  <span className="font-bold text-fg-muted">{previewInvoice.invoiceNumber}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-fg-subtle">Дата</span>
                  <span className="font-bold text-fg-muted">{previewInvoice.date}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-fg-subtle">Назначение</span>
                  <span className="font-bold text-fg-muted">
                    {previewInvoice.isStorePurchase
                      ? (stores.find(s => s.id === previewInvoice.storeId)?.name || 'Магазин')
                      : 'Главный склад'}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {previewInvoice.groups.map((g, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-fg-muted truncate">{g.brand} {g.model}</p>
                        {g.isBonus && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                            БОНУС (0$)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-fg-muted mt-0.5">{[g.ram, g.storage, g.color].filter(Boolean).join(' • ')}</p>
                      <p className="text-[10px] text-fg-subtle mt-0.5">
                        {g.items.length} шт. {g.isBonus ? '• Бесплатно (подарок)' : `× $${g.purchasePriceUsd}`}
                        {g.bonusCampaign ? ` • ${g.bonusCampaign}` : ''}
                      </p>
                    </div>
                    <span className="font-bold text-accent shrink-0">
                      {g.isBonus ? '$0' : `$${(g.items.length * g.purchasePriceUsd).toLocaleString()}`}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border">
                <span className="text-fg-muted">
                  Устройств: <strong className="text-fg-muted">{previewInvoice.groups.reduce((a, b) => a + b.items.length, 0)} шт.</strong>
                </span>
                <span className="text-sm font-bold text-accent">
                  ${previewInvoice.groups.reduce((a, b) => a + b.items.length * b.purchasePriceUsd, 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex space-x-2 p-4 border-t border-border shrink-0">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPreviewInvoice(null)}
                className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg-muted font-bold disabled:opacity-50"
              >
                Изменить
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmSavePurchase}
                className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {isSubmitting ? 'СОХРАНЕНИЕ…' : 'ПОДТВЕРДИТЬ И СОХРАНИТЬ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {editingInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-accent/15 text-accent border border-accent/30">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-fg-muted ">Редактировать накладную</h3>
              </div>
              <button onClick={() => setEditingInvoiceModal(null)} className="p-1 rounded text-fg-subtle hover:text-fg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditInvoiceModal} className="space-y-3 text-xs">
              <div>
                <label className="block text-fg-subtle text-[10px] mb-1">Номер накладной</label>
                <input
                  type="text"
                  required
                  value={editInvoiceNum}
                  onChange={(e) => setEditInvoiceNum(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted font-bold focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle text-[10px] mb-1">Дата накладной</label>
                <input
                  type="date"
                  required
                  value={editInvoiceDateStr}
                  onChange={(e) => setEditInvoiceDateStr(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle text-[10px] mb-1">Сумма накладной ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={editInvoiceAmountUsd}
                  onChange={(e) => setEditInvoiceAmountUsd(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent font-bold focus:border-accent focus:outline-none font-mono"
                />
              </div>

              <div className="flex space-x-2 pt-3 border-t border-border">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingInvoiceModal(null)}
                  className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg-muted font-bold disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? 'СОХРАНЕНИЕ…' : 'СОХРАНИТЬ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 shadow-2xl text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-sm font-bold text-fg-muted flex items-center space-x-2">
                <Building className="w-4 h-4 text-accent" />
                <span>Добавить нового поставщика</span>
              </h3>
              <button
                onClick={() => setIsAddSupplierOpen(false)}
                className="p-1 rounded text-fg-subtle hover:text-fg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSupplierSubmit} className="space-y-4">
              <div>
                <label className="block text-fg-subtle mb-1">Название поставщика *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Например: Xiaomi Tech Hub"
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle mb-1">Контактное лицо</label>
                <input
                  type="text"
                  value={newSupplierContact}
                  onChange={(e) => setNewSupplierContact(e.target.value)}
                  placeholder="Фарход"
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle mb-1">Телефон</label>
                <input
                  type="tel"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  placeholder="+992 90 000 0000"
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingSupplier}
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSavingSupplier && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSavingSupplier ? 'СОХРАНЕНИЕ…' : 'ДОБАВИТЬ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
