import React, { useState, useMemo, useEffect } from 'react';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { currentBusinessMonth, getBusinessDateKey, monthBounds } from '../../utils/businessDate';
import { formatMoney, sumMoney, moneyNumber } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { Expense, ExpenseCategory } from '../../types';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { Receipt, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Skeleton';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useStoreContext } from '../../utils/storeContext';

import {
  CustomCategory,
  STANDARD_CATEGORIES,
  getCategoryLabel
} from '../expenses/types';
import { ExpensesHeaderBar } from '../expenses/ExpensesHeaderBar';
import { ExpensesTable } from '../expenses/ExpensesTable';
import { ExpensesCardsList } from '../expenses/ExpensesCardsList';
import { AddExpenseModal } from '../expenses/AddExpenseModal';
import { EditExpenseModal } from '../expenses/EditExpenseModal';
import { PayExpenseModal } from '../expenses/PayExpenseModal';
import { AddCategoryModal } from '../expenses/AddCategoryModal';

export const ExpensesPage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const {
    currentUser,
    expenses,
    fetchExpensesRange,
    stores,
    users,
    todayRate,
    createExpense,
    updateExpense,
    deleteExpense,
    payExpense,
    isInitialLoading,
    selectedStoreId: globalSelectedStoreId
  } = useAppFields(
    'currentUser',
    'expenses',
    'fetchExpensesRange',
    'stores',
    'users',
    'todayRate',
    'createExpense',
    'updateExpense',
    'deleteExpense',
    'payExpense',
    'isInitialLoading',
    'selectedStoreId'
  );

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

  const todayStr = getBusinessDateKey();
  const thisMonthStr = currentBusinessMonth();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'CUSTOM' | 'MONTH' | 'ALL'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonthStr);
  const [selectedStartDate, setSelectedStartDate] = useState<string>(() => monthBounds(thisMonthStr).start);
  const [selectedEndDate, setSelectedEndDate] = useState<string>(() => monthBounds(thisMonthStr).end);
  const resetToCurrentMonth = () => {
    const { start, end } = monthBounds(thisMonthStr);
    setPeriodFilter('MONTH');
    setSelectedMonth(thisMonthStr);
    setSelectedStartDate(start);
    setSelectedEndDate(end);
  };
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC'>('DATE_DESC');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState('ALL');

  const storeCtx = useStoreContext();
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
    } else if (periodFilter === 'MONTH' && selectedMonth) {
      params.period = 'SPECIFIC_MONTH';
      params.month = selectedMonth;
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
  }, [periodFilter, selectedStartDate, selectedEndDate, selectedMonth, selectedStoreFilter, fetchExpensesRange, dataRefreshRevision]);

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
      if (periodFilter === 'MONTH' && selectedMonth && !expDateStr.startsWith(selectedMonth)) return false;
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
    selectedMonth,
    todayStr,
    statusFilter,
    selectedEmployeeFilter,
    selectedStoreFilter,
    selectedCategoryTab,
    searchQuery,
    customCategories,
    sortBy
  ]);

  const totalExpensesTjs = useMemo(() => sumMoney(filteredExpenses.map((e) => e.amountTjs || 0)), [filteredExpenses]);
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

  const isPeriodCustomized = periodFilter !== 'MONTH' || selectedMonth !== thisMonthStr;
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
    resetToCurrentMonth();
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

      <ExpensesHeaderBar
        totalExpensesTjs={totalExpensesTjs}
        totalExpensesUsd={totalExpensesUsd}
        filteredExpensesCount={filteredExpenses.length}
        totalExpensesCount={expenses.length}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
        onOpenAddModal={() => setIsModalOpen(true)}
        unpaidTotalTjs={unpaidTotalTjs}
        unpaidCount={unpaidCount}
        totalUnpaidInScope={totalUnpaidInScope}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        todayStr={todayStr}
        thisMonthStr={thisMonthStr}
        periodFilter={periodFilter}
        setPeriodFilter={setPeriodFilter}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        selectedStartDate={selectedStartDate}
        setSelectedStartDate={setSelectedStartDate}
        selectedEndDate={selectedEndDate}
        setSelectedEndDate={setSelectedEndDate}
        resetToCurrentMonth={resetToCurrentMonth}
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        activeFiltersCount={activeFiltersCount}
        isAdmin={isAdmin}
        isStoreModeCentral={storeCtx.mode === 'CENTRAL'}
        selectedStoreFilter={selectedStoreFilter}
        setSelectedStoreFilter={setSelectedStoreFilter}
        stores={stores}
        canAddCategory={canAddCategory}
        onOpenAddCategoryModal={() => setIsAddCategoryModalOpen(true)}
        selectedCategoryTab={selectedCategoryTab}
        setSelectedCategoryTab={setSelectedCategoryTab}
        allCategoryOptions={allCategoryOptions}
        categoryCounts={categoryCounts}
        selectedEmployeeFilter={selectedEmployeeFilter}
        setSelectedEmployeeFilter={setSelectedEmployeeFilter}
        activeEmployees={activeEmployees}
        users={users}
        sortBy={sortBy}
        setSortBy={setSortBy}
        customCategories={customCategories}
      />

      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 lg:p-6">
        <div className="max-w-6xl xl:max-w-7xl mx-auto w-full">
          {isInitialLoading ? (
            <LoadingState label="Загрузка расходов…" />
          ) : filteredExpenses.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto min-h-[220px]">
              <div className="w-12 h-12 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger mb-3 shadow-xs">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-fg">Расходов не найдено</h3>
              <p className="text-xs text-fg-subtle mt-1.5 max-w-xs leading-relaxed">
                {searchQuery
                  ? `По запросу «${searchQuery}» ничего не найдено.`
                  : 'За выбранный период или фильтры расходы отсутствуют.'}
              </p>
              {hasActiveFilters && (
                <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
                  <Button
                    variant="secondary"
                    size="md"
                    className="!h-8 !px-3 text-xs"
                    onClick={handleResetFilters}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Сбросить фильтры
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <ExpensesTable
                filteredExpenses={filteredExpenses}
                isStoreScoped={isStoreScoped}
                customCategories={customCategories}
                rate={rate}
                isAdmin={isAdmin}
                isPartner={isPartner}
                onStartPay={handleStartPay}
                onStartEdit={handleStartEdit}
                onConfirmDeleteId={(id) => setDeletingId(id)}
              />

              <ExpensesCardsList
                filteredExpenses={filteredExpenses}
                totalExpensesCount={expenses.length}
                isStoreScoped={isStoreScoped}
                customCategories={customCategories}
                rate={rate}
                isAdmin={isAdmin}
                isPartner={isPartner}
                onStartPay={handleStartPay}
                onStartEdit={handleStartEdit}
                onConfirmDeleteId={(id) => setDeletingId(id)}
              />
            </div>
          )}
        </div>
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

      <EditExpenseModal
        editingExpense={editingExpense}
        onClose={() => setEditingExpense(null)}
        isSubmitting={isSubmitting}
        editCategory={editCategory}
        setEditCategory={setEditCategory}
        allCategoryOptions={allCategoryOptions}
        editAmountTjs={editAmountTjs}
        setEditAmountTjs={setEditAmountTjs}
        editStoreId={editStoreId}
        setEditStoreId={setEditStoreId}
        stores={stores}
        isAdmin={isAdmin}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        onSubmit={handleSaveEdit}
      />

      <AddExpenseModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isSubmitting={isSubmitting}
        category={category}
        setCategory={setCategory}
        allCategoryOptions={allCategoryOptions}
        canAddCategory={canAddCategory}
        onOpenAddCategoryModal={() => setIsAddCategoryModalOpen(true)}
        selectedEmployeeId={selectedEmployeeId}
        setSelectedEmployeeId={setSelectedEmployeeId}
        users={users}
        amountTjs={amountTjs}
        setAmountTjs={setAmountTjs}
        storeId={storeId}
        setStoreId={setStoreId}
        retailStores={retailStores}
        description={description}
        setDescription={setDescription}
        paidFromCashRegister={paidFromCashRegister}
        setPaidFromCashRegister={setPaidFromCashRegister}
        isAdmin={isAdmin}
        rate={rate}
        centralCashStore={centralCashStore}
        onSubmit={handleAddExpense}
      />

      {isAdmin && (
        <PayExpenseModal
          payingExpense={payingExpense}
          onClose={() => setPayingExpense(null)}
          isSubmitting={isSubmitting}
          centralCashStore={centralCashStore}
          rate={rate}
          customCategories={customCategories}
          onConfirmPay={handleConfirmPay}
        />
      )}

      <AddCategoryModal
        open={isAddCategoryModalOpen}
        onClose={() => setIsAddCategoryModalOpen(false)}
        newCategoryName={newCategoryName}
        setNewCategoryName={setNewCategoryName}
        onSubmit={handleAddCategorySubmit}
      />
    </div>
  );
};
