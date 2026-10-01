import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

const notificationScope = (user: NonNullable<AuthenticatedRequest['user']>) => ({
  AND: [
    { OR: [{ targetUserId: null }, { targetUserId: user.userId }] },
    { OR: [{ targetRole: null }, { targetRole: user.role }] },
  ],
});

export function registerNotificationRoutes(app: Express) {
  app.get('/api/notifications', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        res.json([]);
        return;
      }
      const user = req.user!;
      // Notification Center history (ADMIN): every notification, filtered and paged by cursor.
      if (req.query.view === 'history' && user.role === 'ADMIN') {
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
        const filters = [
          notificationScope(user),
          ...(req.query.unread === '1' ? [{ read: false }] : []),
          ...(typeof req.query.storeId === 'string' && req.query.storeId ? [{ storeId: req.query.storeId }] : []),
          ...(typeof req.query.actionType === 'string' && req.query.actionType ? [{ actionType: req.query.actionType }] : []),
        ];
        const rows = await prisma.notification.findMany({
          where: { AND: filters },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        res.json({ items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null });
        return;
      }
      // Unbounded before: this ran on every login and every realtime resync, so it only got
      // slower as the business operated longer. Anything still unresolved stays visible no
      // matter its age (a pending transfer approval shouldn't silently vanish), but resolved/
      // read notifications older than a day are dropped, with a hard cap as a final backstop.
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const notifications = await prisma.notification.findMany({
        where: {
          AND: [
            notificationScope(user),
            { OR: [{ resolved: false }, { createdAt: { gte: oneDayAgo } }] },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      res.json(notifications);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/notifications/:id/read', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const scope = notificationScope(req.user!);
      const result = await prisma.notification.updateMany({
        where: { id: req.params.id, ...scope },
        data: { read: true, readAt: new Date() },
      });
      if (result.count !== 1) { res.status(404).json({ message: 'Уведомление не найдено' }); return; }
      const notification = await prisma.notification.findUniqueOrThrow({ where: { id: req.params.id } });
      res.json(notification);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/notifications/read-all', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      await prisma.notification.updateMany({
        where: notificationScope(user),
        data: { read: true, readAt: new Date() },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/notifications/:id/resolve', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const scope = notificationScope(req.user!);
      const result = await prisma.notification.updateMany({
        where: { id: req.params.id, ...scope },
        data: { resolved: true, read: true, resolvedAt: new Date(), readAt: new Date() },
      });
      if (result.count !== 1) { res.status(404).json({ message: 'Уведомление не найдено' }); return; }
      const notification = await prisma.notification.findUniqueOrThrow({ where: { id: req.params.id } });
      RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', { id: notification.id }, notification.targetRole ? { roles: [notification.targetRole] } : {});
      res.json(notification);
    } catch (error) {
      next(error);
    }
  });
}
