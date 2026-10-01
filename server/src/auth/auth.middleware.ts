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

// Middleware for Role-Based Access Control (RBAC)
export function requireRoles(...allowedRoles: Array<'ADMIN' | 'PARTNER' | 'SELLER'>) {
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

// Store Scope Injector: Ensures SELLERs and PARTNERs can only access their assigned storeId.
// Only ADMIN oversees every store across the network.
export function enforceStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  if (req.user.role !== 'SELLER' && req.user.role !== 'PARTNER') {
    return next();
  }

  if (!req.user.storeId) {
    return res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
  }

  req.query.storeId = req.user.storeId;
  next();
}

// Store Scope Injector for write bodies: Ensures SELLERs and PARTNERs can only create records
// for their own assigned store, regardless of what storeId the client sent in the body.
// Only ADMIN may write to any store.
export function enforceBodyStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  if (req.user.role !== 'SELLER' && req.user.role !== 'PARTNER') {
    return next();
  }

  if (!req.user.storeId) {
    return res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
  }

  req.body = { ...req.body, storeId: req.user.storeId };
  next();
}
