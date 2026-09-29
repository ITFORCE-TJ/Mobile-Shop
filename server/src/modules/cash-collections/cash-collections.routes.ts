import type { Express } from 'express';
import { authenticateJwt, enforceBodyStoreScope, isStoreScopedRole, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import type { ReportPeriod } from '../../common/business-date';
import { cancelCashCollection, createCashCollection, listCashCollections } from './cash-collections.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

export function registerCashCollectionRoutes(app: Express) {
  app.get('/api/cash-collections', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeId = isStoreScopedRole(req.user!.role)
        ? req.user!.storeId ?? '__none__'
        : typeof req.query.storeId === 'string' && req.query.storeId !== 'all' ? req.query.storeId : undefined;
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'MONTH';
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      res.json(await listCashCollections({ storeId, period, month }));
    } catch (error) {
      next(error);
    }
  });

  // Anyone working a store register (seller, store manager) can hand its cash over to the
  // central safe; store-scoped roles are pinned to their own store by enforceBodyStoreScope.
  app.post('/api/cash-collections', authenticateJwt, enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { storeId, amountTjs, comment } = req.body ?? {};
      if (!storeId || amountTjs === undefined || amountTjs === null || amountTjs === '') {
        res.status(400).json({ message: 'storeId и amountTjs обязательны' });
        return;
      }
      const result = await createCashCollection({ storeId, amountTjs, comment, actorId: req.user!.userId });
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: result.storeId }, { storeIds: [result.storeId, result.mainWarehouseId] });
      // Owners are notified when store staff hand cash over (see createCashCollection).
      if (isStoreScopedRole(req.user!.role)) RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', {}, { storeIds: [] });
      res.status(201).json(result.transaction);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/cash-collections/:id/cancel', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await cancelCashCollection(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: result.storeId }, { storeIds: [result.storeId, result.mainWarehouseId] });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });
}
