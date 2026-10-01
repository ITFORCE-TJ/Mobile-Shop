import React, { useState, useMemo, useEffect } from 'react';
import { formatMoney } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { Supplier, SupplierInvoice, Device } from '../../types';
import {
  Truck,
  Plus,
  DollarSign,
  AlertCircle,
  FileText,
  ChevronRight,
  X,
  Building,
  Edit,
  Trash2,
  Loader2,
  Landmark
} from 'lucide-react';

const formatDateStr = (dateVal?: string) => {
  if (!dateVal) return '-';
  const clean = dateVal.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return clean;
};

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
  } = useAppFields('currentUser', 'suppliers', 'supplierInvoices', 'fetchInvoicesRange', 'devices', 'findDevicesByInvoice', 'stores', 'createSupplier', 'updateSupplier', 'deleteSupplier', 'updateSupplierInvoice', 'deleteSupplierInvoice', 'paySupplier', 'paySupplierInvoice', 'todayRate');

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [expandedDeviceGroups, setExpandedDeviceGroups] = useState<Record<string, boolean>>({});

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) || null;
  const selectedInvoice = supplierInvoices.find(inv => inv.id === selectedInvoiceId) || null;

  // `devices` excludes SOLD by default — an invoice's own devices (including any already
  // sold) are fetched on demand so the "which units sold" detail view stays accurate.
  useEffect(() => {
    if (!selectedInvoiceId) return;
    let cancelled = false;
    findDevicesByInvoice(selectedInvoiceId).catch((e) => { if (!cancelled) console.error('Failed to load invoice devices', e); });
    return () => { cancelled = true; };
  }, [selectedInvoiceId, findDevicesByInvoice]);

  // `supplierInvoices` only holds a recent bounded window by default — a supplier's full
  // debt/purchase history can reach further back than that, so fetch it explicitly when
  // this detail view opens instead of only ever showing whatever happened to be loaded.
  useEffect(() => {
    if (!selectedSupplierId) return;
    let cancelled = false;
    fetchInvoicesRange({ supplierId: selectedSupplierId }).catch((e) => { if (!cancelled) console.error('Failed to load supplier invoices', e); });
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
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  // Central Cash: all supplier payments strictly draw from the central cash register
  const centralCashStore = useMemo(() => {
    const warehouses = stores.filter(s => s.isMainWarehouse);
    if (warehouses.length === 0) return stores[0] || null;
    return warehouses.reduce((best, cur) => (cur.cashBalanceUsd || 0) > (best.cashBalanceUsd || 0) ? cur : best, warehouses[0]);
  }, [stores]);
  const defaultPaymentStoreId = centralCashStore?.id || '';
  const rateNumber = todayRate?.rate || 0;

  // Pay form state
  const [paymentAmountUsd, setPaymentAmountUsd] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState(defaultPaymentStoreId);
  const [paymentNote, setPaymentNote] = useState('');

  // Pay single invoice form state
  const [isPayInvoiceModalOpen, setIsPayInvoiceModalOpen] = useState(false);
  const [payInvoiceAmountUsd, setPayInvoiceAmountUsd] = useState('');
  const [payInvoiceSourceAccountId, setPayInvoiceSourceAccountId] = useState(defaultPaymentStoreId);

  // Add supplier state
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierContact, setNewSupplierContact] = useState('');

  // Edit & Delete Supplier state
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editSupplierPhone, setEditSupplierPhone] = useState('');
  const [editSupplierContact, setEditSupplierContact] = useState('');
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);

  // Edit & Delete Invoice state
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editInvoiceAmount, setEditInvoiceAmount] = useState('');
  const [deletingInvoice, setDeletingInvoice] = useState<SupplierInvoice | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setPaymentAmountUsd(supplier.totalDebtUsd.toString());
    setPaymentNote(`Оплата поставщику ${supplier.name}`);
    setSourceAccountId(centralCashStore?.id || '');
    setIsPayModalOpen(true);
  };

  const handleExecutePayment = async () => {
    if (!selectedSupplier || isSubmitting) return;
    const amt = parseFloat(paymentAmountUsd) || 0;
    if (amt <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите положительную сумму оплаты' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await paySupplier({
        supplierId: selectedSupplier.id,
        amountUsd: amt,
        sourceAccountId,
        note: paymentNote.trim() || undefined
      });

      if (res.success) {
        setIsPayModalOpen(false);
        setStatusMessage(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка оплаты' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenPayInvoice = (invoice: SupplierInvoice) => {
    setPayInvoiceAmountUsd(invoice.remainingAmountUsd.toString());
    setPayInvoiceSourceAccountId(centralCashStore?.id || '');
    setIsPayInvoiceModalOpen(true);
  };

  const handleExecuteInvoicePayment = async () => {
    if (!selectedInvoice || isSubmitting) return;
    const amt = parseFloat(payInvoiceAmountUsd) || 0;
    if (amt <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите положительную сумму оплаты' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await paySupplierInvoice({
        invoiceId: selectedInvoice.id,
        amountUsd: amt,
        sourceAccountId: payInvoiceSourceAccountId,
      });

      if (res.success) {
        setIsPayInvoiceModalOpen(false);
        setStatusMessage(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка оплаты' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await createSupplier({
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || undefined,
        contactPerson: newSupplierContact.trim() || undefined
      });

      if (res.success) {
        setIsAddSupplierOpen(false);
        setNewSupplierName('');
        setNewSupplierPhone('');
        setNewSupplierContact('');
        setStatusMessage(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка добавления поставщика' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditSupplier = (sup: Supplier, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingSupplier(sup);
    setEditSupplierName(sup.name);
    setEditSupplierPhone(sup.phone || '');
    setEditSupplierContact(sup.contactPerson || '');
  };

  const handleSaveEditSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !editSupplierName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await updateSupplier(editingSupplier.id, {
        name: editSupplierName.trim(),
        phone: editSupplierPhone.trim() || undefined,
        contactPerson: editSupplierContact.trim() || undefined,
      });
      if (res.success) {
        setEditingSupplier(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления поставщика' });
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
    setEditInvoiceNumber(inv.invoiceNumber);
    setEditInvoiceDate(inv.date.split('T')[0]);
    setEditInvoiceAmount(inv.totalAmountUsd.toString());
  };

  const handleSaveEditInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice || !editInvoiceNumber.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await updateSupplierInvoice(editingInvoice.id, {
        invoiceNumber: editInvoiceNumber.trim(),
        date: editInvoiceDate,
        totalAmountUsd: parseFloat(editInvoiceAmount) || 0,
      });
      if (res.success) {
        setEditingInvoice(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления накладной' });
      }
    } finally {
      setIsSubmitting(false);
    }
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
      {/* Top Header */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface flex items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-fg-muted">
          Общий долг поставщикам: <strong className="text-danger">${formatMoney(totalAllDebt)}</strong>
        </div>
        <button
          onClick={() => setIsAddSupplierOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg flex items-center space-x-1.5 shrink-0 transition-colors shadow-xs"
          title="Добавить поставщика"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>ДОБАВИТЬ ПОСТАВЩИКА</span>
        </button>
      </div>

      {statusMessage && statusMessage.type === 'error' && (
        <div className="mx-4 mt-3 p-2.5 rounded-lg text-xs flex items-center justify-between shrink-0 bg-danger/10 text-danger border border-danger/30">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="hover:text-fg-muted ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Grid for Desktop & List for Mobile */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden">
        {/* Left Column: Suppliers list */}
        <div className="lg:col-span-1 flex flex-col overflow-hidden bg-surface">
          <div className="p-3 border-b border-border bg-surface-raised font-bold text-xs text-fg-muted uppercase tracking-wide">
            Список контрагентов ({suppliers.length})
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
            {suppliers.map((s) => {
              const isSelected = selectedSupplier?.id === s.id;

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSupplierId(s.id)}
                  className={`group w-full text-left p-3.5 hover:bg-surface-raised flex items-center justify-between transition-colors ${
                    isSelected ? 'bg-accent/10 border-l-4 border-accent font-semibold' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <h4 className="text-sm font-semibold text-fg-muted">{s.name}</h4>
                      <ChevronRight className="w-3.5 h-3.5 text-fg-subtle lg:hidden" />
                    </div>
                    {s.contactPerson && (
                      <p className="text-xs text-fg-muted mt-0.5">{s.contactPerson}</p>
                    )}
                    {s.phone && (
                      <p className="text-[11px] text-fg-subtle mt-0.5">{s.phone}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="text-right">
                      <span className="text-xs font-bold text-danger">
                        ${formatMoney(s.totalDebtUsd)}
                      </span>
                      <span className="block text-[10px] text-fg-subtle">Долг</span>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleStartEditSupplier(s, e)}
                        className="p-1.5 rounded-lg text-fg-subtle hover:text-accent hover:bg-surface"
                        title="Редактировать поставщика"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeletingSupplier(s); }}
                        className="p-1.5 rounded-lg text-fg-subtle hover:text-danger hover:bg-surface"
                        title="Удалить поставщика"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Invoices & Payments for selected supplier (Desktop view) */}
        <div className="hidden lg:flex lg:col-span-2 flex-col overflow-hidden bg-bg">
          {selectedSupplier ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Selected supplier summary header */}
              <div className="p-4 border-b border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div>
                  <h4 className="text-base font-bold text-fg-muted">{selectedSupplier.name}</h4>
                  <div className="flex items-center space-x-3 text-xs mt-1">
                    <span className="text-fg-muted">Закуплено: <strong className="text-fg-muted">${formatMoney(selectedSupplier.totalPurchasedUsd)}</strong></span>
                    <span>•</span>
                    <span className="text-fg-muted">Выплачено: <strong className="text-accent">${formatMoney(selectedSupplier.totalPaidUsd)}</strong></span>
                    <span>•</span>
                    <span className="text-fg-muted">Остаток долга: <strong className="text-danger">${formatMoney(selectedSupplier.totalDebtUsd)}</strong></span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenPay(selectedSupplier)}
                    disabled={selectedSupplier.totalDebtUsd <= 0}
                    className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-accent-fg shadow-xs transition-colors flex items-center space-x-1.5"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Погасить долг (FIFO)</span>
                  </button>
                  <button
                    onClick={() => handleStartEditSupplier(selectedSupplier)}
                    className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg-muted transition-colors"
                    title="Редактировать поставщика"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeletingSupplier(selectedSupplier)}
                    className="p-2 rounded-lg bg-surface-raised hover:bg-danger/15 text-fg-subtle hover:text-danger border border-border transition-colors"
                    title="Удалить поставщика"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedSupplierId(null)}
                    className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg-muted"
                    title="Закрыть"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Invoices List */}
              <div className="p-3 border-b border-border bg-surface-raised text-xs font-semibold text-fg-muted">
                Накладные и статус оплат
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
                {selectedSupplierInvoices
                  .map((inv) => {
                    const isPaid = inv.status === 'PAID';
                    const isPartial = inv.status === 'PARTIALLY_PAID';

                    return (
                      <div
                        key={inv.id}
                        onClick={() => setSelectedInvoiceId(inv.id)}
                        className="p-4 hover:bg-surface-raised cursor-pointer transition-colors flex items-center justify-between group"
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-fg-muted group-hover:text-accent transition-colors">{inv.invoiceNumber}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                              isPaid ? 'bg-accent/15 text-accent border border-accent/30' :
                              isPartial ? 'bg-warning/15 text-warning border border-warning/30' :
                              'bg-danger/15 text-danger border border-danger/30'
                            }`}>
                              {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                            </span>
                          </div>
                          <p className="text-[11px] text-fg-subtle mt-1">
                            Дата: {formatDateStr(inv.date)} • Устройств: {inv.devicesCount ?? 0} шт.
                          </p>
                        </div>

                        <div className="flex items-center space-x-2">
                          <div className="text-right">
                            <p className="text-xs font-bold text-fg-muted">
                              Всего: ${formatMoney(inv.totalAmountUsd)}
                            </p>
                            <p className="text-[11px] text-danger">
                              Долг: ${formatMoney(inv.remainingAmountUsd)}
                            </p>
                            <p className="text-[10px] text-accent">
                              Оплачено: ${formatMoney(inv.paidAmountUsd)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleStartEditInvoice(inv, e)}
                            className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle hover:text-accent border border-border transition-colors"
                            title="Редактировать накладную"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeletingInvoice(inv); }}
                            className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle hover:text-danger border border-border transition-colors"
                            title="Удалить накладную"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle group-hover:text-fg-muted border border-border"
                            title="Детали накладной"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-fg-subtle text-xs">
              <FileText className="w-8 h-8 opacity-30 mb-2" />
              <p>Выберите поставщика слева для просмотра накладных и выплат</p>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE FULL-SCREEN MODAL FOR SELECTED SUPPLIER */}
      {selectedSupplier && (
        <div className="lg:hidden fixed inset-0 z-40 bg-bg flex flex-col">
          {/* Header with Title and prominent Close "X" Button */}
          <div className="p-3.5 border-b border-border bg-surface flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <Truck className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold text-fg-muted truncate max-w-50">
                {selectedSupplier.name}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setSelectedSupplierId(null)}
              className="p-1.5 rounded-lg bg-surface-raised text-fg-muted hover:text-fg-muted hover:bg-surface transition-colors flex items-center justify-center border border-border"
              title="Закрыть окно"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Supplier Metrics */}
          <div className="p-3.5 bg-surface-raised border-b border-border grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-surface p-2 rounded-lg border border-border">
              <span className="block text-[10px] text-fg-subtle">Закуплено</span>
              <strong className="text-fg-muted text-xs">
                ${formatMoney(selectedSupplier.totalPurchasedUsd)}
              </strong>
            </div>
            <div className="bg-surface p-2 rounded-lg border border-border">
              <span className="block text-[10px] text-fg-subtle">Выплачено</span>
              <strong className="text-accent text-xs">
                ${formatMoney(selectedSupplier.totalPaidUsd)}
              </strong>
            </div>
            <div className="bg-surface p-2 rounded-lg border border-border">
              <span className="block text-[10px] text-fg-subtle">Долг</span>
              <strong className="text-danger text-xs">
                ${formatMoney(selectedSupplier.totalDebtUsd)}
              </strong>
            </div>
          </div>

          {/* Action button */}
          <div className="p-3 bg-bg border-b border-border shrink-0">
            <button
              onClick={() => handleOpenPay(selectedSupplier)}
              disabled={selectedSupplier.totalDebtUsd <= 0}
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-accent-fg shadow-xs flex items-center justify-center space-x-1.5 transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              <span>Погасить долг поставщику (FIFO)</span>
            </button>
          </div>

          {/* Invoices List */}
          <div className="p-2.5 bg-surface-raised border-b border-border text-xs font-semibold text-fg-muted flex items-center justify-between">
            <span>Накладные поставщика</span>
            <span className="text-[11px] text-fg-subtle">
              {selectedSupplierInvoices.length} шт.
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg p-1">
            {selectedSupplierInvoices
              .map((inv) => {
                const isPaid = inv.status === 'PAID';
                const isPartial = inv.status === 'PARTIALLY_PAID';

                return (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className="p-3 hover:bg-surface-raised active:bg-surface cursor-pointer transition-colors flex items-center justify-between group border-b border-border"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-fg-muted group-hover:text-accent transition-colors">{inv.invoiceNumber}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                          isPaid ? 'bg-accent/15 text-accent border border-accent/30' :
                          isPartial ? 'bg-warning/15 text-warning border border-warning/30' :
                          'bg-danger/15 text-danger border border-danger/30'
                        }`}>
                          {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                        </span>
                      </div>
                      <p className="text-[11px] text-fg-subtle mt-0.5">
                        {formatDateStr(inv.date)} • {inv.devicesCount ?? 0} устройств
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="text-xs font-bold text-fg-muted">
                          ${formatMoney(inv.totalAmountUsd)}
                        </p>
                        <p className="text-[11px] text-danger">
                          Долг: ${formatMoney(inv.remainingAmountUsd)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="p-1 rounded-lg bg-surface-raised text-fg-subtle group-hover:text-fg-muted border border-border"
                        title="Детали накладной"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Mobile Footer with Close button */}
          <div className="p-3 border-t border-border bg-surface shrink-0">
            <button
              type="button"
              onClick={() => setSelectedSupplierId(null)}
              className="w-full py-2 rounded-lg bg-surface-raised hover:bg-surface text-xs font-bold text-fg-muted flex items-center justify-center space-x-1.5 transition-colors border border-border"
            >
              <X className="w-4 h-4" />
              <span>ЗАКРЫТЬ КАРТОЧКУ ПОСТАВЩИКА</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Pay Supplier (FIFO auto distribution) */}
      {isPayModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl">
            <h4 className="text-sm font-bold text-fg-muted mb-1">Выплата поставщику</h4>
            <p className="text-xs text-fg-subtle mb-4">{selectedSupplier.name} (Текущий долг: ${selectedSupplier.totalDebtUsd})</p>

            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block text-fg-subtle mb-1">Сумма оплаты ($ USD):</label>
                <div className="relative">
                  <input step="0.01"
                    type="number"
                    min="0.01"
                    value={paymentAmountUsd ?? ''}
                    onChange={(e) => setPaymentAmountUsd(e.target.value)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-fg-subtle">$</span>
                </div>
              </div>

              <div>
                <label className="block text-fg-subtle mb-1">Касса списания:</label>
                <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-accent/15 text-accent shrink-0">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-fg-muted">Центральная касса</p>
                      <p className="text-[11px] text-fg-subtle">Оплата поставщикам производится исключительно из центральной кассы</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-accent">
                      ${formatMoney(centralCashStore?.cashBalanceUsd)}
                    </span>
                    <p className="text-[10px] text-fg-subtle">Остаток в кассе</p>
                  </div>
                </div>
              </div>

              {rateNumber > 0 && parseFloat(paymentAmountUsd) > 0 && (
                <div className="flex items-center justify-between text-[11px] px-1 text-fg-subtle">
                  <span>Сумма к списанию (курс {rateNumber.toFixed(2)}):</span>
                  <span className="font-semibold text-fg-muted">
                    ≈ {formatMoney(parseFloat(paymentAmountUsd) * rateNumber)} TJS
                  </span>
                </div>
              )}

              {parseFloat(paymentAmountUsd) > 0 && parseFloat(paymentAmountUsd) > (centralCashStore?.cashBalanceUsd ?? 0) && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-[11px] text-danger">
                  Внимание: в Центральной кассе недостаточно средств (Остаток: ${formatMoney(centralCashStore?.cashBalanceUsd)}, требуется: ${formatMoney(parseFloat(paymentAmountUsd) || 0)}).
                </div>
              )}

              <div>
                <label className="block text-fg-subtle mb-1">Примечание:</label>
                <input
                  type="text"
                  value={paymentNote ?? ''}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/30 text-[11px] text-accent">
                Автоматическое погашение: средства распределятся по старейшим неоплаченным накладным (FIFO).
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                disabled={isSubmitting}
                onClick={() => setIsPayModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleExecutePayment}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Оплата…' : 'Оплатить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Pay a single invoice directly (no FIFO across other invoices) */}
      {isPayInvoiceModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl">
            <h4 className="text-sm font-bold text-fg-muted mb-1">Оплата по накладной {selectedInvoice.invoiceNumber}</h4>
            <p className="text-xs text-fg-subtle mb-4">Остаток по накладной: ${selectedInvoice.remainingAmountUsd}</p>

            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block text-fg-subtle mb-1">Сумма оплаты ($ USD):</label>
                <div className="relative">
                  <input step="0.01"
                    type="number"
                    min="0.01"
                    max={selectedInvoice.remainingAmountUsd}
                    value={payInvoiceAmountUsd ?? ''}
                    onChange={(e) => setPayInvoiceAmountUsd(e.target.value)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-fg-subtle">$</span>
                </div>
              </div>

              <div>
                <label className="block text-fg-subtle mb-1">Касса списания:</label>
                <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-accent/15 text-accent shrink-0">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-fg-muted">Центральная касса</p>
                      <p className="text-[11px] text-fg-subtle">Оплата накладной производится исключительно из центральной кассы</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-accent">
                      ${formatMoney(centralCashStore?.cashBalanceUsd)}
                    </span>
                    <p className="text-[10px] text-fg-subtle">Остаток в кассе</p>
                  </div>
                </div>
              </div>

              {rateNumber > 0 && parseFloat(payInvoiceAmountUsd) > 0 && (
                <div className="flex items-center justify-between text-[11px] px-1 text-fg-subtle">
                  <span>Сумма к списанию (курс {rateNumber.toFixed(2)}):</span>
                  <span className="font-semibold text-fg-muted">
                    ≈ {formatMoney(parseFloat(payInvoiceAmountUsd) * rateNumber)} TJS
                  </span>
                </div>
              )}

              {parseFloat(payInvoiceAmountUsd) > 0 && parseFloat(payInvoiceAmountUsd) > (centralCashStore?.cashBalanceUsd ?? 0) && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-[11px] text-danger">
                  Внимание: в Центральной кассе недостаточно средств (Остаток: ${formatMoney(centralCashStore?.cashBalanceUsd)}, требуется: ${formatMoney(parseFloat(payInvoiceAmountUsd) || 0)}).
                </div>
              )}

              <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/30 text-[11px] text-accent">
                Оплата будет применена только к этой накладной, независимо от других долгов поставщика.
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                disabled={isSubmitting}
                onClick={() => setIsPayInvoiceModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleExecuteInvoicePayment}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Оплата…' : 'Оплатить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD SUPPLIER */}
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
                  value={newSupplierName ?? ''}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Например: Xiaomi Tech Hub"
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle mb-1">Контактное лицо</label>
                <input
                  type="text"
                  value={newSupplierContact ?? ''}
                  onChange={(e) => setNewSupplierContact(e.target.value)}
                  placeholder="Фарход"
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle mb-1">Телефон</label>
                <input
                  type="tel"
                  value={newSupplierPhone ?? ''}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  placeholder="+992 90 000 0000"
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? 'Добавление…' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INVOICE DETAILS */}
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
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-highlight/20 text-highlight border border-highlight/40 font-normal">
                        🎯 Target Bonus ($0)
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-fg-subtle">
                    Поставщик: {suppliers.find(s => s.id === selectedInvoice.supplierId)?.name || 'Поставщик'} • {formatDateStr(selectedInvoice.date)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedInvoiceId(null)}
                className="p-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-fg-muted border border-border transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Breakdown */}
            <div className="p-3 bg-surface-raised border-b border-border grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="bg-surface p-2.5 rounded-xl border border-border">
                <span className="text-[10px] text-fg-subtle block font-semibold uppercase">СУММА НАКЛАДНОЙ</span>
                <strong className={selectedInvoice.totalAmountUsd === 0 ? "text-highlight font-bold" : "text-fg-muted font-bold"}>
                  {selectedInvoice.totalAmountUsd === 0 ? '$0.00 (БОНУС)' : `$${formatMoney(selectedInvoice.totalAmountUsd)}`}
                </strong>
              </div>
              <div className="bg-surface p-2.5 rounded-xl border border-border">
                <span className="text-[10px] text-fg-subtle block font-semibold uppercase">ОПЛАЧЕНО</span>
                <strong className="text-accent font-bold">${formatMoney(selectedInvoice.paidAmountUsd)}</strong>
              </div>
              <div className="bg-surface p-2.5 rounded-xl border border-border">
                <span className="text-[10px] text-fg-subtle block font-semibold uppercase">ОСТАТОК ДОЛГА</span>
                <strong className="text-danger font-bold">${formatMoney(selectedInvoice.remainingAmountUsd)}</strong>
              </div>
            </div>

            {selectedInvoice.remainingAmountUsd > 0 && (
              <div className="px-3 pb-3 bg-surface-raised border-b border-border shrink-0">
                <button
                  onClick={() => handleOpenPayInvoice(selectedInvoice)}
                  className="w-full py-2 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg shadow-xs transition-colors flex items-center justify-center space-x-1.5"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Оплатить эту накладную</span>
                </button>
              </div>
            )}

            {/* Invoice Groups (Summary of positions) */}
            {selectedInvoice.groups && selectedInvoice.groups.length > 0 && (
              <div className="p-3 bg-surface-raised border-b border-border font-mono space-y-1.5 shrink-0">
                <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider block">Позиции по накладной:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {selectedInvoice.groups.map((grp: any, gIdx: number) => (
                    <div key={gIdx} className="p-2 rounded-xl bg-surface border border-border flex justify-between items-center">
                      <div>
                        <span className="font-bold text-fg-muted">{grp.brand} {grp.model}</span>
                        <span className="block text-[11px] text-fg-subtle">{grp.ram ? `${grp.ram} • ` : ''}{grp.storage} • {grp.color}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-accent">{grp.quantity} шт.</span>
                        <span className="block text-[10px] text-fg-subtle">${grp.purchasePriceUsd} / шт.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contained Devices List */}
            {(() => {
              const containedDevices = devices.filter(d =>
                d.purchaseInvoiceId === selectedInvoice.id ||
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
                          🎁 ПОДАРОК ($0)
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
                  <div className="p-3 bg-surface-raised border-b border-border flex items-center justify-between text-xs font-mono font-bold text-fg-muted shrink-0">
                    <span>Устройства в накладной</span>
                    <span className="text-accent">
                      {containedDevices.length} шт.
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-surface font-mono">
                    {containedDevices.length === 0 ? (
                      <div className="p-6 text-center text-fg-subtle text-xs">
                        Нет детальных записей устройств для этой накладной
                      </div>
                    ) : hasGroups && variantGroups.size > 0 ? (
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
                  </div>
                </>
              );
            })()}

            {/* Modal Footer */}
            <div className="p-3 bg-surface border-t border-border flex justify-end shrink-0">
              <button
                onClick={() => setSelectedInvoiceId(null)}
                className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-mono font-bold text-fg-muted transition-colors uppercase"
              >
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: EDIT SUPPLIER */}
      {editingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 shadow-xl text-fg-muted">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-sm font-bold text-fg-muted flex items-center space-x-2">
                <Edit className="w-4 h-4 text-accent" />
                <span>Редактировать поставщика</span>
              </h3>
              <button onClick={() => setEditingSupplier(null)} className="text-fg-subtle hover:text-fg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditSupplier} className="space-y-3">
              <div>
                <label className="block text-xs text-fg-subtle mb-1">Название поставщика *</label>
                <input
                  type="text"
                  required
                  value={editSupplierName}
                  onChange={(e) => setEditSupplierName(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-subtle mb-1">Телефон</label>
                <input
                  type="text"
                  value={editSupplierPhone}
                  onChange={(e) => setEditSupplierPhone(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-subtle mb-1">Контактное лицо</label>
                <input
                  type="text"
                  value={editSupplierContact}
                  onChange={(e) => setEditSupplierContact(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingSupplier(null)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE SUPPLIER CONFIRMATION */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-danger/40 p-5 shadow-2xl text-fg-muted space-y-4">
            <div className="flex items-center space-x-3 text-danger">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-fg-muted">Удаление поставщика</h3>
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              Вы действительно хотите удалить поставщика <strong className="text-fg-muted">«{deletingSupplier.name}»</strong>? Все связанные накладные, выплатные записи и поставленные устройства будут безвозвратно удалены.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                disabled={isSubmitting}
                onClick={() => setDeletingSupplier(null)}
                className="px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleConfirmDeleteSupplier}
                className="px-4 py-2.5 rounded-xl bg-danger hover:opacity-90 text-xs font-bold text-white uppercase shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Удаление…' : 'Удалить поставщика'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT INVOICE */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 shadow-xl text-fg-muted">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-sm font-bold text-fg-muted flex items-center space-x-2">
                <Edit className="w-4 h-4 text-accent" />
                <span>Редактировать накладную</span>
              </h3>
              <button onClick={() => setEditingInvoice(null)} className="text-fg-subtle hover:text-fg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditInvoice} className="space-y-3">
              <div>
                <label className="block text-xs text-fg-subtle mb-1">Номер накладной *</label>
                <input
                  type="text"
                  required
                  value={editInvoiceNumber}
                  onChange={(e) => setEditInvoiceNumber(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-subtle mb-1">Дата накладной</label>
                <input
                  type="date"
                  value={editInvoiceDate}
                  onChange={(e) => setEditInvoiceDate(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-subtle mb-1">Сумма накладной ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editInvoiceAmount}
                  onChange={(e) => setEditInvoiceAmount(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-accent font-bold focus:border-accent focus:outline-none"
                />
              </div>
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingInvoice(null)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE INVOICE CONFIRMATION */}
      {deletingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-danger/40 p-5 shadow-2xl text-fg-muted space-y-4">
            <div className="flex items-center space-x-3 text-danger">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-fg-muted">Удаление накладной</h3>
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              Вы действительно хотите удалить накладную <strong className="text-fg-muted">#{deletingInvoice.invoiceNumber}</strong>? Все привязанные к этой накладной устройства и расчеты будут удалены из системы.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                disabled={isSubmitting}
                onClick={() => setDeletingInvoice(null)}
                className="px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleConfirmDeleteInvoice}
                className="px-4 py-2.5 rounded-xl bg-danger hover:opacity-90 text-xs font-bold text-white uppercase shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Удаление…' : 'Удалить накладную'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
