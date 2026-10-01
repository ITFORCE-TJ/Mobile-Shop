import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, Smartphone, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [showAndroidBanner, setShowAndroidBanner] = useState<boolean>(false);
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);
  const [isSafari, setIsSafari] = useState<boolean>(false);

  useEffect(() => {
    // 1. Detect standalone mode (device-specific)
    const checkStandalone = () => {
      const isStandaloneMatch = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const isStandaloneMode = isStandaloneMatch || isIOSStandalone;
      setIsStandalone(isStandaloneMode);
      return isStandaloneMode;
    };

    const standalone = checkStandalone();
    if (standalone) return; // If already running as PWA, do not show install prompt!

    // 2. Detect iOS device and Safari browser
    const ua = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    const safariBrowser = iosDevice && /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    setIsSafari(safariBrowser);

    // Check dismissal cooldown (3 days)
    const checkDismissed = (key: string) => {
      const dismissedAt = localStorage.getItem(key);
      if (!dismissedAt) return false;
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      return elapsed < 3 * 24 * 60 * 60 * 1000; // 3 days cooldown
    };

    // iOS Flow
    if (iosDevice && !checkDismissed('iosInstallPromptDismissedAt')) {
      const timer = setTimeout(() => {
        setShowIOSGuide(true);
      }, 2500);
      return () => clearTimeout(timer);
    }

    // Android / Chrome beforeinstallprompt Event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      if (!checkDismissed('androidInstallPromptDismissedAt')) {
        setShowAndroidBanner(true);
      }
    };

    const handleAppInstalled = () => {
      setShowAndroidBanner(false);
      setShowIOSGuide(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallAndroid = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowAndroidBanner(false);
      }
    } catch (err) {
      console.error('Error during PWA installation:', err);
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismissAndroid = () => {
    setShowAndroidBanner(false);
    localStorage.setItem('androidInstallPromptDismissedAt', Date.now().toString());
  };

  const handleDismissIOS = () => {
    setShowIOSGuide(false);
    localStorage.setItem('iosInstallPromptDismissedAt', Date.now().toString());
  };

  if (isStandalone) return null;

  return (
    <>
      {/* ANDROID / DESKTOP PWA INSTALL BOTTOM BANNER */}
      {showAndroidBanner && deferredPrompt && (
        <div className="fixed bottom-[calc(5.75rem+var(--bottom-nav-pb))] md:bottom-[calc(1rem+var(--sa-bottom))] left-[calc(0.75rem+var(--sa-left))] right-[calc(0.75rem+var(--sa-right))] z-50 max-w-md mx-auto bg-surface border border-emerald-500/40 p-4 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.8)] backdrop-blur-xl text-fg-muted font-mono space-y-3 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-fg-muted uppercase tracking-tight">
                  Mobile Shop POS & ERP
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Установите приложение для работы без браузера
                </p>
              </div>
            </div>
            <button
              onClick={handleDismissAndroid}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <button
              onClick={handleInstallAndroid}
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-[0_0_12px_rgba(16,185,129,0.4)]"
            >
              <Download className="w-4 h-4" />
              <span>УСТАНОВИТЬ</span>
            </button>
            <button
              onClick={handleDismissAndroid}
              className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 text-xs font-bold transition-colors"
            >
              Не сейчас
            </button>
          </div>
        </div>
      )}

      {/* iPHONE / iOS SAFARI INSTALLATION GUIDE MODAL */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md font-mono animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-amber-500/40 p-5 text-fg-muted shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                <h4 className="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider">
                  УСТАНОВКА НА IPHONE
                </h4>
              </div>
              <button onClick={handleDismissIOS} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isSafari ? (
              <div className="space-y-3 text-xs text-slate-300">
                <p className="text-amber-300 font-bold">
                  Для установки приложения открывайте этот сайт в браузере Safari!
                </p>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Скопируйте ссылку <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-400">app.mobileshop.tj</code> и откройте её в оригинальном Safari.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-slate-300 font-bold">
                  Добавьте Mobile Shop на экран Домой для работы в режиме приложения:
                </p>

                <div className="space-y-2 bg-bg p-3 rounded-xl border border-slate-800 text-[11px]">
                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">1</span>
                    <span>Внизу экрана нажмите кнопку <strong>«Поделиться»</strong> <Share className="w-3.5 h-3.5 inline text-sky-400 ml-0.5" /></span>
                  </div>
                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">2</span>
                    <span>Прокрутите вниз и выберите <strong>«На экран Домой»</strong> <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400 ml-0.5" /></span>
                  </div>
                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">3</span>
                    <span>Нажмите <strong>«Добавить»</strong> в верхнем правом углу</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleDismissIOS}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-[0_0_12px_rgba(245,158,11,0.3)]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ПОНЯТНО, СПАСИБО</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
