'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { isAllowed, getHomeRoute } from '@/lib/routePermissions';
import AppLayout from '@/components/layout/AppLayout';

/**
 * Authenticated layout — wraps all pages that require a logged-in user.
 *
 * Responsibilities:
 * 1. If the user is not authenticated → redirect to /login.
 * 2. If the user is authenticated but their role is not allowed for this route
 *    (per routePermissions.ts) → redirect to their home page.
 * 3. Otherwise → render AppLayout (Header + optional Sidebar + content).
 *
 * Note: AuthProvider (in root layout.tsx) holds the auth state. This layout
 * only reads that state and enforces access. It does NOT manage login itself.
 */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isInitialised } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const canAccess = isAuthenticated && isAllowed(pathname, user?.role);

  useEffect(() => {
    if (!isInitialised) return; // wait until localStorage has been read
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (!canAccess) {
      router.replace(getHomeRoute(user?.role));
    }
  }, [isInitialised, isAuthenticated, canAccess, user, pathname, router]);

  // Render nothing until auth state is known (avoids SSR/CSR mismatch)
  if (!isInitialised || !canAccess) return null;

  return <AppLayout>{children}</AppLayout>;
}
