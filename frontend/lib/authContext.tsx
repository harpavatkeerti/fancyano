/**
 * Auth Context — provides authentication state globally.
 *
 * Stores token + user info in localStorage with expiry.
 * Exposes useAuth() hook with: user, role, isAdmin, isSalesman,
 * isCustomer, hasRole(), login(), logout().
 *
 * Cross-tab sync: logs out and detects role changes via storage events.
 */
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { setupApiInterceptors } from './apiInterceptor';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'salesman' | 'customer';
  phone?: string;
  email?: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  expiresAt: number | null; // Unix ms timestamp
}

export interface LoginPayload {
  user: AuthUser;
  token: string;
  expiresAt: number;
}

interface AuthContextValue extends AuthState {
  isAdmin: boolean;
  isSalesman: boolean;
  isCustomer: boolean;
  isAuthenticated: boolean;
  isInitialised: boolean; // true after first client-side localStorage read
  hasRole: (...roles: string[]) => boolean;
  login: (payload: LoginPayload) => void;
  logout: () => void;
}

// ── localStorage keys ──────────────────────────────────────────────────────

const STORAGE_KEY = 'fancyano_auth';

function readFromStorage(): AuthState {
  try {
    if (typeof window === 'undefined') return { user: null, token: null, expiresAt: null };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, token: null, expiresAt: null };
    const parsed: AuthState = JSON.parse(raw);
    // Check expiry
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return { user: null, token: null, expiresAt: null };
    }
    return parsed;
  } catch {
    return { user: null, token: null, expiresAt: null };
  }
}

function writeToStorage(state: AuthState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearStorage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initial state is null to match SSR (no localStorage on server).
  // isInitialised becomes true after the first client-side mount reads storage.
  // Redirect logic in pages/layouts must wait for isInitialised before acting.
  const [auth, setAuth] = useState<AuthState>({ user: null, token: null, expiresAt: null });
  const [isInitialised, setIsInitialised] = useState(false);
  const router = useRouter();

  // Read localStorage + set up API interceptors after mount (client only)
  useEffect(() => {
    setAuth(readFromStorage());
    setIsInitialised(true);
    setupApiInterceptors(() => {
      // Called by interceptor when any API returns 401
      clearStorage();
      setAuth({ user: null, token: null, expiresAt: null });
      router.push('/login');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab sync: handle logout or login from another tab
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      if (!e.newValue) {
        // Another tab cleared storage (logout)
        setAuth({ user: null, token: null, expiresAt: null });
      } else {
        // Another tab logged in or changed role
        try {
          const newState: AuthState = JSON.parse(e.newValue);
          setAuth(newState);
        } catch {
          setAuth({ user: null, token: null, expiresAt: null });
        }
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const login = useCallback((payload: LoginPayload) => {
    const newState: AuthState = {
      user: payload.user,
      token: payload.token,
      expiresAt: payload.expiresAt,
    };
    writeToStorage(newState);
    setAuth(newState);
  }, []);

  const logout = useCallback(() => {
    clearStorage();
    setAuth({ user: null, token: null, expiresAt: null });
  }, []);

  const hasRole = useCallback((...roles: string[]) => {
    return auth.user ? roles.includes(auth.user.role) : false;
  }, [auth.user]);

  const value: AuthContextValue = {
    ...auth,
    isAuthenticated: !!auth.user && !!auth.token,
    isInitialised,
    isAdmin: auth.user?.role === 'admin',
    isSalesman: auth.user?.role === 'salesman',
    isCustomer: auth.user?.role === 'customer',
    hasRole,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
