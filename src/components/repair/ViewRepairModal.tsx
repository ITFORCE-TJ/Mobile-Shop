import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { formatMoney } from '../../utils/money';
import { ViewRepairModalProps, getStatusBadge } from './types';

export const ViewRepairModal: React.FC<ViewRepairModalProps> = ({
  viewingTicket,
  onClose,
  isStoreScoped,
  updatingTicketId,
  onUpdateStatusQuick,
  onOpenIssueModal,
}) => {
  return (
    <Dialog
      open={viewingTicket !== null}
      onClose={onClose}
      title={viewingTicket ? `Квитанция на ремонт #${viewingTicket.ticketNumber}` : 'Квитанция на ремонт'}
      subtitle={viewingTicket ? getStatusBadge(viewingTicket.status).label : undefined}
      maxWidth="lg"
      footer={viewingTicket && viewingTicket.status !== 'ISSUED' ? (
        <div className="w-full flex gap-2">
          {viewingTicket.status === 'ACCEPTED' && (
            <Button
              variant="secondary"
              fullWidth
              loading={updatingTicketId === viewingTicket.id}
              disabled={updatingTicketId !== null}
              onClick={async () => { if (await onUpdateStatusQuick(viewingTicket.id, 'IN_PROGRESS')) onClose(); }}
            >
              В работу
            </Button>
          )}
          {viewingTicket.status === 'IN_PROGRESS' && (
            <Button
              variant="secondary"
              fullWidth
              loading={updatingTicketId === viewingTicket.id}
              disabled={updatingTicketId !== null}
              onClick={async () => { if (await onUpdateStatusQuick(viewingTicket.id, 'READY')) onClose(); }}
            >
              Готов
            </Button>
          )}
          <Button
            fullWidth
            disabled={updatingTicketId !== null}
            onClick={() => {
              const ticketToIssue = viewingTicket;
              onClose();
              onOpenIssueModal(ticketToIssue);
            }}
          >
            Выдать клиенту
          </Button>
        </div>
      ) : undefined}
    >
      {viewingTicket && (
        <div className="space-y-4 text-xs text-fg-muted">
          {/* Device Info */}
          <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-fg-muted text-sm">{viewingTicket.deviceModel || `${viewingTicket.brand || ''} ${viewingTicket.model || ''}`}</span>
              <span className="text-fg-subtle text-[11px]">{new Date(viewingTicket.createdAt).toLocaleString('ru-RU')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-fg-muted text-xs">
              <div>
                <span className="text-fg-subtle block text-[10px] uppercase font-semibold">IMEI</span>
                <span className="font-mono text-fg-muted">{viewingTicket.imei || '—'}</span>
              </div>
              {!isStoreScoped && (
                <div>
                  <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Магазин / Точка</span>
                  <span className="text-fg-muted">{viewingTicket.storeName || 'Магазин'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Customer Details */}
          <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-1">
            <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Данные клиента</span>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-fg-muted">{viewingTicket.customerName || 'Не указано'}</span>
              <span className="text-accent font-semibold">{viewingTicket.customerPhone || 'не указан'}</span>
            </div>
          </div>

          {/* Problem / Defect Description */}
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl space-y-1">
            <span className="text-danger font-semibold block text-[10px] uppercase">Заявленная неисправность</span>
            <p className="text-fg-muted text-xs font-medium leading-relaxed">{viewingTicket.problemDescription}</p>
          </div>

          {/* Visual Condition, Equipment & Note */}
          {(viewingTicket.visualCondition || viewingTicket.equipmentPackage || viewingTicket.comment) && (
            <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-2">
              {viewingTicket.visualCondition && (
                <div>
                  <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Внешнее состояние</span>
                  <span className="text-fg-muted">{viewingTicket.visualCondition}</span>
                </div>
              )}
              {viewingTicket.equipmentPackage && (
                <div>
                  <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Комплектация</span>
                  <span className="text-fg-muted">{viewingTicket.equipmentPackage}</span>
                </div>
              )}
              {viewingTicket.comment && (
                <div>
                  <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Примечание мастера</span>
                  <span className="text-fg-muted">{viewingTicket.comment}</span>
                </div>
              )}
            </div>
          )}

          {/* Financial Details */}
          <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-2">
            <span className="text-fg-subtle block text-[10px] uppercase font-semibold">Расход на ремонт</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-fg-subtle block text-[10px]">Расход на запчасти / работу:</span>
                <span className="font-bold text-accent">
                  {viewingTicket.finalCostTjs ? `${formatMoney(viewingTicket.finalCostTjs)} TJS` : 'Задаётся при выдаче'}
                </span>
              </div>
              {viewingTicket.prepaymentTjs ? (
                <div>
                  <span className="text-fg-subtle block text-[10px]">Предоплата (справочно):</span>
                  <span className="font-bold text-fg-muted">{formatMoney(viewingTicket.prepaymentTjs)} TJS</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
};
