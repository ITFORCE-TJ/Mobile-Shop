import { useEffect } from 'react';
import { hasActiveMutations } from '../api/client';
import { useUIStore } from '../stores/useUIStore';

// Each registration is counted separately: two screens with the same kind of unfinished work
// keep updates blocked until both are done.
const activeBusyOperations = new Map<number, string>();
let nextBusyId = 0;

/**
 * Register a critical in-progress operation (e.g. barcode scan batch, file export, payment checkout)
 * that must not be interrupted by an automated reload.
 * Returns a disposal function to unregister when the operation completes.
 */
export function registerBusyOperation(operationName: string): () => void {
  const id = ++nextBusyId;
  activeBusyOperations.set(id, operationName);
  return () => {
    activeBusyOperations.delete(id);
  };
}

/**
 * Keeps automatic updates (which reload the page) away while a screen holds unfinished work
 * that lives only in memory — a non-empty sales cart, a receipt being scanned, an open form.
 */
export function useUnfinishedWork(active: boolean, label: string) {
  useEffect(() => (active ? registerBusyOperation(label) : undefined), [active, label]);
}

export function hasBusyOperations(): boolean {
  return activeBusyOperations.size > 0;
}

export const isBusyOperationActive = hasBusyOperations;

export interface UpdateSafetyAssessment {
  safe: boolean;
  reason?: string;
}

/**
 * Assess whether the application is currently in an idle/safe state to apply an update
 * without data loss or user disruption.
 */
export function getUpdateSafetyAssessment(): UpdateSafetyAssessment {
  if (typeof document === 'undefined') {
    return { safe: false, reason: 'SSR environment' };
  }

  // 0. If user is on the login screen or session is not authenticated, it is always safe to update
  if (typeof window !== 'undefined') {
    const isLogin = window.location?.pathname === '/login' ||
                    Boolean(window.location?.hash?.includes('login')) ||
                    (typeof document !== 'undefined' && Boolean(document.querySelector?.('[data-login-page="true"]')));
    if (isLogin) {
      return { safe: true };
    }
  }

  // 1. Check in-flight network mutations (financial transactions, receipts, sales)
  if (hasActiveMutations()) {
    return { safe: false, reason: 'Выполняется финансовая операция или отправка данных' };
  }

  // 2. Check manually registered critical operations
  if (activeBusyOperations.size > 0) {
    const ops = Array.from(new Set(activeBusyOperations.values())).join(', ');
    return { safe: false, reason: `Выполняется операция: ${ops}` };
  }

  // 3. Check UI modal state in Zustand store
  const ui = useUIStore.getState();
  if (ui.isScannerOpen) {
    return { safe: false, reason: 'Открыт сканер штрихкодов' };
  }
  if (ui.isStoreSwitchModalOpen) {
    return { safe: false, reason: 'Открыто окно смены магазина' };
  }
  if (ui.isDailyRateModalOpen) {
    return { safe: false, reason: 'Открыто окно установки курса валют' };
  }
  if (ui.storeTransition?.active) {
    return { safe: false, reason: 'Выполняется переключение магазина' };
  }

  // 4. Check active user editing / typing
  const activeEl = document.activeElement;
  // Typing on the lock screen or the update toast itself is not work an update would destroy.
  if (activeEl && !activeEl.closest?.('[data-pwa-ignore="true"]')) {
    const tagName = activeEl.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || (activeEl as HTMLElement).isContentEditable) {
      // If user is focused on an input/textarea, do not interrupt typing
      return { safe: false, reason: 'Пользователь вводит данные в форму' };
    }
  }

  // 5. Check DOM for open dialogs, modals, or drawers
  // Elements with [data-pwa-ignore="true"] (e.g. update toast itself) do not block updates
  const openModal = document.querySelector(
    '[role="dialog"]:not([data-pwa-ignore="true"]), [aria-modal="true"]:not([data-pwa-ignore="true"])'
  );
  if (openModal) {
    return { safe: false, reason: 'Открыто модальное окно' };
  }

  // 6. Check dirty forms with unsubmitted text/data
  const forms = document.querySelectorAll('form:not([data-pwa-ignore="true"])');
  for (const form of forms) {
    const textInputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input[type="number"], input[type="search"], textarea'
    );
    for (const input of textInputs) {
      if (input.value && input.value.trim().length > 0 && input.defaultValue !== input.value) {
        return { safe: false, reason: 'В форме есть несохранённый введённый текст' };
      }
    }
  }

  return { safe: true };
}

/**
 * Returns true if it is safe to reload/activate a new PWA version without disrupting the user.
 */
export function isSafeToUpdate(): boolean {
  return getUpdateSafetyAssessment().safe;
}
