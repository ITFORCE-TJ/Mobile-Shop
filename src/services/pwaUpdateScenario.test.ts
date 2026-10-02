import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { pwaUpdateService } from './pwaUpdateService';
import * as safetyModule from '../utils/pwaUpdateSafety';

describe('Real PWA Update Scenario: Version A -> Version B', () => {
  let mockStorage: Record<string, string> = {};
  let eventListeners: Record<string, Function[]> = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = {};
    eventListeners = {};

    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    });

    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: Function) => {
        eventListeners[type] = eventListeners[type] || [];
        eventListeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: Function) => {
        if (eventListeners[type]) {
          eventListeners[type] = eventListeners[type].filter((l) => l !== listener);
        }
      },
      matchMedia: () => ({ matches: true }),
    });

    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: Function) => {
        eventListeners[type] = eventListeners[type] || [];
        eventListeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: Function) => {
        if (eventListeners[type]) {
          eventListeners[type] = eventListeners[type].filter((l) => l !== listener);
        }
      },
      activeElement: null,
      querySelector: () => null,
      querySelectorAll: () => [],
    });

    vi.stubGlobal('navigator', {
      onLine: true,
      serviceWorker: {
        getRegistration: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('executes full update cycle: launch A -> deploy B -> detect -> background/reopen -> safe update to B', async () => {
    // 1. Initial State: App is on Version A
    const versionA = 'commit-aaa-111';
    const versionB = 'commit-bbb-222';

    (pwaUpdateService as any).state.currentCommit = versionA;
    (pwaUpdateService as any).state.hasUpdate = false;
    (pwaUpdateService as any).state.latestCommit = null;
    (pwaUpdateService as any).state.isUpdating = false;

    // Mock initial registration with active worker A
    const postMessageMock = vi.fn();
    const waitingWorkerMock = {
      state: 'installed',
      postMessage: postMessageMock,
      addEventListener: vi.fn(),
    };

    const mockRegistration = {
      active: { state: 'activated' },
      installing: null,
      waiting: null as any,
      update: vi.fn().mockImplementation(async () => {
        // When update is called, Service Worker discovers new version B
        mockRegistration.waiting = waitingWorkerMock;
      }),
      addEventListener: vi.fn(),
    };

    (navigator.serviceWorker.getRegistration as any).mockResolvedValue(mockRegistration);

    // Initial check on launch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/version.json')) {
        return {
          ok: true,
          json: async () => ({ commit: versionA, version: '1.0.0', buildTime: '2026-10-02T10:00:00Z' }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    pwaUpdateService.init();
    await pwaUpdateService.checkForUpdates();
    expect(pwaUpdateService.getState().hasUpdate).toBe(false);

    // 2. Deploy Version B on server: /version.json returns commit B
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/version.json')) {
        return {
          ok: true,
          json: async () => ({ commit: versionB, version: '1.0.1', buildTime: '2026-10-02T11:00:00Z' }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    // 3. User is actively performing a sale checkout -> Unsafe to update
    const unregisterBusy = safetyModule.registerBusyOperation('checkout_sale_in_progress');
    expect(safetyModule.isSafeToUpdate()).toBe(false);

    // Update check occurs while version A is running
    const updateDetected = await pwaUpdateService.checkForUpdates(true);
    expect(updateDetected).toBe(true);
    expect(pwaUpdateService.getState().hasUpdate).toBe(true);
    expect(pwaUpdateService.getState().latestCommit).toBe(versionB);

    // Auto-update MUST be deferred because transaction is active
    const autoUpdatedDuringTx = pwaUpdateService.trySafeAutoUpdate();
    expect(autoUpdatedDuringTx).toBe(false);
    expect(postMessageMock).not.toHaveBeenCalled();

    // 4. User completes the sale -> State becomes safe
    unregisterBusy();
    expect(safetyModule.isSafeToUpdate()).toBe(true);

    // 5. Background and reopen PWA: triggers visibilitychange and pageshow events
    // Simulating app return to foreground:
    const reloadMock = vi.fn();
    vi.stubGlobal('location', { reload: reloadMock });

    // Associate waiting worker to state
    (pwaUpdateService as any).state.waitingWorker = waitingWorkerMock;

    // Foreground resume triggers safe update
    const autoUpdatedOnResume = pwaUpdateService.trySafeAutoUpdate();
    expect(autoUpdatedOnResume).toBe(true);

    // 6. Waiting Service Worker receives SKIP_WAITING
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(pwaUpdateService.getState().isUpdating).toBe(true);

    // 7. Verify reload loop protection: immediate subsequent update attempt is throttled
    mockStorage['ms_pwa_last_reload_timestamp'] = String(Date.now() - 2000);
    pwaUpdateService.applyUpdate();
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
