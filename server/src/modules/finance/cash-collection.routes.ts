import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { CashCollectionService } from './cash-collection.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import type { ReportPeriod } from '../reports/reports.service';

export function registerCashCollectionRoutes(app: Express) {
  app.get('/api/cash-collections', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const period = req.query.period as ReportPeriod | undefined;
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      const rows = await CashCollectionService.list({ period, month, storeId });
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  // Every register in TJS and USD (Central Cash included) — ADMIN only.
  app.get('/api/cash-collections/balances', authenticateJwt, requireRoles('ADMIN'), async (_req, res, next) => {
    try {
      res.json(await CashCollectionService.balances());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/cash-collections', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      // The whole register is collected; the client confirms the balance it showed the admin.
      const { storeId, expectedCashUsd, comment } = req.body ?? {};
      if (!storeId || expectedCashUsd === undefined || expectedCashUsd === null || expectedCashUsd === '') {
        res.status(400).json({ message: 'Укажите магазин и подтверждённый остаток кассы (expectedCashUsd)' });
        return;
      }
      const result = await CashCollectionService.collect({
        storeId,
        expectedCashUsd,
        comment: typeof comment === 'string' ? comment.trim() : undefined,
        actorUserId: req.user!.userId,
      });

      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId });
      RealtimeSyncGateway.broadcast('FINANCE_UPDATED', {});
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/cash-collections/:id/cancel', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await CashCollectionService.cancel(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: result.storeId });
      RealtimeSyncGateway.broadcast('FINANCE_UPDATED', {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
