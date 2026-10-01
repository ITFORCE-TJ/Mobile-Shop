import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { Smartphone, Lock, User, AlertCircle, ArrowRight, Eye, EyeOff, ShieldCheck, Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, login } = useAppFields('currentUser', 'login');
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (currentUser) {
    return <Navigate to={currentUser.role === 'ADMIN' ? "/finance" : "/sale"} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    if (!loginInput.trim() || !passwordInput) {
      setError('Пожалуйста, введите логин и пароль');
      return;
    }
    setIsLoading(true);
    try {
      const res = await login(loginInput.trim(), passwordInput);
      if (res.success) {
        const user = useAuthStore.getState().currentUser;
        if (user?.role === 'SELLER' || user?.role === 'PARTNER') {
          useUIStore.getState().triggerStoreTransition({
            storeName: user.storeName || 'Магазин',
            isCentral: false,
          });
          navigate('/sale');
        } else {
          navigate('/finance');
        }
      } else {
        setError(res.message || 'Неверный логин или пароль');
      }
    } catch (err: any) {
      setError('Ошибка соединения при входе в систему');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-safe-area safe-area-pb min-h-dvh bg-bg flex flex-col items-center justify-center p-4 text-fg-muted relative">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-border text-accent mb-3 shadow-xs">
            <Smartphone className="w-7 h-7" />
          </div>
          <div className="flex items-center justify-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
            <h1 className="text-lg font-bold tracking-wider text-fg-muted uppercase">MOBILE SHOP OS</h1>
          </div>
          <p className="text-[11px] text-fg-subtle mt-1 uppercase tracking-widest">
            СИСТЕМА УЧЕТА И КАССОВЫЙ ТЕРМИНАЛ
          </p>
        </div>

        {/* Login form card */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-center pb-3 border-b border-border text-[10px] text-fg-subtle">
            <span className="text-accent font-bold uppercase tracking-wider flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              <span>ЗАЩИЩЕНО</span>
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-fg-subtle mb-1 font-semibold">
                ЛОГИН ПОЛЬЗОВАТЕЛЯ
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={loginInput ?? ''}
                  onChange={(e) => setLoginInput(e.target.value)}
                  placeholder="Введите логин"
                  disabled={isLoading}
                  autoFocus
                  required
                  className="w-full rounded-xl bg-surface-raised border border-border pl-9 pr-3 py-2.5 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-fg-subtle mb-1 font-semibold">
                ПАРОЛЬ ДЛЯ ВХОДА 
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput ?? ''}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  required
                  className="w-full rounded-xl bg-surface-raised border border-border pl-9 pr-9 py-2.5 text-xs text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-fg-subtle hover:text-fg-muted disabled:opacity-60"
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-[11px] text-danger bg-danger/10 border border-danger/30 p-2.5 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex items-center justify-center space-x-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 py-2.5 text-xs font-bold text-accent-fg uppercase tracking-wider transition-all shadow-xs shrink-0 ${
                isLoading ? 'opacity-70 cursor-wait' : ''
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-accent-fg" />
                  <span>ВХОД В СИСТЕМУ...</span>
                </>
              ) : (
                <>
                  <span>ВХОД В СИСТЕМУ</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-fg-subtle mt-4 uppercase tracking-widest">
          MOBILE SHOP OS 2026
        </p>
      </div>
    </div>
  );
};
