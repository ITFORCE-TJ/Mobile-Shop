import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { PageId } from '../types';

// Layouts & Modals
import { TopBar } from '../components/layout/TopBar';
import { Sidebar } from '../components/layout/Sidebar';
import { TabletNavRail } from '../components/layout/TabletNavRail';
import { Drawer } from '../components/layout/Drawer';
import { MobileBottomNav } from '../components/layout/MobileBottomNav';
import { DailyRateModal } from '../components/common/DailyRateModal';
import { StoreSwitchModal } from '../components/common/StoreSwitchModal';
import { StoreTransitionOverlay } from '../components/common/StoreTransitionOverlay';
import { PWAInstallPrompt } from '../components/pwa/PWAInstallPrompt';
import { PWAUpdateNotifier } from '../components/pwa/PWAUpdateNotifier';
import { useUIStore } from '../stores/useUIStore';
import { useAppFields } from '../context/AppContext';
import { LoadingState } from '../components/ui/Skeleton';
import { useNavigationLayout } from '../hooks/useNavigationLayout';
import { cancelScan, isNativeScanner } from '../services/scanner/scannerService';

// Lazy-loaded so the ~3MB html5-qrcode dependency it pulls in only downloads the first
// time a user actually opens the scanner, instead of riding along in the main chunk on
// every page load for every mobile user (see performance audit, P0-1).
const ScannerModal = lazy(() => import('../components/common/ScannerModal').then(m => ({ default: m.ScannerModal })));
const NativeScannerOverlay = lazy(() => import('../components/common/NativeScannerOverlay').then(m => ({ default: m.NativeScannerOverlay })));

