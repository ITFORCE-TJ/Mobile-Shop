import { Request, Response, NextFunction } from 'express';
import { AuthService, JwtPayload } from './auth.service';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Middleware to verify JWT token from the Authorization header
export async function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация: токен доступа отсутствует' });
  }

  try {
    const payload = await AuthService.authenticateToken(token);
    if (!payload) {
      return res.status(401).json({ message: 'Сессия недействительна или истекла, войдите снова' });
    }
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

export type UserRole = JwtPayload['role'];

/**
 * Roles pinned to one store (users.storeId): SELLER and STORE_MANAGER. Every read/write
 * of theirs is forced to that store server-side — the client's storeId is never trusted.
 * ADMIN and PARTNER oversee the whole network.
 */
export function isStoreScopedRole(role: UserRole | undefined): boolean {
  return role === 'SELLER' || role === 'STORE_MANAGER';
}

// Middleware for Role-Based Access Control (RBAC)
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Требуется авторизация' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Недостаточно прав для этого действия' });
    }

    next();
  };
}

// Store Scope Injector: Ensures store-scoped roles (SELLER, STORE_MANAGER) can only access
// their assigned store_id. ADMIN and PARTNER oversee every store.
export function enforceStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  if (!isStoreScopedRole(req.user.role)) {
    return next();
  }

  if (!req.user.storeId) {
    return res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
  }

  req.query.storeId = req.user.storeId;
  next();
}

// Store Scope Injector for write bodies: Ensures store-scoped roles can only create records
// for their own assigned store, regardless of what storeId the client sent in the body.
// ADMIN and PARTNER may write to any store.
export function enforceBodyStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  if (!isStoreScopedRole(req.user.role)) {
    return next();
  }

  if (!req.user.storeId) {
    return res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
  }

  req.body = { ...req.body, storeId: req.user.storeId };
  next();
}
