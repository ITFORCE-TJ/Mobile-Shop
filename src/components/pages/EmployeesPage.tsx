import { ActionMenu } from '../ui/ActionMenu';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { decimal, moneyNumber, sumMoney } from '../../utils/money';
import { apiClient } from '../../api/client';
import { getBusinessDateKey } from '../../utils/businessDate';
import React, { useState, useEffect, useMemo } from 'react';
import { useAppFields } from '../../context/AppContext';
import { User, Role, Expense } from '../../types';
import {
  Users,
  Plus,
  Shield,
  Store,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  DollarSign,
  Receipt,
  Calendar,
  Briefcase,
  Download,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';
import { MonthPicker } from '../ui/MonthPicker';
import { useStoreContext } from '../../utils/storeContext';

const ROLE_CONFIG: Record<Role, { label: string; bg: string; color: string; border: string }> = {
  ADMIN: { label: 'Администратор', bg: 'bg-accent/15', color: 'text-accent', border: 'border-accent/30' },
  PARTNER: { label: 'Партнер (Владелец)', bg: 'bg-info/15', color: 'text-info', border: 'border-info/30' },
  SELLER: { label: 'Продавец-кассир', bg: 'bg-surface-raised', color: 'text-fg-subtle', border: 'border-border' }
};

// An advance counts in the payroll month it was given for; everything else in the month it was recorded.
const payrollMonthOf = (e: Expense) =>
  ((e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance) && e.payrollMonth) || getBusinessDateKey(new Date(e.date)).substring(0, 7);

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
    paySalary
  } = useAppFields('currentUser', 'users', 'stores', 'expenses', 'fetchExpensesRange', 'sales', 'fetchSalesRange', 'createUser', 'updateUser', 'deleteUser', 'createExpense', 'paySalary');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUserConfirm, setDeletingUserConfirm] = useState<User | null>(null);

  // Salary payout and advance dialog states
  const [salaryPayoutUser, setSalaryPayoutUser] = useState<User | null>(null);
  const [grossSalaryInput, setGrossSalaryInput] = useState<string>('');
  // Payroll month being paid and the server's tally of what was already paid for it —
  // the server is the single source of truth for salary already paid and advances given
  // for that month (an advance can be handed out in a different month than it belongs to).
  const [payoutMonth, setPayoutMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const [payrollSummary, setPayrollSummary] = useState<{ paidSalaryTjs: number; paidAdvancesTjs: number } | null>(null);
  const [payrollSummaryError, setPayrollSummaryError] = useState<string | null>(null);
  const [payoutNote, setPayoutNote] = useState<string>('');

  const [advanceIssueUser, setAdvanceIssueUser] = useState<User | null>(null);
  const [advanceAmountInput, setAdvanceAmountInput] = useState<string>('');
  const [advanceNoteInput, setAdvanceNoteInput] = useState<string>('');
  // Payroll month the advance is deducted from — it can be handed out in a different month.
  const [advancePayrollMonth, setAdvancePayrollMonth] = useState<string>(getBusinessDateKey().substring(0, 7));

  // Financial History & Payroll Report state
  const [financialHistoryUser, setFinancialHistoryUser] = useState<User | null>(null);
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>('ALL');
  const [isPayrollReportModalOpen, setIsPayrollReportModalOpen] = useState(false);
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState<string>(getBusinessDateKey().substring(0, 7));

  // Form fields
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('SELLER');
  const [storeId, setStoreId] = useState<string>(stores[0]?.id || '');
  const [isActive, setIsActive] = useState(true);

  // Stores load asynchronously from the API — resync once they arrive rather than
  // being permanently stuck on the empty initial value.
  useEffect(() => {
    if (!storeId && stores.length > 0) {
      setStoreId(stores[0].id);
    }
  }, [stores, storeId]);

  // `sales`/`expenses` from context only hold a recent bounded window by default — the
  // payroll table needs every seller's sales/advances for the chosen month, and the
  // financial-history modal needs one seller's entire lifetime, both of which can reach
  // further back than that window. Fetch and merge them in on demand instead of assuming
  // they're loaded. Guarded against a stale response overwriting a newer one on fast clicks.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchSalesRange({ period: 'SPECIFIC_MONTH', month: selectedPayrollMonth }),
      fetchExpensesRange({ period: 'SPECIFIC_MONTH', month: selectedPayrollMonth }),
    ]).catch((e) => { if (!cancelled) console.error('Failed to load payroll data', e); });
    return () => { cancelled = true; };
  }, [selectedPayrollMonth, fetchSalesRange, fetchExpensesRange, dataRefreshRevision]);

  useEffect(() => {
    if (!financialHistoryUser) return;
    let cancelled = false;
    Promise.all([
      fetchSalesRange({ sellerId: financialHistoryUser.id }),
      fetchExpensesRange({ employeeId: financialHistoryUser.id }),
    ]).catch((e) => { if (!cancelled) console.error('Failed to load employee financial history', e); });
    return () => { cancelled = true; };
  }, [financialHistoryUser, fetchSalesRange, fetchExpensesRange, dataRefreshRevision]);
  const [baseSalaryTjs, setBaseSalaryTjs] = useState<string>('');
  const [salesCommissionPercent, setSalesCommissionPercent] = useState<string>('');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A name→id index for the isEmployeeAdvance+employeeName fallback match below — since
  // employeeName is always derived as names.get(employeeId), this only ever matters for a
  // genuine duplicate-name edge case, but it's kept to stay behavior-identical to the
  // original per-card filter it replaces.
  const userIdsByName = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const u of users) {
      const list = map.get(u.name);
      if (list) list.push(u.id); else map.set(u.name, [u.id]);
    }
    return map;
  }, [users]);

  // One pass over sales/expenses building a per-employee lookup, instead of every
  // employee card re-filtering the full (bounded-window) sales/expenses arrays on every
  // render — including renders triggered by something unrelated elsewhere in the app.
  const employeeLifetimeStatsById = useMemo(() => {
    const map = new Map<string, { totalAdvances: number; salesRevTjs: number; unitsSold: number }>();
    const ensure = (id: string) => {
      let entry = map.get(id);
      if (!entry) { entry = { totalAdvances: 0, salesRevTjs: 0, unitsSold: 0 }; map.set(id, entry); }
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
      if (entry) { entry.salesRevTjs += s.totalTjs; entry.unitsSold += s.items.length; }
    }

    return map;
  }, [users, sales, expenses, userIdsByName]);

  // Same one-pass approach, scoped to the payroll modal's selected month.
  const employeePayrollStatsByMonthAndId = useMemo(() => {
    const map = new Map<string, { salesRev: number; advances: number; paidSalary: number }>();
    const ensure = (id: string) => {
      let entry = map.get(id);
      if (!entry) { entry = { salesRev: 0, advances: 0, paidSalary: 0 }; map.set(id, entry); }
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

  // Admin inside a store sees only that store's staff; Central Cash shows everyone.
  const storeCtx = useStoreContext();

  if (currentUser?.role !== 'ADMIN' && currentUser?.role !== 'PARTNER') {
    return (
      <div className="p-8 text-center text-fg-subtle text-xs">
        <p className="font-bold text-fg-muted">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Раздел управления сотрудниками доступен только Администраторам и Партнерам</p>
      </div>
    );
  }

  const handleOpenAdd = () => {
    setEditingUser(null);
    setName('');
    setLogin('');
    setPassword('');
    setShowPassword(false);
    setRole('SELLER');
    setStoreId(stores[0]?.id || '');
    setIsActive(true);
    setBaseSalaryTjs('');
    setSalesCommissionPercent('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setName(u.name);
    setLogin(u.login);
    setPassword('');
    setShowPassword(false);
    setRole(u.role);
    setStoreId(u.storeId || stores[0]?.id || '');
    setIsActive(u.isActive ?? u.active);
    setBaseSalaryTjs(u.baseSalaryTjs?.toString() || '');
    setSalesCommissionPercent(u.salesCommissionPercent?.toString() || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setStatusMessage(null);

    if (!name.trim() || !login.trim()) {
      setStatusMessage({ type: 'error', text: 'Заполните имя и логин' });
      return;
    }

    if (!editingUser && !password.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите пароль для входа нового сотрудника' });
      return;
    }

    if ((role === 'SELLER' || role === 'PARTNER') && (!storeId || !storeId.trim())) {
      setStatusMessage({
        type: 'error',
        text: role === 'PARTNER'
          ? 'Для создания партнера обязательно выберите магазин филиала (*)'
          : 'Для продавца привязка к магазину обязательна (*)'
      });
      return;
    }

    // Salary/commission only apply to sellers — admins and partners are compensated
    // via profit share (Owners), not a salary, so their form fields are hidden and
    // any stale leftover values must never be persisted.
    const baseSal = role === 'SELLER' ? parseFloat(baseSalaryTjs) || 0 : 0;
    const commPct = role === 'SELLER' ? parseFloat(salesCommissionPercent) || 0 : 0;

    setIsSubmitting(true);
    try {
      if (editingUser) {
        const res = await updateUser({
          ...editingUser,
          name: name.trim(),
          login: login.trim(),
          passwordHash: password.trim() ? password.trim() : editingUser.passwordHash,
          role,
          storeId: (role === 'SELLER' || role === 'PARTNER') ? (storeId || undefined) : undefined,
          isActive,
          baseSalaryTjs: baseSal,
          salesCommissionPercent: commPct
        });

        if (res.success) {
          setIsModalOpen(false);
          setStatusMessage({ type: 'success', text: `Данные сотрудника ${name} обновлены` });
        } else {
          setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления' });
        }
      } else {
        const res = await createUser({
          name: name.trim(),
          login: login.trim(),
          passwordHash: password.trim(),
          role,
          storeId: (role === 'SELLER' || role === 'PARTNER') ? (storeId || undefined) : undefined,
          active: true,
          baseSalaryTjs: baseSal,
          salesCommissionPercent: commPct
        });

        if (res.success) {
          setIsModalOpen(false);
          setStatusMessage({ type: 'success', text: `Сотрудник ${name} успешно добавлен` });
        } else {
          setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания' });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssueAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceIssueUser || isSubmitting) return;
    const val = parseFloat(advanceAmountInput) || 0;
    if (val <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите правильную сумму аванса' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createExpense({
        category: 'EMPLOYEE_ADVANCE',
        amountTjs: val,
        storeId: advanceIssueUser.storeId || stores[0]?.id,
        description: `Аванс сотруднику ${advanceIssueUser.name}: ${advanceNoteInput.trim() || 'Выдан под отчет / в счет зарплаты'}`,
        paidFromCashRegister: true,
        employeeId: advanceIssueUser.id,
        employeeName: advanceIssueUser.name,
        isEmployeeAdvance: true,
        payrollMonth: advancePayrollMonth,
      });

      if (res.success) {
        setStatusMessage({ type: 'success', text: `Аванс ${val} TJS успешно выдан сотруднику ${advanceIssueUser.name}` });
        setAdvanceIssueUser(null);
        setAdvanceAmountInput('');
        setAdvanceNoteInput('');
        setAdvancePayrollMonth(getBusinessDateKey().substring(0, 7));
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка выдачи аванса' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!salaryPayoutUser) return;
    let cancelled = false;
    setPayrollSummary(null);
    setPayrollSummaryError(null);
    apiClient<{ paidSalaryTjs: number; paidAdvancesTjs: number }>(`/payroll/${salaryPayoutUser.id}?month=${payoutMonth}`)
      .then((summary) => {
        if (!cancelled) setPayrollSummary({ paidSalaryTjs: Number(summary.paidSalaryTjs) || 0, paidAdvancesTjs: Number(summary.paidAdvancesTjs) || 0 });
      })
      .catch((err) => { if (!cancelled) setPayrollSummaryError((err as Error).message || 'Не удалось загрузить выплаты за месяц'); });
    return () => { cancelled = true; };
  }, [salaryPayoutUser, payoutMonth]);

  const handleExecuteSalaryPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryPayoutUser || isSubmitting) return;
    const grossVal = parseFloat(grossSalaryInput) || 0;
    if (grossVal <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите сумму начисленной зарплаты' });
      return;
    }

    if (!payrollSummary) {
      setStatusMessage({ type: 'error', text: payrollSummaryError || 'Дождитесь загрузки выплат за месяц' });
      return;
    }
    // Same formula the server applies: the gross entered is the whole month's entitlement,
    // minus salary already paid and advances given for that payroll month.
    const netPayout = moneyNumber(decimal(grossVal).minus(payrollSummary.paidSalaryTjs).minus(payrollSummary.paidAdvancesTjs));
    if (netPayout <= 0) {
      setStatusMessage({
        type: 'success',
        text: `Начисленная зарплата ${salaryPayoutUser.name} за ${payoutMonth} (${grossVal} TJS) уже полностью выплачена с учётом авансов — доплата не требуется.`
      });
      setSalaryPayoutUser(null);
      setGrossSalaryInput('');
      setPayoutNote('');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await paySalary({ employeeId: salaryPayoutUser.id, month: payoutMonth, grossTjs: grossVal, note: payoutNote.trim() || undefined });

      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Зарплата ${salaryPayoutUser.name} за ${payoutMonth} выплачена: ${res.amountTjs ?? netPayout} TJS${payrollSummary.paidAdvancesTjs > 0 ? ` (удержано авансов: ${payrollSummary.paidAdvancesTjs} TJS)` : ''}`
        });
        setSalaryPayoutUser(null);
        setGrossSalaryInput('');
        setPayoutNote('');
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка выплаты зарплаты' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportPayrollReport = () => {
    const headers = ['Сотрудник', 'Должность', 'Торговая точка', 'Оклад (TJS)', 'Выручка продаж (TJS)', 'Комиссия %', 'Начислено (TJS)', 'Взято авансов (TJS)', 'Выплачено ЗП (TJS)', 'Остаток к выплате (TJS)'];
    
    const sellers = users.filter(u => (u.isActive ?? u.active) && u.role === 'SELLER');
    const rows = sellers.map(u => {
      const uSales = sales.filter(s => s.sellerId === u.id && s.status !== 'REFUNDED' && s.date.startsWith(selectedPayrollMonth));
      const salesRev = uSales.reduce((acc, s) => acc + s.totalTjs, 0);
      const baseSal = u.baseSalaryTjs || 0;
      const commPct = u.salesCommissionPercent || 0;
      const commAmt = Math.round(salesRev * (commPct / 100));
      const grossAccrued = baseSal + commAmt;

      const uExpenses = expenses.filter(e => (e.employeeId === u.id || (e.isEmployeeAdvance && e.employeeName === u.name)) && payrollMonthOf(e) === selectedPayrollMonth);
      const advances = uExpenses.filter(e => e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance).reduce((acc, e) => acc + (e.amountTjs || 0), 0);
      const paidSalary = uExpenses.filter(e => e.category === 'SALARY').reduce((acc, e) => acc + (e.amountTjs || 0), 0);
      const netPayable = Math.max(0, grossAccrued - advances - paidSalary);

      return [
        u.name,
        'Продавец',
        u.storeName || (u.storeId ? stores.find(s => s.id === u.storeId)?.name : undefined) || 'Магазин не привязан',
        baseSal,
        salesRev,
        `${commPct}% (${commAmt} TJS)`,
        grossAccrued,
        advances,
        paidSalary,
        netPayable
      ];
    });

    const csvLines = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
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

  // Grouping: One global admin at the top, each store separately with its staff/workers
  const [storeFilterChoice, setSelectedStoreFilter] = useState<string>('ALL');
  const selectedStoreFilter = storeCtx.mode === 'STORE' ? storeCtx.storeId : storeFilterChoice;

  const adminUsers = useMemo(() => users.filter(u => u.role === 'ADMIN'), [users]);
  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);
  const mainWarehouse = useMemo(() => stores.find(s => s.isMainWarehouse), [stores]);
  const warehouseUsers = useMemo(() => mainWarehouse ? users.filter(u => u.storeId === mainWarehouse.id && u.role !== 'ADMIN') : [], [mainWarehouse, users]);

  // Map each retail store to its staff (partner + sellers)
  const storeStaffMap = useMemo(() => {
    const map = new Map<string, User[]>();
    retailStores.forEach(s => {
      const staff = users.filter(u => u.storeId === s.id && u.role !== 'ADMIN');
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
    return users.filter(u => u.role !== 'ADMIN' && (!u.storeId || !stores.some(s => s.id === u.storeId)));
  }, [users, stores]);

  const renderUserCard = (u: User) => {
    const roleConf = ROLE_CONFIG[u.role] || ROLE_CONFIG.SELLER;
    const stats = employeeLifetimeStatsById.get(u.id) ?? { totalAdvances: 0, salesRevTjs: 0, unitsSold: 0 };
    const { totalAdvances, salesRevTjs, unitsSold } = stats;
    const baseSal = u.baseSalaryTjs || 0;
    const commPct = u.salesCommissionPercent || 0;

    const resolvedStoreName = (() => {
      const name = u.storeName || (u.storeId ? stores.find(s => s.id === u.storeId)?.name : undefined);
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
        {/* Line 1: Avatar, Name, Role badge, Status & Action menu */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${
              u.role === 'ADMIN' ? 'bg-accent/15 text-accent border-accent/30' :
              u.role === 'PARTNER' ? 'bg-info/15 text-info border-info/30' :
              'bg-surface-raised text-fg-muted border-border'
            }`}>
              {u.name.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs sm:text-sm font-bold text-fg truncate">
                {u.name}
              </h4>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border shrink-0 ${roleConf.bg} ${roleConf.color} ${roleConf.border}`}>
                {roleConf.label}
              </span>
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
              <ActionMenu label={`Действия: ${u.name}`} actions={[
                { label: 'Редактировать сотрудника', icon: Edit2, onSelect: () => handleOpenEdit(u) },
                ...(currentUser.id !== u.id ? [{ label: 'Удалить сотрудника', icon: Trash2, danger: true, onSelect: () => handleDeleteUserClick(u) }] : []),
              ]} />
            </div>
          )}
        </div>

        {/* Line 2: Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2 rounded-xl bg-surface-raised/60 border border-border/50 text-[11px]">
          <div className="min-w-0">
            <span className="text-[10px] text-fg-subtle block">Логин</span>
            <span className="font-mono font-semibold text-fg truncate block">{u.login}</span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] text-fg-subtle block">
              {u.role === 'SELLER' ? 'Оклад / Комиссия' : 'Авансы / Вычеты'}
            </span>
            {u.role === 'SELLER' ? (
              <span className="font-mono font-semibold text-accent truncate block">
                {baseSal > 0 ? `${baseSal.toLocaleString()} TJS` : 'Без оклада'} {commPct > 0 ? `(+${commPct}%)` : ''}
              </span>
            ) : (
              <span className={`font-mono font-bold block ${totalAdvances > 0 ? 'text-warning' : 'text-fg-subtle'}`}>
                {totalAdvances.toLocaleString()} TJS
              </span>
            )}
          </div>

          {u.role === 'SELLER' ? (
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
          ) : (
            <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:block border-t sm:border-t-0 border-border/40 pt-1 sm:pt-0 min-w-0">
              <span className="text-[10px] text-fg-subtle block">Привязка филиала</span>
              <span className={`text-[11px] font-medium truncate block ${u.storeId ? 'text-accent' : 'text-fg-muted'}`}>
                {resolvedStoreName}
              </span>
            </div>
          )}
        </div>

        {/* Line 3: Action Buttons */}
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => {
              setAdvanceIssueUser(u);
              setAdvanceAmountInput('');
              setAdvanceNoteInput('');
            }}
            className="h-7.5 px-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-fg-subtle" />
            <span>Аванс</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const thisMonth = selectedPayrollMonth;
              const empSales = sales.filter(s => s.sellerId === u.id && s.status !== 'REFUNDED' && getBusinessDateKey(new Date(s.date)).startsWith(thisMonth));
              const salesRevTjs = empSales.reduce((sum, s) => sum + s.totalTjs, 0);
              const baseSal = u.baseSalaryTjs || 0;
              const commPct = u.salesCommissionPercent || 0;
              const commAmount = moneyNumber(decimal(salesRevTjs).mul(commPct).div(100));
              const autoGross = baseSal + commAmount;

              setSalaryPayoutUser(u);
              setGrossSalaryInput(autoGross > 0 ? autoGross.toString() : '');
              setPayoutNote('');
              setPayoutMonth(selectedPayrollMonth);
            }}
            className="h-7.5 px-2 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/25 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <DollarSign className="w-3 h-3" />
            <span>Зарплата</span>
          </button>
          <button
            type="button"
            onClick={() => setFinancialHistoryUser(u)}
            className="h-7.5 px-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
            title="Финансовая история выплат и авансов"
          >
            <Receipt className="w-3 h-3 text-fg-subtle" />
            <span>История</span>
          </button>
        </div>
      </div>
    );
  };

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
              onClick={handleOpenAdd}
              className="h-8 px-2.5 sm:px-3.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-semibold flex items-center gap-1 transition-all shadow-xs shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span><span className="hidden sm:inline">Добавить </span>сотрудника</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-2.5 p-2 rounded-lg text-xs flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-danger/15 text-danger border border-danger/30'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
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
            <Shield className="w-3.5 h-3.5" />
            <span>Общий админ ({adminUsers.length})</span>
          </button>

          {retailStores.map(st => {
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
                <span>{st.name} ({count})</span>
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

      {/* Users List: Global Admin at top, then each retail store with its staff */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 md:p-5 bg-bg space-y-4 sm:space-y-5">
        {/* Section 1: Общий администратор */}
        {(selectedStoreFilter === 'ALL' || selectedStoreFilter === 'ADMIN') && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-accent/10 border border-accent/25 text-accent">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1.5">
                    <span>Общий администратор</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent/15 border border-accent/30 text-accent font-semibold">
                      {adminUsers.length}
                    </span>
                  </h4>
                </div>
              </div>
              <span className="text-[11px] text-fg-subtle hidden sm:inline">
                Центральное руководство и полный доступ ко всем магазинам
              </span>
            </div>

            {adminUsers.length === 0 ? (
              <div className="p-4 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-fg-subtle">
                Нет назначенных администраторов
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-max gap-2.5 sm:gap-3 items-start">
                {adminUsers.map(renderUserCard)}
              </div>
            )}
          </div>
        )}

        {/* Section 2: Магазины сети с рабочими */}
        {retailStores.map(store => {
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
                        {storeStaff.length} {storeStaff.length === 1 ? 'сотрудник' : storeStaff.length < 5 ? 'сотрудника' : 'сотрудников'}
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
                  {storeStaff.map(renderUserCard)}
                </div>
              )}
            </div>
          );
        })}

        {/* Section 3: Главный склад (если есть прикрепленный персонал) */}
        {warehouseUsers.length > 0 && (selectedStoreFilter === 'ALL' || selectedStoreFilter === 'WAREHOUSE') && (
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
              {warehouseUsers.map(renderUserCard)}
            </div>
          </div>
        )}

        {/* Section 4: Без привязки (если есть) */}
        {unassignedUsers.length > 0 && (selectedStoreFilter === 'ALL' || selectedStoreFilter === 'UNASSIGNED') && (
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
              {unassignedUsers.map(renderUserCard)}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Add / Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center space-x-2">
                <Users className="w-4 h-4 text-accent" />
                <span>{editingUser ? 'РЕДАКТИРОВАНИЕ СОТРУДНИКА' : 'НОВЫЙ СОТРУДНИК'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
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
                    {stores.filter(s => !s.isMainWarehouse).map(s => (
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

              {/* Salary & Commission Settings — sellers only; admins/partners are
                  compensated via profit share on the Owners page instead. */}
              {role === 'SELLER' && (
                <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-surface-raised border border-border">
                  <div>
                    <label className="block text-accent text-[10px] uppercase mb-1 font-bold">ОКЛАД (TJS/МЕС)</label>
                    <input step="0.01"
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
                onClick={() => setIsModalOpen(false)}
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
      )}

      {/* MODAL: DELETE USER CONFIRMATION */}
      {deletingUserConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-danger/40 p-5 shadow-2xl space-y-4 text-fg-muted">
            <div className="flex items-center space-x-3 text-danger border-b border-border pb-3">
              <div className="p-2 rounded-lg bg-danger/15 text-danger shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase text-fg-muted">УДАЛЕНИЕ СОТРУДНИКА</h3>
                <p className="text-[11px] text-fg-subtle mt-0.5">{deletingUserConfirm.name} ({deletingUserConfirm.login})</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-bg border border-border text-xs space-y-2">
              <p className="text-fg-muted font-semibold">
                Вы действительно хотите навсегда удалить учетную запись сотрудника «<span className="text-danger">{deletingUserConfirm.name}</span>»?
              </p>
              <p className="text-[11px] text-fg-subtle">
                Логин для входа: <strong className="text-fg-muted">{deletingUserConfirm.login}</strong> | Роль: <strong className="text-fg-muted">{deletingUserConfirm.role}</strong>
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDeletingUserConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase transition-colors disabled:opacity-50"
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmDeleteUser}
                className="flex-1 py-2.5 rounded-xl bg-danger hover:opacity-90 active:opacity-80 text-xs font-bold uppercase text-white shadow-xs transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'УДАЛЕНИЕ…' : 'УДАЛИТЬ СОТРУДНИКА'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE ADVANCE TO EMPLOYEE */}
      {advanceIssueUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleIssueAdvance} className="w-full max-w-sm rounded-2xl bg-surface border border-warning/40 p-5 text-fg-muted shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-xs font-bold text-warning uppercase tracking-wider flex items-center space-x-2">
                <Plus className="w-4 h-4 text-warning" />
                <span>ВЫДАЧА АВАНСА / РАСХОДА</span>
              </h4>
              <button type="button" onClick={() => setAdvanceIssueUser(null)} className="text-fg-subtle hover:text-fg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-2.5 rounded-lg bg-bg border border-border space-y-1">
                <span className="text-[10px] text-fg-subtle uppercase block">Сотрудник:</span>
                <strong className="text-sm text-fg-muted">{advanceIssueUser.name}</strong>
                <p className="text-[10px] text-fg-subtle">{advanceIssueUser.storeName || (advanceIssueUser.storeId ? stores.find(s => s.id === advanceIssueUser.storeId)?.name : undefined) || 'Магазин'}</p>
              </div>

              <div>
                <label className="block text-warning text-[10px] uppercase mb-1 font-bold">СУММА АВАНСА (TJS) *</label>
                <div className="relative">
                  <input step="0.01"
                    type="number"
                    min="0.01"
                    required
                    value={advanceAmountInput}
                    onChange={(e) => setAdvanceAmountInput(e.target.value)}
                    placeholder="300"
                    className="w-full rounded-lg bg-bg border border-warning/40 px-3 py-2 text-warning text-sm font-bold focus:border-warning focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-fg-subtle text-xs">TJS</span>
                </div>
              </div>

              <div>
                <label className="block text-fg-subtle text-[10px] uppercase mb-1 font-bold">В СЧЁТ ЗАРПЛАТЫ ЗА МЕСЯЦ *</label>
                <MonthPicker
                  value={advancePayrollMonth}
                  onChange={setAdvancePayrollMonth}
                  className="w-full h-9 px-3 rounded-lg bg-bg border border-border text-fg-muted text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-fg-subtle text-[10px] uppercase mb-1 font-bold">ПРИМЕЧАНИЕ / НА ЧТО ВЫДАНО</label>
                <input
                  type="text"
                  value={advanceNoteInput}
                  onChange={(e) => setAdvanceNoteInput(e.target.value)}
                  placeholder="В счет зарплаты / На личные расходы"
                  className="w-full rounded-lg bg-bg border border-border px-3 py-2 text-fg-muted text-xs focus:border-warning focus:outline-none"
                />
              </div>

              <p className="text-[9px] text-fg-subtle italic">
                ★ Сумма будет списана из кассы и учтена как удержанный аванс при выдаче зарплаты.
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setAdvanceIssueUser(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-warning hover:opacity-90 text-xs font-bold uppercase text-black shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'ВЫДАЧА…' : 'ВЫДАТЬ АВАНС'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: SALARY PAYOUT */}
      {salaryPayoutUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleExecuteSalaryPayout} className="w-full max-w-md rounded-2xl bg-surface border border-accent/40 p-5 text-fg-muted shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-accent" />
                <span>ВЫПЛАТА ЗАРПЛАТЫ СОТРУДНИКУ</span>
              </h4>
              <button type="button" onClick={() => setSalaryPayoutUser(null)} className="text-fg-subtle hover:text-fg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const thisMonth = payoutMonth;
              const totalAdvances = payrollSummary?.paidAdvancesTjs ?? 0;
              const paidSalary = payrollSummary?.paidSalaryTjs ?? 0;

              const empSales = sales.filter(s => s.sellerId === salaryPayoutUser.id && s.status !== 'REFUNDED' && getBusinessDateKey(new Date(s.date)).startsWith(thisMonth));
              const salesRevTjs = sumMoney(empSales.map((s) => s.totalTjs));
              const baseSal = salaryPayoutUser.baseSalaryTjs || 0;
              const commPct = salaryPayoutUser.salesCommissionPercent || 0;
              const commAmount = moneyNumber(decimal(salesRevTjs).mul(commPct).div(100));
              const autoGross = baseSal + commAmount;

              const grossVal = parseFloat(grossSalaryInput) || 0;
              const netPayout = Math.max(0, moneyNumber(decimal(grossVal).minus(paidSalary).minus(totalAdvances)));

              return (
                <div className="text-xs space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-fg-subtle text-[10px] uppercase font-bold">Зарплата за месяц</span>
                    <MonthPicker
                      value={payoutMonth}
                      onChange={setPayoutMonth}
                      className="h-9 px-3 rounded-lg bg-bg border border-accent/40 text-accent text-xs font-semibold"
                    />
                  </div>
                  {payrollSummaryError && (
                    <p className="p-2 rounded-lg bg-danger/10 border border-danger/30 text-danger">{payrollSummaryError}</p>
                  )}
                  <div className="p-3 rounded-lg bg-bg border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <strong className="text-sm text-fg-muted block">{salaryPayoutUser.name}</strong>
                        <span className="text-[10px] text-fg-subtle">{salaryPayoutUser.storeName || (salaryPayoutUser.storeId ? stores.find(s => s.id === salaryPayoutUser.storeId)?.name : undefined) || 'Магазин'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-fg-subtle block uppercase">Авансы за {thisMonth}:</span>
                        <strong className="text-warning">{payrollSummary ? `${totalAdvances.toLocaleString()} TJS` : '…'}</strong>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border text-[11px] space-y-1">
                      <div className="flex justify-between text-fg-subtle">
                        <span>Оклад (фикс):</span>
                        <span className="text-fg-muted">{baseSal.toLocaleString()} TJS</span>
                      </div>
                      <div className="flex justify-between text-fg-subtle">
                        <span>Продажи ({salesRevTjs.toLocaleString()} TJS × {commPct}%):</span>
                        <span className="text-warning">+{commAmount.toLocaleString()} TJS</span>
                      </div>
                      <div className="flex justify-between font-bold text-accent pt-1 border-t border-border">
                        <span>Расчетное начисление:</span>
                        <span>{autoGross.toLocaleString()} TJS</span>
                      </div>
                    </div>

                    {autoGross > 0 && grossSalaryInput !== autoGross.toString() && (
                      <button
                        type="button"
                        onClick={() => setGrossSalaryInput(autoGross.toString())}
                        className="w-full py-1.5 px-2 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent text-[10px] font-bold border border-accent/40 flex items-center justify-center space-x-1 transition-colors"
                      >
                        <span>⚡ Применить авторасчет ({autoGross.toLocaleString()} TJS)</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-accent text-[10px] uppercase mb-1 font-bold">НАЧИСЛЕНО ЗАРПЛАТЫ / БОНУСОВ (TJS) *</label>
                    <div className="relative">
                      <input step="0.01"
                        type="number"
                        min="0.01"
                        required
                        value={grossSalaryInput}
                        onChange={(e) => setGrossSalaryInput(e.target.value)}
                        placeholder="Например: 1500"
                        className="w-full rounded-lg bg-bg border border-accent/40 px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none"
                      />
                      <span className="absolute right-3 top-2.5 text-fg-subtle text-xs">TJS</span>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="p-3 rounded-lg bg-bg border border-border space-y-1.5">
                    <div className="flex justify-between text-fg-subtle">
                      <span>Начислено всего:</span>
                      <span>{grossVal.toLocaleString()} TJS</span>
                    </div>
                    {paidSalary > 0 && (
                      <div className="flex justify-between text-fg-subtle">
                        <span>Уже выплачено зарплаты за месяц:</span>
                        <span>-{paidSalary.toLocaleString()} TJS</span>
                      </div>
                    )}
                    <div className="flex justify-between text-warning">
                      <span>Удержано авансов за месяц:</span>
                      <span>-{totalAdvances.toLocaleString()} TJS</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-border text-sm font-bold text-accent">
                      <span>К выгрузке / на руки:</span>
                      <span>{netPayout.toLocaleString()} TJS</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-fg-subtle text-[10px] uppercase mb-1 font-bold">ПРИМЕЧАНИЕ</label>
                    <input
                      type="text"
                      value={payoutNote}
                      onChange={(e) => setPayoutNote(e.target.value)}
                      placeholder="Выплата за текущий месяц"
                      className="w-full rounded-lg bg-bg border border-border px-3 py-2 text-fg-muted text-xs focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex space-x-2 pt-1">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setSalaryPayoutUser(null)}
                      className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
                    >
                      ОТМЕНА
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !payrollSummary}
                      className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold uppercase text-accent-fg shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isSubmitting ? 'ВЫПЛАТА…' : 'ВЫПЛАТИТЬ ЗАРПЛАТУ'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </form>
        </div>
      )}

      {/* MODAL: Employee Financial History */}
      {financialHistoryUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-2xl bg-surface border border-info/40 p-5 text-fg-muted shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-info uppercase tracking-wider flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-info" />
                  <span>ФИНАНСОВАЯ ИСТОРИЯ И ОПЕРАЦИИ: {financialHistoryUser.name}</span>
                </h4>
                <span className="text-[10px] text-fg-subtle">{financialHistoryUser.storeName || (financialHistoryUser.storeId ? stores.find(s => s.id === financialHistoryUser.storeId)?.name : undefined) || (financialHistoryUser.role === 'SELLER' ? 'Магазин не привязан' : 'Все филиалы')}</span>
              </div>
              <button type="button" onClick={() => setFinancialHistoryUser(null)} className="text-fg-subtle hover:text-fg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive Month Selector Bar */}
            <div className="bg-bg p-3 rounded-lg border border-border space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-fg-muted uppercase flex items-center space-x-1.5">
                  <Calendar className="w-4 h-4 text-warning" />
                  <span>ФИЛЬТР ПО МЕСЯЦУ:</span>
                </label>
                <div className="flex items-center space-x-2">
                  <MonthPicker
                    value={selectedHistoryMonth === 'ALL' ? '' : selectedHistoryMonth}
                    onChange={setSelectedHistoryMonth}
                    className="rounded-lg bg-surface border border-border px-3 py-1 text-xs text-warning font-bold focus:border-warning focus:outline-none"
                  />
                  {selectedHistoryMonth !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryMonth('ALL')}
                      className="px-2 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-[10px] text-fg-muted font-bold"
                    >
                      СБРОСИТЬ ФИЛЬТР
                    </button>
                  )}
                </div>
              </div>

              {/* Month Quick Filter Chips */}
              {(() => {
                const allEmpExpenses = expenses.filter(e => e.employeeId === financialHistoryUser.id || (e.isEmployeeAdvance && e.employeeName === financialHistoryUser.name));
                const allEmpSales = sales.filter(s => s.sellerId === financialHistoryUser.id && s.status !== 'REFUNDED');

                const datesSet = new Set<string>();
                allEmpExpenses.forEach(e => datesSet.add(e.date.substring(0, 7)));
                allEmpSales.forEach(s => datesSet.add(s.date.substring(0, 7)));
                const availableMonths = Array.from(datesSet).sort().reverse();

                return (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryMonth('ALL')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                        selectedHistoryMonth === 'ALL'
                          ? 'bg-warning text-black'
                          : 'bg-surface-raised text-fg-muted hover:bg-surface hover:text-fg-muted border border-border'
                      }`}
                    >
                      🌐 ВСЕ МЕСЯЦЫ
                    </button>
                    {availableMonths.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedHistoryMonth(m)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                          selectedHistoryMonth === m
                            ? 'bg-warning text-black'
                            : 'bg-surface-raised text-fg-muted hover:bg-surface hover:text-fg-muted border border-border'
                        }`}
                      >
                        📅 {m}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Calculations & Breakdown for Selected Month / All */}
            {(() => {
              const allExpenses = expenses.filter(e => e.employeeId === financialHistoryUser.id || (e.isEmployeeAdvance && e.employeeName === financialHistoryUser.name));
              const allSales = sales.filter(s => s.sellerId === financialHistoryUser.id && s.status !== 'REFUNDED');

              const filteredExpenses = selectedHistoryMonth === 'ALL'
                ? allExpenses
                : allExpenses.filter(e => e.date.startsWith(selectedHistoryMonth));

              const filteredSales = selectedHistoryMonth === 'ALL'
                ? allSales
                : allSales.filter(s => s.date.startsWith(selectedHistoryMonth));

              const salaryExpenses = filteredExpenses.filter(e => e.category === 'SALARY');
              const advanceExpenses = filteredExpenses.filter(e => e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance);

              const totalSalaryPaid = salaryExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
              const totalAdvancesTaken = advanceExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
              const totalSalesRev = filteredSales.reduce((sum, s) => sum + s.totalTjs, 0);

              // A single true timeline — expenses and sales interleaved by date, newest
              // first, instead of two separate blocks (all expenses, then all sales).
              const combinedOperations = [
                ...filteredExpenses.map(e => ({ kind: 'expense' as const, date: e.date, data: e })),
                ...filteredSales.map(s => ({ kind: 'sale' as const, date: s.date, data: s })),
              ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

              const baseSal = financialHistoryUser.baseSalaryTjs || 0;
              const commPct = financialHistoryUser.salesCommissionPercent || 0;
              const commAmount = Math.round(totalSalesRev * (commPct / 100));
              const grossAccrued = baseSal + commAmount;

              return (
                <div className="space-y-3">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-bg p-3 rounded-lg border border-border text-xs">
                    <div>
                      <span className="text-[10px] text-fg-subtle uppercase block">ВЫРУЧКА ПРОДАЖ:</span>
                      <strong className="text-fg-muted text-xs font-bold">{totalSalesRev.toLocaleString()} TJS ({filteredSales.length} шт)</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-subtle uppercase block">НАЧИСЛЕНО (ОКЛАД+PROFIT):</span>
                      <strong className="text-accent text-xs font-bold">{grossAccrued.toLocaleString()} TJS</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-subtle uppercase block">ВЫДАННО АВАНСОВ:</span>
                      <strong className="text-warning text-xs font-bold">{totalAdvancesTaken.toLocaleString()} TJS</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-subtle uppercase block">ВЫПЛАЧЕНО ЗАРПЛАТЫ:</span>
                      <strong className="text-info text-xs font-bold">{totalSalaryPaid.toLocaleString()} TJS</strong>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-fg-muted uppercase">
                        Все операции за {selectedHistoryMonth === 'ALL' ? 'весь период' : `месяц ${selectedHistoryMonth}`} ({filteredExpenses.length + filteredSales.length}):
                      </span>
                    </div>

                    <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-bg">
                      {filteredExpenses.length === 0 && filteredSales.length === 0 ? (
                        <div className="p-4 text-center text-fg-subtle text-xs">Операций за выбранный месяц не найдено</div>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                            <tr>
                              <th className="p-2">Дата</th>
                              <th className="p-2">Тип операции</th>
                              <th className="p-2">Детали / Описание</th>
                              <th className="p-2 text-right">Сумма (TJS)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border text-[11px]">
                            {combinedOperations.map(op => op.kind === 'expense' ? (
                              <tr key={`e-${op.data.id}`} className="hover:bg-surface-raised">
                                <td className="p-2 text-fg-subtle whitespace-nowrap">{new Date(op.data.date).toLocaleDateString()}</td>
                                <td className="p-2">
                                  {op.data.category === 'SALARY' ? (
                                    <span className="px-1.5 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/30 text-[10px] font-bold">ЗАРПЛАТА</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded-md bg-warning/10 text-warning border border-warning/30 text-[10px] font-bold">АВАНС</span>
                                  )}
                                </td>
                                <td className="p-2 text-fg-muted truncate max-w-55">{op.data.description || op.data.comment || '-'}</td>
                                <td className={`p-2 text-right font-bold ${op.data.category === 'SALARY' ? 'text-accent' : 'text-warning'}`}>
                                  {op.data.amountTjs.toLocaleString()} TJS
                                </td>
                              </tr>
                            ) : (
                              <tr key={`s-${op.data.id}`} className="hover:bg-surface-raised">
                                <td className="p-2 text-fg-subtle whitespace-nowrap">{new Date(op.data.date).toLocaleDateString()}</td>
                                <td className="p-2">
                                  <span className="px-1.5 py-0.5 rounded-md bg-info/10 text-info border border-info/30 text-[10px] font-bold">ПРОДАЖА #{op.data.receiptNumber}</span>
                                </td>
                                <td className="p-2 text-fg-muted truncate max-w-55">
                                  {op.data.items.map(i => `${i.brand} ${i.model}`).join(', ')} ({op.data.customerName || 'Покупатель'})
                                </td>
                                <td className="p-2 text-right font-bold text-fg-muted">
                                  +{op.data.totalTjs.toLocaleString()} TJS
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="pt-2 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setFinancialHistoryUser(null)}
                className="py-2.5 px-4 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted"
              >
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Monthly Payroll Summary Report */}
      {isPayrollReportModalOpen && (() => {
        const activeSellers = users.filter(u => (u.isActive ?? u.active) && u.role === 'SELLER');
        const sellerPayrollData = activeSellers.map(u => {
          const stats = employeePayrollStatsByMonthAndId.get(u.id) ?? { salesRev: 0, advances: 0, paidSalary: 0 };
          const { salesRev, advances, paidSalary } = stats;
          const baseSal = u.baseSalaryTjs || 0;
          const commPct = u.salesCommissionPercent || 0;
          const commAmt = Math.round(salesRev * (commPct / 100));
          const grossAccrued = baseSal + commAmt;
          const netPayable = Math.max(0, grossAccrued - advances - paidSalary);
          const rawStoreName = u.storeName || (u.storeId ? stores.find(s => s.id === u.storeId)?.name : undefined);
          const storeName = rawStoreName ? rawStoreName.replace(/^Магазин\s*[«"']?|["'»]$/g, '').trim() : 'Без привязки';
          return {
            user: u,
            salesRev,
            advances,
            paidSalary,
            baseSal,
            commPct,
            commAmt,
            grossAccrued,
            netPayable,
            storeName,
          };
        });

        const totals = sellerPayrollData.reduce(
          (acc, row) => ({
            baseSal: acc.baseSal + row.baseSal,
            salesRev: acc.salesRev + row.salesRev,
            commAmt: acc.commAmt + row.commAmt,
            grossAccrued: acc.grossAccrued + row.grossAccrued,
            advances: acc.advances + row.advances,
            paidSalary: acc.paidSalary + row.paidSalary,
            netPayable: acc.netPayable + row.netPayable,
          }),
          { baseSal: 0, salesRev: 0, commAmt: 0, grossAccrued: 0, advances: 0, paidSalary: 0, netPayable: 0 }
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-xs">
            <div className="w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-2xl bg-surface border border-border p-3.5 sm:p-4 text-fg shadow-2xl space-y-2.5">
              {/* Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-border shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-warning/15 text-warning flex items-center justify-center shrink-0">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex items-center gap-2">
                    <h3 className="text-sm font-bold text-fg truncate">Зарплатная ведомость продавцов</h3>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-surface-raised border border-border text-fg-subtle shrink-0">
                      {activeSellers.length} чел.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPayrollReportModalOpen(false)}
                  aria-label="Закрыть"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Month Selector + KPI Summary Bar (no empty space!) */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-raised/80 border border-border rounded-xl px-3 py-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-fg-subtle">Период:</span>
                  <MonthPicker
                    value={selectedPayrollMonth}
                    onChange={setSelectedPayrollMonth}
                    className="rounded-lg bg-surface border border-border px-2.5 py-1 text-xs text-warning font-bold focus:border-warning focus:outline-none"
                  />
                </div>

                {/* KPI Pill Indicators */}
                <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs">
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface border border-border text-[11px]">
                    <span className="text-fg-subtle">Начислено:</span>
                    <span className="font-bold text-fg">{totals.grossAccrued.toLocaleString()} TJS</span>
                  </div>
                  {totals.advances > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-warning/10 border border-warning/20 text-[11px]">
                      <span className="text-warning">Авансы:</span>
                      <span className="font-bold text-warning">-{totals.advances.toLocaleString()} TJS</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-accent/15 border border-accent/30 text-[11px]">
                    <span className="text-accent font-medium">К выдаче:</span>
                    <span className="font-bold text-accent">{totals.netPayable.toLocaleString()} TJS</span>
                  </div>
                </div>
              </div>

              {/* Table Body */}
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 rounded-xl border border-border bg-bg/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-[10.5px] font-semibold text-fg-subtle border-b border-border sticky top-0 z-10 shadow-xs">
                    <tr>
                      <th className="py-2 px-2.5">Сотрудник</th>
                      <th className="py-2 px-2 text-right">Оклад</th>
                      <th className="py-2 px-2 text-right">Продажи</th>
                      <th className="py-2 px-2 text-right">Бонус</th>
                      <th className="py-2 px-2 text-right">Начислено</th>
                      <th className="py-2 px-2 text-right text-warning">Авансы</th>
                      <th className="py-2 px-2 text-right text-info">Выплачено</th>
                      <th className="py-2 px-2.5 text-right text-accent font-bold">К выдаче</th>
                      <th className="py-2 px-2 text-center">Операции</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[11px]">
                    {sellerPayrollData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-xs text-fg-subtle">
                          Нет активных продавцов за выбранный период
                        </td>
                      </tr>
                    ) : (
                      sellerPayrollData.map(({ user: u, salesRev, advances, paidSalary, baseSal, commPct, commAmt, grossAccrued, netPayable, storeName }) => (
                        <tr
                          key={u.id}
                          onClick={() => {
                            setIsPayrollReportModalOpen(false);
                            setSelectedHistoryMonth(selectedPayrollMonth);
                            setFinancialHistoryUser(u);
                          }}
                          className="hover:bg-surface-raised cursor-pointer transition-colors group"
                          title="Нажмите, чтобы открыть подробные операции сотрудника"
                        >
                          <td className="py-2 px-2.5">
                            <div className="font-semibold text-fg group-hover:text-accent transition-colors leading-tight">{u.name}</div>
                            <div className="text-[10px] text-fg-subtle truncate max-w-[130px]">{storeName}</div>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-fg-muted">{baseSal.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-fg-muted font-medium">{salesRev > 0 ? salesRev.toLocaleString() : '—'}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {commAmt > 0 ? (
                              <span className="text-warning font-semibold">
                                +{commAmt.toLocaleString()} <span className="text-[10px] text-warning/80">({commPct}%)</span>
                              </span>
                            ) : (
                              <span className="text-fg-subtle">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums font-bold text-fg">{grossAccrued.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {advances > 0 ? (
                              <span className="text-warning font-semibold">-{advances.toLocaleString()}</span>
                            ) : (
                              <span className="text-fg-subtle">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {paidSalary > 0 ? (
                              <span className="text-info font-semibold">{paidSalary.toLocaleString()}</span>
                            ) : (
                              <span className="text-fg-subtle">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-right tabular-nums whitespace-nowrap">
                            <span className="font-bold text-accent px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/20">
                              {netPayable.toLocaleString()} TJS
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface border border-border text-[10px] font-semibold text-fg-muted group-hover:border-accent group-hover:text-accent transition-colors">
                              <Receipt className="w-3 h-3 text-info" />
                              <span className="hidden sm:inline">Операции</span>
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {sellerPayrollData.length > 0 && (
                    <tfoot className="bg-surface-raised font-semibold text-[11px] border-t-2 border-border text-fg sticky bottom-0 z-10 shadow-xs">
                      <tr>
                        <td className="py-2 px-2.5 text-fg-subtle">Итого ({sellerPayrollData.length}):</td>
                        <td className="py-2 px-2 text-right tabular-nums">{totals.baseSal.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{totals.salesRev.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-warning">{totals.commAmt.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-bold text-fg">{totals.grossAccrued.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-warning">{totals.advances > 0 ? `-${totals.advances.toLocaleString()}` : '0'}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-info">{totals.paidSalary.toLocaleString()}</td>
                        <td className="py-2 px-2.5 text-right tabular-nums font-bold text-accent whitespace-nowrap">{totals.netPayable.toLocaleString()} TJS</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center pt-2 border-t border-border shrink-0">
                <button
                  type="button"
                  onClick={handleExportPayrollReport}
                  className="h-8 px-3 rounded-lg bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg flex items-center gap-1.5 transition-colors active:scale-95 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-accent" />
                  <span>Экспорт CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPayrollReportModalOpen(false)}
                  className="h-8 px-4 rounded-lg bg-accent hover:bg-accent-strong text-xs font-semibold text-accent-fg transition-colors active:scale-95 shadow-xs"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

