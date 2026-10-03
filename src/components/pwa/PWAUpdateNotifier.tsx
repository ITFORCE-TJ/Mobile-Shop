import React from 'react';
import { Wifi, WifiOff, X } from 'lucide-react';
import { usePWAUpdate } from '../../hooks/usePWAUpdate';

export const PWAUpdateNotifier: React.FC = () => {
  const {
    offline,
    showNetworkNotice,
    dismissNetworkNotice,
  } = usePWAUpdate();

  return (
    <>
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
