import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { ActionMenu } from '../ui/ActionMenu';
import { getBusinessDateKey } from '../../utils/businessDate';
import { formatMoney, sumMoney, moneyNumber } from '../../utils/money';
import React, { useState, useMemo, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { Expense, ExpenseCategory } from '../../types';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { STANDARD_EXPENSE_CATEGORIES, LEGACY_EXPENSE_LABELS } from '../../utils/expenseCategories';
import {
  Receipt,
  Plus,
  TrendingDown,
  Calendar,
  Tag,
  Home,
  UserCheck,
  Zap,
  Megaphone,
  Wrench,
  Package,
  Store as StoreIcon,
  Edit2,
  Trash2,
  SlidersHorizontal,
  Banknote,
  Landmark,
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  RotateCcw,
  X,
  User,
  Filter
} from 'lucide-react';
import { SearchBar } from '../ui/SearchBar';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { MonthPicker } from '../ui/MonthPicker';
import { DateRangePicker } from '../ui/DateRangePicker';
import { Select, ToggleRow } from '../ui/Input';
import { FormField } from '../ui/FormField';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';

const STANDARD_CATEGORIES = STANDARD_EXPENSE_CATEGORIES;

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  RENT: Home, 'Аренда': Home,
  SALARY: UserCheck, EMPLOYEE_ADVANCE: UserCheck, 'Зарплата': UserCheck, 'Аванс сотрудника': UserCheck,
  UTILITIES: Zap, 'Коммунальные': Zap,
  MARKETING: Megaphone, 'Реклама': Megaphone,
  TAXES: Receipt,
  SUPPLIES: Package, 'Хозяйственные': Package, 'Транспорт': Package, 'Доставка': Package,
  REPAIR_PARTS: Wrench, 'Ремонт': Wrench,
  OTHER: Tag, 'Другие': Tag,
};

type CustomCategory = { id: string; label: string };

function getCategoryLabel(key: string, customCategories: CustomCategory[]): string {
  const std = STANDARD_CATEGORIES.find(c => c.id === key);
  if (std) return std.label;
  const custom = customCategories.find(c => c.id === key || c.label === key);
  if (custom) return custom.label;
  return LEGACY_EXPENSE_LABELS[key] || key || 'Прочие расходы';
}

function getCategoryIcon(key: string): React.ElementType {
  return CATEGORY_ICONS[key] || Tag;
}

