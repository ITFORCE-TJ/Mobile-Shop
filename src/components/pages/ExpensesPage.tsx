import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { ActionMenu } from '../ui/ActionMenu';
import { getBusinessDateKey } from '../../utils/businessDate';
import React, { useState, useMemo, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { Expense, ExpenseCategory, Store } from '../../types';
import { isStoreScoped } from '../../utils/roles';
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
  Banknote
} from 'lucide-react';
import { SearchBar } from '../ui/SearchBar';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { MonthPicker } from '../ui/MonthPicker';
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

/** Network-level expense: marked BUSINESS, or booked to the main warehouse (central safe). */
function isNetworkExpense(expense: Expense, stores: Store[]): boolean {
  if (expense.targetType === 'BUSINESS') return true;
  if (!expense.storeId) return true;
  return stores.some(s => s.id === expense.storeId && s.isMainWarehouse);
}

function getCategoryIcon(key: string): React.ElementType {
  return CATEGORY_ICONS[key] || Tag;
}

export const ExpensesPage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const { currentUser, expenses, fetchExpensesRange, stores, users, todayRate, createExpense, updateExpense, deleteExpense, payExpense, isInitialLoading, selectedStoreId: globalSelectedStoreId } = useAppFields('currentUser', 'expenses', 'fetchExpensesRange', 'stores', 'users', 'todayRate', 'createExpense', 'updateExpense', 'deleteExpense', 'payExpense', 'isInitialLoading', 'selectedStoreId');

  const isSeller = currentUser?.role === 'SELLER';
  // A store manager works with their own store's expenses only (enforced server-side too).
  const isManager = currentUser?.role === 'STORE_MANAGER';
  const isScoped = isStoreScoped(currentUser);
  const canAddCategory = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);

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
  const [storeId, setStoreId] = useState(retailStores[0]?.id || stores[0]?.id || '');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [paidFromCashRegister, setPaidFromCashRegister] = useState(true);
  // «Расход филиала» vs «Общесетевой расход» — see createExpense on the server.
  const [expenseTarget, setExpenseTarget] = useState<'STORE' | 'BUSINESS'>('STORE');

  useEffect(() => {
    if (!storeId && retailStores.length > 0) setStoreId(retailStores[0].id);
  }, [retailStores, storeId]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'SPECIFIC_MONTH' | 'ALL'>('SPECIFIC_MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState('ALL');
  // Defaults to whichever store is currently active on the POS Terminal page —
  // an admin picking a store there should see that same store here without
  // re-picking it; they can still switch it locally afterward.
  const [selectedStoreFilter, setSelectedStoreFilter] = useState(
    globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : 'ALL'
  );
  // Follow the global store switcher in the TopBar.
  useEffect(() => {
    setSelectedStoreFilter(globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : 'ALL');
  }, [globalSelectedStoreId]);

  // `expenses` from context only holds a recent bounded window by default — the current
  // month (this page's own default filter) is always inside it, but "весь период" or an
  // older month reaches further back, so fetch that exact range from the server and merge
  // it in. Guarded against a stale response overwriting a newer one on fast clicks.
  useEffect(() => {
    const thisMonth = getBusinessDateKey().substring(0, 7);

    let cancelled = false;
    fetchExpensesRange({
      period: periodFilter,
      month: periodFilter === 'SPECIFIC_MONTH' ? selectedMonth : undefined,
    }).catch((e) => { if (!cancelled) console.error('Failed to load expenses for period', e); });
    return () => { cancelled = true; };
  }, [periodFilter, selectedMonth, fetchExpensesRange, dataRefreshRevision]);

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
    setEditAmountTjs((exp.amountTjs || 0).toString());
    setEditStoreId(exp.storeId || stores[0]?.id || '');
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
        storeId: editStoreId,
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
        setStatus({ tone: 'success', text: 'Расход удалён, средства возвращены в баланс кассы' });
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка удаления расхода' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartPay = (exp: Expense) => {
    setPayingExpense(exp);
    setPayStoreId(exp.storeId || retailStores[0]?.id || '');
  };

  const handleConfirmPay = async () => {
    if (!payingExpense || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await payExpense(payingExpense.id, payingExpense.storeId || isNetworkExpense(payingExpense, stores) ? undefined : payStoreId);
      if (res.success) {
        setStatus({ tone: 'success', text: `Расход оплачен: ${payingExpense.amountTjs.toLocaleString()} TJS списано из кассы` });
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

    setIsSubmitting(true);
    try {
      const res = await createExpense({
        category,
        amountTjs: val,
        targetType: isScoped ? 'STORE' : expenseTarget,
        storeId: isScoped ? currentUser?.storeId : expenseTarget === 'BUSINESS' ? undefined : storeId,
        description: description.trim(),
        paidFromCashRegister,
        employeeId: selectedEmployeeId || undefined,
        employeeName: selectedEmp?.name,
        isEmployeeAdvance: category === 'EMPLOYEE_ADVANCE' || !!selectedEmployeeId,
      });

      if (res.success) {
        setIsModalOpen(false);
        setAmountTjs('');
        setDescription('');
        setSelectedEmployeeId('');
        const paidNote = paidFromCashRegister
          ? (!isScoped && expenseTarget === 'BUSINESS' ? 'оплачен из центральной кассы' : 'оплачен из кассы')
          : 'записан как не оплаченный';
        setStatus({ tone: 'success', text: `${!isScoped && expenseTarget === 'BUSINESS' ? 'Общесетевой расход' : 'Расход'} на сумму ${val} TJS ${paidNote}${selectedEmp ? ` (зачислен сотруднику ${selectedEmp.name})` : ''}` });
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

  const filteredExpenses = useMemo(() => {
    const todayStr = getBusinessDateKey();

    return expenses.filter(e => {
      if (isScoped && e.storeId !== currentUser?.storeId) return false;
      if (selectedStoreFilter === 'NETWORK') {
        if (!isNetworkExpense(e, stores)) return false;
      } else if (selectedStoreFilter !== 'ALL' && e.storeId !== selectedStoreFilter) return false;

      const expDateStr = getBusinessDateKey(new Date(e.date));
      if (periodFilter === 'TODAY' && expDateStr !== todayStr) return false;
      if (periodFilter === 'SPECIFIC_MONTH' && !expDateStr.startsWith(selectedMonth)) return false;

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
        const matches =
          label.includes(q) ||
          (e.category || '').toLowerCase().includes(q) ||
          (e.comment || e.description || '').toLowerCase().includes(q) ||
          (e.createdByName || '').toLowerCase().includes(q) ||
          (e.storeName || '').toLowerCase().includes(q) ||
          e.amountTjs.toString().includes(q);
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [expenses, isScoped, stores, currentUser, periodFilter, selectedMonth, selectedStoreFilter, selectedCategoryTab, searchQuery, customCategories]);

  const totalExpensesTjs = useMemo(() => filteredExpenses.reduce((acc, e) => acc + (e.amountTjs || 0), 0), [filteredExpenses]);
  // Each expense keeps the USD amount computed at its own day's exchange rate — summing those
  // (falling back to that record's own rate, never today's, when amountUsd wasn't stored) is
  // what keeps this in sync with the reports page, instead of re-converting the TJS total at
  // today's rate and drifting whenever the rate has moved since the expense was recorded.
  const totalExpensesUsd = useMemo(
    () => +filteredExpenses.reduce((acc, e) => acc + (e.amountUsd ?? ((e.amountTjs || 0) / (e.exchangeRate || rate))), 0).toFixed(2),
    [filteredExpenses, rate]
  );
  const unpaidTotalTjs = useMemo(
    () => filteredExpenses.reduce((acc, e) => acc + (e.status === 'UNPAID' ? e.amountTjs || 0 : 0), 0),
    [filteredExpenses]
  );
  const deletingExpense = deletingId ? expenses.find(e => e.id === deletingId) : undefined;

  const allCategoryOptions = [...STANDARD_CATEGORIES, ...customCategories];
  const hasActiveFilters = periodFilter !== 'SPECIFIC_MONTH' || (!isScoped && selectedStoreFilter !== 'ALL') || selectedCategoryTab !== 'ALL';

  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел расходов доступен администраторам, партнёрам и управляющим магазинов." />
      </div>
    );
  }

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="border-b border-border bg-bg shrink-0">
        <div className="px-3 pb-3">
          <div className="p-3 rounded-lg bg-surface border border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-danger/10 text-danger shrink-0">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs text-fg-subtle block">Итого за период ({filteredExpenses.length} запис.)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-danger">-{totalExpensesTjs.toLocaleString()} TJS</span>
                  <span className="text-xs text-fg-subtle">≈ -${totalExpensesUsd.toLocaleString()}</span>
                </div>
                {unpaidTotalTjs > 0 && (
                  <span className="text-xs font-semibold text-warning block">из них не оплачено: {unpaidTotalTjs.toLocaleString()} TJS</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="danger" leftIcon={Plus} onClick={() => setIsModalOpen(true)}>
                Добавить
              </Button>
            </div>
          </div>
        </div>

        <div className="px-3 pb-3 flex items-center gap-2">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Поиск по расходу / автору..." className="flex-1" />
          <button
            type="button"
            onClick={() => setFiltersOpen(v => !v)}
            className={`relative h-11 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
              filtersOpen ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Фильтры</span>
            {hasActiveFilters && !filtersOpen && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent" />}
          </button>
        </div>

        {filtersOpen && (
          <div className="px-3 pb-3 border-t border-border pt-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 shrink-0">
              <FilterPillGroup
                options={[{ value: 'TODAY', label: 'Сегодня' }, { value: 'SPECIFIC_MONTH', label: 'Месяц' }]}
                value={periodFilter}
                onChange={(v) => setPeriodFilter(v as typeof periodFilter)}
              />

              {periodFilter === 'SPECIFIC_MONTH' && (
                <MonthPicker
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  className="h-9 px-3 rounded-lg border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none"
                />
              )}

              {!isScoped && (
                <Select value={selectedStoreFilter} onChange={(e) => setSelectedStoreFilter(e.target.value)} className="h-9 px-3 pr-8 text-xs font-semibold w-auto shrink-0 cursor-pointer">
                  <option value="ALL">Все расходы</option>
                  <option value="NETWORK">Общесетевые</option>
                  {retailStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}

              <Select value={selectedCategoryTab} onChange={(e) => setSelectedCategoryTab(e.target.value)} className="h-9 px-3 pr-8 text-xs font-semibold w-auto shrink-0 cursor-pointer">
                <option value="ALL">Все категории</option>
                {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>

              {canAddCategory && (
                <Button variant="secondary" size="md" leftIcon={Plus} className="h-9 px-3 text-xs font-semibold shrink-0 whitespace-nowrap" onClick={() => setIsAddCategoryModalOpen(true)}>
                  Категория
                </Button>
              )}
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
                      {exp.status === 'PAID' && exp.sourceAccount?.toLowerCase().includes('касса') && <Badge tone="neutral">Из кассы</Badge>}
                      {exp.employeeName && <Badge tone="accent">{exp.employeeName}</Badge>}
                      {isNetworkExpense(exp, stores) && <Badge tone="info">Общесетевой</Badge>}
                    </div>
                    <p className="text-sm text-fg-muted mt-0.5">{exp.comment || exp.description || 'Операционный расход'}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle mt-1">
                      <StoreIcon className="w-3 h-3" />
                      <span>{isNetworkExpense(exp, stores) ? 'Вся сеть' : exp.storeName || 'Магазин'}</span>
                      <span>·</span>
                      <Calendar className="w-3 h-3" />
                      <span>{formattedDate}</span>
                      <span>·</span>
                      <span>{exp.createdByName || 'Администратор'}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-danger">-{(exp.amountTjs ?? 0).toLocaleString()} TJS</p>
                    <p className="text-xs text-fg-subtle">≈ -${costUsd.toLocaleString()}</p>
                    {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER' || (isManager && !exp.employeeId && !isNetworkExpense(exp, stores))) && (
                      <div className="flex items-center gap-1 mt-1.5 justify-end">
                        {exp.status === 'UNPAID' && (
                          <IconButton icon={Banknote} tone="accent" size="sm" aria-label="Оплатить расход" onClick={() => handleStartPay(exp)} />
                        )}
                        <ActionMenu label="Действия с расходом" actions={[
                          { label: 'Редактировать расход', icon: Edit2, onSelect: () => handleStartEdit(exp) },
                          { label: 'Удалить расход', icon: Trash2, danger: true, onSelect: () => setDeletingId(exp.id) },
                        ]} />
                      </div>
                    )}
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
          ? 'Расход не был оплачен — касса не изменится. Это действие нельзя отменить.'
          : 'Средства вернутся в баланс кассы. Это действие нельзя отменить.'}
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
          {!isManager && !(editingExpense && isNetworkExpense(editingExpense, stores)) && <FormField label="Точка / филиал">
            <Select value={editStoreId} onChange={(e) => setEditStoreId(e.target.value)} className="w-full">
              {/* All stores, not just retail ones: a payroll expense (salary/advance for
                  an ADMIN/PARTNER) can legitimately be attributed to the main warehouse,
                  and the dropdown must include the record's actual current store. */}
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>}
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
            <Button variant="danger" fullWidth type="submit" form="add-expense-form" loading={isSubmitting}>Сохранить расход</Button>
          </>
        }
      >
        <form id="add-expense-form" onSubmit={handleAddExpense} className="space-y-3.5">
          {!isScoped && (
            <FormField label="Чей это расход" required>
              <FilterPillGroup
                options={[{ value: 'STORE', label: 'Расход филиала' }, { value: 'BUSINESS', label: 'Общесетевой расход' }]}
                value={expenseTarget}
                onChange={(v) => setExpenseTarget(v as 'STORE' | 'BUSINESS')}
              />
              <p className="text-xs text-fg-subtle mt-1.5">
                {expenseTarget === 'STORE'
                  ? 'Аренда точки, хозтовары, чай/кофе — списывается с кассы филиала и уменьшает чистую прибыль именно этого магазина.'
                  : 'Общая реклама, бухгалтер, аренда склада — не привязан к магазину, списывается с центральной кассы и уменьшает только итоговую прибыль сети.'}
              </p>
            </FormField>
          )}

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

          {!isManager && (category === 'EMPLOYEE_ADVANCE' || category === 'SALARY') && (
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

          {!isScoped && expenseTarget === 'STORE' && (
            <FormField label="Филиал" required>
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

          <ToggleRow
            checked={paidFromCashRegister}
            onChange={setPaidFromCashRegister}
            label={!isScoped && expenseTarget === 'BUSINESS' ? 'Списать сумму из центральной кассы (главный склад)' : 'Списать сумму из наличной кассы филиала'}
          />

          <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="text-xs text-fg-subtle">Статус оплаты</span>
            {paidFromCashRegister
              ? <Badge tone="success">Оплачено</Badge>
              : <Badge tone="warning">Не оплачено</Badge>}
          </div>
          {!paidFromCashRegister && (
            <p className="text-xs text-fg-subtle px-0.5">Касса не изменится. Оплатить расход можно позже кнопкой «Оплатить» в списке.</p>
          )}
        </form>
      </Dialog>

      <Dialog
        open={!!payingExpense}
        onClose={() => setPayingExpense(null)}
        title="Оплатить расход"
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={() => setPayingExpense(null)}>Отмена</Button>
            <Button variant="primary" fullWidth loading={isSubmitting} disabled={!payingExpense?.storeId && !payStoreId && !(payingExpense && isNetworkExpense(payingExpense, stores))} onClick={handleConfirmPay}>Оплатить</Button>
          </>
        }
      >
        {payingExpense && (
          <div className="space-y-3.5">
            <p className="text-sm text-fg-muted">
              {getCategoryLabel(payingExpense.category, customCategories)}: <span className="font-semibold text-danger">{payingExpense.amountTjs.toLocaleString()} TJS</span>
            </p>
            {isNetworkExpense(payingExpense, stores) ? (
              <p className="text-xs text-fg-subtle">Общесетевой расход — сумма будет списана из центральной кассы (главный склад).</p>
            ) : payingExpense.storeId ? (
              <p className="text-xs text-fg-subtle">Сумма будет списана из кассы «{payingExpense.storeName || 'магазина'}».</p>
            ) : (
              <FormField label="Из какой кассы оплатить" required>
                <Select value={payStoreId} onChange={(e) => setPayStoreId(e.target.value)} className="w-full">
                  {retailStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </FormField>
            )}
          </div>
        )}
      </Dialog>

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
