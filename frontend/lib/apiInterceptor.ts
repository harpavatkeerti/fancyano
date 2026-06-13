/**
 * API Auth Interceptor
 *
 * Registers interceptors on the single shared axios instance (api.client):
 * - Request: attaches Authorization: Bearer <token> from localStorage
 * - Response: on 401, clears auth state and calls onUnauthorized()
 *
 * Call setupApiInterceptors() once at app startup (from AuthProvider).
 * Prevents duplicates on React StrictMode double-mount.
 */
import { api } from './api';

const AUTH_STORAGE_KEY = 'fancyano_auth';

let interceptorsRegistered = false;

export function setupApiInterceptors(onUnauthorized: () => void) {
  if (interceptorsRegistered) return;
  interceptorsRegistered = true;

  // ── Request interceptor: attach auth token ──
  api.client.interceptors.request.use(
    (config) => {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.token && auth?.expiresAt && Date.now() < auth.expiresAt) {
            config.headers = config.headers ?? {};
            config.headers['Authorization'] = `Bearer ${auth.token}`;
          }
        }
      } catch {
        // Ignore parse errors — request proceeds without auth header
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // ── Response interceptor: handle 401 → logout + redirect ──
  api.client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        try {
          localStorage.removeItem(AUTH_STORAGE_KEY);
        } catch {
          // ignore
        }
        onUnauthorized();
      }
      return Promise.reject(error);
    }
  );
}
