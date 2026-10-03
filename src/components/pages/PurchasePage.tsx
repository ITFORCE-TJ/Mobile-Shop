import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { decimal, moneyNumber, formatMoney } from '../../utils/money';
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
  Building,
  Calendar,
  Hash,
  DollarSign,
  Check,
  Receipt,
  Smartphone,
  Clock,
  Sparkles,
  Copy,
  MapPin
} from 'lucide-react';
import { getPhoneColorHex, formatRam, formatStorage } from '../../utils/phoneSpecs';
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

const formatInvoiceDate = (dateVal?: string): string => {
  if (!dateVal) return '-';
  try {
    const clean = dateVal.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return clean;
  } catch {
    return dateVal;
  }
};

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
  const [copiedImei, setCopiedImei] = useState<string | null>(null);

  const handleCopyText = (text: string) => {
    if (!text || text === '—') return;
    navigator.clipboard?.writeText(text);
    setCopiedImei(text);
    setTimeout(() => {
      setCopiedImei(prev => (prev === text ? null : prev));
    }, 2000);
  };

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
        <div className="p-2.5 sm:p-3 border-b border-border bg-surface space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Compact Search Bar with Scanner inside right corner */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск: № накладной / IMEI..."
                className="w-full rounded-xl bg-surface-raised border border-border pl-8 pr-8 py-1.5 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                  title="Очистить"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleScanFinder}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-accent hover:text-accent-strong p-0.5 transition-colors cursor-pointer"
                  title="Сканировать IMEI или номер накладной"
                >
                  <Scan className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* New Purchase button right next to search */}
            <button
              type="button"
              onClick={() => {
                setStatusMessage(null);
                setSelectedSupplierId('');
                setViewMode('form');
              }}
              className="shrink-0 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-accent-fg font-semibold text-xs flex items-center gap-1 transition-all shadow-xs whitespace-nowrap min-h-[32px] sm:min-h-[34px] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span><span className="hidden sm:inline">Новый </span>приход</span>
            </button>
          </div>

          {/* Period selector & Supplier Filter */}
          <div className="flex items-center justify-between gap-1.5 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <MonthPicker
                value={selectedMonth}
                onChange={setSelectedMonth}
                className="h-7 px-2.5 rounded-xl border border-accent text-accent text-xs font-semibold bg-surface focus:outline-none cursor-pointer"
              />

              <select
                value={selectedSupplierFilter}
                onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                className="h-7 bg-surface border border-border text-fg text-xs font-semibold rounded-xl px-2.5 py-0.5 focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="all">Все поставщики</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              {(searchQuery || selectedSupplierFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSupplierFilter('all');
                  }}
                  className="p-1 text-fg-subtle hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer"
                  title="Сбросить фильтры"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Metrics Strip */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] text-fg-subtle font-mono">
              <span>{filteredInvoices.length} накл.</span>
              <span>·</span>
              <span className="text-accent font-bold">
                {filteredInvoices.reduce((sum, inv) => sum + (inv.devicesCount || 0), 0)} шт
              </span>
              <span>·</span>
              <span className="font-bold text-fg">
                ${filteredInvoices.reduce((sum, inv) => sum + (inv.totalAmountUsd || 0), 0).toLocaleString()}
              </span>
              {filteredInvoices.reduce((sum, inv) => sum + (inv.remainingAmountUsd || 0), 0) > 0 && (
                <>
                  <span>·</span>
                  <span className="text-danger font-semibold whitespace-nowrap">
                    Долг: ${filteredInvoices.reduce((sum, inv) => sum + (inv.remainingAmountUsd || 0), 0).toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Invoices List / Table */}
        <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
          {filteredInvoices.length === 0 ? (
            <div className="p-10 text-center text-fg-subtle">
              <Package className="w-9 h-9 mx-auto mb-2 opacity-40 text-fg-subtle" />
              <p className="text-xs font-medium text-fg">Приходы не найдены</p>
              <p className="text-[11px] mt-1 text-fg-subtle">
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
                  className={`p-2.5 sm:p-3 hover:bg-surface-raised/80 cursor-pointer transition-colors flex flex-col gap-1.5 ${
                    isJustSaved ? 'bg-accent/15 border-l-4 border-l-accent' : ''
                  }`}
                >
                  {/* Row 1: Document + Status + Amount + Chevron */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                        isPaid ? 'bg-accent/10 border-accent/25 text-accent' :
                        isPartial ? 'bg-warning/10 border-warning/25 text-warning' :
                        'bg-danger/10 border-danger/25 text-danger'
                      }`}>
                        <FileText className="w-3.5 h-3.5" />
                      </div>

                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold font-mono text-fg truncate">
                          {inv.invoiceNumber}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold border ${
                          isPaid ? 'bg-accent/15 text-accent border-accent/30' :
                          isPartial ? 'bg-warning/15 text-warning border-warning/30' :
                          'bg-danger/15 text-danger border-danger/30'
                        }`}>
                          {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                        </span>
                        {(inv.totalAmountUsd === 0 || inv.invoiceNumber.includes('BONUS')) && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md font-medium bg-highlight/20 text-highlight border border-highlight/40">
                            🎁 Подарок ($0)
                          </span>
                        )}
                        {isJustSaved && (
                          <span className="text-[9px] bg-accent text-accent-fg px-1.5 py-0.2 rounded font-bold">
                            Новое
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount & Debt & Chevron */}
                    <div className="text-right shrink-0 flex items-center gap-1.5">
                      <div className="flex flex-col items-end">
                        <span className="text-xs sm:text-sm font-bold font-mono text-fg leading-tight">
                          {inv.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(inv.totalAmountUsd || 0).toLocaleString()}`}
                        </span>
                        {inv.remainingAmountUsd > 0 ? (
                          <span className="text-[10px] text-danger font-mono font-bold">
                            долг ${inv.remainingAmountUsd.toLocaleString()}
                          </span>
                        ) : inv.totalAmountUsd > 0 ? (
                          <span className="text-[10px] text-fg-subtle font-mono">
                            ~{Math.round((inv.totalAmountUsd || 0) * inv.exchangeRate).toLocaleString()} TJS
                          </span>
                        ) : null}
                      </div>
                      <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" />
                    </div>
                  </div>

                  {/* Row 2: Metadata (Supplier, Date, Store) + Units + Edit/Delete */}
                  <div className="flex items-center justify-between gap-2 text-[11px] text-fg-subtle pl-9">
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <span className="text-fg-muted font-semibold flex items-center gap-1 shrink-0">
                        <Truck className="w-3 h-3 text-fg-subtle" />
                        <span className="truncate max-w-[120px] sm:max-w-none">{inv.supplierName}</span>
                      </span>
                      <span>•</span>
                      <span className="shrink-0">{formatInvoiceDate(inv.date)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5 text-fg-muted shrink-0 truncate">
                        <StoreIcon className="w-3 h-3 text-fg-subtle" />
                        <span className="truncate max-w-[110px] sm:max-w-none">{locationLabel}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-accent font-bold font-mono">{inv.devicesCount || 0} шт.</span>

                      {/* Quick Edit/Delete */}
                      {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleStartEditInvoiceModal(inv)}
                            className="p-1 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-accent border border-border transition-colors cursor-pointer"
                            title="Редактировать накладную"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoiceModal(inv.id)}
                            className="p-1 rounded-lg bg-surface-raised hover:bg-danger/20 text-fg-subtle hover:text-danger border border-border transition-colors cursor-pointer"
                            title="Удалить накладную"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* INVOICE DETAILS MODAL */}
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-3xl rounded-2xl bg-surface border border-border/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-border/70 bg-surface flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0 shadow-2xs">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-fg flex items-center gap-2">
                        <span>Накладная #{selectedInvoice.invoiceNumber}</span>
                      </h3>
                      {(selectedInvoice.totalAmountUsd === 0 || selectedInvoice.invoiceNumber.includes('BONUS')) ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-highlight/20 text-highlight border border-highlight/40 font-bold">
                          🎯 Target Bonus ($0)
                        </span>
                      ) : selectedInvoice.remainingAmountUsd === 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Оплачена
                        </span>
                      ) : (selectedInvoice.paidAmountUsd || 0) > 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Частично
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Не оплачена
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg-subtle mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>Поставщик: <strong className="text-fg font-semibold">{selectedInvoice.supplierName || 'Поставщик'}</strong></span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-fg-subtle" />
                        {formatInvoiceDate(selectedInvoice.date)}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartEditInvoiceModal(selectedInvoice)}
                        className="p-2 rounded-xl bg-surface-raised hover:bg-surface text-fg-subtle hover:text-accent border border-border/80 transition-colors cursor-pointer shadow-2xs"
                        title="Редактировать накладную"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInvoiceModal(selectedInvoice.id)}
                        className="p-2 rounded-xl bg-surface-raised hover:bg-danger/20 text-fg-subtle hover:text-danger border border-border/80 transition-colors cursor-pointer shadow-2xs"
                        title="Удалить накладную"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedInvoiceId(null)}
                    className="p-2 rounded-xl bg-surface-raised hover:bg-surface text-fg-subtle hover:text-fg border border-border/80 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Financial Breakdown Cards */}
              <div className="p-3.5 sm:p-4 bg-surface-raised/40 border-b border-border/70 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
                {/* Total Card */}
                <div className="p-3 rounded-xl bg-surface border border-border/80 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                      Сумма накладной
                    </span>
                    <strong className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${selectedInvoice.totalAmountUsd === 0 ? "text-highlight" : "text-fg"}`}>
                      {selectedInvoice.totalAmountUsd === 0 ? '$0.00 (БОНУС)' : `$${formatMoney(selectedInvoice.totalAmountUsd)}`}
                    </strong>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-fg-subtle shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>

                {/* Paid Card */}
                <div className="p-3 rounded-xl bg-surface border border-border/80 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                      Оплачено
                    </span>
                    <strong className="text-sm sm:text-base font-bold font-mono text-accent mt-0.5 block">
                      ${formatMoney(selectedInvoice.paidAmountUsd)}
                    </strong>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-center text-accent shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>

                {/* Debt Card */}
                <div className="p-3 rounded-xl bg-surface border border-border/80 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
                      Остаток долга
                    </span>
                    <strong className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${(selectedInvoice.remainingAmountUsd || 0) > 0 ? "text-danger" : "text-fg-subtle"}`}>
                      ${formatMoney(selectedInvoice.remainingAmountUsd)}
                    </strong>
                  </div>
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                    (selectedInvoice.remainingAmountUsd || 0) > 0 ? "bg-danger/10 border-danger/25 text-danger" : "bg-surface-raised border-border text-fg-subtle"
                  }`}>
                    <AlertCircle className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Invoice Groups (Summary of positions) */}
              {selectedInvoice.groups && selectedInvoice.groups.length > 0 && (
                <div className="p-3.5 sm:p-4 bg-surface-raised/30 border-b border-border/70 space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-xs font-bold text-fg-muted">
                    <span className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-accent" />
                      <span>Позиции по накладной</span>
                    </span>
                    <span className="text-[11px] font-mono text-fg-subtle">
                      Всего: {selectedInvoice.groups.reduce((acc: number, g: any) => acc + (g.quantity || 0), 0)} шт.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {selectedInvoice.groups.map((grp: any, gIdx: number) => {
                      const colorHex = getPhoneColorHex(grp.color);
                      const formattedR = formatRam(grp.ram);
                      const formattedS = formatStorage(grp.storage);
                      return (
                        <div
                          key={gIdx}
                          className="p-3 rounded-xl bg-surface border border-border/80 shadow-2xs hover:border-accent/40 transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-accent shrink-0">
                              <Smartphone className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-fg text-xs truncate">
                                {grp.brand} {grp.model}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                {formattedS && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-[10px] font-bold font-mono text-fg">
                                    {formattedS}
                                  </span>
                                )}
                                {formattedR && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent">
                                    ОЗУ {formattedR}
                                  </span>
                                )}
                                {grp.color && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/60 text-[10px] text-fg-muted">
                                    {colorHex && (
                                      <span
                                        className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                        style={{ backgroundColor: colorHex }}
                                      />
                                    )}
                                    <span>{grp.color}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold font-mono text-accent text-xs block">
                              {grp.quantity} шт.
                            </span>
                            <span className="text-[10px] font-mono text-fg-subtle block">
                              ${formatMoney(grp.purchasePriceUsd)} / шт.
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contained Devices List */}
              {(() => {
                const containedDevices = devices.filter(d =>
                  (selectedInvoice.id && d.purchaseInvoiceId === selectedInvoice.id) ||
                  d.invoiceNumber === selectedInvoice.invoiceNumber
                );

                const renderDeviceRow = (dev: Device, idx: number) => {
                  const colorHex = getPhoneColorHex(dev.color);
                  const formattedR = formatRam(dev.ram);
                  const formattedS = formatStorage(dev.storage);

                  return (
                    <div
                      key={dev.id}
                      className="p-2.5 sm:p-3 rounded-xl bg-surface border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs hover:border-accent/40 transition-colors shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-fg-subtle text-[10px] font-bold font-mono">#{idx + 1}</span>
                          <strong className="text-fg font-bold text-xs">{dev.brand} {dev.model}</strong>
                          {formattedS && (
                            <span className="px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-[10px] font-bold font-mono text-fg">
                              {formattedS}
                            </span>
                          )}
                          {formattedR && (
                            <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent">
                              ОЗУ {formattedR}
                            </span>
                          )}
                          {dev.color && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/60 text-[10px] text-fg-muted">
                              {colorHex && (
                                <span
                                  className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: colorHex }}
                                />
                              )}
                              <span>{dev.color}</span>
                            </span>
                          )}
                          {(dev.purchaseCostUsd === 0 || dev.isBonus) && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-highlight/20 text-highlight border border-highlight/40 font-bold flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              Подарок ($0)
                            </span>
                          )}
                        </div>

                        {/* IMEI & Location Info */}
                        <div className="text-[11px] text-fg-subtle mt-1.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyText(dev.imei)}
                            title="Скопировать IMEI"
                            className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-raised border border-border/80 hover:border-accent/50 text-[10px] font-mono text-fg-muted hover:text-fg transition-all cursor-pointer"
                          >
                            <span className="text-[9px] text-fg-subtle font-sans">IMEI:</span>
                            <span className="font-bold text-fg">{dev.imei}</span>
                            {copiedImei === dev.imei ? (
                              <span className="text-accent flex items-center gap-0.5 text-[9px] font-sans font-bold">
                                <Check className="w-2.5 h-2.5" />
                                <span>Скопировано</span>
                              </span>
                            ) : (
                              <Copy className="w-2.5 h-2.5 text-fg-subtle group-hover:text-accent transition-colors opacity-70 group-hover:opacity-100" />
                            )}
                          </button>

                          {dev.imei2 && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(dev.imei2!)}
                              title="Скопировать IMEI 2"
                              className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-raised border border-border/80 hover:border-accent/50 text-[10px] font-mono text-fg-muted hover:text-fg transition-all cursor-pointer"
                            >
                              <span className="text-[9px] text-fg-subtle font-sans">IMEI 2:</span>
                              <span className="font-bold text-fg">{dev.imei2}</span>
                              {copiedImei === dev.imei2 ? (
                                <span className="text-accent flex items-center gap-0.5 text-[9px] font-sans font-bold">
                                  <Check className="w-2.5 h-2.5" />
                                </span>
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-fg-subtle group-hover:text-accent transition-colors opacity-70 group-hover:opacity-100" />
                              )}
                            </button>
                          )}

                          <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle bg-surface-raised px-2 py-0.5 rounded-md border border-border/60">
                            <MapPin className="w-2.5 h-2.5 text-accent" />
                            <span>{dev.locationName}</span>
                          </span>
                        </div>

                        {dev.bonusCampaign && (
                          <p className="text-[10px] text-highlight mt-1 font-medium">
                            {dev.bonusCampaign}
                          </p>
                        )}
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/50">
                        <span className={`text-xs font-bold font-mono ${dev.purchaseCostUsd === 0 ? 'text-highlight' : 'text-accent'}`}>
                          {dev.purchaseCostUsd === 0 ? '$0 (Подарок)' : `$${formatMoney(dev.purchaseCostUsd)}`}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          dev.status === 'SOLD'
                            ? 'bg-warning/15 text-warning border-warning/30'
                            : 'bg-accent/15 text-accent border-accent/30'
                        }`}>
                          {dev.status === 'SOLD' ? 'Продан' : 'На складе'}
                        </span>
                      </div>
                    </div>
                  );
                };

                const hasGroups = Array.isArray(selectedInvoice.groups) && selectedInvoice.groups.length > 0;
                const variantGroups = new Map<string, { brand: string; model: string; ram?: string; storage: string; color: string; devices: typeof containedDevices }>();
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
                    <div className="p-3 sm:p-3.5 bg-surface-raised/50 border-b border-border/70 flex items-center justify-between text-xs font-bold text-fg-muted shrink-0">
                      <span className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-accent" />
                        <span>Устройства в накладной</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-surface border border-border font-bold font-mono text-accent text-xs">
                        {containedDevices.length} шт.
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 bg-surface-raised/20">
                      {containedDevices.length === 0 ? (
                        <div className="p-8 text-center text-fg-subtle text-xs">
                          Устройства для этой архивной накладной были оприходованы ранее
                        </div>
                      ) : hasGroups && variantGroups.size > 0 ? (
                        Array.from(variantGroups.entries()).map(([key, group]) => {
                          const isExpanded = expandedDeviceGroups[key] ?? false;
                          const soldCount = group.devices.filter(d => d.status === 'SOLD').length;
                          const colorHex = getPhoneColorHex(group.color);
                          const formattedR = formatRam(group.ram);
                          const formattedS = formatStorage(group.storage);

                          return (
                            <div key={key} className="rounded-xl border border-border/80 bg-surface overflow-hidden shadow-2xs">
                              <button
                                type="button"
                                onClick={() => setExpandedDeviceGroups(prev => ({ ...prev, [key]: !isExpanded }))}
                                className="w-full p-3 flex items-center justify-between text-xs hover:bg-surface-raised/60 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5 text-left min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-accent shrink-0">
                                    <Smartphone className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <strong className="text-fg font-bold text-xs">{group.brand} {group.model}</strong>
                                      {formattedS && (
                                        <span className="px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-[10px] font-bold font-mono text-fg">
                                          {formattedS}
                                        </span>
                                      )}
                                      {formattedR && (
                                        <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent">
                                          ОЗУ {formattedR}
                                        </span>
                                      )}
                                      {group.color && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/60 text-[10px] text-fg-muted">
                                          {colorHex && (
                                            <span
                                              className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                              style={{ backgroundColor: colorHex }}
                                            />
                                          )}
                                          <span>{group.color}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0 ml-2">
                                  <span className="text-accent font-bold font-mono text-xs">{group.devices.length} шт.</span>
                                  {soldCount > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-warning/15 text-warning font-semibold">
                                      {soldCount} продано
                                    </span>
                                  )}
                                  <div className={`p-1 rounded-md text-fg-subtle transition-transform duration-200 ${isExpanded ? 'rotate-90 text-accent' : ''}`}>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </div>
                                </div>
                              </button>
                              {isExpanded && (
                                <div className="p-3 pt-0 space-y-2 border-t border-border/60 bg-surface-raised/40">
                                  {group.devices.map((dev, idx) => renderDeviceRow(dev, idx))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        containedDevices.map((dev, idx) => renderDeviceRow(dev, idx))
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Modal Footer */}
              <div className="p-3.5 sm:p-4 bg-surface border-t border-border/70 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceId(null)}
                  className="px-5 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted hover:text-fg transition-all cursor-pointer min-h-[38px]"
                >
                  Закрыть
                </button>
              </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border/80 p-5 sm:p-6 text-fg-muted shadow-2xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0 shadow-2xs">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-fg">
                    Редактировать накладную
                  </h3>
                  <p className="text-[11px] text-fg-subtle">
                    Изменение номера, даты и суммы закупки
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvoiceModal(null)}
                className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Context Card */}
            <div className="p-3 rounded-xl bg-surface-raised/60 border border-border/80 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                  Накладная
                </div>
                <div className="font-bold font-mono text-fg truncate">
                  #{editingInvoiceModal.invoiceNumber}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                  Устройств в партии
                </div>
                <div className="font-bold font-mono text-accent">
                  {editingInvoiceModal.devicesCount || 0} шт.
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveEditInvoiceModal} className="space-y-3.5">
              {/* Invoice Number */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5 flex items-center justify-between">
                  <span>Номер накладной</span>
                  <span className="text-[10px] text-accent font-semibold font-mono">Обязательно</span>
                </label>
                <div className="relative">
                  <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                    <Hash className="w-4 h-4 text-accent" />
                  </div>
                  <input
                    type="text"
                    required
                    value={editInvoiceNum}
                    onChange={(e) => setEditInvoiceNum(e.target.value)}
                    placeholder="Например, INV-0022"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-raised border border-border text-xs sm:text-sm font-bold font-mono text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                  />
                </div>
              </div>

              {/* Invoice Date */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5 flex items-center justify-between">
                  <span>Дата накладной</span>
                  <span className="text-[10px] text-fg-subtle font-mono">ГГГГ-ММ-ДД</span>
                </label>
                <div className="relative">
                  <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                    <Calendar className="w-4 h-4 text-accent" />
                  </div>
                  <input
                    type="date"
                    required
                    value={editInvoiceDateStr}
                    onChange={(e) => setEditInvoiceDateStr(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-raised border border-border text-xs sm:text-sm font-semibold text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                  />
                </div>
              </div>

              {/* Invoice Amount */}
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5 flex items-center justify-between">
                  <span>Сумма накладной ($ USD)</span>
                  <span className="text-[10px] text-fg-subtle font-mono">USD</span>
                </label>
                <div className="relative">
                  <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                    <DollarSign className="w-4 h-4 text-accent" />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0"
                    value={editInvoiceAmountUsd}
                    onChange={(e) => setEditInvoiceAmountUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-14 py-2.5 rounded-xl bg-surface-raised border border-border text-sm sm:text-base font-bold font-mono text-accent focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md bg-surface border border-border text-[10px] font-bold font-mono text-fg-subtle pointer-events-none">
                    USD
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-2 flex items-center gap-2.5 border-t border-border/70">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingInvoiceModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted hover:text-fg transition-all cursor-pointer min-h-[40px] disabled:opacity-50 flex items-center justify-center"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg shadow-xs hover:shadow-md transition-all cursor-pointer min-h-[40px] disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Сохранение…</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Сохранить</span>
                    </>
                  )}
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