export const ExpensesPage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const { currentUser, expenses, fetchExpensesRange, stores, users, todayRate, createExpense, updateExpense, deleteExpense, payExpense, isInitialLoading, selectedStoreId: globalSelectedStoreId } = useAppFields('currentUser', 'expenses', 'fetchExpensesRange', 'stores', 'users', 'todayRate', 'createExpense', 'updateExpense', 'deleteExpense', 'payExpense', 'isInitialLoading', 'selectedStoreId');

  const isSeller = currentUser?.role === 'SELLER';
  const isPartner = currentUser?.role === 'PARTNER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isStoreScoped = isSeller || isPartner;
  const canAddCategory = isAdmin || isPartner;

  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);
  const centralCashStore = useMemo(() => {
    const warehouses = stores.filter(s => s.isMainWarehouse);
    if (warehouses.length === 0) return stores[0] || null;
    return warehouses.reduce((best, cur) => (cur.cashBalanceUsd || 0) > (best.cashBalanceUsd || 0) ? cur : best, warehouses[0]);
  }, [stores]);

  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [payingExpense, setPayingExpense] = useState<Expense | null>(null);
  const [payStoreId, setPayStoreId] = useState('');

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('RENT');
  const [editAmountTjs, setEditAmountTjs] = useState('');
  const [editStoreId, setEditStoreId] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [amountTjs, setAmountTjs] = useState('');
  const [storeId, setStoreId] = useState(() => {
    if (isStoreScoped) return currentUser?.storeId || '';
    return retailStores[0]?.id || stores[0]?.id || '';
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [paidFromCashRegister, setPaidFromCashRegister] = useState(isAdmin);

  useEffect(() => {
    if (isStoreScoped) {
      if (currentUser?.storeId) setStoreId(currentUser.storeId);
      return;
    }
    if (!storeId && retailStores.length > 0) setStoreId(retailStores[0].id);
  }, [retailStores, storeId, isStoreScoped, currentUser?.storeId]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'YESTERDAY' | 'MONTH' | 'CUSTOM' | 'ALL'>('MONTH');
  const [selectedStartDate, setSelectedStartDate] = useState<string>('');
  const [selectedEndDate, setSelectedEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC'>('DATE_DESC');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState('ALL');
  // Defaults to whichever store is currently active on the POS Terminal page —
  // an admin picking a store there should see that same store here without
  // re-picking it; they can still switch it locally afterward.
  const [selectedStoreFilter, setSelectedStoreFilter] = useState(() => {
    if (isPartner) return currentUser?.storeId || '';
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all') return globalSelectedStoreId;
    return 'ALL';
  });

  useEffect(() => {
    if (isPartner) {
      if (currentUser?.storeId) setSelectedStoreFilter(currentUser.storeId);
      return;
    }
    if (!isSeller) {
      if (globalSelectedStoreId && globalSelectedStoreId !== 'all') {
        setSelectedStoreFilter(globalSelectedStoreId);
      } else {
        setSelectedStoreFilter('ALL');
      }
    }
  }, [globalSelectedStoreId, isSeller, isPartner, currentUser?.storeId]);

  const todayStr = getBusinessDateKey();
  const thisMonthStr = todayStr.substring(0, 7);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getBusinessDateKey(d);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const params: {
      period?: 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL';
      month?: string;
      startDate?: string;
      endDate?: string;
      storeId?: string;
    } = {};

    if (periodFilter === 'TODAY') {
      params.period = 'TODAY';
    } else if (periodFilter === 'YESTERDAY') {
      params.startDate = yesterdayStr;
      params.endDate = yesterdayStr;
    } else if (periodFilter === 'MONTH') {
      params.period = 'SPECIFIC_MONTH';
      params.month = thisMonthStr;
    } else if (periodFilter === 'CUSTOM' && selectedStartDate) {
      params.startDate = selectedStartDate;
      params.endDate = selectedEndDate || selectedStartDate;
    } else if (periodFilter === 'ALL') {
      params.period = 'ALL';
    }

    if (selectedStoreFilter !== 'ALL') {
      params.storeId = selectedStoreFilter;
    }

    fetchExpensesRange(params).catch((e) => {
      if (!cancelled) console.error('Failed to load expenses for period', e);
    });

    return () => {
      cancelled = true;
    };
  }, [periodFilter, selectedStartDate, selectedEndDate, selectedStoreFilter, thisMonthStr, yesterdayStr, fetchExpensesRange, dataRefreshRevision]);

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() => {
    try {
      const saved = localStorage.getItem('custom_expense_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleStartEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setEditCategory(exp.category);
    setEditAmountTjs((exp.amountTjs || 0).toFixed(2));
    setEditStoreId(isStoreScoped ? (currentUser?.storeId || '') : (exp.storeId || stores[0]?.id || ''));
    setEditDescription(exp.comment || exp.description || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || isSubmitting) return;
    const val = parseFloat(editAmountTjs) || 0;
    if (val <= 0) {
      setStatus({ tone: 'error', text: 'Укажите корректную сумму расхода' });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await updateExpense(editingExpense.id, {
        category: editCategory,
        amountTjs: val,
        storeId: isStoreScoped ? (currentUser?.storeId || '') : editStoreId,
        comment: editDescription.trim(),
        description: editDescription.trim(),
      });
      if (res.success) {
        setEditingExpense(null);
        setStatus({ tone: 'success', text: 'Расход успешно обновлён' });
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка обновления расхода' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await deleteExpense(deletingId);
      setDeletingId(null);
      if (res.success) {
        setStatus({ tone: 'success', text: 'Расход удалён, средства возвращены в баланс Центральной кассы' });
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка удаления расхода' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartPay = (exp: Expense) => {
    setPayingExpense(exp);
    setPayStoreId(centralCashStore?.id || '');
  };

  const handleConfirmPay = async () => {
    if (!payingExpense || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await payExpense(payingExpense.id, centralCashStore?.id);
      if (res.success) {
        setStatus({ tone: 'success', text: `Расход оплачен: ${formatMoney(payingExpense.amountTjs)} TJS списано из Центральной кассы` });
        setPayingExpense(null);
      } else {
        setStatus({ tone: 'error', text: res.message || 'Не удалось оплатить расход' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setStatus(null);

    const val = parseFloat(amountTjs) || 0;
    if (val <= 0) {
      setStatus({ tone: 'error', text: 'Укажите положительную сумму расхода' });
      return;
    }

    const selectedEmp = selectedEmployeeId ? users.find(u => u.id === selectedEmployeeId) : undefined;

    const isPaid = isAdmin ? paidFromCashRegister : false;

    setIsSubmitting(true);
    try {
      const res = await createExpense({
        category,
        amountTjs: val,
        storeId: isStoreScoped ? (currentUser?.storeId || '') : storeId,
        sourceAccount: isPaid ? 'Центральная касса' : undefined,
        description: description.trim(),
        paidFromCashRegister: isPaid,
        employeeId: selectedEmployeeId || undefined,
        employeeName: selectedEmp?.name,
        isEmployeeAdvance: category === 'EMPLOYEE_ADVANCE' || !!selectedEmployeeId,
      });

      if (res.success) {
        setIsModalOpen(false);
        setAmountTjs('');
        setDescription('');
        setSelectedEmployeeId('');
        const paidNote = isPaid ? 'оплачен из Центральной кассы' : 'зафиксирован как долг (ожидает оплаты администратором)';
        setStatus({ tone: 'success', text: `Расход на сумму ${val} TJS ${paidNote}${selectedEmp ? ` (зачислен сотруднику ${selectedEmp.name})` : ''}` });
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка проведения расхода' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;

    const allExist = [...STANDARD_CATEGORIES, ...customCategories];
    if (allExist.some(c => c.label.toLowerCase() === name.toLowerCase() || c.id.toLowerCase() === name.toLowerCase())) {
      setStatus({ tone: 'error', text: `Категория "${name}" уже существует` });
      return;
    }

    // Use the readable name itself as the id (not a synthetic CUSTOM_<timestamp> tag):
    // the backend stores `category` as a plain string on the expense record, so anyone
    // viewing it later — a different admin, a different browser/device — must be able to
    // read the category directly from that stored value, without depending on this
    // browser's localStorage still holding the id→label mapping.
    const newCat = { id: name, label: name };
    const updated = [...customCategories, newCat];
    setCustomCategories(updated);
    try { localStorage.setItem('custom_expense_categories', JSON.stringify(updated)); } catch {}

    setSelectedCategoryTab(newCat.id);
    setCategory(newCat.id as ExpenseCategory);
    setIsAddCategoryModalOpen(false);
    setNewCategoryName('');
    setStatus({ tone: 'success', text: `Новая категория "${name}" добавлена` });
  };

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  const activeEmployees = useMemo(() => {
    return users.filter(u => u.isActive ?? u.active);
  }, [users]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of expenses) {
      if (selectedStoreFilter !== 'ALL' && exp.storeId !== selectedStoreFilter) continue;
      map[exp.category] = (map[exp.category] || 0) + 1;
    }
    return map;
  }, [expenses, selectedStoreFilter]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (isStoreScoped && e.storeId !== currentUser?.storeId) return false;
      if (selectedStoreFilter !== 'ALL' && e.storeId !== selectedStoreFilter) return false;

      const expDateStr = getBusinessDateKey(new Date(e.date));
      if (periodFilter === 'TODAY' && expDateStr !== todayStr) return false;
      if (periodFilter === 'YESTERDAY' && expDateStr !== yesterdayStr) return false;
      if (periodFilter === 'MONTH' && !expDateStr.startsWith(thisMonthStr)) return false;
      if (periodFilter === 'CUSTOM') {
        if (selectedStartDate) {
          const start = selectedStartDate;
          const end = selectedEndDate || selectedStartDate;
          const minDate = start < end ? start : end;
          const maxDate = start < end ? end : start;
          if (expDateStr < minDate || expDateStr > maxDate) return false;
        }
      }

      if (statusFilter === 'UNPAID' && e.status !== 'UNPAID') return false;
      if (statusFilter === 'PAID' && e.status === 'UNPAID') return false;

      if (selectedEmployeeFilter === 'ANY_EMPLOYEE') {
        if (!e.employeeId && e.category !== 'EMPLOYEE_ADVANCE' && e.category !== 'SALARY') return false;
      } else if (selectedEmployeeFilter !== 'ALL') {
        if (e.employeeId !== selectedEmployeeFilter) return false;
      }

      if (selectedCategoryTab !== 'ALL') {
        const targetLabel = getCategoryLabel(selectedCategoryTab, customCategories).toLowerCase();
        const expCat = (e.category || '').toLowerCase();
        const expLabel = getCategoryLabel(e.category, customCategories).toLowerCase();

        const matchesId = expCat === selectedCategoryTab.toLowerCase();
        const matchesLabel = expLabel === targetLabel || expCat.includes(targetLabel) || targetLabel.includes(expCat);
        if (!matchesId && !matchesLabel) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const label = getCategoryLabel(e.category, customCategories).toLowerCase();
        const empName = (e.employeeName || '').toLowerCase();
        const matches =
          label.includes(q) ||
          (e.category || '').toLowerCase().includes(q) ||
          (e.comment || e.description || '').toLowerCase().includes(q) ||
          (e.createdByName || '').toLowerCase().includes(q) ||
          (e.storeName || '').toLowerCase().includes(q) ||
          empName.includes(q) ||
          (e.amountTjs || 0).toString().includes(q);
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'DATE_ASC') return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
      if (sortBy === 'AMOUNT_DESC') return (b.amountTjs || 0) - (a.amountTjs || 0);
      if (sortBy === 'AMOUNT_ASC') return (a.amountTjs || 0) - (b.amountTjs || 0);
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });
  }, [
    expenses,
    isStoreScoped,
    currentUser,
    periodFilter,
    selectedStartDate,
    selectedEndDate,
    todayStr,
    yesterdayStr,
    thisMonthStr,
    statusFilter,
    selectedEmployeeFilter,
    selectedStoreFilter,
    selectedCategoryTab,
    searchQuery,
    customCategories,
    sortBy
  ]);

  const totalExpensesTjs = useMemo(() => sumMoney(filteredExpenses.map((e) => e.amountTjs || 0)), [filteredExpenses]);
  // Each expense keeps the USD amount computed at its own day's exchange rate — summing those
  // (falling back to that record's own rate, never today's, when amountUsd wasn't stored) is
  // what keeps this in sync with the reports page, instead of re-converting the TJS total at
  // today's rate and drifting whenever the rate has moved since the expense was recorded.
  const totalExpensesUsd = useMemo(
    () => moneyNumber(sumMoney(filteredExpenses.map((e) => e.amountUsd ?? moneyNumber((e.amountTjs || 0) / (e.exchangeRate || rate))))),
    [filteredExpenses, rate]
  );
  const unpaidTotalTjs = useMemo(
    () => sumMoney(filteredExpenses.map((e) => (e.status === 'UNPAID' ? e.amountTjs || 0 : 0))),
    [filteredExpenses]
  );
  const unpaidCount = useMemo(() => filteredExpenses.filter(e => e.status === 'UNPAID').length, [filteredExpenses]);

  const totalUnpaidInScope = useMemo(() => {
    return expenses.filter(e => e.status === 'UNPAID' && (selectedStoreFilter === 'ALL' || e.storeId === selectedStoreFilter)).length;
  }, [expenses, selectedStoreFilter]);

  const deletingExpense = deletingId ? expenses.find(e => e.id === deletingId) : undefined;
  const allCategoryOptions = [...STANDARD_CATEGORIES, ...customCategories];

  const isPeriodCustomized = periodFilter !== 'MONTH';
  const isStoreFiltered = isAdmin && selectedStoreFilter !== 'ALL';
  const isCategoryFiltered = selectedCategoryTab !== 'ALL';
  const isStatusFiltered = statusFilter !== 'ALL';
  const isEmployeeFiltered = selectedEmployeeFilter !== 'ALL';
  const isSearchActive = Boolean(searchQuery.trim());
  const isSortChanged = sortBy !== 'DATE_DESC';

  const activeFiltersCount =
    (isPeriodCustomized ? 1 : 0) +
    (isStoreFiltered ? 1 : 0) +
    (isCategoryFiltered ? 1 : 0) +
    (isStatusFiltered ? 1 : 0) +
    (isEmployeeFiltered ? 1 : 0) +
    (isSearchActive ? 1 : 0) +
    (isSortChanged ? 1 : 0);

  const hasActiveFilters = activeFiltersCount > 0;

  const handleResetFilters = () => {
    setPeriodFilter('MONTH');
    setSelectedStartDate('');
    setSelectedEndDate('');
    setSelectedStoreFilter(isPartner ? (currentUser?.storeId || '') : 'ALL');
    setSelectedCategoryTab('ALL');
    setStatusFilter('ALL');
    setSelectedEmployeeFilter('ALL');
    setSortBy('DATE_DESC');
    setSearchQuery('');
  };

  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел расходов доступен только администраторам и партнёрам." />
      </div>
    );
  }

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="border-b border-border bg-bg shrink-0">
        <div className="px-3 pb-3">
          <div className="p-3.5 rounded-xl bg-surface border border-border flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-danger/10 text-danger shrink-0">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-fg-subtle font-medium">
                    Итого за период: <strong className="text-fg font-semibold">{filteredExpenses.length}</strong> из {expenses.length} записей
                  </span>
                  {hasActiveFilters && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-bold border border-accent/25">
                      Фильтров: {activeFiltersCount}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
                  <span className="text-xl font-bold text-danger">-{formatMoney(totalExpensesTjs)} TJS</span>
                  <span className="text-xs text-fg-subtle">≈ -${formatMoney(totalExpensesUsd)}</span>
                  {filteredExpenses.length > 0 && (
                    <span className="text-[11px] text-fg-subtle">
                      · ср. {formatMoney(totalExpensesTjs / filteredExpenses.length)} TJS
                    </span>
                  )}
                </div>
                {unpaidTotalTjs > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === 'UNPAID' ? 'ALL' : 'UNPAID')}
                    className="text-xs font-semibold text-warning hover:underline flex items-center gap-1.5 mt-1 cursor-pointer"
                    title="Нажмите для фильтрации"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>из них не оплачено: <strong>{formatMoney(unpaidTotalTjs)} TJS</strong> ({unpaidCount} шт.)</span>
                    <span className="text-[10px] underline ml-0.5">
                      {statusFilter === 'UNPAID' ? '✕ сбросить фильтр' : '→ показать'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasActiveFilters && (
                <Button
                  variant="secondary"
                  size="md"
                  leftIcon={RotateCcw}
                  onClick={handleResetFilters}
                  className="text-xs font-semibold"
                >
                  Сбросить
                </Button>
              )}
              <Button variant="danger" leftIcon={Plus} onClick={() => setIsModalOpen(true)}>
                Добавить расход
              </Button>
            </div>
          </div>
        </div>

        {/* Search, Status, and Filter toggle bar */}
        <div className="px-3 pb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Поиск по расходу, категории, автору, сотруднику, сумме..."
              className="flex-1 min-w-50"
            />

            {/* Quick Status pills */}
            <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-xl border border-border text-xs shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-surface text-fg shadow-xs border border-border/80'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Все
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('UNPAID')}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  statusFilter === 'UNPAID'
                    ? 'bg-warning/20 text-warning border border-warning/40 shadow-xs'
                    : 'text-fg-subtle hover:text-warning'
                }`}
              >
                <span>Не оплачено</span>
                {totalUnpaidInScope > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    statusFilter === 'UNPAID' ? 'bg-warning text-black' : 'bg-warning/20 text-warning'
                  }`}>
                    {totalUnpaidInScope}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PAID')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  statusFilter === 'PAID'
                    ? 'bg-accent/20 text-accent border border-accent/40 shadow-xs'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Оплачено
              </button>
            </div>

            {/* Advanced Filters Button */}
            <button
              type="button"
              onClick={() => setFiltersOpen(v => !v)}
              className={`relative h-10 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-all ${
                filtersOpen || hasActiveFilters
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface text-fg-muted hover:border-accent/40'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Фильтры</span>
              {hasActiveFilters && (
                <span className="w-5 h-5 rounded-full bg-accent text-accent-fg font-bold text-[10px] flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Quick Date Bar: Preset Pills + DateRangePicker */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-xl border border-border text-xs shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedStartDate('');
                  setSelectedEndDate('');
                  setPeriodFilter('TODAY');
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  periodFilter === 'TODAY'
                    ? 'bg-surface text-accent shadow-xs border border-border/80'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedStartDate('');
                  setSelectedEndDate('');
                  setPeriodFilter('YESTERDAY');
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  periodFilter === 'YESTERDAY'
                    ? 'bg-surface text-accent shadow-xs border border-border/80'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Вчера
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedStartDate('');
                  setSelectedEndDate('');
                  setPeriodFilter('MONTH');
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  periodFilter === 'MONTH'
                    ? 'bg-surface text-accent shadow-xs border border-border/80'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Этот месяц
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedStartDate('');
                  setSelectedEndDate('');
                  setPeriodFilter('ALL');
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  periodFilter === 'ALL'
                    ? 'bg-surface text-accent shadow-xs border border-border/80'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Все время
              </button>
            </div>

            {/* Custom Date Range Picker (Single Date or Range) */}
            <DateRangePicker
              startDate={selectedStartDate}
              endDate={selectedEndDate}
              isToday={periodFilter === 'TODAY'}
              onChange={(start, end) => {
                setSelectedStartDate(start);
                setSelectedEndDate(end);
                setPeriodFilter('CUSTOM');
              }}
              onResetToday={() => {
                setSelectedStartDate('');
                setSelectedEndDate('');
                setPeriodFilter('TODAY');
              }}
              className="shrink-0"
            />
          </div>

          {/* Active Filter Chips Bar (one-click removable tags) */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
              <span className="text-[11px] text-fg-subtle font-medium">Активно:</span>
              {periodFilter !== 'MONTH' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-border text-fg-muted shadow-2xs">
                  <Calendar className="w-3 h-3 text-accent" />
                  <span>
                    {periodFilter === 'TODAY'
                      ? 'Сегодня'
                      : periodFilter === 'YESTERDAY'
                      ? 'Вчера'
                      : periodFilter === 'ALL'
                      ? 'Все время'
                      : selectedStartDate === selectedEndDate || !selectedEndDate
                      ? `Дата: ${selectedStartDate}`
                      : `${selectedStartDate} — ${selectedEndDate}`}
                  </span>
                  <button
                    onClick={() => {
                      setPeriodFilter('MONTH');
                      setSelectedStartDate('');
                      setSelectedEndDate('');
                    }}
                    className="hover:text-danger ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {statusFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-border text-fg-muted shadow-2xs">
                  <span>Статус: {statusFilter === 'UNPAID' ? 'Не оплачено' : 'Оплачено'}</span>
                  <button onClick={() => setStatusFilter('ALL')} className="hover:text-danger ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {isAdmin && selectedStoreFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-border text-fg-muted shadow-2xs">
                  <StoreIcon className="w-3 h-3 text-accent" />
                  <span>{stores.find(s => s.id === selectedStoreFilter)?.name || selectedStoreFilter}</span>
                  <button onClick={() => setSelectedStoreFilter('ALL')} className="hover:text-danger ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedCategoryTab !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-border text-fg-muted shadow-2xs">
                  <Tag className="w-3 h-3 text-accent" />
                  <span>{getCategoryLabel(selectedCategoryTab, customCategories)}</span>
                  <button onClick={() => setSelectedCategoryTab('ALL')} className="hover:text-danger ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedEmployeeFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-border text-fg-muted shadow-2xs">
                  <User className="w-3 h-3 text-accent" />
                  <span>
                    {selectedEmployeeFilter === 'ANY_EMPLOYEE'
                      ? 'Все сотрудники'
                      : users.find(u => u.id === selectedEmployeeFilter)?.name || selectedEmployeeFilter}
                  </span>
                  <button onClick={() => setSelectedEmployeeFilter('ALL')} className="hover:text-danger ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {sortBy !== 'DATE_DESC' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-border text-fg-muted shadow-2xs">
                  <ArrowUpDown className="w-3 h-3 text-accent" />
                  <span>
                    {sortBy === 'DATE_ASC'
                      ? 'Сначала старые'
                      : sortBy === 'AMOUNT_DESC'
                      ? 'Сумма: макс'
                      : 'Сумма: мин'}
                  </span>
                  <button onClick={() => setSortBy('DATE_DESC')} className="hover:text-danger ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {searchQuery.trim() && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-border text-fg-muted shadow-2xs">
                  <span>Поиск: «{searchQuery}»</span>
                  <button onClick={() => setSearchQuery('')} className="hover:text-danger ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={handleResetFilters}
                className="text-[11px] text-accent hover:underline font-bold ml-1"
              >
                Сбросить все
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Advanced Filters Panel */}
        {filtersOpen && (
          <div className="px-3 pb-3 border-t border-border pt-3 bg-surface-raised/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Store Filter */}
              {isAdmin && (
                <div>
                  <label className="block text-fg-subtle mb-1 text-[11px] font-bold">Филиал / Точка:</label>
                  <Select
                    value={selectedStoreFilter}
                    onChange={(e) => setSelectedStoreFilter(e.target.value)}
                    className="w-full h-9 px-3 text-xs font-semibold"
                  >
                    <option value="ALL">Все филиалы и склады</option>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.isMainWarehouse ? `Центральный склад (${s.name})` : `Магазин «${s.name}»`}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Category Filter */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-fg-subtle text-[11px] font-bold">Категория:</label>
                  {canAddCategory && (
                    <button
                      type="button"
                      onClick={() => setIsAddCategoryModalOpen(true)}
                      className="text-[10px] text-accent hover:underline font-bold flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Новая</span>
                    </button>
                  )}
                </div>
                <Select
                  value={selectedCategoryTab}
                  onChange={(e) => setSelectedCategoryTab(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-semibold"
                >
                  <option value="ALL">Все категории ({expenses.length})</option>
                  {allCategoryOptions.map(c => {
                    const cnt = categoryCounts[c.id] || 0;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.label} {cnt > 0 ? `(${cnt})` : ''}
                      </option>
                    );
                  })}
                </Select>
              </div>

              {/* Employee Filter */}
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] font-bold">Сотрудник / Назначение:</label>
                <Select
                  value={selectedEmployeeFilter}
                  onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-semibold"
                >
                  <option value="ALL">Все расходы</option>
                  <option value="ANY_EMPLOYEE">Только сотрудники (авансы/ЗП)</option>
                  {activeEmployees.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.role === 'ADMIN' ? ' (Админ)' : ''}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Sorting */}
              <div>
                <label className="block text-fg-subtle mb-1 text-[11px] font-bold">Сортировка:</label>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="w-full h-9 px-3 text-xs font-semibold"
                >
                  <option value="DATE_DESC">Сначала новые (по дате)</option>
                  <option value="DATE_ASC">Сначала старые (по дате)</option>
                  <option value="AMOUNT_DESC">Сумма: по убыванию (макс)</option>
                  <option value="AMOUNT_ASC">Сумма: по возрастанию (мин)</option>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-border/60">
              <span className="text-[11px] text-fg-subtle">
                Найдено <strong className="text-fg">{filteredExpenses.length}</strong> из {expenses.length} расходов
              </span>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs text-danger hover:underline font-semibold flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Сбросить фильтры</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="px-3 py-1 rounded-lg bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg"
                >
                  Свернуть
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isInitialLoading ? (
          <LoadingState label="Загрузка расходов…" />
        ) : filteredExpenses.length === 0 ? (
          <EmptyState icon={Receipt} title="Операционные расходы не найдены" />
        ) : (
          <div className="divide-y divide-border">
            {filteredExpenses.map((exp) => {
              const Icon = getCategoryIcon(exp.category);
              const label = getCategoryLabel(exp.category, customCategories);
              const formattedDate = exp.date ? new Date(exp.date).toLocaleDateString('ru-RU') : '—';
              const costUsd = exp.amountUsd ?? +(exp.amountTjs / (exp.exchangeRate || rate)).toFixed(2);

              return (
                <div key={exp.id} className="p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-surface-raised text-fg-muted shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-fg-muted">{label}</span>
                      {exp.status === 'UNPAID'
                        ? <Badge tone="warning">Не оплачено</Badge>
                        : <Badge tone="success">Оплачено</Badge>}
                      {exp.status === 'PAID' && exp.sourceAccount?.toLowerCase().includes('касса') && (
                        <Badge tone="neutral">{exp.sourceAccount === 'Центральная касса' ? 'Центральная касса' : 'Из кассы'}</Badge>
                      )}
                      {exp.employeeName && <Badge tone="accent">{exp.employeeName}</Badge>}
                    </div>
                    <p className="text-sm text-fg-muted mt-0.5">{exp.comment || exp.description || 'Операционный расход'}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle mt-1">
                      {!isStoreScoped && (
                        <>
                          <StoreIcon className="w-3 h-3" />
                          <span>{exp.storeName || 'Магазин'}</span>
                          <span>·</span>
                        </>
                      )}
                      <Calendar className="w-3 h-3" />
                      <span>{formattedDate}</span>
                      <span>·</span>
                      <span>{exp.createdByName || 'Администратор'}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-danger">-{formatMoney(exp.amountTjs)} TJS</p>
                    <p className="text-xs text-fg-subtle">≈ -${formatMoney(costUsd)}</p>
                    <div className="flex items-center gap-1 mt-1.5 justify-end">
                      {isAdmin && exp.status === 'UNPAID' && (
                        <IconButton icon={Banknote} tone="accent" size="sm" aria-label="Оплатить расход" onClick={() => handleStartPay(exp)} />
                      )}
                      {(isAdmin || isPartner) && (
                        <ActionMenu label="Действия с расходом" actions={[
                          { label: 'Редактировать расход', icon: Edit2, onSelect: () => handleStartEdit(exp) },
                          { label: 'Удалить расход', icon: Trash2, danger: true, onSelect: () => setDeletingId(exp.id) },
                        ]} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deletingId}
        title="Удалить расход?"
        message={deletingExpense?.status === 'UNPAID'
          ? 'Расход не был оплачен — баланс кассы не изменится. Это действие нельзя отменить.'
          : 'Расход будет отменён, средства вернутся в баланс Центральной кассы. Это действие нельзя отменить.'}
        confirmLabel="Удалить"
        loading={isSubmitting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingId(null)}
      />

      <Dialog
        open={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        title="Редактировать расход"
        footer={
          <>
            <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={() => setEditingExpense(null)}>Отмена</Button>
            <Button variant="primary" fullWidth type="submit" form="edit-expense-form" loading={isSubmitting}>Сохранить</Button>
          </>
        }
      >
        <form id="edit-expense-form" onSubmit={handleSaveEdit} className="space-y-3.5">
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
                {/* All stores, not just retail ones: a payroll expense (salary/advance for
                    an ADMIN/PARTNER) can legitimately be attributed to the main warehouse,
                    and the dropdown must include the record's actual current store. */}
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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

      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Регистрация расхода"
        footer={
          <>
            <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={() => setIsModalOpen(false)}>Отмена</Button>
            <Button
              variant="danger"
              fullWidth
              type="submit"
              form="add-expense-form"
              loading={isSubmitting}
              disabled={isAdmin && paidFromCashRegister && (parseFloat(amountTjs) || 0) / rate > (centralCashStore?.cashBalanceUsd ?? 0)}
            >
              {isAdmin && paidFromCashRegister ? 'Сохранить расход' : 'Зафиксировать расход (долг)'}
            </Button>
          </>
        }
      >
        <form id="add-expense-form" onSubmit={handleAddExpense} className="space-y-3.5">
          <FormField label="Категория расхода" required>
            <div className="flex items-center gap-2">
              <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="w-full">
                {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
              {canAddCategory && (
                <Button type="button" variant="secondary" size="md" leftIcon={Plus} onClick={() => setIsAddCategoryModalOpen(true)} className="shrink-0 px-3">
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
                {retailStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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

          {isAdmin && paidFromCashRegister && (parseFloat(amountTjs) || 0) / rate > (centralCashStore?.cashBalanceUsd ?? 0) && (
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

      {isAdmin && (
        <Dialog
          open={!!payingExpense}
          onClose={() => setPayingExpense(null)}
          title="Оплатить расход"
          maxWidth="sm"
          footer={
            <>
              <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={() => setPayingExpense(null)}>Отмена</Button>
              <Button
                variant="primary"
                fullWidth
                loading={isSubmitting}
                disabled={(centralCashStore?.cashBalanceUsd ?? 0) < (payingExpense?.amountUsd ?? (payingExpense?.amountTjs ?? 0) / rate)}
                onClick={handleConfirmPay}
              >
                Оплатить из Центральной кассы
              </Button>
            </>
          }
        >
          {payingExpense && (
            <div className="space-y-3.5">
              <p className="text-sm text-fg-muted">
                {getCategoryLabel(payingExpense.category, customCategories)}: <span className="font-semibold text-danger">{formatMoney(payingExpense.amountTjs)} TJS</span>
              </p>
              <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-accent/15 text-accent shrink-0">
                    <Landmark className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-fg-muted">Центральная касса</p>
                    <p className="text-[11px] text-fg-subtle">
                      {payingExpense.storeName ? `Филиал: ${payingExpense.storeName}` : 'Общий расход компании'}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-accent">
                    ${formatMoney(centralCashStore?.cashBalanceUsd)}
                  </span>
                  <p className="text-[10px] text-fg-subtle">Остаток в кассе</p>
                </div>
              </div>

              {(centralCashStore?.cashBalanceUsd ?? 0) < (payingExpense.amountUsd ?? payingExpense.amountTjs / rate) && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-[11px] text-danger">
                  Внимание: в Центральной кассе недостаточно средств (Остаток: ${formatMoney(centralCashStore?.cashBalanceUsd)}, требуется: ${formatMoney(payingExpense.amountUsd ?? payingExpense.amountTjs / rate)}).
                </div>
              )}
            </div>
          )}
        </Dialog>
      )}

      <Dialog
        open={isAddCategoryModalOpen}
        onClose={() => setIsAddCategoryModalOpen(false)}
        title="Новая категория расхода"
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setIsAddCategoryModalOpen(false)}>Отмена</Button>
            <Button variant="danger" fullWidth type="submit" form="add-category-form">Добавить</Button>
          </>
        }
      >
        <form id="add-category-form" onSubmit={handleAddCategorySubmit}>
          <FormField label="Название категории" required>
            <input
              type="text" required value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Например: Логистика, Оборудование..."
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </FormField>
        </form>
      </Dialog>
    </div>
  );
};
