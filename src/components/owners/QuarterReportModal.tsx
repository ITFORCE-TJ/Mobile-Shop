import React, { useState } from 'react';
import { FileText, X, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { formatUsd } from '../../utils/money';
import { Owner } from '../../types';

interface QuarterReportModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmClose: (data: { quarterName: string; transferRemainingToCapital: boolean }) => Promise<void>;
  displayOwners: Owner[];
  getOwnerDetails: (owner: Owner) => { name: string; roleTag: string; roleSub: string };
  ownerShareLabel: (ownerId: string) => string;
  isSubmitting: boolean;
}

function ownerCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'учредитель';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'учредителя';
  return 'учредителей';
}

export const QuarterReportModal: React.FC<QuarterReportModalProps> = ({
  open,
  onClose,
  onConfirmClose,
  displayOwners,
  getOwnerDetails,
  ownerShareLabel,
  isSubmitting,
}) => {
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [selectedQuarterYear, setSelectedQuarterYear] = useState<number>(2026);
  const [transferRemainingToCapital, setTransferRemainingToCapital] = useState(true);

  if (!open) return null;

  const handleConfirm = async () => {
    const quarterName = `${selectedQuarter} ${selectedQuarterYear}`;
    await onConfirmClose({
      quarterName,
      transferRemainingToCapital,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-surface border border-border p-3.5 sm:p-4 text-fg shadow-2xl space-y-3 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-fg leading-tight">
                Закрытие периода ({selectedQuarter} {selectedQuarterYear})
              </h4>
              <p className="text-[10px] text-fg-subtle">
                Финансовая ведомость и распределение прибыли партнеров
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg p-1.5 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quarter / Year Selector Toolbar */}
        <div className="flex items-center justify-between gap-2 p-1 rounded-xl bg-surface-raised border border-border">
          <div className="flex items-center gap-1 flex-1">
            {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => {
              const isSel = selectedQuarter === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setSelectedQuarter(q)}
                  className={`flex-1 py-1 px-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isSel
                      ? 'bg-amber-500 text-black shadow-xs font-black'
                      : 'text-fg-subtle hover:text-fg hover:bg-surface'
                  }`}
                >
                  {q}
                </button>
              );
            })}
          </div>

          <CustomSelect
            value={String(selectedQuarterYear)}
            onChange={(val) => setSelectedQuarterYear(parseInt(val))}
            options={[
              { value: '2026', label: '2026 г.' },
              { value: '2025', label: '2025 г.' },
              { value: '2024', label: '2024 г.' },
            ]}
            title="Выберите год"
            className="shrink-0"
          />
        </div>

        {/* Breakdown Table */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-fg-subtle px-0.5">
            <span className="font-semibold uppercase tracking-wider">Сводная ведомость ($ USD)</span>
            <span className="font-mono">{displayOwners.length} {ownerCountLabel(displayOwners.length)}</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                <tr>
                  <th className="py-2 px-2.5 font-semibold">Партнер / Доля</th>
                  <th className="py-2 px-2 text-right font-semibold">Начислено</th>
                  <th className="py-2 px-2 text-right font-semibold">Выплачено</th>
                  <th className="py-2 px-2 text-right font-semibold text-amber-500">Остаток</th>
                  <th className="py-2 px-2.5 text-right font-semibold">Капитал</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {displayOwners.map((o) => {
                  const isNegative = (o.availableProfitUsd || 0) < 0;
                  return (
                    <tr key={o.id} className="hover:bg-surface/50 font-mono transition-colors">
                      <td className="py-1.5 px-2.5 font-sans">
                        <span className="font-bold text-fg block text-xs truncate max-w-[130px] sm:max-w-none">
                          {getOwnerDetails(o).name}
                        </span>
                        <span className="text-[10px] text-fg-subtle block truncate max-w-[150px] sm:max-w-none leading-tight">
                          {ownerShareLabel(o.id)}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-semibold text-fg">
                        {formatUsd(o.totalAccruedProfitUsd)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-fg-subtle">
                        {formatUsd(o.totalPaidProfitUsd)}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-bold ${
                        isNegative ? 'text-rose-500' : (o.availableProfitUsd || 0) > 0 ? 'text-amber-500' : 'text-fg-subtle'
                      }`}>
                        {formatUsd(o.availableProfitUsd)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-medium text-fg">
                        {formatUsd(o.capitalBalanceUsd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-surface/80 font-bold border-t border-border text-xs font-mono">
                <tr>
                  <td className="py-2 px-2.5 uppercase font-sans text-fg-subtle text-[11px]">ИТОГО:</td>
                  <td className="py-2 px-2 text-right text-fg">
                    {formatUsd(displayOwners.reduce((sum, o) => sum + (o.totalAccruedProfitUsd || 0), 0))}
                  </td>
                  <td className="py-2 px-2 text-right text-fg-subtle">
                    {formatUsd(displayOwners.reduce((sum, o) => sum + (o.totalPaidProfitUsd || 0), 0))}
                  </td>
                  <td className={`py-2 px-2 text-right font-bold ${
                    displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0) < 0
                      ? 'text-rose-500'
                      : 'text-amber-500'
                  }`}>
                    {formatUsd(displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0))}
                  </td>
                  <td className="py-2 px-2.5 text-right text-fg">
                    {formatUsd(displayOwners.reduce((sum, o) => sum + (o.capitalBalanceUsd || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Sweep option interactive toggle card */}
        <div
          onClick={() => setTransferRemainingToCapital(prev => !prev)}
          className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-2.5 ${
            transferRemainingToCapital
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-surface-raised border-border hover:border-fg-subtle/30'
          }`}
        >
          <div className="pt-0.5 shrink-0">
            <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
              transferRemainingToCapital
                ? 'bg-amber-500 text-black'
                : 'border border-border bg-surface text-transparent'
            }`}>
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-fg block leading-tight">
              Зачислить прибыль в оборотный капитал
            </span>
            <span className="text-[11px] text-fg-subtle block leading-tight mt-0.5">
              {transferRemainingToCapital
                ? 'Доступный остаток прибыли будет автоматически перенесен в капитал партнеров'
                : 'Прибыль останется на балансе партнеров до следующего периода'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors cursor-pointer disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Закрытие…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Закрыть {selectedQuarter} {selectedQuarterYear}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
