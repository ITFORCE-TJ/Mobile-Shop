import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { decimal, moneyNumber } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { SupplierInvoice } from '../../types';
import { soundEffects } from '../../utils/sound';
import { getBusinessDateKey } from '../../utils/businessDate';
import { useUnfinishedWork } from '../../utils/pwaUpdateSafety';

import {
  PurchaseItemGroup,
  PurchasePreviewGroup,
  PurchasePreviewData,
  getImeiPair,
} from '../purchase/types';
import { AddSupplierModal } from '../purchase/AddSupplierModal';
import { EditInvoiceModal } from '../purchase/EditInvoiceModal';
import { ReceiptPreviewModal } from '../purchase/ReceiptPreviewModal';
import { InvoiceDetailsModal } from '../purchase/InvoiceDetailsModal';
import { PurchaseHistoryList } from '../purchase/PurchaseHistoryList';
import { NewPurchaseForm } from '../purchase/NewPurchaseForm';

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
    openScanner,
  } = useAppFields(
    'currentUser',
    'suppliers',
    'stores',
    'supplierInvoices',
    'devices',
    'findDevicesByInvoice',
    'findDeviceByImei',
    'fetchInvoicesRange',
    'createPurchase',
    'updateSupplierInvoice',
    'deleteSupplierInvoice',
    'createSupplier',
    'openScanner'
  );

  // Edit Invoice Modal state
  const [editingInvoiceModal, setEditingInvoiceModal] = useState<SupplierInvoice | null>(null);

  // Mode: 'list' (History of purchases) or 'form' (Register new purchase intake)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  useUnfinishedWork(viewMode === 'form', 'Незавершённый приход');

  // List search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const selectedInvoice = supplierInvoices.find((inv) => inv.id === selectedInvoiceId) || null;

  // Invoice devices fetching
  useEffect(() => {
    if (!selectedInvoiceId) return;
    let cancelled = false;
    findDevicesByInvoice(selectedInvoiceId).catch((e) => {
      if (!cancelled) console.error('Failed to load invoice devices', e);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedInvoiceId, findDevicesByInvoice]);

  // Invoice range fetching for selected period
  useEffect(() => {
    let cancelled = false;
    fetchInvoicesRange({
      period: 'SPECIFIC_MONTH',
      month: selectedMonth,
    }).catch((e) => {
      if (!cancelled) console.error('Failed to load invoices for period', e);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, fetchInvoicesRange, dataRefreshRevision]);

  // Form states - no default supplier, must be selected explicitly
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  // Inline "add new supplier"
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  // Auto-generate sequential invoice number
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    return `INV-${((supplierInvoices?.length || 0) + 1).toString().padStart(4, '0')}`;
  });

  // If the currently selected supplier is deleted, clear selection
  useEffect(() => {
    if (selectedSupplierId && !suppliers.some((s) => s.id === selectedSupplierId)) {
      setSelectedSupplierId('');
    }
  }, [suppliers, selectedSupplierId]);

  useEffect(() => {
    if (supplierInvoices) {
      setInvoiceNumber(`INV-${(supplierInvoices.length + 1).toString().padStart(4, '0')}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierInvoices?.length]);

  const [purchaseDate] = useState<string>(getBusinessDateKey());

  // Destination mode (Main Warehouse intake is ADMIN ONLY)
  const [isStorePurchase, setIsStorePurchase] = useState<boolean>(currentUser?.role !== 'ADMIN');
  const [storeId, setStoreId] = useState<string>(stores.find((s) => !s.isMainWarehouse)?.id || 'store-1');

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
      items: [{ imei: '' }],
    },
  ]);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSavedInvoice, setJustSavedInvoice] = useState<string | null>(null);

  // Autocomplete suggestion lists derived from database devices and standard presets
  const brandOptions = useMemo(() => {
    const set = new Set<string>(['Apple', 'Samsung', 'Xiaomi', 'Google', 'OnePlus', 'Honor', 'Realme', 'Huawei', 'Nothing']);
    (devices || []).forEach((d) => {
      if (d.brand) set.add(d.brand.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const getModelOptions = useCallback(
    (selectedBrand: string) => {
      const set = new Set<string>();
      const brandLower = (selectedBrand || '').trim().toLowerCase();
      (devices || []).forEach((d) => {
        if (d.model && (!brandLower || (d.brand && d.brand.toLowerCase() === brandLower))) {
          set.add(d.model.trim());
        }
      });
      return Array.from(set).sort();
    },
    [devices]
  );

  const ramOptions = useMemo(() => {
    const set = new Set<string>(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB']);
    (devices || []).forEach((d) => {
      if (d.ram) set.add(d.ram.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const storageOptions = useMemo(() => {
    const set = new Set<string>(['64 GB', '128 GB', '256 GB', '512 GB', '1 TB']);
    (devices || []).forEach((d) => {
      if (d.storage) set.add(d.storage.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>([
      'Black',
      'White',
      'Titanium',
      'Natural Titanium',
      'Black Titanium',
      'Desert Titanium',
      'Midnight',
      'Starlight',
      'Silver',
      'Gold',
      'Blue',
      'Graphite',
      'Purple',
      'Green',
    ]);
    (devices || []).forEach((d) => {
      if (d.color) set.add(d.color.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  // Filtered list of purchase invoices
  const filteredInvoices = useMemo(() => {
    return (supplierInvoices || [])
      .filter((inv) => {
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

        // 3. Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesInvoiceNum = inv.invoiceNumber.toLowerCase().includes(q);
          const matchesSupplier = inv.supplierName.toLowerCase().includes(q);

          const invoiceDevices = devices.filter(
            (d) => d.invoiceNumber === inv.invoiceNumber || (inv.id && d.purchaseInvoiceId === inv.id)
          );
          const matchesDevice = invoiceDevices.some(
            (d) =>
              d.imei.toLowerCase().includes(q) ||
              (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
              d.model.toLowerCase().includes(q) ||
              d.brand.toLowerCase().includes(q)
          );

          if (!matchesInvoiceNum && !matchesSupplier && !matchesDevice) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [supplierInvoices, devices, selectedMonth, selectedSupplierFilter, searchQuery]);

  // Scan finder to locate purchase
  const handleScanFinder = () => {
    openScanner(async (scannedCode) => {
      const code = scannedCode.trim();
      let matchedDevice = devices.find((d) => d.imei === code || d.imei2 === code);
      if (!matchedDevice) {
        try {
          [matchedDevice] = await findDeviceByImei(code);
        } catch {
          // fall through
        }
      }
      if (matchedDevice && matchedDevice.invoiceNumber) {
        let matchedInv = supplierInvoices.find((inv) => inv.invoiceNumber === matchedDevice!.invoiceNumber);
        if (!matchedInv) {
          try {
            const found = await fetchInvoicesRange({ search: matchedDevice.invoiceNumber });
            matchedInv = found.find((inv) => inv.invoiceNumber === matchedDevice!.invoiceNumber);
          } catch {
            // fall through
          }
        }
        if (matchedInv) {
          setSelectedInvoiceId(matchedInv.id);
          return;
        }
      }

      let directInv = supplierInvoices.find((inv) => inv.invoiceNumber.toLowerCase() === code.toLowerCase());
      if (!directInv) {
        try {
          const found = await fetchInvoicesRange({ search: code });
          directInv = found.find((inv) => inv.invoiceNumber.toLowerCase() === code.toLowerCase());
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

  const handleSaveEditInvoice = async (
    id: string,
    data: { invoiceNumber: string; date: string; totalAmountUsd: number }
  ) => {
    const res = await updateSupplierInvoice(id, data);
    if (res.success) {
      setEditingInvoiceModal(null);
      setSelectedInvoiceId(null);
    }
    return res;
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

  // Form helpers
  const handleAddGroup = () => {
    setGroups((prev) => [
      ...prev,
      {
        id: `g-${Date.now()}`,
        brand: '',
        model: '',
        ram: '',
        storage: '',
        color: '',
        purchasePriceUsd: 0,
        items: [{ imei: '' }],
      },
    ]);
  };

  const handleRemoveGroup = (idx: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateGroup = (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => {
    setGroups((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleAddImeiToGroup = (groupIdx: number) => {
    soundEffects.playAddToCartSuccess();
    setGroups((prev) => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items.push({ imei: '' });
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
  };

  const handleRemoveImeiFromGroup = (groupIdx: number, itemIdx: number) => {
    setGroups((prev) => {
      const next = [...prev];
      const items = next[groupIdx].items.filter((_, i) => i !== itemIdx);
      next[groupIdx] = {
        ...next[groupIdx],
        items: items.length > 0 ? items : [{ imei: '' }],
      };
      return next;
    });
  };

  const handleUpdateImei = (groupIdx: number, itemIdx: number, val: string) => {
    setGroups((prev) => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items[itemIdx] = { ...items[itemIdx], imei: val };
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
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

  const handleBatchImeiPaste = (groupIdx: number, text: string) => {
    const rawLines = text.match(/\d{15}\s*\/\s*\d{15}|[^\s,]+/g)?.map((s) => s.trim()) ?? [];
    if (rawLines.length > 0) {
      soundEffects.playAddToCartSuccess();
      setGroups((prev) => {
        const next = [...prev];
        const newItems = rawLines.map((imei) => ({ imei }));

        next[groupIdx] = {
          ...next[groupIdx],
          items: newItems,
        };
        return next;
      });
    }
  };

  // Calculate totals for new intake form
  const totalFormUnits = groups.reduce((acc, g) => acc + g.items.filter((i) => i.imei.trim().length > 0).length, 0);
  const totalFormUsd = moneyNumber(
    groups.reduce((acc, g) => {
      const count = g.items.filter((i) => i.imei.trim().length > 0).length;
      return acc.plus(decimal(g.purchasePriceUsd || 0).mul(count));
    }, decimal(0))
  );

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
        setStatusMessage({
          type: 'error',
          text: `Позиция #${i + 1} (${g.brand || ''} ${g.model || ''}): обязательно укажите RAM (ОЗУ)`,
        });
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

    const cleanGroups: PurchasePreviewGroup[] = groups
      .map((g) => {
        const validItems = g.items
          .filter((i) => i.imei.trim().length > 0)
          .map((i) => ({ imei: i.imei.trim() }));

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
          bonusCampaign: g.isBonus ? g.bonusCampaign?.trim() || 'Бонус от поставщика' : undefined,
          items: validItems,
          imeis: validItems.map((i) => i.imei),
        };
      })
      .filter((g) => g.items.length > 0);

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
      groups: cleanGroups,
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

        setGroups([
          {
            id: `g-${Date.now()}`,
            brand: '',
            model: '',
            ram: '',
            storage: '',
            color: '',
            purchasePriceUsd: 0,
            items: [{ imei: '' }],
          },
        ]);
        setPreviewInvoice(null);
        setSelectedSupplierId('');

        setViewMode('list');
        setStatusMessage({
          type: 'success',
          text: `Приход по накладной ${savedNum} успешно сохранен (${previewInvoice.groups.reduce((a, b) => a + b.items.length, 0)} шт.)!`,
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

  return (
    <>
      {viewMode === 'list' ? (
        <PurchaseHistoryList
          filteredInvoices={filteredInvoices}
          suppliers={suppliers}
          stores={stores}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          selectedSupplierFilter={selectedSupplierFilter}
          onSupplierFilterChange={setSelectedSupplierFilter}
          onResetFilters={() => {
            setSearchQuery('');
            setSelectedSupplierFilter('all');
          }}
          onScanFinder={handleScanFinder}
          onNewPurchaseClick={() => {
            setStatusMessage(null);
            setSelectedSupplierId('');
            setViewMode('form');
          }}
          onSelectInvoice={setSelectedInvoiceId}
          onEditInvoice={(inv) => setEditingInvoiceModal(inv)}
          onDeleteInvoice={handleDeleteInvoiceModal}
          currentUser={currentUser}
          justSavedInvoice={justSavedInvoice}
        />
      ) : (
        <NewPurchaseForm
          suppliers={suppliers}
          stores={stores}
          currentUser={currentUser}
          selectedSupplierId={selectedSupplierId}
          onSelectSupplierId={setSelectedSupplierId}
          isStorePurchase={isStorePurchase}
          onSetIsStorePurchase={setIsStorePurchase}
          storeId={storeId}
          onSetStoreId={setStoreId}
          groups={groups}
          onUpdateGroup={handleUpdateGroup}
          onAddGroup={handleAddGroup}
          onRemoveGroup={handleRemoveGroup}
          onAddImeiToGroup={handleAddImeiToGroup}
          onRemoveImeiFromGroup={handleRemoveImeiFromGroup}
          onUpdateImei={handleUpdateImei}
          onUpdateImei2={handleUpdateImei2}
          onScanImei={handleScanImei}
          onBatchImeiPaste={handleBatchImeiPaste}
          brandOptions={brandOptions}
          getModelOptions={getModelOptions}
          ramOptions={ramOptions}
          storageOptions={storageOptions}
          colorOptions={colorOptions}
          totalFormUnits={totalFormUnits}
          totalFormUsd={totalFormUsd}
          statusMessage={statusMessage}
          isSubmitting={isSubmitting}
          onBackToList={() => {
            setStatusMessage(null);
            setViewMode('list');
          }}
          onOpenAddSupplier={() => setIsAddSupplierOpen(true)}
          onSubmitForm={handleSubmitPurchase}
          onOpenScannerForImei2={(groupIdx, itemIdx) => {
            openScanner((scannedCode) => handleUpdateImei2(groupIdx, itemIdx, scannedCode));
          }}
        />
      )}

      {/* Invoice Details Modal */}
      <InvoiceDetailsModal
        invoice={selectedInvoice}
        devices={devices}
        currentUser={currentUser}
        onClose={() => setSelectedInvoiceId(null)}
        onEditInvoice={(inv) => setEditingInvoiceModal(inv)}
        onDeleteInvoice={handleDeleteInvoiceModal}
      />

      {/* Edit Invoice Modal */}
      <EditInvoiceModal
        invoice={editingInvoiceModal}
        onClose={() => setEditingInvoiceModal(null)}
        onSave={handleSaveEditInvoice}
        onSuccess={(msg) => {
          setStatusMessage({ type: 'success', text: msg });
        }}
        onError={(msg) => {
          setStatusMessage({ type: 'error', text: msg });
        }}
      />

      {/* Receipt Preview Modal */}
      <ReceiptPreviewModal
        previewInvoice={previewInvoice}
        suppliers={suppliers}
        stores={stores}
        onClose={() => setPreviewInvoice(null)}
        onConfirm={handleConfirmSavePurchase}
        isSubmitting={isSubmitting}
      />

      {/* Add Supplier Modal */}
      <AddSupplierModal
        open={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        createSupplier={createSupplier}
        onError={(msg) => {
          setStatusMessage({ type: 'error', text: msg });
        }}
      />
    </>
  );
};
