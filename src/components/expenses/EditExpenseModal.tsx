import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Select } from '../ui/Input';
import { formatStoreName } from '../../utils/storeContext';
import { ExpenseCategory } from '../../types';
import { EditExpenseModalProps } from './types';

export const EditExpenseModal: React.FC<EditExpenseModalProps> = ({
  editingExpense,
  onClose,
  isSubmitting,
  editCategory,
  setEditCategory,
  allCategoryOptions,
  editAmountTjs,
  setEditAmountTjs,
  editStoreId,
  setEditStoreId,
  stores,
  isAdmin,
  editDescription,
  setEditDescription,
  onSubmit,
}) => {
  return (
    <Dialog
      open={!!editingExpense}
      onClose={onClose}
      title="Редактировать расход"
      footer={
        <>
          <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={onClose}>Отмена</Button>
          <Button variant="primary" fullWidth type="submit" form="edit-expense-form" loading={isSubmitting}>Сохранить</Button>
        </>
      }
    >
      <form id="edit-expense-form" onSubmit={onSubmit} className="space-y-3.5">
        <FormField label="Категория расхода">
          <Select value={editCategory} onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)} className="w-full">
            {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Сумма расхода (TJS)" required>
          <input
            type="number" step="0.01" required min="0.01"
            value={editAmountTjs} onChange={(e) => setEditAmountTjs(e.target.value)}
            className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm font-semibold text-danger focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </FormField>
        {isAdmin && (
          <FormField label="Точка / филиал">
            <Select value={editStoreId} onChange={(e) => setEditStoreId(e.target.value)} className="w-full">
              {stores.map(s => <option key={s.id} value={s.id}>{formatStoreName(s.name)}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Описание / примечание">
          <input
            type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Примечание к расходу..."
            className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </FormField>
      </form>
    </Dialog>
  );
};
