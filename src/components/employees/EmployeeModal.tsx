import React, { useState, useEffect } from 'react';
import { User, Store, Role } from '../../types';
import { Users, X, Eye, EyeOff, Loader2 } from 'lucide-react';

interface EmployeeModalProps {
  open: boolean;
  editingUser: User | null;
  stores: Store[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    login: string;
    password?: string;
    role: Role;
    storeId?: string;
    isActive: boolean;
    baseSalaryTjs: number;
    salesCommissionPercent: number;
  }) => Promise<{ success: boolean; message?: string }>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  open,
  editingUser,
  stores,
  onClose,
  onSubmit,
  onSuccess,
  onError,
}) => {
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('SELLER');
  const [storeId, setStoreId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [baseSalaryTjs, setBaseSalaryTjs] = useState<string>('');
  const [salesCommissionPercent, setSalesCommissionPercent] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingUser) {
      setName(editingUser.name);
      setLogin(editingUser.login);
      setPassword('');
      setShowPassword(false);
      setRole(editingUser.role);
      setStoreId(editingUser.storeId || stores[0]?.id || '');
      setIsActive(editingUser.isActive ?? editingUser.active);
      setBaseSalaryTjs(editingUser.baseSalaryTjs?.toString() || '');
      setSalesCommissionPercent(editingUser.salesCommissionPercent?.toString() || '');
    } else {
      setName('');
      setLogin('');
      setPassword('');
      setShowPassword(false);
      setRole('SELLER');
      setStoreId(stores[0]?.id || '');
      setIsActive(true);
      setBaseSalaryTjs('');
      setSalesCommissionPercent('');
    }
  }, [editingUser, stores, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!name.trim() || !login.trim()) {
      onError('Заполните имя и логин');
      return;
    }

    if (!editingUser && !password.trim()) {
      onError('Укажите пароль для входа нового сотрудника');
      return;
    }

    if ((role === 'SELLER' || role === 'PARTNER') && (!storeId || !storeId.trim())) {
      onError(
        role === 'PARTNER'
          ? 'Для создания партнера обязательно выберите магазин филиала (*)'
          : 'Для продавца привязка к магазину обязательна (*)'
      );
      return;
    }

    const baseSal = role === 'SELLER' ? parseFloat(baseSalaryTjs) || 0 : 0;
    const commPct = role === 'SELLER' ? parseFloat(salesCommissionPercent) || 0 : 0;

    setIsSubmitting(true);
    try {
      const res = await onSubmit({
        name: name.trim(),
        login: login.trim(),
        password: password.trim() || undefined,
        role,
        storeId: (role === 'SELLER' || role === 'PARTNER') ? (storeId || undefined) : undefined,
        isActive,
        baseSalaryTjs: baseSal,
        salesCommissionPercent: commPct,
      });

      if (res.success) {
        onSuccess(editingUser ? `Данные сотрудника ${name} обновлены` : `Сотрудник ${name} успешно добавлен`);
        onClose();
      } else {
        onError(res.message || (editingUser ? 'Ошибка обновления' : 'Ошибка создания'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-3.5">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h4 className="text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center space-x-2">
            <Users className="w-4 h-4 text-accent" />
            <span>{editingUser ? 'РЕДАКТИРОВАНИЕ СОТРУДНИКА' : 'НОВЫЙ СОТРУДНИК'}</span>
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs space-y-3">
          <div>
            <label className="block text-fg-subtle text-[10px] uppercase mb-1">ФИО СОТРУДНИКА *</label>
            <input
              type="text"
              required
              value={name ?? ''}
              onChange={(e) => setName(e.target.value)}
              placeholder="Саид Каримов"
              className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-fg-subtle text-[10px] uppercase mb-1">ЛОГИН ДЛЯ ВХОДА *</label>
            <input
              type="text"
              required
              value={login ?? ''}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="seller3"
              className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-fg-subtle text-[10px] uppercase mb-1">
              <span>{editingUser ? 'НОВЫЙ ПАРОЛЬ (оставьте пустым, чтобы не менять)' : 'ПАРОЛЬ ДЛЯ ВХОДА *'}</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required={!editingUser}
                value={password ?? ''}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editingUser ? 'Оставьте пустым, чтобы не менять пароль' : 'Пароль для входа в систему'}
                className="w-full rounded-lg bg-surface-raised border border-border pl-3 pr-10 py-2 text-fg-muted focus:border-accent focus:outline-none font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-fg-subtle hover:text-fg-muted transition-colors"
                title={showPassword ? 'Скрыть пароль' : 'Показать пароль сотрудника'}
              >
                {showPassword ? <EyeOff className="w-4 h-4 text-accent" /> : <Eye className="w-4 h-4 text-fg-subtle hover:text-accent" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-fg-subtle text-[10px] uppercase mb-1">РОЛЬ ДОСТУПА</label>
            <select
              value={role ?? 'SELLER'}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg-muted focus:border-accent focus:outline-none"
            >
              <option value="SELLER">Продавец (ограничен своим магазином, без себестоимости)</option>
              <option value="PARTNER">Партнер филиала (доля прибыли, финансы магазина)</option>
              <option value="ADMIN">Администратор (полный доступ)</option>
            </select>
          </div>

          {(role === 'SELLER' || role === 'PARTNER') && (
            <div>
              <label className="block text-warning text-[10px] uppercase mb-1 font-bold">
                ПРИВЯЗКА К МАГАЗИНУ <span className="text-danger font-bold">* (ОБЯЗАТЕЛЬНО)</span>
              </label>
              <select
                required
                value={storeId ?? ''}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full rounded-lg bg-surface-raised border border-warning/40 px-3 py-2 text-fg font-bold focus:border-warning focus:outline-none cursor-pointer"
              >
                <option value="">-- ВЫБЕРИТЕ ТОЧКУ ПРОДАЖ / МАГАЗИН * --</option>
                {stores.filter((s) => !s.isMainWarehouse).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-fg-subtle mt-1">
                {role === 'PARTNER'
                  ? 'Партнёр обязательно прикрепляется к филиалу и получает долю от прибыли этого магазина.'
                  : 'Продавец работает только с кассой и складом выбранного магазина.'}
              </p>
            </div>
          )}

          {role === 'SELLER' && (
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-surface-raised border border-border">
              <div>
                <label className="block text-accent text-[10px] uppercase mb-1 font-bold">ОКЛАД (TJS/МЕС)</label>
                <input
                  step="0.01"
                  type="number"
                  min="0"
                  value={baseSalaryTjs}
                  onChange={(e) => setBaseSalaryTjs(e.target.value)}
                  placeholder="1500"
                  className="w-full rounded-lg bg-surface border border-border px-3 py-1.5 text-fg-muted font-mono text-xs focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-accent text-[10px] uppercase mb-1 font-bold">КОМИССИЯ ПРОДАЖ (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.0001"
                  value={salesCommissionPercent}
                  onChange={(e) => setSalesCommissionPercent(e.target.value)}
                  placeholder="2.5"
                  className="w-full rounded-lg bg-surface border border-border px-3 py-1.5 text-fg-muted font-mono text-xs focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          )}

          {editingUser && (
            <div className="pt-2 border-t border-border">
              <label className="flex items-center space-x-2 cursor-pointer text-fg-muted">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded bg-surface-raised border-border text-accent focus:ring-0"
                />
                <span>Активная учетная запись</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex space-x-2 pt-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
          >
            ОТМЕНА
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold uppercase text-accent-fg shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'СОХРАНЕНИЕ…' : editingUser ? 'СОХРАНИТЬ' : 'СОЗДАТЬ'}
          </button>
        </div>
      </form>
    </div>
  );
};
