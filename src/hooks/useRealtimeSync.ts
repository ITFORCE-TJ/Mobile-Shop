import { useEffect, useRef } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { requireNativeUrl } from '../services/nativeConfig';
import { setRealtimeState } from '../services/connectionStatus';

/** Subscribes to the backend's authenticated WebSocket and invokes onEvent for every broadcast. */
export function useRealtimeSync(token: string | null, onEvent: (type: string, payload: any) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) return;

    let wsUrl = '';
    const customWsUrl = import.meta.env.VITE_WS_URL;
    if (Capacitor.isNativePlatform()) requireNativeUrl(customWsUrl, 'wss:', 'VITE_WS_URL');

    if (customWsUrl) {
      const separator = customWsUrl.includes('?') ? '&' : '?';
      wsUrl = `${customWsUrl}${separator}token=${encodeURIComponent(token)}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    }

    let socket: WebSocket | null = null;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let hasConnected = false;
    let suspended = false;
    let authRejected = false;
    let appListener: PluginListenerHandle | undefined;

    function clearRetryTimer() {
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    }

    function scheduleReconnect() {
      if (stopped || suspended || authRejected || retryTimer !== undefined) return;
      clearRetryTimer();
      if (import.meta.env.DEV) {
        console.debug(`[WebSocket] scheduling reconnect in ${retryDelay}ms`);
      }
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    }

    function connect() {
      if (stopped || suspended || authRejected) return;
      clearRetryTimer();

      // Guard: do not open a new socket if an active or connecting socket already exists
      const isLive = socket && typeof socket.readyState === 'number' && (socket.readyState === 0 /* CONNECTING */ || socket.readyState === 1 /* OPEN */);
      if (isLive) {
        return;
      }

      // If an old socket was closing or closed, detach any stale handlers
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket = null;
      }

      try {
        if (import.meta.env.DEV) {
          console.debug('[WebSocket] connecting...');
        }
        const connection = new WebSocket(wsUrl);
        socket = connection;
        setRealtimeState('connecting');

        connection.onopen = () => {
          if (stopped) {
            connection.close(1000, 'Unmounted');
            return;
          }
          if (import.meta.env.DEV) {
            console.debug('[WebSocket] connected');
          }
          retryDelay = 1000;
          setRealtimeState('online');
          if (hasConnected) onEventRef.current('RECONNECTED', null);
          hasConnected = true;
        };

        connection.onmessage = (event) => {
          if (stopped) return;
          try {
            const data = JSON.parse(event.data);
            onEventRef.current(data.type, data.payload);
          } catch (e) {
            console.error('[Realtime Sync Parse Error]:', e);
          }
        };

        connection.onclose = (event) => {
          if (import.meta.env.DEV) {
            console.debug(`[WebSocket] disconnected code=${event.code} reason=${event.reason || ''}`);
          }
          if (stopped) return;
          setRealtimeState('offline');
          // Authorization failures require a new token, not repeated connections.
          if (event.code === 1008) authRejected = true;
          if (!authRejected) {
            scheduleReconnect();
          }
        };

        // Failed connections also emit close; keep retries in one place.
        connection.onerror = () => {
          if (connection.readyState === undefined || (connection.readyState !== 2 && connection.readyState !== 3)) {
            try {
              connection.close();
            } catch {
              // ignore
            }
          }
        };
      } catch (err) {
        if (import.meta.env.DEV) {
          console.debug('[WebSocket] connection failed to construct:', err);
        }
        scheduleReconnect();
      }
    }

    const handleBeforeUnload = () => {
      if (socket && (socket.readyState === undefined || socket.readyState === 0 || socket.readyState === 1)) {
        try {
          socket.close(1000, 'Page unload');
        } catch {
          // ignore
        }
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    connect();

    if (Capacitor.isNativePlatform()) {
      const onAppState = ({ isActive }: { isActive: boolean }) => {
        if (stopped) return;
        suspended = !isActive;
        clearRetryTimer();
        // A WebView may still report OPEN for a socket killed while suspended.
        // Recreate it on foreground; existing RECONNECTED handling refreshes data.
        if (socket) {
          socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
          try { socket.close(1000, 'App lifecycle'); } catch { /* Already closed. */ }
          socket = null;
        }
        if (isActive) connect();
      };
      void import('@capacitor/app').then(async ({ App }) => {
        if (stopped) return;
        const listener = await App.addListener('appStateChange', onAppState);
        if (stopped) { await listener.remove(); return; }
        appListener = listener;
        const state = await App.getState();
        if (!state.isActive) onAppState(state);
      }).catch((error) => console.error('Native realtime lifecycle unavailable', error));
    }

    return () => {
      stopped = true;
      setRealtimeState('idle');
      void appListener?.remove();
      clearRetryTimer();
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        try {
          socket.close();
        } catch {
          // ignore
        }
        socket = null;
      }
    };
  }, [token]);
}
