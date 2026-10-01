import { useSyncExternalStore } from 'react';

/** State of the realtime WebSocket, set by useRealtimeSync. */
export type RealtimeState = 'idle' | 'connecting' | 'online' | 'offline';

let realtimeState: RealtimeState = 'idle';
const listeners = new Set<() => void>();

export function setRealtimeState(next: RealtimeState) {
  if (next === realtimeState) return;
  realtimeState = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export interface ConnectionView {
  tone: 'success' | 'warning' | 'danger';
  label: string;
  syncLabel: string;
}

/** What the status bar says: only a live socket on a live network counts as synced. */
export function describeConnection(browserOnline: boolean, realtime: RealtimeState): ConnectionView {
  if (!browserOnline) return { tone: 'danger', label: 'Нет сети', syncLabel: 'Синхронизация остановлена' };
  if (realtime === 'online') return { tone: 'success', label: 'Система активна', syncLabel: 'Синхронизация онлайн' };
  if (realtime === 'offline') return { tone: 'warning', label: 'Нет связи с сервером', syncLabel: 'Переподключение…' };
  return { tone: 'warning', label: 'Подключение…', syncLabel: 'Подключение к серверу…' };
}

const getSnapshot = () => `${typeof navigator === 'undefined' || navigator.onLine ? 1 : 0}:${realtimeState}`;

export function useConnectionStatus(): ConnectionView {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => '1:idle');
  const [online, realtime] = snapshot.split(':');
  return describeConnection(online === '1', realtime as RealtimeState);
}
