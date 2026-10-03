import React from 'react';
import { Plus, Landmark } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Select, ToggleRow } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { ExpenseCategory } from '../../types';
import { AddExpenseModalProps } from './types';

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  open,
  onClose,
  isSubmitting,
  category,
  setCategory,
  allCategoryOptions,
  canAddCategory,
  onOpenAddCategoryModal,
  selectedEmployeeId,
  setSelectedEmployeeId,
  users,
  amountTjs,
  setAmountTjs,
  storeId,
  setStoreId,
  retailStores,
  description,
  setDescription,
  paidFromCashRegister,
  setPaidFromCashRegister,
  isAdmin,
  rate,
  centralCashStore,
  onSubmit,
}) => {
  const isInsufficientFunds = isAdmin && paidFromCashRegister && (parseFloat(amountTjs) || 0) / rate > (centralCashStore?.cashBalanceUsd ?? 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Регистрация расхода"
      footer={
        <>
          <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={onClose}>Отмена</Button>
          <Button
            variant="danger"
            fullWidth
            type="submit"
            form="add-expense-form"
            loading={isSubmitting}
            disabled={isInsufficientFunds}
          >
            {isAdmin && paidFromCashRegister ? 'Сохранить расход' : 'Зафиксировать расход (долг)'}
          </Button>
        </>
      }
    >
      <form id="add-expense-form" onSubmit={onSubmit} className="space-y-3.5">
        <FormField label="Категория расхода" required>
          <div className="flex items-center gap-2">
            <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="w-full">
              {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            {canAddCategory && (
              <Button type="button" variant="secondary" size="md" leftIcon={Plus} onClick={onOpenAddCategoryModal} className="shrink-0 px-3">
                Новая
              </Button>
            )}
          </div>
        </FormField>

        {(category === 'EMPLOYEE_ADVANCE' || category === 'SALARY') && (
          <FormField label="Сотрудник (для удержания из ЗП)">
            <Select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="w-full">
              <option value="">— Выберите сотрудника —</option>
              {users.filter(u => u.isActive ?? u.active).map(u => (
                <option key={u.id} value={u.id}>{u.name}{u.role === 'ADMIN' ? ' (Администратор)' : ''}</option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Сумма расхода (TJS)" required>
          <div className="relative">
            <input step="0.01"
              type="number" min="0.01" required value={amountTjs} onChange={(e) => setAmountTjs(e.target.value)}
              placeholder="500"
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 pr-12 text-sm font-semibold text-danger focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">TJS</span>
          </div>
        </FormField>

        {isAdmin && (
          <FormField label="Магазин" required>
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full">
              {retailStores.map(s => <option key={s.id} value={s.id}>{formatStoreName(s.name)}</option>)}
            </Select>
          </FormField>
        )}

        <FormField label="Описание / обоснование">
          <input
            type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Оплата аренды за текущий месяц"
            className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </FormField>

        {/* Only ADMIN can choose to write off directly from Central Cash and see its balance */}
        {isAdmin && (
          <ToggleRow
            checked={paidFromCashRegister}
            onChange={setPaidFromCashRegister}
            label="Списать из Центральной кассы"
          />
        )}

        {isAdmin && paidFromCashRegister && (
          <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-accent/15 text-accent shrink-0">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-fg-muted">Центральная касса</p>
                <p className="text-[11px] text-fg-subtle">Сумма спишется с центрального баланса</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-bold text-accent">
                ${formatMoney(centralCashStore?.cashBalanceUsd)}
              </span>
              <p className="text-[10px] text-fg-subtle">Остаток в кассе</p>
            </div>
          </div>
        )}

        {isInsufficientFunds && (
          <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-[11px] text-danger">
            Внимание: в Центральной кассе недостаточно средств (Остаток: ${formatMoney(centralCashStore?.cashBalanceUsd)}, требуется: ≈${formatMoney((parseFloat(amountTjs) || 0) / rate)} = {formatMoney(parseFloat(amountTjs) || 0)} TJS по курсу {rate}).
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="text-xs text-fg-subtle">Статус оплаты</span>
          {isAdmin && paidFromCashRegister ? (
            <Badge tone="success">Оплачено</Badge>
          ) : (
            <Badge tone="warning">Долг (не оплачено)</Badge>
          )}
        </div>
        {(!isAdmin || !paidFromCashRegister) && (
          <p className="text-xs text-fg-subtle px-0.5">
            {isAdmin
              ? 'Центральная касса не изменится. Оплатить расход можно позже кнопкой «Оплатить» в списке.'
              : 'Расход фиксируется как долг. Администратор проверит и произведёт оплату из кассы.'}
          </p>
        )}
      </form>
    </Dialog>
  );
};
