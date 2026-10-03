import React, { useState, useEffect } from 'react';
import { CreditCard, X, Users, ArrowDownLeft, ArrowUpRight, Warehouse, Store, Loader2 } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { Store as StoreType, Owner } from '../../types';

interface OwnerTransactionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    ownerId: string;
    type: 'INVESTMENT' | 'WITHDRAWAL';
    amountUsd: number;
    storeId: string;
    note?: string;
  }) => Promise<void>;
  displayOwners: Owner[];
  getOwnerDetails: (owner: Owner) => { name: string; roleTag: string; roleSub: string };
  stores: StoreType[];
  mainWarehouse?: StoreType;
  retailStores: StoreType[];
  rate: number;
  initialOwnerId?: string;
  initialTxType?: 'INVESTMENT' | 'WITHDRAWAL';
  isSubmitting: boolean;
}

export const OwnerTransactionModal: React.FC<OwnerTransactionModalProps> = ({
  open,
  onClose,
  onSubmit,
  displayOwners,
  getOwnerDetails,
  stores,
  mainWarehouse,
  retailStores,
  rate,
  initialOwnerId,
  initialTxType = 'INVESTMENT',
  isSubmitting,
}) => {
  const [selectedOwnerId, setSelectedOwnerId] = useState(initialOwnerId || displayOwners[0]?.id || '');
  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL'>(initialTxType);
  const [selectedTxStoreId, setSelectedTxStoreId] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      if (initialOwnerId) {
        setSelectedOwnerId(initialOwnerId);
      } else if (!selectedOwnerId && displayOwners.length > 0) {
        setSelectedOwnerId(displayOwners[0].id);
      }
      setTxType(initialTxType);
      if (!selectedTxStoreId && stores.length > 0) {
        const defaultStore = stores.find(s => !s.isMainWarehouse) || stores[0];
        setSelectedTxStoreId(defaultStore.id);
      }
      setAmountUsd('');
      setNote('');
    }
  }, [open, initialOwnerId, initialTxType, displayOwners, stores]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountUsd) || 0;
    if (val <= 0 || !selectedTxStoreId || !selectedOwnerId) return;

    await onSubmit({
      ownerId: selectedOwnerId,
      type: txType,
      amountUsd: val,
      storeId: selectedTxStoreId,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
      <form onSubmit={handleSubmit} className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-border p-4 sm:p-5 text-fg shadow-2xl space-y-3.5 text-xs">
        <div className="flex items-center justify-between pb-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-accent" />
            <h4 className="text-sm font-bold text-fg uppercase">
              Финансовая операция
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg p-1 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Учредитель *</label>
            <CustomSelect
              value={selectedOwnerId ?? ''}
              onChange={setSelectedOwnerId}
              options={displayOwners.map((o) => {
                const details = getOwnerDetails(o);
                return {
                  value: o.id,
                  label: details.name,
                  sublabel: details.roleTag,
                  icon: <Users className="w-3.5 h-3.5 text-accent" />,
                };
              })}
              title="Выберите учредителя"
              className="w-full"
              triggerClassName="w-full justify-between"
            />
          </div>

          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Тип операции *</label>
            <CustomSelect
              value={txType}
              onChange={(val) => setTxType(val as 'INVESTMENT' | 'WITHDRAWAL')}
              options={[
                { value: 'INVESTMENT', label: 'Внесение капитала (Вложение)', icon: <ArrowDownLeft className="w-3.5 h-3.5 text-accent" /> },
                { value: 'WITHDRAWAL', label: 'Изъятие / вывод капитала', icon: <ArrowUpRight className="w-3.5 h-3.5 text-danger" /> },
              ]}
              title="Тип операции"
              className="w-full"
              triggerClassName="w-full justify-between"
            />
          </div>

          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Объект (магазин / склад) *</label>
            <CustomSelect
              value={selectedTxStoreId}
              onChange={setSelectedTxStoreId}
              options={[
                ...(mainWarehouse ? [{
                  value: mainWarehouse.id,
                  label: `Центральный склад (${mainWarehouse.name})`,
                  icon: <Warehouse className="w-3.5 h-3.5 text-warning" />,
                }] : []),
                ...retailStores.map(store => ({
                  value: store.id,
                  label: formatStoreName(store.name),
                  icon: <Store className="w-3.5 h-3.5 text-accent" />,
                })),
              ]}
              title="Выберите объект"
              className="w-full"
              triggerClassName="w-full justify-between"
            />
          </div>

          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Сумма ($ USD) *</label>
            <div className="relative">
              <input
                step="0.01"
                type="number"
                min="0.01"
                required
                value={amountUsd ?? ''}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="1000"
                className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold font-mono focus:border-accent focus:outline-none pr-8"
              />
              <span className="absolute right-3 top-2 text-fg-subtle font-bold">$</span>
            </div>
            {amountUsd && parseFloat(amountUsd) > 0 && (
              <span className="text-[11px] text-accent font-semibold block mt-1 font-mono">
                ≈ {formatMoney((parseFloat(amountUsd) || 0) * rate)} TJS (по курсу {rate})
              </span>
            )}
          </div>

          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Основание / Примечание</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Причина, реквизиты или источник..."
              className="w-full rounded-xl bg-surface-raised border border-border p-2.5 text-fg focus:border-accent focus:outline-none text-xs resize-none"
            />
          </div>
        </div>

        <div className="flex space-x-2 pt-2 border-t border-border">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg border border-border uppercase disabled:opacity-50 transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'Сохранение…' : 'Провести'}
          </button>
        </div>
      </form>
    </div>
  );
};
