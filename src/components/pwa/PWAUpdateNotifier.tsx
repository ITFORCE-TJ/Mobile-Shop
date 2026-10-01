import React, { useState, useEffect } from 'react';
import { RefreshCw, Wifi, WifiOff, X } from 'lucide-react';

export const PWAUpdateNotifier: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [showNetworkNotice, setShowNetworkNotice] = useState(false);

  useEffect(() => {
    // Register Service Worker update check
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setNeedRefresh(true);
              }
            });
          }
        });
      });
    }

    // The new worker activates asynchronously after SKIP_WAITING is posted —
    // reloading immediately (instead of waiting for this event) risks the
    // reload being served by the still-controlling old worker.
    let reloaded = false;
    const handleControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);

    // Online / Offline listeners
    const handleOnline = () => {
      setOffline(false);
      setShowNetworkNotice(true);
      setTimeout(() => setShowNetworkNotice(false), 4000);
    };

    const handleOffline = () => {
      setOffline(true);
      setShowNetworkNotice(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        // Do not reload here — the controllerchange listener above reloads
        // once the new worker actually takes control.
      });
    }
  };

  return (
    <>
      {/* Service Worker Update Toast */}
      {needRefresh && (
        <div className="fixed top-[calc(3.5rem+var(--sa-top))] sm:top-[calc(4rem+var(--sa-top))] left-[calc(0.75rem+var(--sa-left))] right-[calc(0.75rem+var(--sa-right))] z-50 max-w-md mx-auto bg-surface border border-sky-500/50 p-3 rounded-xl shadow-2xl backdrop-blur-xl text-fg-muted font-mono flex items-center justify-between space-x-3 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center space-x-2.5 min-w-0">
            <RefreshCw className="w-5 h-5 text-sky-400 animate-spin shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg-muted truncate">Доступно обновление версии PWA</p>
              <p className="text-[10px] text-slate-400 truncate">Нажмите, чтобы перезагрузить приложение</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handleUpdate}
              className="py-1.5 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold uppercase transition-colors"
            >
              ОБНОВИТЬ
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Network Offline / Online Toast */}
      {showNetworkNotice && (
        <div className={`fixed top-3 left-3 right-3 z-50 max-w-md mx-auto p-2.5 rounded-xl border font-mono text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in duration-200 ${
          offline
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
        }`}>
          <div className="flex items-center space-x-2">
            {offline ? <WifiOff className="w-4 h-4 text-rose-400" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
            <span>{offline ? 'АВТОНОМНЫЙ РЕЖИМ (НЕТ ИНТЕРНЕТА)' : 'СВЯЗЬ ВОССТАНОВЛЕНА (ОНЛАЙН)'}</span>
          </div>
          <button onClick={() => setShowNetworkNotice(false)} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
