import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_ACTIVITY_KEY } from '../services/inactivityLock';

const user = { id: 'u1', name: 'Далер', login: 'admin', role: 'ADMIN' } as const;
// A JWT whose payload only matters for `exp` (client-side timing; the server verifies tokens).
const jwt = (expSeconds: number) => `x.${btoa(JSON.stringify({ exp: expSeconds })).replace(/=+$/, '')}.y`;
const future = () => jwt(Math.floor(Date.now() / 1000) + 3600);

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  };
}

/** Loads the store as a fresh page load would, with the given storage contents. */
async function load(session: Record<string, string> = {}, local: Record<string, string> = {}) {
  const sessionStorage = memoryStorage(session);
  const localStorage = memoryStorage(local);
  vi.stubGlobal('window', {});
  vi.stubGlobal('sessionStorage', sessionStorage);
  vi.stubGlobal('localStorage', localStorage);
  vi.resetModules();
  const mod = await import('./useAuthStore');
  return { ...mod, sessionStorage, localStorage };
}

describe('auth session storage and lock', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps the session only for this browser session: a fresh launch requires login', async () => {
    const a = await load();
    a.useAuthStore.getState().setAuth(user as any, future());
    expect(a.sessionStorage.data.get('ms_jwt_token')).toBeTruthy();
    expect(a.localStorage.data.has('ms_jwt_token')).toBe(false);
    expect(a.localStorage.data.has('ms_user')).toBe(false);

    // Fresh launch: the OS/browser starts with an empty session storage.
    const b = await load({}, Object.fromEntries(a.localStorage.data));
    expect(b.useAuthStore.getState().currentUser).toBeNull();
    expect(b.useAuthStore.getState().token).toBeNull();
  });

  it('removes a token an earlier version persisted across launches and hands it over for revocation', async () => {
    const legacy = future();
    const a = await load({}, { ms_jwt_token: legacy, ms_user: JSON.stringify(user) });
    expect(a.useAuthStore.getState().token).toBeNull();
    expect(a.localStorage.data.has('ms_jwt_token')).toBe(false);
    expect(a.localStorage.data.has('ms_user')).toBe(false);
    expect(a.takeLegacyPersistedToken()).toBe(legacy);
    expect(a.takeLegacyPersistedToken()).toBeNull();
  });

  it('restores the session after a reload in the same session with recent activity', async () => {
    const token = future();
    const a = await load({ ms_jwt_token: token, ms_user: JSON.stringify(user), [LAST_ACTIVITY_KEY]: String(Date.now() - 60_000) });
    expect(a.useAuthStore.getState().token).toBe(token);
    expect(a.useAuthStore.getState().currentUser?.id).toBe('u1');
  });

  it('does not restore a session whose last activity is 10 minutes old (page reloaded after a long background)', async () => {
    const a = await load({ ms_jwt_token: future(), ms_user: JSON.stringify(user), [LAST_ACTIVITY_KEY]: String(Date.now() - 600_000) });
    expect(a.useAuthStore.getState().token).toBeNull();
    expect(a.useAuthStore.getState().currentUser).toBeNull();
    expect(a.sessionStorage.data.has('ms_jwt_token')).toBe(false);
    // The abandoned token is handed over so the server session can be revoked.
    expect(a.takeLegacyPersistedToken()).toBeTruthy();
  });

  it('lock() drops the credential everywhere but keeps who was signed in, so the work stays on screen', async () => {
    const a = await load();
    const token = future();
    a.useAuthStore.getState().setAuth(user as any, token);
    const dropped = a.useAuthStore.getState().lock();
    const s = a.useAuthStore.getState();
    expect(dropped).toBe(token);
    expect(s.locked).toBe(true);
    expect(s.token).toBeNull();
    expect(s.isAuthenticated).toBe(false);
    expect(s.currentUser?.id).toBe('u1');
    expect(a.sessionStorage.data.has('ms_jwt_token')).toBe(false);
  });

  it('a reload while locked never bypasses the lock', async () => {
    const a = await load();
    a.useAuthStore.getState().setAuth(user as any, future());
    a.useAuthStore.getState().lock();
    const b = await load(Object.fromEntries(a.sessionStorage.data));
    expect(b.useAuthStore.getState().token).toBeNull();
    expect(b.useAuthStore.getState().currentUser).toBeNull();
  });

  it('setAuth after a lock unlocks with the new token', async () => {
    const a = await load();
    a.useAuthStore.getState().setAuth(user as any, future());
    a.useAuthStore.getState().lock();
    const fresh = future();
    a.useAuthStore.getState().setAuth(user as any, fresh);
    expect(a.useAuthStore.getState().locked).toBe(false);
    expect(a.useAuthStore.getState().token).toBe(fresh);
  });

  it('logout() clears the lock too', async () => {
    const a = await load();
    a.useAuthStore.getState().setAuth(user as any, future());
    a.useAuthStore.getState().lock();
    a.useAuthStore.getState().logout();
    expect(a.useAuthStore.getState().locked).toBe(false);
    expect(a.useAuthStore.getState().currentUser).toBeNull();
  });
});
