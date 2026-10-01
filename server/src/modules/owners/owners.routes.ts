import { D } from '../../common/decimal';
import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { OwnersService } from './owners.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerOwnerRoutes(app: Express) {
  app.get('/api/owners', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (_req, res, next) => {
    try {
      const count = await prisma.owner.count();
      if (count === 0) {
        await OwnersService.initializeDefaultOwners();
      }
      res.json(await OwnersService.listWithResolvedNames());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/link-user', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const owner = await OwnersService.linkUser(req.params.id, req.body?.userId || null, req.user!.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/init', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const owners = await OwnersService.initializeDefaultOwners(req.user?.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', {});
      res.json(owners);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/owner-transactions', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      // Owner-level capital moves (investment/withdrawal/payout/reinvest) are nowhere near
      // per-sale volume, so a generous opt-in cap is enough — existing callers that don't
      // pass it keep today's full-history behavior.
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 0, 1), 5000) : undefined;
      res.json(await prisma.ownerTransaction.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), ...(limit ? { take: limit } : {}) }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/investment', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, destination, note } = req.body ?? {};
      const owner = await OwnersService.investment(req.params.id, amountUsd, destination ?? 'Главный счет', note, req.user!.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/withdrawal', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, source, note } = req.body ?? {};
      const owner = await OwnersService.withdrawal(req.params.id, amountUsd, source ?? 'Главный счет', note, req.user!.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/payout', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, source, note } = req.body ?? {};
      const owner = await OwnersService.payout(req.params.id, amountUsd, source ?? 'Главный счет', note, req.user!.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/reinvest', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, destination, note } = req.body ?? {};
      const owner = await OwnersService.reinvest(req.params.id, amountUsd, note, req.user!.userId, destination);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/profit-shares', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { shares, rebalanceBalances } = req.body ?? {};
      if (!Array.isArray(shares) || D(shares.length).eq(0)) {
        res.status(400).json({ message: 'shares обязателен и должен быть непустым массивом' });
        return;
      }
      const owners = await OwnersService.updateProfitShares(shares, req.user!.userId, Boolean(rebalanceBalances));
      RealtimeSyncGateway.broadcast('OWNER_TX', {});
      res.json(owners);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/quarter-close', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { quarterName, transferRemainingToCapital } = req.body ?? {};
      if (!quarterName) {
        res.status(400).json({ message: 'quarterName обязателен' });
        return;
      }
      const owners = await OwnersService.closeQuarter(quarterName, Boolean(transferRemainingToCapital), req.user!.userId);
      res.json(owners);
    } catch (error) {
      next(error);
    }
  });
}

