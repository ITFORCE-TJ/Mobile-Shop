import { useMemo } from 'react';
import { useAppFields } from '../context/AppContext';

export type StoreContext =
  | { mode: 'STORE'; storeId: string; storeName: string }
  | { mode: 'CENTRAL'; storeId: null; storeName: null };

interface StoreLike { id: string; name: string; isMainWarehouse?: boolean }

/**
 * Strips redundant prefixes/quotes like «Магазин «Сиёма»» or «Магазин "ЦУМ"»
 * to display a clean, beautiful brand name: «Сиёма», «Садбарг», «ЦУМ».
 * Warehouses and headquarters (e.g. «Главный склад», «Центральная касса») are preserved as-is.
 */
export function formatStoreName(rawName?: string | null): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  const cleaned = trimmed
    .replace(/^магазин\s*[«"']?/i, '')
    .replace(/[»"']$/, '')
    .trim();
  return cleaned || trimmed;
}

/**
 * Whose data a page shows. The admin inside a store (picked in the top bar) sees only that
 * store; in Central Cash (no retail store picked) the overview of every store. Store staff are
 * always in their own store. This is a view filter — what a role may see is still enforced by
 * the server.
 */
export function resolveStoreContext(input: { role?: string | null; userStoreId?: string | null; selectedStoreId?: string | null; stores: StoreLike[] }): StoreContext {
  const id = input.role === 'ADMIN' ? input.selectedStoreId : input.userStoreId;
  const store = id ? input.stores.find((s) => s.id === id && !s.isMainWarehouse) : undefined;
  return store ? { mode: 'STORE', storeId: store.id, storeName: store.name } : { mode: 'CENTRAL', storeId: null, storeName: null };
}

export function useStoreContext(): StoreContext {
  const { currentUser, selectedStoreId, stores } = useAppFields('currentUser', 'selectedStoreId', 'stores');
  return useMemo(
    () => resolveStoreContext({ role: currentUser?.role, userStoreId: currentUser?.storeId, selectedStoreId, stores }),
    [currentUser?.role, currentUser?.storeId, selectedStoreId, stores]
  );
}
