import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { pwaUpdateService } from './pwaUpdateService';
import * as safetyModule from '../utils/pwaUpdateSafety';

describe('PWAUpdateService', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = {};

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

    vi.stubGlobal('navigator', {
      onLine: true,
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(null),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exposes initial state with current commit and build info', () => {
    const state = pwaUpdateService.getState();
    expect(state).toHaveProperty('hasUpdate');
    expect(state).toHaveProperty('currentCommit');
    expect(state).toHaveProperty('isChecking');

    const buildInfo = pwaUpdateService.getBuildInfo();
    expect(buildInfo).toHaveProperty('version');
    expect(buildInfo).toHaveProperty('commit');
    expect(buildInfo).toHaveProperty('buildTime');
  });

  it('detects new version when version.json returns a different commit', async () => {
    const mockCommit = 'new-commit-hash-789';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ commit: mockCommit, version: '1.0.1', buildTime: '2026-10-02T12:00:00Z' }),
    } as Response);

    const updateFound = await pwaUpdateService.checkForUpdates(true);
    expect(updateFound).toBe(true);
    const state = pwaUpdateService.getState();
    expect(state.hasUpdate).toBe(true);
    expect(state.latestCommit).toBe(mockCommit);
    expect(state.serverVersion).toBe('1.0.1');
  });

  it('does not flag update when server commit matches current commit', async () => {
    const currentCommit = pwaUpdateService.getState().currentCommit;
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ commit: currentCommit, version: '1.0.0', buildTime: '2026-10-02T10:00:00Z' }),
    } as Response);

    const updateFound = await pwaUpdateService.checkForUpdates(true);
    expect(updateFound).toBe(false);
  });

  it('defers automatic update if safety check fails', () => {
    vi.spyOn(safetyModule, 'getUpdateSafetyAssessment').mockReturnValue({
      safe: false,
      reason: 'Active transaction in progress',
    });

    // Mock hasUpdate
    (pwaUpdateService as any).state.hasUpdate = true;
    (pwaUpdateService as any).state.isUpdating = false;

    const autoUpdated = pwaUpdateService.trySafeAutoUpdate();
    expect(autoUpdated).toBe(false);
    expect(pwaUpdateService.getState().isUpdating).toBe(false);
  });

  it('prevents reload loops if reload occurred less than 10 seconds ago', () => {
    const RELOAD_KEY = 'ms_pwa_last_reload_timestamp';
    mockStorage[RELOAD_KEY] = String(Date.now() - 3000); // 3 seconds ago

    const reloadMock = vi.fn();
    vi.stubGlobal('location', { reload: reloadMock });

    // Try applying update
    (pwaUpdateService as any).state.isUpdating = false;
    (pwaUpdateService as any).state.waitingWorker = null;

    pwaUpdateService.applyUpdate();

    // Reload must be prevented
    expect(reloadMock).not.toHaveBeenCalled();
    expect(pwaUpdateService.getState().isUpdating).toBe(false);
  });

  it('correctly identifies standalone display mode vs browser', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query.includes('standalone'),
      }),
      navigator: {},
    });

    expect(pwaUpdateService.isStandalone()).toBe(true);
  });

  it('a new version activated by another tab does not reload over unfinished work; it reloads once safe', () => {
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    const service = pwaUpdateService as unknown as { state: { isUpdating: boolean; hasUpdate: boolean; waitingWorker: unknown }; handleControllerChange: () => void };
    service.state.isUpdating = false;
    service.state.waitingWorker = null;
    const safety = vi.spyOn(safetyModule, 'getUpdateSafetyAssessment').mockReturnValue({ safe: false, reason: 'Выполняется операция: Незавершённая продажа' });

    service.handleControllerChange();
    expect(reload).not.toHaveBeenCalled();
    expect(pwaUpdateService.getState().hasUpdate).toBe(true);

    safety.mockReturnValue({ safe: true });
    expect(pwaUpdateService.trySafeAutoUpdate()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

