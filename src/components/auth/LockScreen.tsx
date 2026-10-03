import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, User as UserIcon, AlertCircle, Eye, EyeOff, Loader2, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppFields } from '../../context/AppContext';
import { apiClient, revokeAbandonedSession } from '../../api/client';
import { hasBusyOperations } from '../../utils/pwaUpdateSafety';
import { markLockedDom } from '../../services/sessionLock';
import type { User } from '../../types';

type SignIn = { token: string; user: User };

/**
 * Shown after 10 minutes without activity. Covers the whole app (which stays mounted, hidden
 * and inert underneath, so a cart or unsaved form survives) and asks for login and password.
 * The same user continues where they left off; another user starts a clean session only after
 * confirming that this device's unfinished work will be closed. Nothing is submitted or
 * discarded automatically.
 */
export const LockScreen: React.FC = () => {
  const locked = useAuthStore((s) => s.locked);
  const lockedUser = useAuthStore((s) => s.currentUser);
  const { stores, isScannerOpen, closeScanner } = useAppFields('stores', 'isScannerOpen', 'closeScanner');
  const hostRef = useRef<HTMLDivElement>(null);

  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<SignIn | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Fresh form for every lock; the native camera view sits above the WebView, so close it.
  useEffect(() => {
    if (!locked) return;
    setLoginInput(lockedUser?.login ?? '');
    setPassword('');
    setError(null);
    setSwitchTo(null);
    setConfirmLogout(false);
    if (isScannerOpen) closeScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // Everything else on the page (app, dialogs, toasts — also ones added while locked) is inert.
  useEffect(() => {
    if (!locked) { markLockedDom(false); return; }
    markLockedDom(true);
    const marked = new Set<Element>();
    const seal = () => {
      for (const el of Array.from(document.body.children)) {
        if (el === hostRef.current || marked.has(el) || el.hasAttribute('inert')) continue;
        el.setAttribute('inert', '');
        el.setAttribute('aria-hidden', 'true');
        marked.add(el);
      }
    };
    seal();
    const observer = new MutationObserver(seal);
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      for (const el of marked) { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
    };
  }, [locked]);

  if (!locked || !lockedUser) return null;

  const withStoreName = (user: User): User => ({
    ...user,
    storeName: user.storeName || (user.storeId ? stores.find((s) => s.id === user.storeId)?.name : undefined),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!loginInput.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    setBusy(true);
    try {
      const result = await apiClient<SignIn>('/auth/login', { method: 'POST', body: JSON.stringify({ login: loginInput.trim(), password }) });
      setPassword('');
      if (result.user.id === lockedUser.id) {
        // Same person: continue exactly where they were.
        useAuthStore.getState().setAuth(withStoreName(result.user), result.token);
      } else {
        setSwitchTo(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  const confirmSwitch = () => {
    if (!switchTo) return;
    useAuthStore.getState().setAuth(withStoreName(switchTo.user), switchTo.token);
    // Another user must not see this device's previous screens: start from a clean page.
    window.location.assign('/');
  };
  const cancelSwitch = () => {
    if (switchTo) void revokeAbandonedSession(switchTo.token);
    setSwitchTo(null);
  };
  const logout = () => {
    useAuthStore.getState().logout();
    window.location.assign('/login');
  };

  const unfinished = hasBusyOperations();

  return createPortal(
    <div
      ref={hostRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      data-pwa-ignore="true"
      className="app-safe-area safe-area-pb fixed inset-0 z-[2147483000] bg-bg flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-border text-accent mb-3">
            <Lock className="w-7 h-7" />
          </div>
          <h1 id="lock-title" className="text-lg font-bold text-fg">Сеанс заблокирован</h1>
          <p className="text-sm text-fg-subtle mt-1">
            Войдите, чтобы продолжить{unfinished ? ' — несохранённая работа сохранена на экране' : ''}.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          {switchTo ? (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">
                Вы вошли как <strong className="text-fg">{switchTo.user.name}</strong>. Сеанс пользователя <strong className="text-fg">{lockedUser.name}</strong> на этом устройстве будет закрыт
                {unfinished ? ', его незавершённая работа (корзина, форма) — потеряна' : ''}.
              </p>
              <button type="button" onClick={confirmSwitch} className="w-full min-h-11 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-sm font-semibold">
                Продолжить как {switchTo.user.name}
              </button>
              <button type="button" onClick={cancelSwitch} className="w-full min-h-11 rounded-xl bg-surface-raised border border-border text-fg-muted text-sm font-semibold">
                Отмена
              </button>
            </div>
          ) : confirmLogout ? (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">
                Выйти из системы?{unfinished ? ' Незавершённая работа на этом устройстве будет потеряна.' : ''}
              </p>
              <button type="button" onClick={logout} className="w-full min-h-11 rounded-xl bg-danger text-white text-sm font-semibold">Выйти</button>
              <button type="button" onClick={() => setConfirmLogout(false)} className="w-full min-h-11 rounded-xl bg-surface-raised border border-border text-fg-muted text-sm font-semibold">Отмена</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5" data-pwa-ignore="true">
              <label className="block">
                <span className="block text-xs text-fg-subtle mb-1 font-semibold">Логин</span>
                <span className="relative block">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle"><UserIcon className="w-4 h-4" /></span>
                  <input
                    type="text"
                    autoComplete="username"
                    value={loginInput}
                    onChange={(e) => setLoginInput(e.target.value)}
                    disabled={busy}
                    className="w-full min-h-11 rounded-xl bg-surface-raised border border-border pl-9 pr-3 text-sm text-fg focus:border-accent focus:outline-none disabled:opacity-60"
                  />
                </span>
              </label>
              <label className="block">
                <span className="block text-xs text-fg-subtle mb-1 font-semibold">Пароль</span>
                <span className="relative block">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle"><Lock className="w-4 h-4" /></span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    autoFocus
                    className="w-full min-h-11 rounded-xl bg-surface-raised border border-border pl-9 pr-11 text-sm text-fg focus:border-accent focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-fg-subtle hover:text-fg-muted"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </span>
              </label>

              {error && (
                <div role="alert" className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 p-2.5 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={busy} className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-sm font-semibold disabled:opacity-70">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{busy ? 'Вход…' : 'Войти'}</span>
              </button>
              <button type="button" onClick={() => setConfirmLogout(true)} className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl text-fg-subtle hover:text-fg-muted text-sm">
                <LogOut className="w-4 h-4" />
                <span>Выйти из системы</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
