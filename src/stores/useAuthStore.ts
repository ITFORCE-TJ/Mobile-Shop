import { create } from 'zustand';
import { stripRoleSuffix } from '../utils/formatUser';
import { User } from '../types';
import { isStoredActivityExpired, LAST_ACTIVITY_KEY } from '../services/inactivityLock';

interface AuthState {
  currentUser: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** Locked after inactivity: no credential, but the signed-in user's screens stay mounted. */
  locked: boolean;
  setAuth: (user: User, token: string) => void;
  /** Drops the credential and locks; returns the dropped token so its server session can be revoked. */
  lock: () => string | null;
  logout: () => void;
}

const TOKEN_KEY = 'ms_jwt_token';
const USER_KEY = 'ms_user';

// Decodes the `exp` claim straight from the JWT payload (no signature check —
// this only drives client-side UX timing; the server is the actual authority).
function decodeJwtExpiry(token: string): number | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

let autoLogoutTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoLogoutTimer() {
  if (autoLogoutTimer !== null) {
    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = null;
  }
}

// Proactively logs the user out the moment their token expires, instead of
// waiting for the next API call to come back with 401 (see src/api/client.ts).
function scheduleAutoLogout(token: string) {
  clearAutoLogoutTimer();
  const exp = decodeJwtExpiry(token);
  if (exp === null) return;
  const msUntilExpiry = exp * 1000 - Date.now();
  if (msUntilExpiry <= 0) {
    useAuthStore.getState().logout();
    return;
  }
  autoLogoutTimer = setTimeout(() => {
    useAuthStore.getState().logout();
  }, msUntilExpiry);
}

// Session names are shown without role suffixes; a name that is only a suffix stays as it was.
const withCleanName = <T extends { name?: string }>(user: T): T =>
  user.name ? { ...user, name: stripRoleSuffix(user.name) || user.name } : user;

const session = (): Storage | null => {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
};
const persistent = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

// A token that must not be used but may still be valid on the server: one an earlier version
// kept across launches, or a session abandoned for 10+ minutes. Handed to the app once so it
// can revoke that server session (see revokeAbandonedSession in src/api/client.ts).
let abandonedToken: string | null = null;
export function takeLegacyPersistedToken(): string | null {
  const token = abandonedToken;
  abandonedToken = null;
  return token;
}

/**
 * The session lives in sessionStorage only: it survives a reload (e.g. applying an update) but
 * not a fresh launch of the app, which always starts at the login screen. No default-admin
 * fallback: only a real, non-expired token with recent activity restores a session.
 */
const getInitialSession = (): { user: User | null; token: string | null } => {
  if (typeof window === 'undefined') return { user: null, token: null };
  const local = persistent();
  const store = session();
  try {
    // Earlier versions kept the session across launches: never reuse it.
    const legacy = local?.getItem(TOKEN_KEY) ?? null;
    if (legacy) abandonedToken = legacy;
    local?.removeItem(TOKEN_KEY);
    local?.removeItem(USER_KEY);

    const savedUser = store?.getItem(USER_KEY);
    const savedToken = store?.getItem(TOKEN_KEY);
    if (!savedUser || !savedToken) return { user: null, token: null };
    const exp = decodeJwtExpiry(savedToken);
    const expired = exp !== null && exp * 1000 <= Date.now();
    // A page restored after 10+ minutes in the background (the OS discarded and reloaded it)
    // must not skip the inactivity lock.
    if (expired || isStoredActivityExpired(store, Date.now())) {
      if (!expired) abandonedToken = savedToken;
      store?.removeItem(TOKEN_KEY);
      store?.removeItem(USER_KEY);
      return { user: null, token: null };
    }
    const parsedUser = JSON.parse(savedUser);
    return { user: parsedUser ? withCleanName(parsedUser) : parsedUser, token: savedToken };
  } catch (e) {
    console.error(e);
  }
  return { user: null, token: null };
};

const initialSession = getInitialSession();

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: initialSession.user,
  token: initialSession.token,
  isAuthenticated: !!initialSession.user && !!initialSession.token,
  locked: false,

  setAuth: (user: User, token: string) => {
    const cleanUser = user ? withCleanName(user) : user;
    const store = session();
    store?.setItem(TOKEN_KEY, token);
    store?.setItem(USER_KEY, JSON.stringify(cleanUser));
    // A fresh sign-in is activity: a reload right after it must not count as abandoned.
    try { store?.setItem(LAST_ACTIVITY_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    scheduleAutoLogout(token);
    set({ currentUser: cleanUser, token, isAuthenticated: true, locked: false });
  },

  lock: () => {
    const { token } = get();
    clearAutoLogoutTimer();
    const store = session();
    store?.removeItem(TOKEN_KEY);
    store?.removeItem(USER_KEY);
    set({ token: null, isAuthenticated: false, locked: true });
    return token;
  },

  logout: () => {
    clearAutoLogoutTimer();
    const store = session();
    store?.removeItem(TOKEN_KEY);
    store?.removeItem(USER_KEY);
    set({ currentUser: null, token: null, isAuthenticated: false, locked: false });
  },
}));

if (initialSession.token) {
  scheduleAutoLogout(initialSession.token);
}
