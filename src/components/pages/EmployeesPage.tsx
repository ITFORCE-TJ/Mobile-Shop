import React, { useState, useEffect, useMemo } from 'react';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { getBusinessDateKey } from '../../utils/businessDate';
import { useAppFields } from '../../context/AppContext';
import { User, Role } from '../../types';
import { useStoreContext } from '../../utils/storeContext';
import { payrollMonthOf } from '../employees/types';

import {
  Users,
  Plus,
  Store,
  Building,
  CheckCircle2,
  AlertCircle,
  Briefcase,
} from 'lucide-react';

import { EmployeeCard } from '../employees/EmployeeCard';
import { EmployeeModal } from '../employees/EmployeeModal';
import { DeleteEmployeeConfirmModal } from '../employees/DeleteEmployeeConfirmModal';
import { EmployeeAdvanceModal } from '../employees/EmployeeAdvanceModal';
import { SalaryPayoutModal } from '../employees/SalaryPayoutModal';
import { EmployeeFinancialHistoryModal } from '../employees/EmployeeFinancialHistoryModal';
import { PayrollReportModal } from '../employees/PayrollReportModal';

export const EmployeesPage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const {
    currentUser,
    users,
    stores,
    expenses,
    fetchExpensesRange,
    sales,
    fetchSalesRange,
    createUser,
    updateUser,
    deleteUser,
    createExpense,
    paySalary,
  } = useAppFields(
    'currentUser',
    'users',
    'stores',
    'expenses',
    'fetchExpensesRange',
    'sales',
    'fetchSalesRange',
    'createUser',
    'updateUser',
    'deleteUser',
    'createExpense',
    'paySalary'
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUserConfirm, setDeletingUserConfirm] = useState<User | null>(null);

  // Salary payout and advance dialog states
  const [salaryPayoutUser, setSalaryPayoutUser] = useState<User | null>(null);
  const [initialGrossSalaryInput, setInitialGrossSalaryInput] = useState<string>('');
  const [salaryPayoutInitialMonth, setSalaryPayoutInitialMonth] = useState<string>(
    getBusinessDateKey().substring(0, 7)
  );

  const [advanceIssueUser, setAdvanceIssueUser] = useState<User | null>(null);

  // Financial History & Payroll Report state
  const [financialHistoryUser, setFinancialHistoryUser] = useState<User | null>(null);
  const [isPayrollReportModalOpen, setIsPayrollReportModalOpen] = useState(false);
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState<string>(
    getBusinessDateKey().substring(0, 7)
  );

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch sales & expenses range on demand
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchSalesRange({ period: 'SPECIFIC_MONTH', month: selectedPayrollMonth }),
      fetchExpensesRange({ period: 'SPECIFIC_MONTH', month: selectedPayrollMonth }),
    ]).catch((e) => {
      if (!cancelled) console.error('Failed to load payroll data', e);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPayrollMonth, fetchSalesRange, fetchExpensesRange, dataRefreshRevision]);

  useEffect(() => {
    if (!financialHistoryUser) return;
    let cancelled = false;
    Promise.all([
      fetchSalesRange({ sellerId: financialHistoryUser.id }),
      fetchExpensesRange({ employeeId: financialHistoryUser.id }),
    ]).catch((e) => {
      if (!cancelled) console.error('Failed to load employee financial history', e);
    });
    return () => {
      cancelled = true;
    };
  }, [financialHistoryUser, fetchSalesRange, fetchExpensesRange, dataRefreshRevision]);

  const userIdsByName = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const u of users) {
      const list = map.get(u.name);
      if (list) list.push(u.id);
      else map.set(u.name, [u.id]);
    }
    return map;
  }, [users]);

  const employeeLifetimeStatsById = useMemo(() => {
    const map = new Map<string, { totalAdvances: number; salesRevTjs: number; unitsSold: number }>();
    const ensure = (id: string) => {
      let entry = map.get(id);
      if (!entry) {
        entry = { totalAdvances: 0, salesRevTjs: 0, unitsSold: 0 };
        map.set(id, entry);
      }
      return entry;
    };
    for (const u of users) ensure(u.id);

    for (const e of expenses) {
      if (!(e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance)) continue;
      const matchedIds = new Set<string>();
      if (e.employeeId) matchedIds.add(e.employeeId);
      if (e.isEmployeeAdvance && e.employeeName) {
        for (const id of userIdsByName.get(e.employeeName) || []) matchedIds.add(id);
      }
      for (const id of matchedIds) ensure(id).totalAdvances += e.amountTjs || 0;
    }

    for (const s of sales) {
      if (s.status === 'REFUNDED') continue;
      const entry = map.get(s.sellerId);
      if (entry) {
        entry.salesRevTjs += s.totalTjs;
        entry.unitsSold += s.items.length;
      }
    }

    return map;
  }, [users, sales, expenses, userIdsByName]);

  const employeePayrollStatsByMonthAndId = useMemo(() => {
    const map = new Map<string, { salesRev: number; advances: number; paidSalary: number }>();
    const ensure = (id: string) => {
      let entry = map.get(id);
      if (!entry) {
        entry = { salesRev: 0, advances: 0, paidSalary: 0 };
        map.set(id, entry);
      }
      return entry;
    };
    for (const u of users) ensure(u.id);

    for (const e of expenses) {
      if (payrollMonthOf(e) !== selectedPayrollMonth) continue;
      const isAdvance = e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance;
      const isSalary = e.category === 'SALARY';
      if (!isAdvance && !isSalary) continue;
      const matchedIds = new Set<string>();
      if (e.employeeId) matchedIds.add(e.employeeId);
      if (e.isEmployeeAdvance && e.employeeName) {
        for (const id of userIdsByName.get(e.employeeName) || []) matchedIds.add(id);
      }
      for (const id of matchedIds) {
        const entry = ensure(id);
        if (isAdvance) entry.advances += e.amountTjs || 0;
        if (isSalary) entry.paidSalary += e.amountTjs || 0;
      }
    }

    for (const s of sales) {
      if (s.status === 'REFUNDED' || !s.date.startsWith(selectedPayrollMonth)) continue;
      const entry = map.get(s.sellerId);
      if (entry) entry.salesRev += s.totalTjs;
    }

    return map;
  }, [users, sales, expenses, selectedPayrollMonth, userIdsByName]);

  const handleDeleteUserClick = (u: User) => {
    if (currentUser?.id === u.id) {
      setStatusMessage({ type: 'error', text: 'Вы не можете удалить собственный текущий профиль.' });
      return;
    }
    setDeletingUserConfirm(u);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUserConfirm || isSubmitting) return;
    const targetName = deletingUserConfirm.name;
    setIsSubmitting(true);
    try {
      const res = await deleteUser(deletingUserConfirm.id);
      setDeletingUserConfirm(null);

      if (res.success) {
        setStatusMessage({ type: 'success', text: `Сотрудник ${targetName} успешно удален из системы.` });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления сотрудника' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveUser = async (data: {
    name: string;
    login: string;
    password?: string;
    role: Role;
    storeId?: string;
    isActive: boolean;
    baseSalaryTjs: number;
    salesCommissionPercent: number;
  }) => {
    if (editingUser) {
      return updateUser({
        ...editingUser,
        name: data.name,
        login: data.login,
        passwordHash: data.password ? data.password : editingUser.passwordHash,
        role: data.role,
        storeId: data.storeId,
        isActive: data.isActive,
        baseSalaryTjs: data.baseSalaryTjs,
        salesCommissionPercent: data.salesCommissionPercent,
      });
    } else {
      return createUser({
        name: data.name,
        login: data.login,
        passwordHash: data.password || '',
        role: data.role,
        storeId: data.storeId,
        active: true,
        baseSalaryTjs: data.baseSalaryTjs,
        salesCommissionPercent: data.salesCommissionPercent,
      });
    }
  };

  const handleIssueAdvance = async (data: { amount: number; payrollMonth: string; note: string }) => {
    if (!advanceIssueUser || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await createExpense({
        category: 'EMPLOYEE_ADVANCE',
        amountTjs: data.amount,
        storeId: advanceIssueUser.storeId || stores[0]?.id,
        sourceAccount: 'Центральная касса',
        description: `Аванс сотруднику ${advanceIssueUser.name}: ${data.note || 'Выдан под отчет / в счет зарплаты'}`,
        paidFromCashRegister: true,
        employeeId: advanceIssueUser.id,
        employeeName: advanceIssueUser.name,
        isEmployeeAdvance: true,
        payrollMonth: data.payrollMonth,
      });

      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Аванс ${data.amount} TJS успешно выдан из Центральной кассы сотруднику ${advanceIssueUser.name}`,
        });
        setAdvanceIssueUser(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка выдачи аванса' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportPayrollReport = () => {
    const headers = [
      'Сотрудник',
      'Должность',
      'Торговая точка',
      'Оклад (TJS)',
      'Выручка продаж (TJS)',
      'Комиссия %',
      'Начислено (TJS)',
      'Взято авансов (TJS)',
      'Выплачено ЗП (TJS)',
      'Остаток к выплате (TJS)',
    ];

    const sellers = users.filter((u) => (u.isActive ?? u.active) && u.role === 'SELLER');
    const rows = sellers.map((u) => {
      const uSales = sales.filter(
        (s) => s.sellerId === u.id && s.status !== 'REFUNDED' && s.date.startsWith(selectedPayrollMonth)
      );
      const salesRev = uSales.reduce((acc, s) => acc + s.totalTjs, 0);
      const baseSal = u.baseSalaryTjs || 0;
      const commPct = u.salesCommissionPercent || 0;
      const commAmt = Math.round(salesRev * (commPct / 100));
      const grossAccrued = baseSal + commAmt;

      const uExpenses = expenses.filter(
        (e) =>
          (e.employeeId === u.id || (e.isEmployeeAdvance && e.employeeName === u.name)) &&
          payrollMonthOf(e) === selectedPayrollMonth
      );
      const advances = uExpenses
        .filter((e) => e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance)
        .reduce((acc, e) => acc + (e.amountTjs || 0), 0);
      const paidSalary = uExpenses
        .filter((e) => e.category === 'SALARY')
        .reduce((acc, e) => acc + (e.amountTjs || 0), 0);
      const netPayable = Math.max(0, grossAccrued - advances - paidSalary);

      return [
        u.name,
        'Продавец',
        u.storeName || (u.storeId ? stores.find((s) => s.id === u.storeId)?.name : undefined) || 'Магазин не привязан',
        baseSal,
        salesRev,
        `${commPct}% (${commAmt} TJS)`,
        grossAccrued,
        advances,
        paidSalary,
        netPayable,
      ];
    });

    const csvLines = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob(['\ufeff' + csvLines], { type: 'text/csv;charset=utf-8;' });
    const fileName = `Зарплатная_ведомость_продавцов_${selectedPayrollMonth}.csv`;

    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      try {
        const file = new File([blob], fileName, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          void navigator.share({ files: [file], title: fileName });
          return;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const storeCtx = useStoreContext();

  const [storeFilterChoice, setSelectedStoreFilter] = useState<string>('ALL');
  const selectedStoreFilter = storeCtx.mode === 'STORE' ? storeCtx.storeId : storeFilterChoice;

  const adminUsers = useMemo(() => users.filter((u) => u.role === 'ADMIN'), [users]);
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse), [stores]);
  const mainWarehouse = useMemo(() => stores.find((s) => s.isMainWarehouse), [stores]);
  const warehouseUsers = useMemo(
    () => (mainWarehouse ? users.filter((u) => u.storeId === mainWarehouse.id && u.role !== 'ADMIN') : []),
    [mainWarehouse, users]
  );

  const storeStaffMap = useMemo(() => {
    const map = new Map<string, User[]>();
    retailStores.forEach((s) => {
      const staff = users.filter((u) => u.storeId === s.id && u.role !== 'ADMIN');
      staff.sort((a, b) => {
        if (a.role === 'PARTNER' && b.role !== 'PARTNER') return -1;
        if (a.role !== 'PARTNER' && b.role === 'PARTNER') return 1;
        return a.name.localeCompare(b.name, 'ru');
      });
      map.set(s.id, staff);
    });
    return map;
  }, [retailStores, users]);

  const unassignedUsers = useMemo(() => {
    return users.filter((u) => u.role !== 'ADMIN' && (!u.storeId || !stores.some((s) => s.id === u.storeId)));
  }, [users, stores]);

  if (currentUser?.role !== 'ADMIN' && currentUser?.role !== 'PARTNER') {
    return (
      <div className="p-8 text-center text-fg-subtle text-xs">
        <p className="font-bold text-fg-muted">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Раздел управления сотрудниками доступен только Администраторам и Партнерам</p>
      </div>
    );
  }

  const renderCard = (u: User) => (
    <EmployeeCard
      key={u.id}
      user={u}
      stats={employeeLifetimeStatsById.get(u.id) ?? { totalAdvances: 0, salesRevTjs: 0, unitsSold: 0 }}
      stores={stores}
      currentUser={currentUser}
      selectedPayrollMonth={selectedPayrollMonth}
      sales={sales}
      onEdit={(user) => {
        setEditingUser(user);
        setIsModalOpen(true);
      }}
      onDelete={handleDeleteUserClick}
      onOpenAdvance={(user) => setAdvanceIssueUser(user)}
      onOpenSalaryPayout={(user, autoGross, month) => {
        setSalaryPayoutUser(user);
        setInitialGrossSalaryInput(autoGross > 0 ? autoGross.toString() : '');
        setSalaryPayoutInitialMonth(month);
      }}
      onOpenHistory={(user) => setFinancialHistoryUser(user)}
    />
  );

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      {/* Header Bar */}
      <div className="p-2.5 sm:p-3 md:px-5 border-b border-border bg-surface flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <Users className="w-4 h-4 text-accent shrink-0" />
          <h3 className="text-xs sm:text-sm font-bold text-fg truncate">
            Сотрудники и оклады
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsPayrollReportModalOpen(true)}
            className="h-8 px-2.5 sm:px-3 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Ежемесячная ведомость зарплат продавцов"
          >
            <Briefcase className="w-3.5 h-3.5 text-fg-subtle" />
            <span><span className="hidden sm:inline">Зарплатный </span>отчёт</span>
          </button>

          {currentUser?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => {
                setEditingUser(null);
                setIsModalOpen(true);
              }}
              className="h-8 px-2.5 sm:px-3.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-semibold flex items-center gap-1 transition-all shadow-xs shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span><span className="hidden sm:inline">Добавить </span>сотрудника</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          className={`mx-3 sm:mx-4 mt-2.5 p-2 rounded-lg text-xs flex items-center space-x-2 shrink-0 ${
            statusMessage.type === 'success'
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'bg-danger/15 text-danger border border-danger/30'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Quick Store Filter Pills (Central Cash only) */}
      {storeCtx.mode === 'CENTRAL' && (
        <div className="px-3 sm:px-5 py-2 border-b border-border bg-surface flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedStoreFilter('ALL')}
            className={`h-7 px-2.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
              selectedStoreFilter === 'ALL'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'bg-surface-raised hover:bg-surface text-fg-muted border border-border'
            }`}
          >
            Все ({users.length})
          </button>

          <button
            type="button"
            onClick={() => setSelectedStoreFilter('ADMIN')}
            className={`h-7 px-2.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedStoreFilter === 'ADMIN'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'bg-surface-raised hover:bg-surface text-fg-muted border border-border'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Центральный офис ({adminUsers.length})</span>
          </button>

          {retailStores.map((st) => {
            const count = storeStaffMap.get(st.id)?.length || 0;
            const isActive = selectedStoreFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStoreFilter(st.id)}
                className={`h-7 px-2.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'bg-surface-raised hover:bg-surface text-fg-muted border border-border'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>
                  {st.name} ({count})
                </span>
              </button>
            );
          })}

          {warehouseUsers.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStoreFilter('WAREHOUSE')}
              className={`h-7 px-2.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedStoreFilter === 'WAREHOUSE'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'bg-surface-raised hover:bg-surface text-fg-muted border border-border'
              }`}
            >
              <span>Главный склад ({warehouseUsers.length})</span>
            </button>
          )}

          {unassignedUsers.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStoreFilter('UNASSIGNED')}
              className={`h-7 px-2.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                selectedStoreFilter === 'UNASSIGNED'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'bg-surface-raised hover:bg-surface text-fg-muted border border-border'
              }`}
            >
              Без привязки ({unassignedUsers.length})
            </button>
          )}
        </div>
      )}

      {/* Users List */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 md:p-5 bg-bg space-y-4 sm:space-y-5">
        {/* Section 1: Общий администратор */}
        {(selectedStoreFilter === 'ALL' || selectedStoreFilter === 'ADMIN') && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-accent/10 border border-accent/25 text-accent">
                  <Building className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                    <span>Центральный офис</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent/15 border border-accent/30 text-accent font-semibold">
                      {adminUsers.length}
                    </span>
                  </h4>
                </div>
              </div>
              <span className="text-[11px] text-fg-subtle hidden sm:inline">
                Центральное управление и доступ
              </span>
            </div>

            {adminUsers.length === 0 ? (
              <div className="p-4 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-fg-subtle">
                Нет назначенных сотрудников
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-max gap-2.5 sm:gap-3 items-start">
                {adminUsers.map(renderCard)}
              </div>
            )}
          </div>
        )}

        {/* Section 2: Магазины сети с рабочими */}
        {retailStores.map((store) => {
          if (selectedStoreFilter !== 'ALL' && selectedStoreFilter !== store.id) return null;
          const storeStaff = storeStaffMap.get(store.id) || [];
          return (
            <div key={store.id} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-accent/10 border border-accent/25 text-accent">
                    <Store className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                      <span>{store.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-raised border border-border text-fg-subtle font-semibold">
                        {storeStaff.length}{' '}
                        {storeStaff.length === 1
                          ? 'сотрудник'
                          : storeStaff.length < 5
                          ? 'сотрудника'
                          : 'сотрудников'}
                      </span>
                    </h4>
                  </div>
                </div>
                <span className="text-[11px] text-fg-subtle hidden sm:inline">
                  Розничная торговая точка · Персонал и партнер
                </span>
              </div>

              {storeStaff.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-fg-subtle">
                  В этом магазине пока нет назначенных сотрудников
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-max gap-2.5 sm:gap-3 items-start">
                  {storeStaff.map(renderCard)}
                </div>
              )}
            </div>
          );
        })}

        {/* Section 3: Главный склад */}
        {warehouseUsers.length > 0 &&
          (selectedStoreFilter === 'ALL' || selectedStoreFilter === 'WAREHOUSE') && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-500">
                    <Store className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                      <span>{mainWarehouse?.name || 'Главный склад'}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-raised border border-border text-fg-subtle font-semibold">
                        {warehouseUsers.length}
                      </span>
                    </h4>
                  </div>
                </div>
                <span className="text-[11px] text-fg-subtle hidden sm:inline">
                  Персонал центрального склада
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-max gap-2.5 sm:gap-3 items-start">
                {warehouseUsers.map(renderCard)}
              </div>
            </div>
          )}

        {/* Section 4: Без привязки */}
        {unassignedUsers.length > 0 &&
          (selectedStoreFilter === 'ALL' || selectedStoreFilter === 'UNASSIGNED') && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-surface-raised border border-border text-fg-subtle">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                      <span>Без привязки к магазину</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-raised border border-border text-fg-subtle font-semibold">
                        {unassignedUsers.length}
                      </span>
                    </h4>
                  </div>
                </div>
                <span className="text-[11px] text-fg-subtle hidden sm:inline">
                  Сотрудники без назначенной точки
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-max gap-2.5 sm:gap-3 items-start">
                {unassignedUsers.map(renderCard)}
              </div>
            </div>
          )}
      </div>

      {/* MODALS */}
      <EmployeeModal
        open={isModalOpen}
        editingUser={editingUser}
        stores={stores}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSaveUser}
        onSuccess={(msg) => setStatusMessage({ type: 'success', text: msg })}
        onError={(msg) => setStatusMessage({ type: 'error', text: msg })}
      />

      <DeleteEmployeeConfirmModal
        user={deletingUserConfirm}
        onClose={() => setDeletingUserConfirm(null)}
        onConfirm={handleConfirmDeleteUser}
        isSubmitting={isSubmitting}
      />

      <EmployeeAdvanceModal
        user={advanceIssueUser}
        stores={stores}
        onClose={() => setAdvanceIssueUser(null)}
        onIssueAdvance={handleIssueAdvance}
        onError={(msg) => setStatusMessage({ type: 'error', text: msg })}
        isSubmitting={isSubmitting}
      />

      <SalaryPayoutModal
        user={salaryPayoutUser}
        stores={stores}
        sales={sales}
        initialMonth={salaryPayoutInitialMonth}
        initialGrossInput={initialGrossSalaryInput}
        onClose={() => setSalaryPayoutUser(null)}
        onPaySalary={paySalary}
        onSuccess={(msg) => setStatusMessage({ type: 'success', text: msg })}
        onError={(msg) => setStatusMessage({ type: 'error', text: msg })}
      />

      <EmployeeFinancialHistoryModal
        user={financialHistoryUser}
        stores={stores}
        expenses={expenses}
        sales={sales}
        onClose={() => setFinancialHistoryUser(null)}
      />

      <PayrollReportModal
        open={isPayrollReportModalOpen}
        onClose={() => setIsPayrollReportModalOpen(false)}
        selectedPayrollMonth={selectedPayrollMonth}
        onMonthChange={setSelectedPayrollMonth}
        users={users}
        stores={stores}
        employeePayrollStatsByMonthAndId={employeePayrollStatsByMonthAndId}
        onExportCSV={handleExportPayrollReport}
        onSelectEmployeeHistory={(u, month) => {
          setIsPayrollReportModalOpen(false);
          setFinancialHistoryUser(u);
        }}
      />
    </div>
  );
};
