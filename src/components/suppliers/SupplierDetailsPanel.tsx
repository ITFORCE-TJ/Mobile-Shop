import React from 'react';
import { Supplier, SupplierInvoice } from '../../types';
import { formatMoney } from '../../utils/money';
import { formatDateStr } from './types';
import {
  DollarSign,
  Edit,
  Trash2,
  X,
  FileText,
  ChevronRight,
  Truck,
} from 'lucide-react';

interface SupplierDetailsPanelProps {
  supplier: Supplier | null;
  invoices: SupplierInvoice[];
  onClose: () => void;
  onOpenPay: (supplier: Supplier) => void;
  onEditSupplier: (supplier: Supplier) => void;
  onDeleteSupplier: (supplier: Supplier) => void;
  onSelectInvoice: (invoiceId: string) => void;
  onEditInvoice: (invoice: SupplierInvoice, e?: React.MouseEvent) => void;
  onDeleteInvoice: (invoice: SupplierInvoice, e?: React.MouseEvent) => void;
}

export const SupplierDetailsPanel: React.FC<SupplierDetailsPanelProps> = ({
  supplier,
  invoices,
  onClose,
  onOpenPay,
  onEditSupplier,
  onDeleteSupplier,
  onSelectInvoice,
  onEditInvoice,
  onDeleteInvoice,
}) => {
  return (
    <>
      {/* Desktop Column */}
      <div className="hidden lg:flex lg:col-span-2 flex-col overflow-hidden bg-bg">
        {supplier ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selected supplier summary header */}
            <div className="p-4 border-b border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div>
                <h4 className="text-base font-bold text-fg-muted">{supplier.name}</h4>
                <div className="flex items-center space-x-3 text-xs mt-1">
                  <span className="text-fg-muted">
                    Закуплено: <strong className="text-fg-muted">${formatMoney(supplier.totalPurchasedUsd)}</strong>
                  </span>
                  <span>•</span>
                  <span className="text-fg-muted">
                    Выплачено: <strong className="text-accent">${formatMoney(supplier.totalPaidUsd)}</strong>
                  </span>
                  <span>•</span>
                  <span className="text-fg-muted">
                    Остаток долга: <strong className="text-danger">${formatMoney(supplier.totalDebtUsd)}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => onOpenPay(supplier)}
                  disabled={supplier.totalDebtUsd <= 0}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-accent-fg shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Погасить долг (FIFO)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onEditSupplier(supplier)}
                  className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg-muted transition-colors cursor-pointer"
                  title="Редактировать поставщика"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSupplier(supplier)}
                  className="p-2 rounded-lg bg-surface-raised hover:bg-danger/15 text-fg-subtle hover:text-danger border border-border transition-colors cursor-pointer"
                  title="Удалить поставщика"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg-muted cursor-pointer"
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
              {invoices.map((inv) => {
                const isPaid = inv.status === 'PAID';
                const isPartial = inv.status === 'PARTIALLY_PAID';

                return (
                  <div
                    key={inv.id}
                    onClick={() => onSelectInvoice(inv.id)}
                    className="p-4 hover:bg-surface-raised cursor-pointer transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-fg-muted group-hover:text-accent transition-colors">
                          {inv.invoiceNumber}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                            isPaid
                              ? 'bg-accent/15 text-accent border border-accent/30'
                              : isPartial
                              ? 'bg-warning/15 text-warning border border-warning/30'
                              : 'bg-danger/15 text-danger border border-danger/30'
                          }`}
                        >
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
                        onClick={(e) => onEditInvoice(inv, e)}
                        className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle hover:text-accent border border-border transition-colors cursor-pointer"
                        title="Редактировать накладную"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => onDeleteInvoice(inv, e)}
                        className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle hover:text-danger border border-border transition-colors cursor-pointer"
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

      {/* MOBILE FULL-SCREEN MODAL */}
      {supplier && (
        <div className="app-safe-area lg:hidden fixed inset-0 z-40 bg-bg flex flex-col pb-[var(--sa-bottom)]">
          {/* Header */}
          <div className="p-3.5 border-b border-border bg-surface flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <Truck className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold text-fg-muted truncate max-w-50">
                {supplier.name}
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-surface-raised text-fg-muted hover:text-fg-muted hover:bg-surface transition-colors flex items-center justify-center border border-border cursor-pointer"
              title="Закрыть окно"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Metrics */}
          <div className="p-3.5 bg-surface-raised border-b border-border grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-surface p-2 rounded-lg border border-border">
              <span className="block text-[10px] text-fg-subtle">Закуплено</span>
              <strong className="text-fg-muted text-xs">
                ${formatMoney(supplier.totalPurchasedUsd)}
              </strong>
            </div>
            <div className="bg-surface p-2 rounded-lg border border-border">
              <span className="block text-[10px] text-fg-subtle">Выплачено</span>
              <strong className="text-accent text-xs">
                ${formatMoney(supplier.totalPaidUsd)}
              </strong>
            </div>
            <div className="bg-surface p-2 rounded-lg border border-border">
              <span className="block text-[10px] text-fg-subtle">Долг</span>
              <strong className="text-danger text-xs">
                ${formatMoney(supplier.totalDebtUsd)}
              </strong>
            </div>
          </div>

          {/* Action button */}
          <div className="p-3 bg-bg border-b border-border shrink-0">
            <button
              type="button"
              onClick={() => onOpenPay(supplier)}
              disabled={supplier.totalDebtUsd <= 0}
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-accent-fg shadow-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <DollarSign className="w-4 h-4" />
              <span>Погасить долг поставщику (FIFO)</span>
            </button>
          </div>

          {/* Invoices List */}
          <div className="p-2.5 bg-surface-raised border-b border-border text-xs font-semibold text-fg-muted flex items-center justify-between">
            <span>Накладные поставщика</span>
            <span className="text-[11px] text-fg-subtle">{invoices.length} шт.</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg p-1">
            {invoices.map((inv) => {
              const isPaid = inv.status === 'PAID';
              const isPartial = inv.status === 'PARTIALLY_PAID';

              return (
                <div
                  key={inv.id}
                  onClick={() => onSelectInvoice(inv.id)}
                  className="p-3 hover:bg-surface-raised active:bg-surface cursor-pointer transition-colors flex items-center justify-between group border-b border-border"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-fg-muted group-hover:text-accent transition-colors">
                        {inv.invoiceNumber}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                          isPaid
                            ? 'bg-accent/15 text-accent border border-accent/30'
                            : isPartial
                            ? 'bg-warning/15 text-warning border border-warning/30'
                            : 'bg-danger/15 text-danger border border-danger/30'
                        }`}
                      >
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

          {/* Mobile Footer */}
          <div className="p-3 border-t border-border bg-surface shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 rounded-lg bg-surface-raised hover:bg-surface text-xs font-bold text-fg-muted flex items-center justify-center space-x-1.5 transition-colors border border-border cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>ЗАКРЫТЬ КАРТОЧКУ ПОСТАВЩИКА</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
