import { create } from 'zustand';
import { stripRoleSuffix } from '../utils/formatUser';
import { User } from '../types';

interface AuthState {
  currentUser: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

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

// No default-admin fallback: an unauthenticated visitor must see the login screen,
// never a live session. Only a real, previously-issued, non-expired token restores one.
// Session names are shown without role suffixes; a name that is only a suffix stays as it was.
const withCleanName = <T extends { name?: string }>(user: T): T =>
  user.name ? { ...user, name: stripRoleSuffix(user.name) || user.name } : user;

const getInitialSession = (): { user: User | null; token: string | null } => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { user: null, token: null };
  }
  try {
    const savedUser = localStorage.getItem('ms_user');
    const savedToken = localStorage.getItem('ms_jwt_token');
    if (savedUser && savedToken) {
      const exp = decodeJwtExpiry(savedToken);
      if (exp !== null && exp * 1000 <= Date.now()) {
        localStorage.removeItem('ms_jwt_token');
        localStorage.removeItem('ms_user');
        return { user: null, token: null };
      }
      const parsedUser = JSON.parse(savedUser);
      return { user: parsedUser ? withCleanName(parsedUser) : parsedUser, token: savedToken };
    }
  } catch (e) {
    console.error(e);
  }
  return { user: null, token: null };
};

const initialSession = getInitialSession();

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: initialSession.user,
  token: initialSession.token,
  isAuthenticated: !!initialSession.user && !!initialSession.token,

  setAuth: (user: User, token: string) => {
    const cleanUser = user ? withCleanName(user) : user;
    localStorage.setItem('ms_jwt_token', token);
    localStorage.setItem('ms_user', JSON.stringify(cleanUser));
    scheduleAutoLogout(token);
    set({ currentUser: cleanUser, token, isAuthenticated: true });
  },

  logout: () => {
    clearAutoLogoutTimer();
    localStorage.removeItem('ms_jwt_token');
    localStorage.removeItem('ms_user');
    set({ currentUser: null, token: null, isAuthenticated: false });
  },
}));

if (initialSession.token) {
  scheduleAutoLogout(initialSession.token);
}
