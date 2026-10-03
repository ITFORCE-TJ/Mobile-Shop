import { Role, Expense } from '../../types';
import { getBusinessDateKey } from '../../utils/businessDate';

export const ROLE_CONFIG: Record<Role, { label: string; bg: string; color: string; border: string }> = {
  ADMIN: { label: 'Администратор', bg: 'bg-accent/15', color: 'text-accent', border: 'border-accent/30' },
  PARTNER: { label: 'Партнер (Владелец)', bg: 'bg-info/15', color: 'text-info', border: 'border-info/30' },
  SELLER: { label: 'Продавец-кассир', bg: 'bg-surface-raised', color: 'text-fg-subtle', border: 'border-border' }
};

export const payrollMonthOf = (e: Expense) =>
  ((e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance) && e.payrollMonth) || getBusinessDateKey(new Date(e.date)).substring(0, 7);
