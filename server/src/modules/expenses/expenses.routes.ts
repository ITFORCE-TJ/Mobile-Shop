import { D } from '../../common/decimal';
import type { Express, Response } from 'express';
import { authenticateJwt, enforceBodyStoreScope, isStoreScopedRole, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { createExpenseStandalone, updateExpense, deleteExpense, payExpense } from './expenses.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';
import { getPayrollSummary, paySalary } from './payroll.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

/** Owner profit allocations are owner-level accounting — never sent to store-scoped roles. */
function expenseView<T extends { ownerProfitAllocations?: unknown }>(req: AuthenticatedRequest, expense: T) {
  if (!isStoreScopedRole(req.user!.role)) return expense;
  const { ownerProfitAllocations: _allocations, ...rest } = expense;
  return rest;
}

/**
 * A store manager may only touch expenses of their own store — never network-level ones
 * (booked to the main warehouse), another store's, or payroll/advances. Returns false after
 * sending a 403.
 */
async function ensureExpenseInScope(req: AuthenticatedRequest, res: Response): Promise<boolean> {
  if (!isStoreScopedRole(req.user!.role)) return true;
  const expense = await prisma.expense.findUnique({ where: { id: req.params.id }, select: { storeId: true, targetType: true, employeeId: true } });
  if (!expense || expense.targetType === 'BUSINESS' || !req.user!.storeId || expense.storeId !== req.user!.storeId) {
    res.status(403).json({ message: 'Этот расход относится к другому магазину или ко всей сети' });
    return false;
  }
  if (expense.employeeId) {
    res.status(403).json({ message: 'Зарплату и авансы сотрудников изменяет администратор' });
    return false;
  }
  return true;
}

export function registerExpenseRoutes(app: Express) {
  app.get('/api/payroll/:employeeId', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req, res, next) => {
    try { res.json(await getPayrollSummary(req.params.employeeId, String(req.query.month || ''))); }
    catch (error) { next(error); }
  });
  app.post('/api/payroll/:employeeId/payout', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const expense = await paySalary({ employeeId: req.params.employeeId, month: req.body?.month,
        grossTjs: req.body?.grossTjs, note: req.body?.note, actorId: req.user!.userId });
      RealtimeSyncGateway.broadcast('EXPENSE_CREATED', { expenseId: expense.id }, { storeIds: [expense.storeId!] });
      res.status(201).json(expenseView(req, expense));
    } catch (error) { next(error); }
  });
  app.get('/api/expenses', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeScopeId = isStoreScopedRole(req.user!.role) ? req.user!.storeId ?? '__none__' : typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      // period/month let the Reports export preview ask for exactly the range it's showing,
      // instead of the client filtering the entire expense history it used to fetch in full.
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'ALL';
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const dateRange = dateRangeForPeriod(period, month);
      // Explicit opt-in cap for the app's background/startup load — existing callers that
      // don't pass it keep today's full-history-for-that-period behavior. employeeId powers
      // one employee's full advance/expense history (Employees page), naturally bounded to
      // that one person's own records rather than the whole business's.
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 0, 1), 2000) : undefined;
      const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
      const expenses = await prisma.expense.findMany({
        where: {
          // Cancelled expenses are kept forever for audit (see expenses.service.ts
          // deleteExpense) but stay out of the everyday list, matching the old
          // hard-delete behavior from the user's point of view.
          cancelledAt: null,
          ...(storeScopeId ? { storeId: storeScopeId } : {}),
          ...(employeeId ? { employeeId } : dateRange ? { createdAt: dateRange } : {}),
        },
        // Only the store name is ever read (mapExpense) — `include: { store: true }` used
        // to pull the full row, cashBalanceTjs included, into every expense in the list.
        include: { store: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        ...(employeeId ? {} : limit ? { take: limit } : {}),
      });
      // Allocation snapshots are internal accounting data, not part of the seller's expense view.
      res.json(expenses.map(({ ownerProfitAllocations: _allocations, ...expense }) => expense));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/expenses', authenticateJwt, requireRoles('ADMIN', 'PARTNER', 'STORE_MANAGER'), enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { category, amountTjs, storeId, sourceAccount, comment, description, paidFromCashRegister, employeeId, isEmployeeAdvance } =
        req.body ?? {};
      let { targetType } = req.body ?? {};
      if (!category || !amountTjs) {
        res.status(400).json({ message: 'category и amountTjs обязательны' });
        return;
      }
      if (targetType !== undefined && targetType !== 'STORE' && targetType !== 'BUSINESS') {
        res.status(400).json({ message: 'targetType должен быть STORE или BUSINESS' });
        return;
      }
      if (isStoreScopedRole(req.user!.role)) {
        // A store manager books only their own store's expenses; network-level expenses and
        // payroll/advances stay with the owners.
        if (employeeId || isEmployeeAdvance) {
          res.status(403).json({ message: 'Выплаты и авансы сотрудникам оформляет администратор' });
          return;
        }
        targetType = 'STORE';
      } else if (targetType === 'STORE' && !storeId) {
        res.status(400).json({ message: 'Для расхода филиала выберите магазин' });
        return;
      }

      const expense = await createExpenseStandalone({
        category,
        amountTjs: D(amountTjs),
        targetType,
        storeId,
        sourceAccount,
        comment,
        description,
        paidFromCashRegister,
        employeeId,
        isEmployeeAdvance,
        createdByUserId: req.user!.userId,
      });

      RealtimeSyncGateway.broadcast('EXPENSE_CREATED', { expenseId: expense.id }, storeId ? { storeIds: [storeId] } : undefined);
      res.status(201).json(expenseView(req, expense));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/expenses/:id/pay', authenticateJwt, requireRoles('ADMIN', 'PARTNER', 'STORE_MANAGER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!(await ensureExpenseInScope(req, res))) return;
      const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId : undefined;
      const expense = await payExpense(req.params.id, req.user!.userId, storeId);
      RealtimeSyncGateway.broadcast('EXPENSE_UPDATED', { expenseId: expense.id }, expense.storeId ? { storeIds: [expense.storeId] } : undefined);
      res.json(expenseView(req, expense));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/expenses/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER', 'STORE_MANAGER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!(await ensureExpenseInScope(req, res))) return;
      const input = { ...(req.body ?? {}) };
      // A store manager can't move an expense to another store.
      if (isStoreScopedRole(req.user!.role)) delete input.storeId;
      const expense = await updateExpense(req.params.id, input, req.user!.userId);
      RealtimeSyncGateway.broadcast('EXPENSE_UPDATED', { expenseId: expense.id });
      res.json(expenseView(req, expense));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/expenses/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER', 'STORE_MANAGER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!(await ensureExpenseInScope(req, res))) return;
      const result = await deleteExpense(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('EXPENSE_DELETED', { expenseId: req.params.id });
      res.json(expenseView(req, result));
    } catch (error) {
      next(error);
    }
  });
}
