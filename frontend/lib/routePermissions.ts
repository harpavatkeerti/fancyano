/**
 * Frontend Route Permissions — SINGLE SOURCE OF TRUTH
 *
 * Mirrors backend/src/middleware/routePermissions.js.
 * Used by (authenticated)/layout.tsx to enforce role-based access
 * at the page level, and by RequireRole to show/hide UI elements.
 *
 * To change access for any route, update both this file AND the backend config.
 */

export type Role = 'admin' | 'salesman' | 'customer';

const routePermissions = {
  // Routes that are accessible without authentication
  public: ['/login'],

  // Page path → allowed roles
  // Paths not listed here: any authenticated user
  routes: {
    '/dashboard':   ['admin'] as Role[],
    '/inventory':   ['admin'] as Role[],
    '/users':       ['admin'] as Role[],
    '/credit-notes':['admin'] as Role[],
    '/reports':     ['admin'] as Role[],
    '/settings':    ['admin'] as Role[],
    // /bookings (list) is admin-only, but /bookings/[id] is shared
    '/bookings':    ['admin'] as Role[],
  },
};

export default routePermissions;

/**
 * Returns the default landing page for a given role after login.
 */
export function getHomeRoute(role: Role | null | undefined): string {
  switch (role) {
    case 'admin':     return '/dashboard';
    case 'salesman':  return '/home';
    case 'customer':  return '/home';
    default:          return '/login';
  }
}

/**
 * Check if a role is allowed to access a given path.
 * @param path - The pathname (e.g. '/dashboard')
 * @param role - The user's role
 * @returns true if allowed
 */
export function isAllowed(path: string, role: Role | null | undefined): boolean {
  if (!role) return false;

  // Exact match only — prefix matching caused /bookings/[id] to incorrectly
  // inherit the /bookings admin-only rule. Each route must be listed explicitly
  // if its sub-paths also need restriction.
  for (const [routePath, allowedRoles] of Object.entries(routePermissions.routes)) {
    if (path === routePath) {
      return allowedRoles.includes(role);
    }
  }

  // Not listed → any authenticated user is allowed
  return true;
}

