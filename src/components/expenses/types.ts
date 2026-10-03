import React from 'react';
import {
  Tag,
  Home,
  UserCheck,
  Zap,
  Megaphone,
  Receipt,
  Package,
  Wrench,
} from 'lucide-react';
import { STANDARD_EXPENSE_CATEGORIES, LEGACY_EXPENSE_LABELS } from '../../utils/expenseCategories';
import { Expense, ExpenseCategory, Store, User } from '../../types';

export const STANDARD_CATEGORIES = STANDARD_EXPENSE_CATEGORIES;

export const CATEGORY_ICONS: Record<string, React.ElementType> = {
  RENT: Home, 'Аренда': Home,
  SALARY: UserCheck, EMPLOYEE_ADVANCE: UserCheck, 'Зарплата': UserCheck, 'Аванс сотрудника': UserCheck,
  UTILITIES: Zap, 'Коммунальные': Zap,
  MARKETING: Megaphone, 'Реклама': Megaphone,
  TAXES: Receipt,
  SUPPLIES: Package, 'Хозяйственные': Package, 'Транспорт': Package, 'Доставка': Package,
  REPAIR_PARTS: Wrench, 'Ремонт': Wrench,
  OTHER: Tag, 'Другие': Tag,
};

export type CustomCategory = { id: string; label: string };

export function getCategoryLabel(key: string, customCategories: CustomCategory[]): string {
  const std = STANDARD_CATEGORIES.find(c => c.id === key);
  if (std) return std.label;
  const custom = customCategories.find(c => c.id === key || c.label === key);
  if (custom) return custom.label;
  return LEGACY_EXPENSE_LABELS[key] || key || 'Прочие расходы';
}

export function getCategoryIcon(key: string): React.ElementType {
  return CATEGORY_ICONS[key] || Tag;
}

export interface ExpensesHeaderBarProps {
  totalExpensesTjs: number;
  totalExpensesUsd: number;
  filteredExpensesCount: number;
  totalExpensesCount: number;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onOpenAddModal: () => void;
  unpaidTotalTjs: number;
  unpaidCount: number;
  totalUnpaidInScope: number;
  statusFilter: 'ALL' | 'UNPAID' | 'PAID';
  setStatusFilter: (val: 'ALL' | 'UNPAID' | 'PAID') => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  todayStr: string;
  thisMonthStr: string;
  periodFilter: 'TODAY' | 'CUSTOM' | 'MONTH' | 'ALL';
  setPeriodFilter: (val: 'TODAY' | 'CUSTOM' | 'MONTH' | 'ALL') => void;
  selectedMonth: string;
  setSelectedMonth: (val: string) => void;
  selectedStartDate: string;
  setSelectedStartDate: (val: string) => void;
  selectedEndDate: string;
  setSelectedEndDate: (val: string) => void;
  resetToCurrentMonth: () => void;
  filtersOpen: boolean;
  setFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeFiltersCount: number;
  isAdmin: boolean;
  isStoreModeCentral: boolean;
  selectedStoreFilter: string;
  setSelectedStoreFilter: (val: string) => void;
  stores: Store[];
  canAddCategory: boolean;
  onOpenAddCategoryModal: () => void;
  selectedCategoryTab: string;
  setSelectedCategoryTab: (val: string) => void;
  allCategoryOptions: { id: string; label: string }[];
  categoryCounts: Record<string, number>;
  selectedEmployeeFilter: string;
  setSelectedEmployeeFilter: (val: string) => void;
  activeEmployees: User[];
  users: User[];
  sortBy: 'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC';
  setSortBy: (val: 'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC') => void;
  customCategories: CustomCategory[];
}

export interface ExpensesTableProps {
  filteredExpenses: Expense[];
  isStoreScoped: boolean;
  customCategories: CustomCategory[];
  rate: number;
  isAdmin: boolean;
  isPartner: boolean;
  onStartPay: (exp: Expense) => void;
  onStartEdit: (exp: Expense) => void;
  onConfirmDeleteId: (id: string) => void;
}

export interface ExpensesCardsListProps {
  filteredExpenses: Expense[];
  totalExpensesCount: number;
  isStoreScoped: boolean;
  customCategories: CustomCategory[];
  rate: number;
  isAdmin: boolean;
  isPartner: boolean;
  onStartPay: (exp: Expense) => void;
  onStartEdit: (exp: Expense) => void;
  onConfirmDeleteId: (id: string) => void;
}

export interface AddExpenseModalProps {
  open: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  category: ExpenseCategory;
  setCategory: (val: ExpenseCategory) => void;
  allCategoryOptions: { id: string; label: string }[];
  canAddCategory: boolean;
  onOpenAddCategoryModal: () => void;
  selectedEmployeeId: string;
  setSelectedEmployeeId: (val: string) => void;
  users: User[];
  amountTjs: string;
  setAmountTjs: (val: string) => void;
  storeId: string;
  setStoreId: (val: string) => void;
  retailStores: Store[];
  description: string;
  setDescription: (val: string) => void;
  paidFromCashRegister: boolean;
  setPaidFromCashRegister: (val: boolean) => void;
  isAdmin: boolean;
  rate: number;
  centralCashStore: Store | null;
  onSubmit: (e: React.FormEvent) => void;
}

export interface EditExpenseModalProps {
  editingExpense: Expense | null;
  onClose: () => void;
  isSubmitting: boolean;
  editCategory: ExpenseCategory;
  setEditCategory: (val: ExpenseCategory) => void;
  allCategoryOptions: { id: string; label: string }[];
  editAmountTjs: string;
  setEditAmountTjs: (val: string) => void;
  editStoreId: string;
  setEditStoreId: (val: string) => void;
  stores: Store[];
  isAdmin: boolean;
  editDescription: string;
  setEditDescription: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export interface PayExpenseModalProps {
  payingExpense: Expense | null;
  onClose: () => void;
  isSubmitting: boolean;
  centralCashStore: Store | null;
  rate: number;
  customCategories: CustomCategory[];
  onConfirmPay: () => void;
}

export interface AddCategoryModalProps {
  open: boolean;
  onClose: () => void;
  newCategoryName: string;
  setNewCategoryName: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}
