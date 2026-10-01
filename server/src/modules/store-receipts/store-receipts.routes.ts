import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { StoreReceiptsService } from './store-receipts.service';

export function registerStoreReceiptRoutes(app: Express) {
  // One scan of the receipt screen: is this phone in the main warehouse? (store staff only)
  app.post('/api/store-receipts/lookup', authenticateJwt, requireRoles('SELLER', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      res.json(await StoreReceiptsService.lookup(req.user!, req.body?.imei));
    } catch (error) {
      next(error);
    }
  });

  // Completes the receipt into the employee's own store; any storeId in the body is ignored.
  app.post('/api/store-receipts', authenticateJwt, requireRoles('SELLER', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      res.status(201).json(await StoreReceiptsService.create(req.user!, req.body?.imeis));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/store-receipts', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) || undefined : undefined;
      res.json(await StoreReceiptsService.list(req.user!, { storeId, limit }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/store-receipts/:id', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      res.json(await StoreReceiptsService.get(req.user!, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  // «Ознакомлен»: the admin's review mark — no stock, cash or profit changes.
  app.post('/api/store-receipts/:id/acknowledge', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      res.json(await StoreReceiptsService.acknowledge(req.user!.userId, req.params.id));
    } catch (error) {
      next(error);
    }
  });
}
