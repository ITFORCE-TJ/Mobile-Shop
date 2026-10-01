import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { TransfersService } from './transfers.service';

export function registerTransferRoutes(app: Express) {
  app.get('/api/transfers', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      // SELLERs only see transfers touching their own store — cross-store transfer
      // history is not something a store employee should be able to read.
      const userStoreId = req.user!.storeId;
      const isStoreScoped = (req.user!.role === 'SELLER' || req.user!.role === 'PARTNER') && typeof userStoreId === 'string' && userStoreId.length > 0;
      const storeScope = isStoreScoped
        ? { OR: [{ fromStoreId: userStoreId }, { toStoreId: userStoreId }] }
        : undefined;

      // Explicit opt-in cap — existing callers that don't pass it keep today's full-history
      // behavior. Pending approvals still surface via Notifications regardless of this cap.
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 0, 1), 2000) : undefined;

      const transfers = await prisma.transferRequest.findMany({
        where: storeScope,
        // Only the store name is ever read (mapTransfer) — the full row isn't needed.
        include: { items: true, fromStore: { select: { name: true } }, toStore: { select: { name: true } } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        ...(limit ? { take: limit } : {}),
      });
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transfers', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { fromStoreId, toStoreId, deviceIds } = req.body ?? {};
      if (!fromStoreId || !toStoreId || !Array.isArray(deviceIds)) {
        res.status(400).json({ message: 'fromStoreId, toStoreId и deviceIds обязательны' });
        return;
      }
      // SELLERs may request transfers OUT of their own assigned store, or IN from the main
      // warehouse into their own store (e.g. when the admin is away and stock still needs to
      // reach the shop floor) — approval still requires an ADMIN/PARTNER, so this never lets a
      // SELLER move stock on their own authority. Any other combination (another store's stock,
      // or a destination that isn't their own store) stays blocked.
      if (req.user!.role === 'SELLER') {
        const ownStoreId = req.user!.storeId;
        const isOwnStoreOrigin = fromStoreId === ownStoreId;
        const isPullFromMainWarehouse =
          toStoreId === ownStoreId &&
          !!(await prisma.store.findUnique({ where: { id: fromStoreId }, select: { isMainWarehouse: true } }))?.isMainWarehouse;
        if (!isOwnStoreOrigin && !isPullFromMainWarehouse) {
          res.status(403).json({ message: 'Вы можете перемещать товары только из своего магазина или с главного склада в свой магазин' });
          return;
        }
        // A SELLER can only request — an ADMIN/PARTNER still has to approve before stock
        // actually moves.
        const transfer = await TransfersService.create({ fromStoreId, toStoreId, deviceIds, requestedByUserId: req.user!.userId });
        res.status(201).json(transfer);
        return;
      }

      if (req.user!.role === 'PARTNER') {
        const ownStoreId = req.user!.storeId;
        const mainWarehouse = await prisma.store.findFirst({ where: { isMainWarehouse: true }, select: { id: true } });
        const validStoreIds = [ownStoreId, mainWarehouse?.id].filter(Boolean);
        if (!validStoreIds.includes(fromStoreId) || !validStoreIds.includes(toStoreId)) {
          res.status(403).json({ message: 'Вы можете перемещать товары только между своим магазином и главным складом' });
          return;
        }
      }

      // An ADMIN/PARTNER doing the transfer themselves needs no separate approval step —
      // they're already the ones who'd approve it, so it just moves immediately.
      const transfer = await TransfersService.createDirect({ fromStoreId, toStoreId, deviceIds, requestedByUserId: req.user!.userId });
      res.status(201).json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transfers/:id/approve', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        const tr = await prisma.transferRequest.findUnique({ where: { id: req.params.id }, select: { fromStoreId: true, toStoreId: true } });
        if (!tr || (tr.fromStoreId !== req.user!.storeId && tr.toStoreId !== req.user!.storeId)) {
          res.status(403).json({ message: 'Нет доступа к перемещениям другого магазина' });
          return;
        }
      }
      const transfer = await TransfersService.approve(req.params.id, req.user!.userId);
      res.json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transfers/:id/reject', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        const tr = await prisma.transferRequest.findUnique({ where: { id: req.params.id }, select: { fromStoreId: true, toStoreId: true } });
        if (!tr || (tr.fromStoreId !== req.user!.storeId && tr.toStoreId !== req.user!.storeId)) {
          res.status(403).json({ message: 'Нет доступа к перемещениям другого магазина' });
          return;
        }
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Не указана';
      const transfer = await TransfersService.reject(req.params.id, req.user!.userId, reason);
      res.json(transfer);
    } catch (error) {
      next(error);
    }
  });
}
