import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { CashCollectionService } from './cash-collection.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import type { ReportPeriod } from '../reports/reports.service';

export function registerCashCollectionRoutes(app: Express) {
  app.get('/api/cash-collections', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
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

  app.post('/api/cash-collections', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { storeId, amountTjs, comment } = req.body ?? {};
      if (!storeId || amountTjs === undefined || amountTjs === null) {
        res.status(400).json({ message: 'storeId и amountTjs обязательны' });
        return;
      }
      const result = await CashCollectionService.collect({
        storeId,
        amountTjs,
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

  app.post('/api/cash-collections/:id/cancel', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
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
