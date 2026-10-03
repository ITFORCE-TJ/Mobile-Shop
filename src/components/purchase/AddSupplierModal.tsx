import React, { useState } from 'react';
import { Building, X, Loader2 } from 'lucide-react';

interface AddSupplierModalProps {
  open: boolean;
  onClose: () => void;
  createSupplier: (data: { name: string; phone?: string; contactPerson?: string }) => Promise<{ success: boolean; message?: string }>;
  onError: (msg: string) => void;
}

export const AddSupplierModal: React.FC<AddSupplierModalProps> = ({
  open,
  onClose,
  createSupplier,
  onError,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contact, setContact] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const res = await createSupplier({
        name: name.trim(),
        phone: phone.trim() || undefined,
        contactPerson: contact.trim() || undefined,
      });
      if (res.success) {
        setName('');
        setPhone('');
        setContact('');
        onClose();
      } else {
        onError(res.message || 'Ошибка добавления поставщика');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 shadow-2xl text-xs">
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
          <h3 className="text-sm font-bold text-fg-muted flex items-center space-x-2">
            <Building className="w-4 h-4 text-accent" />
            <span>Добавить нового поставщика</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-fg-subtle hover:text-fg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-fg-subtle mb-1">Название поставщика *</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Xiaomi Tech Hub"
              className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-fg-subtle mb-1">Контактное лицо</label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Фарход"
              className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-fg-subtle mb-1">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+992 90 000 0000"
              className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSaving ? 'СОХРАНЕНИЕ…' : 'ДОБАВИТЬ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
