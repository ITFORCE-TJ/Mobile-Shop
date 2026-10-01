import { create } from 'zustand';
import { ThemeMode } from '../types';

export interface StoreTransitionState {
  active: boolean;
  storeName: string;
  storeId?: string;
  isCentral?: boolean;
  durationMs?: number;
}

interface UIState {
  theme: ThemeMode;
  drawerOpen: boolean;
  sidebarCollapsed: boolean;
  selectedStoreId: string;
  isDailyRateModalOpen: boolean;
  isScannerOpen: boolean;
  scannerCallback: ((code: string) => void) | null;
  isStoreSwitchModalOpen: boolean;
  storeTransition: StoreTransitionState | null;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setDrawerOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setSelectedStoreId: (storeId: string) => void;
  setDailyRateModalOpen: (open: boolean) => void;
  openScanner: (callback: (code: string) => void) => void;
  closeScanner: () => void;
  setStoreSwitchModalOpen: (open: boolean) => void;
  triggerStoreTransition: (opts: { storeName: string; storeId?: string; isCentral?: boolean; durationMs?: number }) => void;
  clearStoreTransition: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: (typeof localStorage !== 'undefined' ? (localStorage.getItem('ms_theme') as ThemeMode) : null) || 'light',
  drawerOpen: false,
  sidebarCollapsed: typeof localStorage !== 'undefined' ? localStorage.getItem('ms_sidebar_collapsed') === 'true' : false,
  selectedStoreId: 'all',
  isDailyRateModalOpen: false,
  isScannerOpen: false,
  scannerCallback: null,
  isStoreSwitchModalOpen: false,
  storeTransition: null,

  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ms_theme', theme);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },

  toggleTheme: () =>
    set((state) => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ms_theme', nextTheme);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', nextTheme);
      }
      return { theme: nextTheme };
    }),

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ms_sidebar_collapsed', String(sidebarCollapsed));
    }
    set({ sidebarCollapsed });
  },
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ms_sidebar_collapsed', String(next));
      }
      return { sidebarCollapsed: next };
    }),
  setSelectedStoreId: (selectedStoreId) => set({ selectedStoreId }),
  setDailyRateModalOpen: (isDailyRateModalOpen) => set({ isDailyRateModalOpen }),

  openScanner: (scannerCallback) => set({ isScannerOpen: true, scannerCallback }),
  closeScanner: () => set({ isScannerOpen: false, scannerCallback: null }),
  setStoreSwitchModalOpen: (isStoreSwitchModalOpen) => set({ isStoreSwitchModalOpen }),
  triggerStoreTransition: (opts) =>
    set({
      storeTransition: {
        active: true,
        storeName: opts.storeName,
        storeId: opts.storeId,
        isCentral: opts.isCentral,
        durationMs: opts.durationMs,
      },
    }),
  clearStoreTransition: () => set({ storeTransition: null }),
}));

if (typeof window !== 'undefined') {
  (window as any).__uiStore = useUIStore;
}
