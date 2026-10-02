import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest, requireRoles } from '../../auth/auth.middleware';
import { BonusesService } from './bonuses.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { BonusAccountService } from './bonus-account.service';

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

  // ---- Old bonus accruals to owners: previewed, then taken back by the admin ----
  app.get('/api/bonuses/legacy-accruals', authenticateJwt, requireRoles('ADMIN'), async (_req: AuthenticatedRequest, res, next) => {
    try {
      res.json(await BonusesService.legacyAccruals());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bonuses/legacy-accruals/reverse', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await BonusesService.reverseLegacyAccruals({ expectedTotalUsd: req.body?.expectedTotalUsd, userId: req.user!.userId });
      RealtimeSyncGateway.broadcast('OWNER_TX', {}, { roles: ['ADMIN'] });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // ---- Bonus Account: the admin moves its money to Central Cash or pays it out ----
  app.get('/api/bonus-account/operations', authenticateJwt, requireRoles('ADMIN'), async (_req: AuthenticatedRequest, res, next) => {
    try {
      res.json(await BonusAccountService.operations());
    } catch (error) {
      next(error);
    }
  });

  for (const kind of ['transfer', 'payout'] as const) {
    app.post(`/api/bonus-account/${kind}`, authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
      try {
        const input = { amountUsd: req.body?.amountUsd, comment: req.body?.comment, userId: req.user!.userId };
        const result = kind === 'transfer' ? await BonusAccountService.transfer(input) : await BonusAccountService.payout(input);
        RealtimeSyncGateway.broadcast('STORE_UPDATED', {}, { roles: ['ADMIN'] });
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    });
  }

  app.post('/api/bonus-account/operations/:id/cancel', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await BonusAccountService.cancel(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', {}, { roles: ['ADMIN'] });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
