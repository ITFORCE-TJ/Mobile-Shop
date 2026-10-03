import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { AddCategoryModalProps } from './types';

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  open,
  onClose,
  newCategoryName,
  setNewCategoryName,
  onSubmit,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Новая категория расхода"
      maxWidth="sm"
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>Отмена</Button>
          <Button variant="danger" fullWidth type="submit" form="add-category-form">Добавить</Button>
        </>
      }
    >
      <form id="add-category-form" onSubmit={onSubmit}>
        <FormField label="Название категории" required>
          <input
            type="text" required value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Например: Логистика, Оборудование..."
            className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </FormField>
      </form>
    </Dialog>
  );
};
