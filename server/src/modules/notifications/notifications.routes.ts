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
      const user = req.user!;
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
      RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', notification);
      res.json(notification);
    } catch (error) {
      next(error);
    }
  });
}
