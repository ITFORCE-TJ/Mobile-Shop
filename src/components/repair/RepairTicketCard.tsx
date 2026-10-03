import React from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { formatMoney } from '../../utils/money';
import { RepairTicketCardProps, getStatusBadge } from './types';

export const RepairTicketCard: React.FC<RepairTicketCardProps> = ({
  ticket,
  isStoreScoped,
  updatingTicketId,
  onViewTicket,
  onUpdateStatusQuick,
  onOpenIssueModal,
}) => {
  const conf = getStatusBadge(ticket.status);
  const isAccepted = ticket.status === 'ACCEPTED';
  const isInProgress = ticket.status === 'IN_PROGRESS';
  const isIssued = ticket.status === 'ISSUED';

  return (
    <div
      onClick={() => onViewTicket(ticket)}
      className="p-2.5 sm:p-3 rounded-xl bg-surface border border-border hover:border-border-strong hover:bg-surface-raised/40 transition-all flex flex-col gap-1.5 cursor-pointer shadow-2xs"
    >
      {/* Line 1: Ticket #, Status Badge, Date, Expense & Chevron */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs sm:text-sm font-bold text-accent font-mono shrink-0">
            Кв. #{ticket.ticketNumber}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold border shrink-0 ${conf.color}`}>
            {conf.label}
          </span>
          <span className="text-[11px] text-fg-subtle shrink-0">
            • {new Date(ticket.createdAt).toLocaleDateString('ru-RU')}
          </span>
        </div>

        {/* Right: Expense & Chevron */}
        <div className="text-right shrink-0 flex items-center gap-1.5">
          <div className="flex flex-col items-end">
            {isIssued ? (
              <>
                <span className="text-xs sm:text-sm font-bold font-mono text-accent leading-tight">
                  {formatMoney(ticket.finalCostTjs)} TJS
                </span>
                <span className="text-[10px] text-fg-subtle font-mono">расход</span>
              </>
            ) : (
              <span className="text-[10px] text-fg-subtle font-mono">
                расход при выдаче
              </span>
            )}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
        </div>
      </div>

      {/* Line 2: Device Model */}
      <div className="min-w-0">
        <h4 className="text-xs sm:text-sm font-bold text-fg truncate">
          {ticket.deviceModel || `${ticket.brand || ''} ${ticket.model || ''}`}
        </h4>
      </div>

      {/* Line 3: Client & Store & Defect */}
      <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle min-w-0 truncate">
        <span className="text-fg-muted font-medium shrink-0">
          {ticket.customerName || 'Клиент'}
        </span>
        {ticket.customerPhone && (
          <span className="shrink-0 text-fg-subtle">
            ({ticket.customerPhone})
          </span>
        )}
        {!isStoreScoped && ticket.storeName && (
          <>
            <span>•</span>
            <span className="text-fg-muted font-medium shrink-0">
              {ticket.storeName}
            </span>
          </>
        )}
        <span>•</span>
        <span className="text-danger font-medium truncate">
          Дефект: {ticket.problemDescription}
        </span>
      </div>

      {/* Line 4 (if not issued): Actions & Prepayment */}
      {!isIssued && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs" onClick={(e) => e.stopPropagation()}>
          <div>
            {ticket.prepaymentTjs ? (
              <span className="text-[10px] text-fg-subtle font-mono">
                Предоплата: <strong className="text-fg font-semibold">{formatMoney(ticket.prepaymentTjs)} TJS</strong>
              </span>
            ) : <div />}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isAccepted && (
              <button
                type="button"
                onClick={() => onUpdateStatusQuick(ticket.id, 'IN_PROGRESS')}
                disabled={updatingTicketId !== null}
                className="h-7 px-2.5 rounded-lg bg-warning/15 hover:bg-warning/25 border border-warning/30 text-xs font-semibold text-warning transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                {updatingTicketId === ticket.id && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>В работу</span>
              </button>
            )}
            {isInProgress && (
              <button
                type="button"
                onClick={() => onUpdateStatusQuick(ticket.id, 'READY')}
                disabled={updatingTicketId !== null}
                className="h-7 px-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 border border-accent/30 text-xs font-semibold text-accent transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                {updatingTicketId === ticket.id && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Готов</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenIssueModal(ticket)}
              disabled={updatingTicketId === ticket.id}
              className="h-7 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
            >
              <span>Выдать клиенту</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
