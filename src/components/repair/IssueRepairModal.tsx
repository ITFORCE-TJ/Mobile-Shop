import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { formatMoney } from '../../utils/money';
import { IssueRepairModalProps } from './types';

export const IssueRepairModal: React.FC<IssueRepairModalProps> = ({
  selectedTicket,
  onClose,
  isSubmitting,
  issueFinalCost,
  setIssueFinalCost,
  onConfirmIssue,
}) => {
  return (
    <Dialog
      open={selectedTicket !== null}
      onClose={() => { if (!isSubmitting) onClose(); }}
      title="Выдача ремонта клиенту"
      subtitle={selectedTicket ? `Квитанция #${selectedTicket.ticketNumber}` : undefined}
      footer={
        <div className="w-full grid grid-cols-2 gap-2">
          <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={onClose}>Отмена</Button>
          <Button fullWidth loading={isSubmitting} onClick={onConfirmIssue}>
            {isSubmitting ? 'Выдача…' : (parseFloat(issueFinalCost) || 0) > 0 ? 'Подтвердить выдачу' : 'Выдать без расхода'}
          </Button>
        </div>
      }
    >
      {selectedTicket && (
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-1">
            <p className="font-semibold text-fg-muted">{selectedTicket.deviceModel || selectedTicket.model}</p>
            <p className="text-xs text-fg-subtle">Клиент: {selectedTicket.customerName} ({selectedTicket.customerPhone || 'телефон не указан'})</p>
          </div>
          <label className="block">
            <span className="block text-fg-subtle mb-1 text-xs font-semibold">Расход на ремонт (запчасти / работа мастера), TJS</span>
            <input
              step="0.01"
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="0.00"
              value={issueFinalCost}
              onChange={(e) => setIssueFinalCost(e.target.value)}
              className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent font-bold focus:border-accent focus:outline-none"
            />
          </label>
          {selectedTicket.prepaymentTjs ? (
            <div className="p-2.5 rounded-xl bg-surface-raised border border-border flex justify-between items-center text-xs">
              <span className="text-fg-subtle">Предоплата по квитанции (справочно)</span>
              <span className="font-semibold text-fg-muted">{formatMoney(selectedTicket.prepaymentTjs)} TJS</span>
            </div>
          ) : null}
          <p className="text-xs text-fg-subtle">
            {(parseFloat(issueFinalCost) || 0) > 0
              ? 'Сумма будет списана с кассы магазина как расход на запчасти и ремонт.'
              : 'Расход не указан: ремонт будет выдан без списания с кассы.'}
          </p>
        </div>
      )}
    </Dialog>
  );
};
