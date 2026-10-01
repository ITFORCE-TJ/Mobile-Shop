import { D } from '../../common/decimal';
import type { Express } from 'express';
import { authenticateJwt, enforceBodyStoreScope, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { createExpenseStandalone, updateExpense, deleteExpense, payExpense } from './expenses.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';
import { dateRangeForCustomDates } from '../../common/business-date';
import { getPayrollSummary, paySalary } from './payroll.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

export function registerExpenseRoutes(app: Express) {
  app.get('/api/payroll/:employeeId', authenticateJwt, requireRoles('ADMIN'), async (req, res, next) => {
    try { res.json(await getPayrollSummary(req.params.employeeId, String(req.query.month || ''))); }
    catch (error) { next(error); }
  });
  app.post('/api/payroll/:employeeId/payout', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const expense = await paySalary({ employeeId: req.params.employeeId, month: req.body?.month,
        grossTjs: req.body?.grossTjs, note: req.body?.note, actorId: req.user!.userId });
      RealtimeSyncGateway.broadcast('EXPENSE_CREATED', { expenseId: expense.id }, { storeIds: [expense.storeId!] });
      res.status(201).json(expense);
    } catch (error) { next(error); }
  });
  app.get('/api/expenses', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const isStoreScoped = req.user!.role === 'SELLER' || req.user!.role === 'PARTNER';
      const storeScopeId = isStoreScoped ? req.user!.storeId ?? '__none__' : typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      const startDate = typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate) ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate) ? req.query.endDate : undefined;
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'ALL';
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const dateRange = startDate ? dateRangeForCustomDates(startDate, endDate) : dateRangeForPeriod(period, month);
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

  app.post('/api/expenses', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { category, amountTjs, targetType, storeId, sourceAccount, comment, description, paidFromCashRegister, employeeId, isEmployeeAdvance, payrollMonth } =
        req.body ?? {};
      if (!category || !amountTjs) {
        res.status(400).json({ message: 'category и amountTjs обязательны' });
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
        payrollMonth,
        createdByUserId: req.user!.userId,
      });

      RealtimeSyncGateway.broadcast('EXPENSE_CREATED', { expenseId: expense.id }, storeId ? { storeIds: [storeId] } : undefined);
      res.status(201).json(expense);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/expenses/:id/pay', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        const existing = await prisma.expense.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
        if (!existing || existing.storeId !== req.user!.storeId) {
          res.status(403).json({ message: 'Нет доступа к расходам другого магазина' });
          return;
        }
      }
      const storeId = typeof req.body?.storeId === 'string' ? req.body.storeId : undefined;
      const expense = await payExpense(req.params.id, req.user!.userId, storeId);
      RealtimeSyncGateway.broadcast('EXPENSE_UPDATED', { expenseId: expense.id }, expense.storeId ? { storeIds: [expense.storeId] } : undefined);
      res.json(expense);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/expenses/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        const existing = await prisma.expense.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
        if (!existing || existing.storeId !== req.user!.storeId) {
          res.status(403).json({ message: 'Нет доступа к расходам другого магазина' });
          return;
        }
      }
      const expense = await updateExpense(req.params.id, req.body ?? {}, req.user!.userId);
      RealtimeSyncGateway.broadcast('EXPENSE_UPDATED', { expenseId: expense.id });
      res.json(expense);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/expenses/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        const existing = await prisma.expense.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
        if (!existing || existing.storeId !== req.user!.storeId) {
          res.status(403).json({ message: 'Нет доступа к расходам другого магазина' });
          return;
        }
      }
      const result = await deleteExpense(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('EXPENSE_DELETED', { expenseId: req.params.id });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
