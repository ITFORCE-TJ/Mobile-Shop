import type { Role, User } from '../types';

/** ADMIN and PARTNER oversee the whole network of stores. */
export function isNetworkRole(role: Role | undefined | null): boolean {
  return role === 'ADMIN' || role === 'PARTNER';
}

/**
 * SELLER and STORE_MANAGER are pinned to their own store (users.storeId) — the server
 * enforces it; the UI mirrors it so they never see a store picker.
 */
export function isStoreScoped(user: Pick<User, 'role'> | null | undefined): boolean {
  return user?.role === 'SELLER' || (user?.role as string) === 'STORE_MANAGER';
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  PARTNER: 'Партнер',
  STORE_MANAGER: 'Управляющий магазином',
  SELLER: 'Продавец',
};
