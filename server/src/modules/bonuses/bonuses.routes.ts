import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest, requireRoles } from '../../auth/auth.middleware';
import { BonusesService } from './bonuses.service';

export function registerBonusRoutes(app: Express) {
  app.get('/api/bonuses/pool', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (_req: AuthenticatedRequest, res, next) => {
    try {
      const result = await BonusesService.getBonusPool();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bonuses/distribute-profit', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await BonusesService.distributeBonusProfit({
        periodName: req.body?.periodName,
        allocations: req.body?.allocations,
        note: req.body?.note,
        userId: req.user!.userId,
      });
      res.status(200).json(result);
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
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
}
