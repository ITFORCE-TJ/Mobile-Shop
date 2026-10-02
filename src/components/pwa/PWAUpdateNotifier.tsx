import React, { useState } from 'react';
import { RefreshCw, Wifi, WifiOff, X, ArrowUpCircle } from 'lucide-react';
import { usePWAUpdate } from '../../hooks/usePWAUpdate';

export const PWAUpdateNotifier: React.FC = () => {
  const {
    hasUpdate,
    latestCommit,
    currentCommit,
    isUpdating,
    offline,
    showNetworkNotice,
    applyUpdate,
    dismissNetworkNotice,
  } = usePWAUpdate();

  const [dismissedUpdate, setDismissedUpdate] = useState(false);

  return (
    <>
      {/* Service Worker / App Update Toast */}
      {hasUpdate && !dismissedUpdate && (
        <div
          data-pwa-ignore="true"
          className="fixed top-[calc(3.5rem+var(--sa-top))] sm:top-[calc(4rem+var(--sa-top))] left-[calc(0.75rem+var(--sa-left))] right-[calc(0.75rem+var(--sa-right))] z-50 max-w-md mx-auto bg-surface border border-sky-500/50 p-3 rounded-xl shadow-2xl backdrop-blur-xl text-fg-muted font-mono flex items-center justify-between space-x-3 animate-in slide-in-from-top-4 duration-300"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            {isUpdating ? (
              <RefreshCw className="w-5 h-5 text-sky-400 animate-spin shrink-0" />
            ) : (
              <ArrowUpCircle className="w-5 h-5 text-sky-400 shrink-0 animate-pulse" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg-muted truncate">
                Доступна новая версия PWA
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                Нажмите для применения обновления
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={() => applyUpdate()}
              disabled={isUpdating}
              className="py-1.5 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 text-xs font-bold uppercase transition-all disabled:opacity-60 flex items-center gap-1 cursor-pointer"
            >
              {isUpdating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isUpdating ? 'ОБНОВЛЕНИЕ…' : 'ОБНОВИТЬ'}</span>
            </button>
            <button
              onClick={() => setDismissedUpdate(true)}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-300 cursor-pointer"
              title="Скрыть уведомление"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Network Offline / Online Toast */}
      {showNetworkNotice && (
        <div
          data-pwa-ignore="true"
          className={`fixed top-3 left-3 right-3 z-50 max-w-md mx-auto p-2.5 rounded-xl border font-mono text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in duration-200 ${
            offline
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {offline ? <WifiOff className="w-4 h-4 text-rose-400" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
            <span>{offline ? 'АВТОНОМНЫЙ РЕЖИМ (НЕТ ИНТЕРНЕТА)' : 'СВЯЗЬ ВОССТАНОВЛЕНА (ОНЛАЙН)'}</span>
          </div>
          <button onClick={dismissNetworkNotice} className="text-slate-400 hover:text-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
