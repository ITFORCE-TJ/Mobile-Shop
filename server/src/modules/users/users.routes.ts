import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { UsersService } from './users.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerUserRoutes(app: Express) {
  // Readable by any authenticated role — every page needs to resolve colleague names
  // (sellers on receipts, assignees on tickets, etc.). Financial fields (salary, commission)
  // are only included for ADMIN/PARTNER; SELLERs get name/role/store only. Mutations stay
  // ADMIN-only below.
  app.get('/api/users', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const isPrivileged = req.user!.role === 'ADMIN' || req.user!.role === 'PARTNER';
      res.json(await UsersService.list(isPrivileged));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/users', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { login, password, name, role, storeId, baseSalaryTjs, salesCommissionPercent } = req.body ?? {};
      if (!login || !password || !name || !role) {
        res.status(400).json({ message: 'login, password, name и role обязательны' });
        return;
      }
      if ((role === 'SELLER' || role === 'PARTNER') && (!storeId || !String(storeId).trim())) {
        res.status(400).json({ message: role === 'PARTNER' ? 'Для роли Партнер обязательна привязка к магазину' : 'Для роли Продавец обязательна привязка к магазину' });
        return;
      }
      const user = await UsersService.create({ login, password, name, role, storeId, baseSalaryTjs, salesCommissionPercent, createdByUserId: req.user!.userId });
      RealtimeSyncGateway.broadcast('USER_UPDATED', { userId: user.id });
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/users/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await UsersService.update(req.params.id, req.body ?? {}, req.user!.userId);
      RealtimeSyncGateway.broadcast('USER_UPDATED', { userId: user.id });
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/users/:id/status', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (typeof req.body?.active !== 'boolean') { res.status(400).json({ message: 'active должен быть true или false' }); return; }
      const user = await UsersService.setActive(req.params.id, Boolean(req.body?.active), req.user!.userId);
      RealtimeSyncGateway.broadcast('USER_UPDATED', { userId: user.id });
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/users/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      await UsersService.remove(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('USER_UPDATED', { userId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });
}
