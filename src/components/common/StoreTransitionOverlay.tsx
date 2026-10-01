import React, { useEffect, useState, useRef } from 'react';
import { useUIStore } from '../../stores/useUIStore';
import {
  Store as StoreIcon,
  Landmark,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

export const StoreTransitionOverlay: React.FC = () => {
  const { storeTransition, clearStoreTransition } = useUIStore();
  const [isExiting, setIsExiting] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (storeTransition?.active) {
      setIsExiting(false);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);

      const totalDuration = storeTransition.durationMs || 520;
      const exitDelay = Math.max(150, totalDuration - 170);

      // Start exit animation slightly before full duration
      timeoutRef.current = setTimeout(() => {
        setIsExiting(true);
      }, exitDelay);

      // Fully clear transition state after exit animation finishes
      exitTimeoutRef.current = setTimeout(() => {
        clearStoreTransition();
        setIsExiting(false);
      }, totalDuration);
    } else {
      setIsExiting(false);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, [storeTransition, clearStoreTransition]);

  // Handle escape key to quickly dismiss if desired
  useEffect(() => {
    if (!storeTransition?.active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearStoreTransition();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [storeTransition, clearStoreTransition]);

  if (!storeTransition?.active) return null;

  const isCentral = !!storeTransition.isCentral;
  const storeName = storeTransition.storeName;

  return (
    <aside
      aria-label="Смена рабочего режима магазина"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none pointer-events-auto overflow-hidden"
    >
      {/* Backdrop with silky blur and fade */}
      <div
        onClick={clearStoreTransition}
        className={`absolute inset-0 bg-black/65 dark:bg-black/80 backdrop-blur-md transition-opacity duration-200 ${
          isExiting ? 'animate-store-overlay-out' : 'animate-store-overlay-in'
        }`}
      />

      {/* Ambient background glow orb */}
      <div
        className={`absolute w-80 h-80 rounded-full blur-3xl pointer-events-none transition-transform duration-300 ${
          isCentral ? 'bg-accent/25' : 'bg-warning/20'
        } ${isExiting ? 'scale-75 opacity-0' : 'scale-100 opacity-100'}`}
      />

      {/* Main Animated Modal Card */}
      <div
        className={`relative z-10 w-full max-w-sm rounded-3xl bg-surface/95 dark:bg-surface/90 border border-border/80 p-6 sm:p-7 text-center shadow-2xl flex flex-col items-center gap-4.5 backdrop-blur-xl ${
          isExiting ? 'animate-store-card-out' : 'animate-store-card-in'
        }`}
      >
        {/* Top Mode Badge */}
        <div className="flex items-center gap-1.5">
          {isCentral ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-accent/15 text-accent border border-accent/30 shadow-2xs">
              <Landmark className="w-3.5 h-3.5" />
              <span>Главный офис · Центр. касса</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-warning/15 text-warning border border-warning/30 shadow-2xs">
              <StoreIcon className="w-3.5 h-3.5" />
              <span>Розничная точка · POS</span>
            </span>
          )}
        </div>

        {/* Pulsing Glowing Icon Container */}
        <div className="relative my-1">
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center relative shadow-lg transition-transform ${
              isCentral
                ? 'bg-gradient-to-br from-accent/25 via-accent/10 to-transparent text-accent border border-accent/40 animate-store-pulse-glow'
                : 'bg-gradient-to-br from-warning/25 via-warning/10 to-transparent text-warning border border-warning/40 animate-store-pulse-glow'
            }`}
          >
            {isCentral ? (
              <Landmark className="w-10 h-10 transition-transform transform-gpu" />
            ) : (
              <StoreIcon className="w-10 h-10 transition-transform transform-gpu" />
            )}

            {/* Sparkle micro badge on corner */}
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center shadow-xs">
              <Sparkles className={`w-3.5 h-3.5 ${isCentral ? 'text-accent' : 'text-warning'} animate-pulse`} />
            </div>
          </div>
        </div>

        {/* Store Title & Context */}
        <div className="space-y-1.5 max-w-full">
          <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">
            {isCentral ? 'Переход в режим:' : 'Активация кассы:'}
          </span>
          <h2 className="text-xl font-extrabold text-fg tracking-tight leading-tight line-clamp-2 px-1">
            {storeName}
          </h2>
          <p className="text-xs text-fg-subtle leading-snug">
            {isCentral
              ? 'Сводный финансовый учёт, касса и отчётность'
              : 'Подключение каталога товаров, цен и терминала продаж'}
          </p>
        </div>

        {/* Micro-Progress Bar & Step Label */}
        <div className="w-full space-y-2 pt-1">
          <div className="w-full h-1.5 bg-surface-raised rounded-full overflow-hidden border border-border/50">
            <div
              className={`h-full rounded-full animate-store-progress ${
                isCentral
                  ? 'bg-gradient-to-r from-accent via-emerald-400 to-accent'
                  : 'bg-gradient-to-r from-warning via-amber-300 to-warning'
              }`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-fg-subtle font-medium px-0.5">
            <span className="flex items-center gap-1.5">
              {isExiting ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="text-fg font-semibold">Готово</span>
                </>
              ) : (
                <>
                  <span className={`w-2 h-2 rounded-full ${isCentral ? 'bg-accent' : 'bg-warning'} animate-ping shrink-0`} />
                  <span>{isCentral ? 'Подключение офиса...' : 'Загрузка магазина...'}</span>
                </>
              )}
            </span>
            <span className="font-mono text-fg-muted font-bold">
              {isExiting ? '100%' : 'Загрузка'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
