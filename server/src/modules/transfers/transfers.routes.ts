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
      // Store staff (SELLER and PARTNER) request transfers OUT of their own store only; an
      // ADMIN approves those that involve the main warehouse. Phones the admin delivers from the
      // main warehouse are taken in through a store receipt (IMEI scan), not pulled from here.
      if (req.user!.role === 'SELLER' || req.user!.role === 'PARTNER') {
        if (fromStoreId !== req.user!.storeId) {
          res.status(403).json({ message: 'Перемещать можно только товары своего магазина. Телефоны с главного склада принимаются через «Приход товара»' });
          return;
        }
        const transfer = await TransfersService.create({ fromStoreId, toStoreId, deviceIds, requestedByUserId: req.user!.userId });
        res.status(201).json(transfer);
        return;
      }

      // The ADMIN moves stock directly, without a separate approval step.
      const transfer = await TransfersService.createDirect({ fromStoreId, toStoreId, deviceIds, requestedByUserId: req.user!.userId });
      res.status(201).json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transfers/:id/approve', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        const tr = await prisma.transferRequest.findUnique({
          where: { id: req.params.id },
          select: { fromStoreId: true, toStoreId: true, fromStore: { select: { isMainWarehouse: true } }, toStore: { select: { isMainWarehouse: true } } },
        });
        if (!tr || (tr.fromStoreId !== req.user!.storeId && tr.toStoreId !== req.user!.storeId)) {
          res.status(403).json({ message: 'Нет доступа к перемещениям другого магазина' });
          return;
        }
        if (tr.fromStore.isMainWarehouse || tr.toStore.isMainWarehouse) {
          res.status(403).json({ message: 'Перемещения с участием главного склада подтверждает администратор' });
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
        const tr = await prisma.transferRequest.findUnique({
          where: { id: req.params.id },
          select: { fromStoreId: true, toStoreId: true, fromStore: { select: { isMainWarehouse: true } }, toStore: { select: { isMainWarehouse: true } } },
        });
        if (!tr || (tr.fromStoreId !== req.user!.storeId && tr.toStoreId !== req.user!.storeId)) {
          res.status(403).json({ message: 'Нет доступа к перемещениям другого магазина' });
          return;
        }
        if (tr.fromStore.isMainWarehouse || tr.toStore.isMainWarehouse) {
          res.status(403).json({ message: 'Перемещения с участием главного склада подтверждает администратор' });
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
