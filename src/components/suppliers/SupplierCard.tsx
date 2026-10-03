import React from 'react';
import { Supplier } from '../../types';
import { formatMoney } from '../../utils/money';
import { User, Phone, Edit, Trash2, ChevronRight } from 'lucide-react';

interface SupplierCardProps {
  supplier: Supplier;
  isSelected: boolean;
  onSelect: (s: Supplier) => void;
  onEdit: (s: Supplier, e: React.MouseEvent) => void;
  onDelete: (s: Supplier, e: React.MouseEvent) => void;
}

export const SupplierCard: React.FC<SupplierCardProps> = ({
  supplier: s,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}) => {
  const initials = (s.name || '').trim().substring(0, 2).toUpperCase() || 'П';
  const hasDebt = s.totalDebtUsd > 0;

  return (
    <div
      onClick={() => onSelect(s)}
      className={`group relative rounded-xl border transition-all text-left p-2.5 sm:p-3 cursor-pointer select-none active:scale-[0.99] flex items-center justify-between gap-2.5 ${
        isSelected
          ? 'bg-accent/10 border-accent/40 shadow-xs'
          : hasDebt
          ? 'bg-surface hover:bg-surface-raised/80 border-border/80'
          : 'bg-surface hover:bg-surface-raised/80 border-border/60 text-fg-muted'
      }`}
    >
      {/* Left: Avatar initials badge + details */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/25 text-accent font-black text-xs flex items-center justify-center shrink-0 tracking-wider">
          {initials}
        </div>
        <div className="min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-fg truncate">
            {s.name}
          </h4>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-fg-subtle flex-wrap">
            {s.contactPerson && (
              <span className="flex items-center gap-1 truncate text-fg-muted">
                <User className="w-3 h-3 text-fg-subtle shrink-0" />
                <span>{s.contactPerson}</span>
              </span>
            )}
            {s.phone && (
              <span className="flex items-center gap-1 font-mono text-[10px] text-fg-subtle">
                <Phone className="w-3 h-3 text-fg-subtle shrink-0" />
                <span>{s.phone}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Debt amount + Actions/Chevron */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          {hasDebt ? (
            <>
              <span className="text-xs sm:text-sm font-black text-danger font-mono block leading-none">
                ${formatMoney(s.totalDebtUsd)}
              </span>
              <span className="text-[10px] text-fg-subtle block font-medium mt-0.5">
                Долг
              </span>
            </>
          ) : (
            <span className="text-[10px] font-semibold text-success px-1.5 py-0.5 rounded-md bg-success/10 border border-success/20">
              Оплачено
            </span>
          )}
        </div>

        {/* Desktop hover actions */}
        <div className="hidden lg:flex items-center space-x-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => onEdit(s, e)}
            className="p-1 rounded-md text-fg-subtle hover:text-accent hover:bg-surface cursor-pointer"
            title="Редактировать поставщика"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => onDelete(s, e)}
            className="p-1 rounded-md text-fg-subtle hover:text-danger hover:bg-surface cursor-pointer"
            title="Удалить поставщика"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-1 rounded-lg bg-surface-raised/60 text-fg-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-all">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
