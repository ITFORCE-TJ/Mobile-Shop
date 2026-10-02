import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest, requireRoles } from '../../auth/auth.middleware';
import { BonusesService } from './bonuses.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerBonusRoutes(app: Express) {
  app.get('/api/bonuses/pool', authenticateJwt, requireRoles('ADMIN'), async (_req: AuthenticatedRequest, res, next) => {
    try {
      const result = await BonusesService.getBonusPool();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Bonuses are never distributed to anyone (no payout, no reinvestment): the Bonuses page
  // shows the quarter and closes it.
  app.get('/api/bonuses/quarter', authenticateJwt, requireRoles('ADMIN'), async (_req: AuthenticatedRequest, res, next) => {
    try {
      res.json(await BonusesService.quarterSummary());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/bonuses/quarter-history', authenticateJwt, requireRoles('ADMIN'), async (_req: AuthenticatedRequest, res, next) => {
    try {
      res.json(await BonusesService.quarterHistory());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bonuses/annul-pool', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await BonusesService.annulBonusPool({
        periodName: req.body?.periodName,
        note: req.body?.note,
        userId: req.user!.userId,
      });
      // Other open admin screens refetch the zeroed quarter.
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { roles: ['ADMIN'] });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
}
