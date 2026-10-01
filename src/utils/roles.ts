import type { Role, User } from '../types';

/** Only ADMIN oversees the whole network of stores. */
export function isNetworkRole(role: Role | undefined | null): boolean {
  return role === 'ADMIN';
}

/**
 * SELLER and PARTNER are pinned to their own store (users.storeId) — the server
 * enforces it; the UI mirrors it so they never see a store picker or switch stores.
 */
export function isStoreScoped(user: Pick<User, 'role'> | null | undefined): boolean {
  return user?.role === 'SELLER' || user?.role === 'PARTNER' || (user?.role as string) === 'STORE_MANAGER';
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  PARTNER: 'Партнер',
  STORE_MANAGER: 'Управляющий магазином',
  SELLER: 'Продавец',
};
