import { type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { resolveActor } from '../../common/actor';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { D } from '../../common/decimal';
import { requireNonNegativeMoney } from '../../common/money';

function validateCompensation(input: { baseSalaryTjs?: MoneyInput; salesCommissionPercent?: number }) {
  if (input.baseSalaryTjs !== undefined) input.baseSalaryTjs = requireNonNegativeMoney(input.baseSalaryTjs, 'Оклад');
  if (input.salesCommissionPercent !== undefined) {
    const value = D(input.salesCommissionPercent);
    if (value.lt(0) || value.gt(100)) throw new Error('Комиссия должна быть от 0 до 100%');
  }
}

const MIN_PASSWORD_LENGTH = 6;

function requireValidPassword(password: string): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов`);
  }
  return password;
}

const SAFE_SELECT = {
  id: true,
  login: true,
  name: true,
  role: true,
  active: true,
  storeId: true,
  store: { select: { id: true, name: true } },
  baseSalaryTjs: true,
  salesCommissionPercent: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PUBLIC_SELECT = {
  id: true,
  login: true,
  name: true,
  role: true,
  active: true,
  storeId: true,
  store: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

export class UsersService {
  public static async list(includeFinancialFields: boolean = false) {
    if (includeFinancialFields) {
      return prisma.user.findMany({ select: SAFE_SELECT, orderBy: { createdAt: 'asc' } });
    }
    return prisma.user.findMany({ select: PUBLIC_SELECT, orderBy: { createdAt: 'asc' } });
  }

  public static async create(input: {
    login: string;
    password: string;
    name: string;
    role: 'ADMIN' | 'PARTNER' | 'SELLER';
    storeId?: string;
    baseSalaryTjs?: MoneyInput;
    salesCommissionPercent?: number;
    createdByUserId: string;
  }) {
    validateCompensation(input);
    if (typeof input.name !== 'string' || !input.name.trim() || typeof input.login !== 'string' || !input.login.trim()) throw new Error('Укажите имя и логин');
    input.name = input.name.trim(); input.login = input.login.trim();
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const existing = await tx.user.findUnique({ where: { login: input.login } });
      if (existing) throw new Error('Пользователь с таким логином уже существует');

      if ((input.role === 'SELLER' || input.role === 'PARTNER') && (!input.storeId || !input.storeId.trim())) {
        throw new Error(input.role === 'PARTNER' ? 'Для роли Партнер обязательна привязка к магазину' : 'Для роли Продавец обязательна привязка к магазину');
      }

      const hashed = await AuthService.hashPassword(requireValidPassword(input.password));
      const user = await tx.user.create({
        data: {
          login: input.login,
          password: hashed,
          name: input.name,
          role: input.role,
          storeId: input.storeId,
          baseSalaryTjs: input.baseSalaryTjs,
          salesCommissionPercent: input.salesCommissionPercent,
        },
        select: SAFE_SELECT,
      });

      if (input.role === 'PARTNER') {
        const existingOwner = await tx.owner.findFirst({ where: { userId: user.id } });
        if (!existingOwner) {
          await tx.owner.create({
            data: {
              name: user.name,
              userId: user.id,
              storeId: user.storeId || null,
              profitSharePercent: 40,
              capitalBalanceUsd: 0,
              totalAccruedProfitUsd: 0,
              availableProfitUsd: 0,
            } as any,
          });
        }
      }

      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_CREATE', details: `Создан сотрудник: ${user.name} (${user.role})`, targetId: user.id },
      });
      return user;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async update(
    userId: string,
    input: {
      login?: string;
      password?: string;
      name?: string;
      role?: 'ADMIN' | 'PARTNER' | 'SELLER';
      storeId?: string | null;
      baseSalaryTjs?: MoneyInput;
      salesCommissionPercent?: number;
    },
    updatedByUserId: string,
  ) {
    validateCompensation(input);
    const updatedUser = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, updatedByUserId);
      const targetUser = await tx.user.findUnique({ where: { id: userId } });
      if (!targetUser) throw new Error('Пользователь не найден');

      const data: any = {};
      if (input.login && input.login.trim()) {
        const newLogin = input.login.trim();
        const existing = await tx.user.findUnique({ where: { login: newLogin } });
        if (existing && existing.id !== userId) {
          throw new Error('Пользователь с таким логином уже существует');
        }
        data.login = newLogin;
      }
      if (input.name && input.name.trim()) data.name = input.name.trim();
      if (input.role) data.role = input.role;
      if (input.storeId !== undefined) data.storeId = input.storeId;
      if (input.baseSalaryTjs !== undefined) data.baseSalaryTjs = input.baseSalaryTjs;
      if (input.salesCommissionPercent !== undefined) data.salesCommissionPercent = input.salesCommissionPercent;

      const effectiveRole = data.role || targetUser.role;
      const effectiveStoreId = data.storeId !== undefined ? data.storeId : targetUser.storeId;
      if ((effectiveRole === 'SELLER' || effectiveRole === 'PARTNER') && (!effectiveStoreId || !String(effectiveStoreId).trim())) {
        throw new Error(effectiveRole === 'PARTNER' ? 'Для роли Партнер обязательна привязка к магазину' : 'Для роли Продавец обязательна привязка к магазину');
      }

      if (input.password && input.password.trim().length > 0) {
        data.password = await AuthService.hashPassword(requireValidPassword(input.password.trim()));
      }

      const user = await tx.user.update({ where: { id: userId }, data, select: SAFE_SELECT });
      if (data.password || data.role || input.storeId !== undefined) {
        await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }

      // Keep a linked Owner's display name and storeId in sync — it must never drift from the
      // actual account it represents (a partner is a real person, not a free-text label).
      if (data.name || input.storeId !== undefined) {
        await tx.owner.updateMany({
          where: { userId },
          data: {
            ...(data.name ? { name: data.name } : {}),
            ...(input.storeId !== undefined ? { storeId: input.storeId } : {}),
          },
        });
      }

      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_UPDATE', details: `Обновлены данные сотрудника: ${user.name} (${user.role})${input.password ? ' (пароль изменен)' : ''}`, targetId: user.id },
      });
      return user;
    }, { maxWait: 10000, timeout: 25000 });
    if (input.password?.trim() || input.role || input.storeId !== undefined) RealtimeSyncGateway.disconnectUser(userId);
    return updatedUser;
  }

  public static async setActive(userId: string, active: boolean, actingUserId: string) {
    const user = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const user = await tx.user.update({ where: { id: userId }, data: { active }, select: SAFE_SELECT });
      if (!active) await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'USER_STATUS_CHANGE',
          details: `Сотрудник ${user.name} ${active ? 'активирован' : 'деактивирован'}`,
          targetId: userId,
        },
      });
      return user;
    }, { maxWait: 10000, timeout: 25000 });
    if (!active) RealtimeSyncGateway.disconnectUser(userId);
    return user;
  }

  public static async remove(userId: string, actingUserId: string) {
    if (userId === actingUserId) {
      throw new Error('Нельзя удалить собственный профиль во время активной сессии');
    }
    await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new Error('Сотрудник не найден');
      await tx.user.delete({ where: { id: userId } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_DELETE', details: `Удален сотрудник: ${target.name} (${target.role})` },
      });
    }, { maxWait: 10000, timeout: 25000 });
    RealtimeSyncGateway.disconnectUser(userId);
  }
}