// Lazy-loaded page components for Code Splitting
const SalePage = lazy(() => import('../components/pages/SalePage').then(m => ({ default: m.SalePage })));
const SalesHistoryPage = lazy(() => import('../components/pages/SalesHistoryPage').then(m => ({ default: m.SalesHistoryPage })));
const InventoryPage = lazy(() => import('../components/pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const PurchasePage = lazy(() => import('../components/pages/PurchasePage').then(m => ({ default: m.PurchasePage })));
const TransferPage = lazy(() => import('../components/pages/TransferPage').then(m => ({ default: m.TransferPage })));
const ExchangePage = lazy(() => import('../components/pages/ExchangePage').then(m => ({ default: m.ExchangePage })));
const RepairPage = lazy(() => import('../components/pages/RepairPage').then(m => ({ default: m.RepairPage })));
const SuppliersPage = lazy(() => import('../components/pages/SuppliersPage').then(m => ({ default: m.SuppliersPage })));
const BonusesPage = lazy(() => import('../components/pages/BonusesPage').then(m => ({ default: m.BonusesPage })));
const ExpensesPage = lazy(() => import('../components/pages/ExpensesPage').then(m => ({ default: m.ExpensesPage })));
const OwnersPage = lazy(() => import('../components/pages/OwnersPage').then(m => ({ default: m.OwnersPage })));
const EmployeesPage = lazy(() => import('../components/pages/EmployeesPage').then(m => ({ default: m.EmployeesPage })));
const FinancePage = lazy(() => import('../components/pages/FinancePage').then(m => ({ default: m.FinancePage })));
const AuditLogPage = lazy(() => import('../components/pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const SettingsPage = lazy(() => import('../components/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const NotificationsPage = lazy(() => import('../components/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));

const PAGE_ROUTES: Record<string, string> = {
  SALE: '/sale',
  SALES_HISTORY: '/sales-history',
  INVENTORY: '/inventory',
  PURCHASE: '/purchase',
  TRANSFER: '/transfer',
  EXCHANGE: '/exchange',
  REPAIR: '/repair',
  SUPPLIERS: '/suppliers',
  BONUSES: '/bonuses',
  EXPENSES: '/expenses',
  OWNERS: '/owners',
  EMPLOYEES: '/employees',
  REPORTS: '/reports',
  FINANCE: '/finance',
  AUDIT_LOG: '/audit-log',
  SETTINGS: '/settings',
  NOTIFICATIONS: '/notifications',
};

function LoadingFallback() {
  return <LoadingState label="Загрузка…" className="h-full bg-bg" />;
}

export function MainLayout() {
  const native = isNativeScanner();
  React.useEffect(() => () => cancelScan(), []);
  const navigationLayout = useNavigationLayout();
  const location = useLocation();
  const { currentUser } = useAuthStore();
  const { isDailyRateModalOpen, setDailyRateModalOpen, isStoreSwitchModalOpen, setStoreSwitchModalOpen } = useUIStore();
  const { isRateModalOpen, closeDailyRateModal, activePage, setActivePage, selectedStoreId, stores, isScannerOpen } = useAppFields('isRateModalOpen', 'closeDailyRateModal', 'activePage', 'setActivePage', 'selectedStoreId', 'stores', 'isScannerOpen');

  React.useEffect(() => {
    const matched = Object.entries(PAGE_ROUTES).find(([_, path]) => path === location.pathname);
    if (matched) {
      const pageId = matched[0] as PageId;
      if (pageId !== activePage) {
        setActivePage(pageId);
      }
    }
  }, [location.pathname]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Sellers are pinned to their own store; for admin/partner this reflects whichever
  // store is currently active (set on the POS Terminal page), instead of a hardcoded label.
  const activeStoreLabel = currentUser.storeName
    || (currentUser.storeId ? stores.find(s => s.id === currentUser.storeId)?.name : undefined)
    || (selectedStoreId && selectedStoreId !== 'all' ? stores.find(s => s.id === selectedStoreId)?.name : undefined)
    || 'Все магазины';

  return (
    <div className="app-safe-area app-viewport flex w-full max-w-full overflow-hidden bg-bg text-fg antialiased selection:bg-accent selection:text-accent-fg">
      {navigationLayout === 'mobile' && <Drawer />}
      {navigationLayout === 'tablet' && <TabletNavRail />}
      {navigationLayout === 'desktop' && <Sidebar />}

      <div className="flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden bg-bg relative">
        <TopBar />
        <main className="flex-1 flex flex-col min-w-0 max-w-full min-h-0 overflow-y-auto overflow-x-hidden relative bg-bg">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to={currentUser?.role === 'ADMIN' ? "/finance" : "/sale"} replace />} />
              <Route path="/sale" element={<SalePage />} />
              <Route path="/sales-history" element={<SalesHistoryPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/purchase" element={currentUser?.role === 'ADMIN' ? <PurchasePage /> : <Navigate to="/sale" replace />} />
              <Route path="/transfer" element={<TransferPage />} />
              <Route path="/exchange" element={<ExchangePage />} />
              <Route path="/repair" element={<RepairPage />} />
              <Route path="/suppliers" element={currentUser?.role === 'ADMIN' ? <SuppliersPage /> : <Navigate to="/sale" replace />} />
              <Route path="/customers" element={<Navigate to="/sale" replace />} />
              <Route path="/bonuses" element={currentUser?.role === 'ADMIN' ? <BonusesPage /> : <Navigate to="/sale" replace />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/owners" element={currentUser?.role === 'ADMIN' ? <OwnersPage /> : <Navigate to="/sale" replace />} />
              <Route path="/employees" element={currentUser?.role === 'ADMIN' ? <EmployeesPage /> : <Navigate to="/sale" replace />} />
              {/* «Финансовые отчёты» merged into Финансы (opens on the «Отчёт» tab) */}
              <Route path="/reports" element={<Navigate to={currentUser?.role === 'ADMIN' ? "/finance" : "/sale"} replace />} />
              <Route path="/finance" element={currentUser?.role === 'ADMIN' ? <FinancePage /> : <Navigate to="/sale" replace />} />
              <Route path="/audit-log" element={currentUser?.role === 'ADMIN' ? <AuditLogPage /> : <Navigate to="/sale" replace />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/notifications" element={currentUser?.role === 'ADMIN' ? <NotificationsPage /> : <Navigate to="/sale" replace />} />
              <Route path="*" element={<Navigate to={currentUser?.role === 'ADMIN' ? "/finance" : "/sale"} replace />} />
            </Routes>
          </Suspense>
        </main>
        {navigationLayout === 'mobile' && <MobileBottomNav />}

        <footer className="hidden md:flex h-6 shrink-0 border-t border-border bg-surface px-3 items-center justify-between text-[10px] text-fg-subtle select-none z-20">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-fg-muted font-medium">Система активна</span>
            </span>
            <span>·</span>
            <span>Точка: {activeStoreLabel}</span>
            <span>·</span>
            <span>{currentUser?.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <span>USD / TJS</span>
            <span>·</span>
            <span className="text-fg-muted font-medium">Синхронизация онлайн</span>
          </div>
        </footer>
      </div>

      <DailyRateModal
        isOpen={isDailyRateModalOpen || isRateModalOpen}
        onClose={() => {
          setDailyRateModalOpen(false);
          closeDailyRateModal();
        }}
      />
      {currentUser?.role === 'ADMIN' && (
        <StoreSwitchModal
          isOpen={isStoreSwitchModalOpen}
          onClose={() => setStoreSwitchModalOpen(false)}
        />
      )}
      <StoreTransitionOverlay />
      {!native && isScannerOpen && (
        <Suspense fallback={null}>
          <ScannerModal />
        </Suspense>
      )}
      {native ? (
        <Suspense fallback={null}><NativeScannerOverlay /></Suspense>
      ) : (
        <><PWAInstallPrompt /><PWAUpdateNotifier /></>
      )}
    </div>
  );
}
