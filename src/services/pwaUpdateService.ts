import { isSafeToUpdate, getUpdateSafetyAssessment } from '../utils/pwaUpdateSafety';

export interface PWAUpdateState {
  hasUpdate: boolean;
  isChecking: boolean;
  lastChecked: number | null;
  currentCommit: string;
  latestCommit: string | null;
  serverVersion: string | null;
  isUpdating: boolean;
  waitingWorker: ServiceWorker | null;
  offline: boolean;
  showNetworkNotice: boolean;
}

export type PWAUpdateListener = (state: PWAUpdateState) => void;

class PWAUpdateService {
  private state: PWAUpdateState = {
    hasUpdate: false,
    isChecking: false,
    lastChecked: null,
    currentCommit: typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : 'dev',
    latestCommit: null,
    serverVersion: null,
    isUpdating: false,
    waitingWorker: null,
    offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    showNetworkNotice: false,
  };

  private listeners = new Set<PWAUpdateListener>();
  private registration: ServiceWorkerRegistration | null = null;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private networkNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  public getState(): PWAUpdateState {
    return { ...this.state };
  }

  public subscribe(listener: PWAUpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[PWA] Error in update subscriber:', err);
      }
    });
  }

  /**
   * Initializes PWA update lifecycle listeners, periodic checking, and resume hooks.
   */
  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // 1. Hook into Service Worker registration if available
    if ('serviceWorker' in navigator) {
      this.setupServiceWorker();
    }

    // 2. Setup Foreground / Visibility / Online / Periodic Listeners (Requirements 3 & 6)
    this.setupLifecycleHooks();

    // 3. Initial check on application launch
    this.checkForUpdates(true);
  }

  private async setupServiceWorker() {
    try {
      // Get existing registration or wait until ready
      const reg = (await navigator.serviceWorker.getRegistration?.()) || (navigator.serviceWorker.ready ? await navigator.serviceWorker.ready : null);
      if (reg) {
        this.attachRegistration(reg);
      }

      // Also listen on ready promise in case registration was still pending
      if (navigator.serviceWorker.ready && typeof navigator.serviceWorker.ready.then === 'function') {
        navigator.serviceWorker.ready.then((readyReg) => {
          if (readyReg) this.attachRegistration(readyReg);
        }).catch(() => {});
      }

      // Handle controllerchange: when the new service worker activates and claims the clients
      navigator.serviceWorker.addEventListener('controllerchange', () => this.handleControllerChange());
    } catch (err) {
      console.warn('[PWA] ServiceWorker setup error:', err);
    }
  }

  private reloadedForController = false;

  /**
   * A new version took control of this page. Reload into it when this tab asked for the update
   * or holds no unfinished work; if another tab activated it while this one has a cart or form
   * in progress, keep the update pending and apply it once that work is done.
   */
  public handleControllerChange() {
    if (this.reloadedForController) return;
    if (this.state.isUpdating || getUpdateSafetyAssessment().safe) {
      this.reloadedForController = true;
      this.performSafeReload();
      return;
    }
    this.state.hasUpdate = true;
    this.state.waitingWorker = null;
    this.notify();
  }

  private attachRegistration(reg: ServiceWorkerRegistration) {
    this.registration = reg;

    // Check 1: Is a new worker ALREADY waiting from a previous background check?
    if (reg.waiting) {
      this.handleWaitingWorker(reg.waiting);
    }

    // Check 2: Is a worker currently installing?
    if (reg.installing) {
      this.trackInstallingWorker(reg.installing);
    }

    // Check 3: Listen for future update discoveries
    reg.addEventListener('updatefound', () => {
      if (reg.installing) {
        this.trackInstallingWorker(reg.installing);
      }
    });
  }

  private trackInstallingWorker(worker: ServiceWorker) {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        // If navigator.serviceWorker.controller is present, this is an update to an existing installation!
        if (navigator.serviceWorker.controller) {
          this.handleWaitingWorker(worker);
        }
      } else if (worker.state === 'activated') {
        // Successfully activated
      }
    });
  }

  private handleWaitingWorker(worker: ServiceWorker) {
    this.state.waitingWorker = worker;
    this.state.hasUpdate = true;
    this.notify();

    // Safe auto-apply: if idle, apply immediately without interrupting active work
    this.trySafeAutoUpdate();
  }

  private setupLifecycleHooks() {
    // A. Online / Offline events
    window.addEventListener('online', () => {
      this.state.offline = false;
      this.state.showNetworkNotice = true;
      this.notify();

      if (this.networkNoticeTimer) clearTimeout(this.networkNoticeTimer);
      this.networkNoticeTimer = setTimeout(() => {
        this.state.showNetworkNotice = false;
        this.notify();
      }, 4000);

      // Trigger update check when connectivity returns
      this.checkForUpdates();
    });

    window.addEventListener('offline', () => {
      this.state.offline = true;
      this.state.showNetworkNotice = true;
      this.notify();
    });

    // B. Visibility change (when switching back to PWA tab or standalone app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkForUpdates();
        // If an update is pending, check if it's now safe to apply
        this.trySafeAutoUpdate();
      }
    });

    // C. Pageshow (critical for iOS Safari and Standalone WebKit when resuming from memory)
    window.addEventListener('pageshow', () => {
      this.checkForUpdates();
      this.trySafeAutoUpdate();
    });

    // D. Window focus (desktop and mobile app switcher focus)
    window.addEventListener('focus', () => {
      this.checkForUpdates();
      this.trySafeAutoUpdate();
    });

    // E. Periodic Heartbeat (~60 seconds) while active
    this.checkIntervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine) {
        this.checkForUpdates();
      }
    }, 60_000);
  }

  /**
   * Check for updates across both Service Worker registration and independent /version.json.
   */
  public async checkForUpdates(force = false): Promise<boolean> {
    if (this.state.isChecking && !force) return this.state.hasUpdate;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    this.state.isChecking = true;
    this.state.lastChecked = Date.now();
    this.notify();

    let foundUpdate = false;

    try {
      // 1. Independent version check from server (Requirement 10)
      // Independent from SW caching: uses cache: 'no-store' and cache-busting timestamp
      const versionResult = await this.checkServerVersion();
      if (versionResult.hasNewCommit) {
        foundUpdate = true;
        this.state.hasUpdate = true;
        this.state.latestCommit = versionResult.commit;
        this.state.serverVersion = versionResult.version;
        this.notify();
      }

      // 2. Service Worker update check
      if (this.registration) {
        // If already waiting, mark update
        if (this.registration.waiting) {
          foundUpdate = true;
          this.handleWaitingWorker(this.registration.waiting);
        }

        try {
          await this.registration.update();
        } catch (swErr) {
          console.debug('[PWA] Service worker registration.update() check:', swErr);
        }
      } else if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          this.attachRegistration(reg);
          try {
            await reg.update();
          } catch {
            // Ignore offline/throttled check
          }
        }
      }
    } catch (err) {
      console.warn('[PWA] Error during update check:', err);
    } finally {
      this.state.isChecking = false;
      this.notify();
    }

    if (foundUpdate) {
      this.trySafeAutoUpdate();
    }

    return foundUpdate;
  }

  /**
   * Fetches fresh /version.json bypassing all caches.
   */
  private async checkServerVersion(): Promise<{ hasNewCommit: boolean; commit: string | null; version: string | null }> {
    try {
      const response = await fetch(`/version.json?_t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      if (!response.ok) {
        return { hasNewCommit: false, commit: null, version: null };
      }

      const data = await response.json();
      const serverCommit = data.commit ? String(data.commit).trim() : null;
      const currentCommit = this.state.currentCommit;

      // If current commit is unknown or dev, only flag update if explicitly different non-dev
      if (serverCommit && currentCommit && currentCommit !== 'dev' && serverCommit !== 'dev') {
        if (serverCommit !== currentCommit) {
          return {
            hasNewCommit: true,
            commit: serverCommit,
            version: data.version || null,
          };
        }
      }

      return { hasNewCommit: false, commit: serverCommit, version: data.version || null };
    } catch {
      return { hasNewCommit: false, commit: null, version: null };
    }
  }

  /**
   * Attempts automatic update if the app is currently in a safe state.
   */
  public trySafeAutoUpdate(): boolean {
    if (!this.state.hasUpdate || this.state.isUpdating) return false;

    const safety = getUpdateSafetyAssessment();
    if (safety.safe) {
      this.applyUpdate();
      return true;
    } else {
      console.info(`[PWA] Automatic update deferred: ${safety.reason}`);
      return false;
    }
  }

  /**
   * Applies the update: signals SKIP_WAITING to waiting worker, or performs safe reload.
   */
  public applyUpdate() {
    if (this.state.isUpdating) return;
    this.state.isUpdating = true;
    this.notify();

    if (this.state.waitingWorker) {
      // Post message to waiting service worker to activate
      this.state.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Direct safe reload
      this.performSafeReload();
    }
  }

  /**
   * Reloads the page safely while preventing infinite reload loops (Requirement 13).
   */
  private performSafeReload() {
    const RELOAD_KEY = 'ms_pwa_last_reload_timestamp';
    const now = Date.now();
    const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || '0');

    // Prevent repeated reloads within 10 seconds
    if (now - lastReload < 10_000) {
      console.warn('[PWA] Reload loop prevented. Last reload occurred less than 10s ago.');
      this.state.isUpdating = false;
      this.notify();
      return;
    }

    sessionStorage.setItem(RELOAD_KEY, String(now));

    // Perform reload
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  public dismissNetworkNotice() {
    this.state.showNetworkNotice = false;
    this.notify();
  }

  public isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean })?.standalone)
    );
  }

  public getBuildInfo() {
    return {
      version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
      commit: typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : 'dev',
      buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString(),
    };
  }
}

export const pwaUpdateService = new PWAUpdateService();
