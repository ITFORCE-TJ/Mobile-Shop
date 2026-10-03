import React, { useState, useMemo, useEffect } from 'react';
import { formatMoney } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { Supplier, SupplierInvoice } from '../../types';
import {
  Truck,
  Plus,
  AlertCircle,
  X,
  Search,
} from 'lucide-react';
import { SupplierCard } from '../suppliers/SupplierCard';
import { SupplierDetailsPanel } from '../suppliers/SupplierDetailsPanel';
import { PaySupplierModal } from '../suppliers/PaySupplierModal';
import { PaySupplierInvoiceModal } from '../suppliers/PaySupplierInvoiceModal';
import { SupplierModal } from '../suppliers/SupplierModal';
import { DeleteSupplierConfirmModal } from '../suppliers/DeleteSupplierConfirmModal';
import { SupplierInvoiceDetailsModal } from '../suppliers/SupplierInvoiceDetailsModal';
import { EditSupplierInvoiceModal } from '../suppliers/EditSupplierInvoiceModal';
import { DeleteSupplierInvoiceModal } from '../suppliers/DeleteSupplierInvoiceModal';

export const SuppliersPage: React.FC = () => {
  const {
    currentUser,
    suppliers,
    supplierInvoices,
    fetchInvoicesRange,
    devices,
    findDevicesByInvoice,
    stores,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    paySupplier,
    paySupplierInvoice,
    todayRate
  } = useAppFields(
    'currentUser',
    'suppliers',
    'supplierInvoices',
    'fetchInvoicesRange',
    'devices',
    'findDevicesByInvoice',
    'stores',
    'createSupplier',
    'updateSupplier',
    'deleteSupplier',
    'updateSupplierInvoice',
    'deleteSupplierInvoice',
    'paySupplier',
    'paySupplierInvoice',
    'todayRate'
  );

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) || null;
  const selectedInvoice = supplierInvoices.find(inv => inv.id === selectedInvoiceId) || null;

  // `devices` excludes SOLD by default — an invoice's own devices (including any already
  // sold) are fetched on demand so the "which units sold" detail view stays accurate.
  useEffect(() => {
    if (!selectedInvoiceId) return;
    let cancelled = false;
    findDevicesByInvoice(selectedInvoiceId).catch((e) => {
      if (!cancelled) console.error('Failed to load invoice devices', e);
    });
    return () => { cancelled = true; };
  }, [selectedInvoiceId, findDevicesByInvoice]);

  // `supplierInvoices` only holds a recent bounded window by default — a supplier's full
  // debt/purchase history can reach further back than that, so fetch it explicitly when
  // this detail view opens instead of only ever showing whatever happened to be loaded.
  useEffect(() => {
    if (!selectedSupplierId) return;
    let cancelled = false;
    fetchInvoicesRange({ supplierId: selectedSupplierId }).catch((e) => {
      if (!cancelled) console.error('Failed to load supplier invoices', e);
    });
    return () => { cancelled = true; };
  }, [selectedSupplierId, fetchInvoicesRange]);

  // Filters/sorts the full (unbounded, grows with every purchase invoice ever
  // raised) supplierInvoices array — computed once per relevant change instead of
  // twice per render (desktop panel + mobile overlay both need the same list).
  const selectedSupplierInvoices = useMemo(() => {
    if (!selectedSupplier) return [];
    return supplierInvoices
      .filter(inv => inv.supplierId === selectedSupplier.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [supplierInvoices, selectedSupplier]);

  const [searchQuery, setSearchQuery] = useState('');
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase().trim();
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
      (s.phone && s.phone.toLowerCase().includes(q))
    );
  }, [suppliers, searchQuery]);

  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isPayInvoiceModalOpen, setIsPayInvoiceModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);

  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<SupplierInvoice | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Central Cash: all supplier payments strictly draw from the central cash register
  const centralCashStore = useMemo(() => {
    const warehouses = stores.filter(s => s.isMainWarehouse);
    if (warehouses.length === 0) return stores[0] || null;
    return warehouses.reduce(
      (best, cur) => (cur.cashBalanceUsd || 0) > (best.cashBalanceUsd || 0) ? cur : best,
      warehouses[0]
    );
  }, [stores]);

  const rateNumber = todayRate?.rate || 0;

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div className="p-8 text-center text-fg-subtle">
        <p className="text-sm font-medium text-fg-muted">Доступ ограничен</p>
        <p className="text-xs mt-1">Раздел поставщиков и цен закупки доступен только Администратору</p>
      </div>
    );
  }

  const handleOpenPay = (supplier: Supplier) => {
    setSelectedSupplierId(supplier.id);
    setIsPayModalOpen(true);
  };

  const handleOpenPayInvoice = (invoice: SupplierInvoice) => {
    setSelectedInvoiceId(invoice.id);
    setIsPayInvoiceModalOpen(true);
  };

  const handleStartAddSupplier = () => {
    setSupplierToEdit(null);
    setIsSupplierModalOpen(true);
  };

  const handleStartEditSupplier = (sup: Supplier, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSupplierToEdit(sup);
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (data: { name: string; phone?: string; contactPerson?: string }) => {
    setIsSubmitting(true);
    try {
      if (supplierToEdit) {
        const res = await updateSupplier(supplierToEdit.id, data);
        if (res.success) {
          setIsSupplierModalOpen(false);
          setSupplierToEdit(null);
        } else {
          setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления поставщика' });
        }
      } else {
        const res = await createSupplier(data);
        if (res.success) {
          setIsSupplierModalOpen(false);
          setStatusMessage(null);
        } else {
          setStatusMessage({ type: 'error', text: res.message || 'Ошибка добавления поставщика' });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!deletingSupplier || isSubmitting) return;
    const supId = deletingSupplier.id;
    setIsSubmitting(true);
    try {
      const res = await deleteSupplier(supId);
      setDeletingSupplier(null);
      if (res.success) {
        if (selectedSupplierId === supId) {
          setSelectedSupplierId(null);
        }
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления поставщика' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditInvoice = (inv: SupplierInvoice, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingInvoice(inv);
  };

  const handleSaveEditInvoice = async (data: { invoiceNumber: string; date: string; totalAmountUsd: number }) => {
    if (!editingInvoice || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await updateSupplierInvoice(editingInvoice.id, data);
      if (res.success) {
        setEditingInvoice(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления накладной' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartDeleteInvoice = (inv: SupplierInvoice, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeletingInvoice(inv);
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!deletingInvoice || isSubmitting) return;
    const invId = deletingInvoice.id;
    setIsSubmitting(true);
    try {
      const res = await deleteSupplierInvoice(invId);
      setDeletingInvoice(null);
      if (res.success) {
        if (selectedInvoiceId === invId) {
          setSelectedInvoiceId(null);
        }
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления накладной' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAllDebt = suppliers.reduce((acc, s) => acc + s.totalDebtUsd, 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      {/* Top Header / Stat Card */}
      <div className="p-3 border-b border-border bg-surface shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-danger/10 border border-danger/25 text-danger flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">Долг поставщикам</span>
            <span className="text-sm sm:text-base font-black text-danger font-mono leading-none">
              ${formatMoney(totalAllDebt)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartAddSupplier}
          className="px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg flex items-center gap-1.5 shrink-0 transition-all active:scale-95 shadow-xs cursor-pointer"
          title="Добавить поставщика"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Добавить</span>
        </button>
      </div>

      {statusMessage && statusMessage.type === 'error' && (
        <div className="mx-3 mt-2.5 p-2.5 rounded-lg text-xs flex items-center justify-between shrink-0 bg-danger/10 text-danger border border-danger/30">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="hover:text-fg-muted ml-2 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Grid for Desktop & List for Mobile */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden">
        {/* Left Column: Suppliers list */}
        <div className="lg:col-span-1 flex flex-col overflow-hidden bg-surface">
          {/* Search bar & counter */}
          <div className="px-3 py-2 border-b border-border bg-surface-raised/40 flex items-center justify-between gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени или телефону..."
                className="w-full h-8 pl-8 pr-7 rounded-lg bg-surface border border-border text-xs text-fg placeholder:text-fg-subtle focus:outline-hidden focus:border-accent transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg cursor-pointer p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <span className="text-[10px] font-semibold text-fg-subtle whitespace-nowrap shrink-0">
              {filteredSuppliers.length} {filteredSuppliers.length === 1 ? 'контрагент' : filteredSuppliers.length < 5 ? 'контрагента' : 'контрагентов'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-1.5 bg-bg">
            {filteredSuppliers.length === 0 ? (
              <div className="p-8 text-center text-xs text-fg-subtle">
                <Truck className="w-8 h-8 mx-auto mb-2 opacity-30 text-fg-subtle" />
                <p className="font-semibold">Поставщики не найдены</p>
                {searchQuery && <p className="text-[11px] mt-0.5">Попробуйте изменить поисковый запрос</p>}
              </div>
            ) : (
              filteredSuppliers.map((s) => (
                <SupplierCard
                  key={s.id}
                  supplier={s}
                  isSelected={selectedSupplier?.id === s.id}
                  onSelect={(sup) => setSelectedSupplierId(sup.id)}
                  onEdit={(sup, e) => handleStartEditSupplier(sup, e)}
                  onDelete={(sup, e) => {
                    e.stopPropagation();
                    setDeletingSupplier(sup);
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Column: Invoices & Payments for selected supplier */}
        <SupplierDetailsPanel
          supplier={selectedSupplier}
          invoices={selectedSupplierInvoices}
          onClose={() => setSelectedSupplierId(null)}
          onOpenPay={handleOpenPay}
          onEditSupplier={(sup) => handleStartEditSupplier(sup)}
          onDeleteSupplier={(sup) => setDeletingSupplier(sup)}
          onSelectInvoice={(invoiceId) => setSelectedInvoiceId(invoiceId)}
          onEditInvoice={handleStartEditInvoice}
          onDeleteInvoice={handleStartDeleteInvoice}
        />
      </div>

      {/* MODAL: Pay supplier debt with FIFO */}
      <PaySupplierModal
        open={isPayModalOpen}
        supplier={selectedSupplier}
        centralCashStore={centralCashStore}
        rateNumber={rateNumber}
        onClose={() => setIsPayModalOpen(false)}
        onPay={paySupplier}
        onError={(text) => setStatusMessage({ type: 'error', text })}
      />

      {/* MODAL: Pay a single invoice directly (no FIFO) */}
      <PaySupplierInvoiceModal
        open={isPayInvoiceModalOpen}
        invoice={selectedInvoice}
        centralCashStore={centralCashStore}
        rateNumber={rateNumber}
        onClose={() => setIsPayInvoiceModalOpen(false)}
        onPay={paySupplierInvoice}
        onError={(text) => setStatusMessage({ type: 'error', text })}
      />

      {/* MODAL: Add / Edit Supplier */}
      <SupplierModal
        open={isSupplierModalOpen}
        supplier={supplierToEdit}
        onClose={() => {
          setIsSupplierModalOpen(false);
          setSupplierToEdit(null);
        }}
        onSubmit={handleSaveSupplier}
        isSubmitting={isSubmitting}
      />

      {/* MODAL: Delete Supplier Confirmation */}
      <DeleteSupplierConfirmModal
        supplier={deletingSupplier}
        onClose={() => setDeletingSupplier(null)}
        onConfirm={handleConfirmDeleteSupplier}
        isSubmitting={isSubmitting}
      />

      {/* MODAL: Invoice Details */}
      <SupplierInvoiceDetailsModal
        invoice={selectedInvoice}
        suppliers={suppliers}
        devices={devices}
        onClose={() => setSelectedInvoiceId(null)}
        onOpenPay={handleOpenPayInvoice}
      />

      {/* MODAL: Edit Invoice */}
      <EditSupplierInvoiceModal
        invoice={editingInvoice}
        supplierName={selectedSupplier?.name}
        rateNumber={rateNumber}
        onClose={() => setEditingInvoice(null)}
        onSubmit={handleSaveEditInvoice}
        isSubmitting={isSubmitting}
      />

      {/* MODAL: Delete Invoice Confirmation */}
      <DeleteSupplierInvoiceModal
        invoice={deletingInvoice}
        onClose={() => setDeletingInvoice(null)}
        onConfirm={handleConfirmDeleteInvoice}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
