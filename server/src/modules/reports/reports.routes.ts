import type { Express } from 'express';
import { authenticateJwt, isStoreScopedRole, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { computeReportsSummary, toStoreManagerView, type ReportPeriod } from './reports.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

export function registerReportRoutes(app: Express) {
  // Computes the whole "Финансовый и балансовый отчет" dataset server-side, scoped to the
  // requested period/store at the DB level — this is what used to be a client-side useMemo
  // filtering the FULL, ever-growing sales/expenses history fetched on every login.
  // A STORE_MANAGER gets the same report, hard-pinned to their own store and stripped of
  // every network/owner-level figure (see toStoreManagerView).
  app.get('/api/reports/summary', authenticateJwt, requireRoles('ADMIN', 'PARTNER', 'STORE_MANAGER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'TODAY';
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const storeScoped = isStoreScopedRole(req.user!.role);
      if (storeScoped && !req.user!.storeId) {
        res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
        return;
      }
      const storeId = storeScoped ? req.user!.storeId! : typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      if (period === 'SPECIFIC_MONTH' && !month) {
        res.status(400).json({ message: 'month обязателен для периода SPECIFIC_MONTH' });
        return;
      }
      const summary = await computeReportsSummary({ period, month, storeId });
      res.json(storeScoped ? toStoreManagerView(summary) : summary);
    } catch (error) {
      next(error);
    }
  });
}
