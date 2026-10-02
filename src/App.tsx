import { AppProvider } from './context/AppContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { AppRouter } from './router/AppRouter';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { PWAUpdateNotifier } from './components/pwa/PWAUpdateNotifier';

export default function App() {
  return (
    <ErrorBoundary>
      <NotificationsProvider>
        <AppProvider>
          <AppRouter />
          <PWAUpdateNotifier />
        </AppProvider>
      </NotificationsProvider>
    </ErrorBoundary>
  );
}
