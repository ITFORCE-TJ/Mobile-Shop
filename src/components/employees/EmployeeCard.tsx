import React from 'react';
import { User, Store, Sale } from '../../types';
import { ActionMenu } from '../ui/ActionMenu';
import { Edit2, Trash2, Plus, DollarSign, Receipt } from 'lucide-react';
import { decimal, moneyNumber } from '../../utils/money';
import { getBusinessDateKey } from '../../utils/businessDate';

interface EmployeeCardProps {
  user: User;
  stats: { totalAdvances: number; salesRevTjs: number; unitsSold: number };
  stores: Store[];
  currentUser: User | null;
  selectedPayrollMonth: string;
  sales: Sale[];
  onEdit: (u: User) => void;
  onDelete: (u: User) => void;
  onOpenAdvance: (u: User) => void;
  onOpenSalaryPayout: (u: User, autoGross: number, month: string) => void;
  onOpenHistory: (u: User) => void;
}

export const EmployeeCard: React.FC<EmployeeCardProps> = ({
  user: u,
  stats,
  stores,
  currentUser,
  selectedPayrollMonth,
  sales,
  onEdit,
  onDelete,
  onOpenAdvance,
  onOpenSalaryPayout,
  onOpenHistory,
}) => {
  const { totalAdvances, salesRevTjs, unitsSold } = stats;
  const baseSal = u.baseSalaryTjs || 0;
  const commPct = u.salesCommissionPercent || 0;

  const resolvedStoreName = (() => {
    const name = u.storeName || (u.storeId ? stores.find((s) => s.id === u.storeId)?.name : undefined);
    if (name) return name;
    if (u.role === 'SELLER' || u.role === 'PARTNER') return 'Не привязан';
    return 'Все филиалы';
  })();

  return (
    <div
      key={u.id}
      className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border transition-all flex flex-col gap-2 shadow-2xs relative overflow-hidden group ${
        u.isActive
          ? 'bg-surface border-border hover:border-accent/40'
          : 'bg-surface/60 border-border/60 opacity-75'
      }`}
    >
      {/* Line 1: Avatar, Name, Status & Action menu */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 bg-surface-raised text-fg border border-border">
            {u.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <h4 className="text-xs sm:text-sm font-bold text-fg truncate">
              {u.name}
            </h4>
            {u.isActive ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/10 text-accent border border-accent/20 font-semibold inline-flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Активен
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-danger/15 text-danger border border-danger/30 font-semibold shrink-0">
                Заблокирован
              </span>
            )}
          </div>
        </div>

        {currentUser?.role === 'ADMIN' && (
          <div className="shrink-0">
            <ActionMenu
              label={`Действия: ${u.name}`}
              subtitle={`Сотрудник: ${u.name}`}
              actions={[
                {
                  label: 'Редактировать сотрудника',
                  description: 'Изменить имя, логин, роль, оклад или пароль',
                  icon: Edit2,
                  onSelect: () => onEdit(u),
                },
                ...(currentUser.id !== u.id
                  ? [
                      {
                        label: 'Удалить сотрудника',
                        description: 'Безвозвратное удаление учетной записи',
                        icon: Trash2,
                        danger: true,
                        onSelect: () => onDelete(u),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        )}
      </div>

      {/* Line 2: Details grid */}
      {u.role === 'SELLER' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2 rounded-xl bg-surface-raised/60 border border-border/50 text-[11px]">
          <div className="min-w-0">
            <span className="text-[10px] text-fg-subtle block">Логин</span>
            <span className="font-mono font-semibold text-fg truncate block">{u.login}</span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] text-fg-subtle block">Оклад / Комиссия</span>
            <span className="font-mono font-semibold text-accent truncate block">
              {baseSal > 0 ? `${baseSal.toLocaleString()} TJS` : 'Без оклада'} {commPct > 0 ? `(+${commPct}%)` : ''}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:block border-t sm:border-t-0 border-border/40 pt-1 sm:pt-0 min-w-0">
            <span className="text-[10px] text-fg-subtle block">Продажи (Авансы)</span>
            <div className="flex items-center gap-1 font-mono text-fg font-semibold truncate">
              <span>{salesRevTjs.toLocaleString()} TJS</span>
              <span className="text-fg-subtle font-normal text-[10px]">({unitsSold} шт)</span>
              <span className="text-fg-subtle">·</span>
              <span className={`text-[10px] font-bold ${totalAdvances > 0 ? 'text-warning' : 'text-fg-subtle'}`}>
                Ав: {totalAdvances.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 p-2 rounded-xl bg-surface-raised/60 border border-border/50 text-[11px]">
          <div className="min-w-0">
            <span className="text-[10px] text-fg-subtle block">Логин</span>
            <span className="font-mono font-semibold text-fg truncate block">{u.login}</span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] text-fg-subtle block">Привязка филиала</span>
            <span className={`text-[11px] font-medium truncate block ${u.storeId ? 'text-accent' : 'text-fg-muted'}`}>
              {resolvedStoreName}
            </span>
          </div>
        </div>
      )}

      {/* Line 3: Action Buttons (Only for sellers) */}
      {u.role === 'SELLER' && (
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onOpenAdvance(u)}
            className="h-7.5 px-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-fg-subtle" />
            <span>Аванс</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const thisMonth = selectedPayrollMonth;
              const empSales = sales.filter(
                (s) =>
                  s.sellerId === u.id &&
                  s.status !== 'REFUNDED' &&
                  getBusinessDateKey(new Date(s.date)).startsWith(thisMonth)
              );
              const totalEmpSalesRev = empSales.reduce((sum, s) => sum + s.totalTjs, 0);
              const commAmount = moneyNumber(decimal(totalEmpSalesRev).mul(commPct).div(100));
              const autoGross = baseSal + commAmount;
              onOpenSalaryPayout(u, autoGross, thisMonth);
            }}
            className="h-7.5 px-2 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/25 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <DollarSign className="w-3 h-3" />
            <span>Зарплата</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenHistory(u)}
            className="h-7.5 px-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            title="Финансовая история выплат и авансов"
          >
            <Receipt className="w-3 h-3 text-fg-subtle" />
            <span>История</span>
          </button>
        </div>
      )}
    </div>
  );
};
