import { D } from '../../common/decimal';
import { roundMoney } from '../../common/money';
import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { StoresService } from './stores.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';

export function registerStoreRoutes(app: Express) {
  app.post('/api/stores', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const store = await StoresService.create(req.body?.name, req.body?.address, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.status(201).json(store);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/stores/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const store = await StoresService.update(req.params.id, req.body?.name, req.body?.address, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.json(store);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/stores/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      await StoresService.remove(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/stores/:id/adjust-cash', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { newBalanceUsd, newBalanceTjs, reason } = req.body ?? {};
      let targetUsd: ReturnType<typeof D> | null = null;
      if (newBalanceUsd !== undefined && newBalanceUsd !== null) {
        targetUsd = D(newBalanceUsd);
      } else if (newBalanceTjs !== undefined && newBalanceTjs !== null) {
        const rate = await getRateForDate(new Date());
        // Without a rate the TJS figure can't be converted — never fall back to zeroing the register.
        if (!rate || D(rate).lte(0)) {
          res.status(400).json({ message: 'Сначала задайте курс USD/TJS на сегодня' });
          return;
        }
        targetUsd = roundMoney(D(newBalanceTjs).div(rate));
      }
      if (targetUsd === null) {
        res.status(400).json({ message: 'Укажите новый остаток кассы в долларах (newBalanceUsd) или сомони (newBalanceTjs)' });
        return;
      }
      const store = await StoresService.adjustCashBalance(req.params.id, targetUsd, reason, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.json(store);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/stores/:id/merge', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const targetStoreId = req.body?.targetStoreId;
      if (!targetStoreId) {
        res.status(400).json({ message: 'targetStoreId обязателен' });
        return;
      }
      const store = await StoresService.mergeAndDelete(req.params.id, targetStoreId, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: targetStoreId });
      res.json(store);
    } catch (error) {
      next(error);
    }
  });
}
