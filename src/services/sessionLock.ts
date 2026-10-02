import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAuthStore, takeLegacyPersistedToken } from '../stores/useAuthStore';
import { hasActiveMutations, revokeAbandonedSession } from '../api/client';
import { InactivityMonitor } from './inactivityLock';

/** Hides the app synchronously (before the next paint) via CSS while the session is locked. */
export function markLockedDom(locked: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute('data-session-locked', locked);
}

/**
 * Locks the session: the credential is dropped on the device at once (no API request can be
 * made) and its server session is revoked; the signed-in user's screens stay mounted behind
 * the lock screen so a cart or an unsaved form survives until the same user signs in again.
 */
export function lockSession() {
  markLockedDom(true);
  const token = useAuthStore.getState().lock();
  if (token) void revokeAbandonedSession(token);
}

/** Revokes a server session left by an earlier launch (never reused). Call once at startup. */
export function revokeLeftoverSession() {
  const token = takeLegacyPersistedToken();
  if (token) void revokeAbandonedSession(token);
}

function safeSessionStorage(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}

/**
 * Locks the app after 10 minutes without user input while someone is signed in (all roles).
 * The inactive time is recomputed whenever the app returns to the foreground — browser
 * visibility/pageshow/focus, and the native app's resume event.
 */
export function useInactivityLock() {
  const signedIn = useAuthStore((s) => !!s.token && !!s.currentUser && !s.locked);
  useEffect(() => {
    if (!signedIn) return;
    const monitor = new InactivityMonitor({
      windowTarget: window,
      documentTarget: document,
      isVisible: () => document.visibilityState === 'visible',
      // Never cut a request in flight (e.g. a sale being saved); lock right after it.
      canLockNow: () => !hasActiveMutations(),
      storage: safeSessionStorage(),
      onLock: lockSession,
    });
    monitor.start();
    let removeResume: (() => void) | undefined;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      void App.addListener('resume', () => monitor.check()).then((handle) => {
        if (disposed) void handle.remove();
        else removeResume = () => void handle.remove();
      });
    }
    return () => { disposed = true; monitor.stop(); removeResume?.(); };
  }, [signedIn]);
}
