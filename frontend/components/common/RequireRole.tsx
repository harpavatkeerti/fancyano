'use client';

import { useAuth } from '@/lib/authContext';

interface RequireRoleProps {
  roles: string[];
  children: React.ReactNode;
  /** Shown instead of children when role is not allowed. Defaults to null (hidden). */
  fallback?: React.ReactNode;
}

/**
 * RequireRole — conditionally renders children based on user role.
 *
 * Page-level access control (redirect) is handled by (authenticated)/layout.tsx.
 * This component handles UI-level show/hide only.
 *
 * Usage:
 *   <RequireRole roles={['admin']}><DeleteButton /></RequireRole>
 *   <RequireRole roles={['admin']} fallback={<ReadOnlyView />}><EditView /></RequireRole>
 */
export default function RequireRole({
  roles,
  children,
  fallback = null,
}: RequireRoleProps) {
  const { user, isAuthenticated } = useAuth();
  const allowed = isAuthenticated && user && roles.includes(user.role);
  return <>{allowed ? children : fallback}</>;
}
