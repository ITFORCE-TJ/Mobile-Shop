import { useAuthStore } from '../stores/useAuthStore';
import { Capacitor } from '@capacitor/core';
import { requireNativeUrl } from '../services/nativeConfig';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const pendingMutations = new Map<string, Promise<unknown>>();
const pendingKeys = new Map<string, string>();
export const REQUEST_TIMEOUT_MS = 45_000;

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase()) && !endpoint.startsWith('/auth/');
  if (!mutation) return request<T>(endpoint, options);
  const identity = JSON.stringify([useAuthStore.getState().currentUser?.id, options.method, endpoint, options.body ?? null]);
  const existing = pendingMutations.get(identity);
  if (existing) return existing as Promise<T>;
  const task = (async () => {
    const hash = crypto.subtle ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)) : null;
    const storageKey = hash ? 'ms_operation_' + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') : null;
    const headers = new Headers(options.headers);
    let key = headers.get('Idempotency-Key') || pendingKeys.get(identity) || null;
    try { if (!key && storageKey) key = sessionStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
    key ||= Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    pendingKeys.set(identity, key);
    try { if (storageKey) sessionStorage.setItem(storageKey, key); } catch { /* In-memory deduplication remains active. */ }
    headers.set('Idempotency-Key', key);
    try {
      const result = await request<T>(endpoint, { ...options, headers: Object.fromEntries(headers.entries()) });
      pendingKeys.delete(identity);
      try { if (storageKey) sessionStorage.removeItem(storageKey); } catch { /* No storage. */ }
      window.dispatchEvent(new Event('business-data-changed'));
      return result;
    } catch (error) {
      // Keep the key after ambiguous network/5xx failure: retry must recover the committed result.
      if ((error as { status?: number }).status && (error as { status: number }).status < 500) {
        pendingKeys.delete(identity);
        try { if (storageKey) sessionStorage.removeItem(storageKey); } catch { /* No storage. */ }
      }
      throw error;
    }
  })();
  pendingMutations.set(identity, task);
  try { return await task; } finally { pendingMutations.delete(identity); }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (Capacitor.isNativePlatform()) requireNativeUrl(import.meta.env.VITE_API_URL, 'https:', 'VITE_API_URL');
  const token = useAuthStore.getState().token;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = API_BASE_URL.startsWith('http')
    ? `${API_BASE_URL.replace(/\/$/, '')}${cleanEndpoint}`
    : `${API_BASE_URL}${cleanEndpoint}`;

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (token !== useAuthStore.getState().token) {
      throw new Error('Сессия изменилась. Ответ предыдущего пользователя отклонён.');
    }
    if (!response.ok) {
      if (response.status === 401) {
        useAuthStore.getState().logout();
      }
      const errorData = await response.json().catch(() => ({
        message: response.status === 504 || response.status === 502
          ? 'Сервер API недоступен. Запустите бэкенд: npm run server'
          : `Ошибка API (HTTP ${response.status})`
      }));
      throw Object.assign(new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`), { status: response.status });
    }

    return await response.json();
  } catch (err: any) {
    if (timedOut) {
      const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase());
      throw new Error(mutation
        ? 'Сервер не ответил вовремя. Результат операции пока неизвестен. Проверьте историю перед новой операцией; повтор с теми же данными защищён от дублирования.'
        : 'Сервер не ответил вовремя. Не удалось обновить данные.');
    }
    if (err.name === 'TypeError' || err.message?.includes('Failed to fetch')) {
      throw new Error('Сервер API недоступен. Запустите бэкенд: npm run server');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
