import crypto from 'crypto';
import type { Role } from '@prisma/client';
import { prisma } from '../prisma/prisma.service';

export interface JwtPayload {
  userId: string;
  login: string;
  role: Role;
  storeId?: string | null;
  sessionId?: string;
  exp?: number;
}

function loadJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_SECRET environment variable must be set (no insecure default is permitted)');
  }
  return secret;
}

export class AuthService {
  private static JWT_SECRET = loadJwtSecret();

  // Secure Password Hashing using PBKDF2 (Native Node.js crypto module)
  public static async hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const [salt, key] = hash.split(':');
      if (!salt || !key) return resolve(false);
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        resolve(key === derivedKey.toString('hex'));
      });
    });
  }

  // Token lifetime: there is no refresh mechanism (see auth-architecture-review memory)
  // and the token lives in localStorage — if it were ever stolen via XSS or a compromised
  // dependency, this is the entire blast-radius window before it stops working on its own.
  // 12h covers a full shift on a shared store terminal without forcing a mid-shift
  // re-login, while keeping the exposure window tighter than the previous 24h/7-day values.
  // Deactivating a user (see users.routes.ts) still revokes access immediately regardless
  // of this value, since authenticateJwt re-checks `active` from the DB on every request.
  private static readonly TOKEN_LIFETIME_SECONDS = 60 * 60 * 12;

  public static async createSession(payload: JwtPayload, verifiedPasswordHash: string): Promise<string> {
    const expiresAt = new Date(Date.now() + this.TOKEN_LIFETIME_SECONDS * 1000);
    const session = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${payload.userId} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: payload.userId } });
      if (!current?.active || current.password !== verifiedPasswordHash) throw new Error('Учётные данные изменились. Войдите снова.');
      return tx.authSession.create({ data: { userId: payload.userId, expiresAt } });
    });
    return this.generateToken({ ...payload, sessionId: session.id });
  }

  public static async authenticateToken(token: string): Promise<JwtPayload | null> {
    const payload = this.verifyToken(token);
    if (!payload?.sessionId) return null;
    const session = await prisma.authSession.findUnique({ where: { id: payload.sessionId },
      include: { user: { select: { login: true, role: true, storeId: true, active: true } } } });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() ||
        session.userId !== payload.userId || !session.user.active) return null;
    return { userId: session.userId, login: session.user.login, role: session.user.role,
      storeId: session.user.storeId, sessionId: session.id, exp: payload.exp };
  }

  // Create JWT Token
  public static generateToken(payload: JwtPayload): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + AuthService.TOKEN_LIFETIME_SECONDS })).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.JWT_SECRET)
      .update(`${header}.${encodedPayload}`)
      .digest('base64url');

    return `${header}.${encodedPayload}.${signature}`;
  }

  // Verify JWT Token
  public static verifyToken(token: string): JwtPayload | null {
    try {
      if (token.split('.').length !== 3) return null;
      const [header, encodedPayload, signature] = token.split('.');
      if (!header || !encodedPayload || !signature) return null;

      const expectedSignature = crypto
        .createHmac('sha256', this.JWT_SECRET)
        .update(`${header}.${encodedPayload}`)
        .digest('base64url');

      const signatureBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);
      if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return null;
      }

      const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
      if (decodedHeader?.alg !== 'HS256' || decodedHeader?.typ !== 'JWT') return null;
      const payload: JwtPayload & { exp: number } = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
      if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;

      return payload;
    } catch {
      return null;
    }
  }
}
