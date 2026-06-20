# Login System Architecture

> **Plan**: [PLAN_auth.md](./PLAN_auth.md)
> **Last updated**: 2026-06-20

---

## Overview

The app uses a JWT-based authentication system with role-based access control (RBAC). All three user types — admin, salesman, customer — log in through a single `/login` page.

---

## Flow

```
User visits any page
    └─ AuthProvider (in layout.tsx) reads localStorage
        ├─ Token missing or expired? → redirect to /login
        └─ Token valid?
            ├─ Set auth context (user, role, token)
            └─ Allow render → (authenticated)/layout.tsx checks route permissions
                ├─ Role not allowed for this route? → redirect to home
                └─ Role allowed? → render page with AppLayout
```

### Login Flow

1. User submits username + password on `/login`
2. Frontend calls `POST /api/auth/login`
3. Backend checks bcrypt hash, returns `{ token, user, expiresAt }`
4. Frontend stores in localStorage:
   - `auth_token` — signed JWT
   - `auth_user` — `{ id, name, username, role }`
   - `auth_expires_at` — Unix timestamp (ms), 24 hours from login
5. Frontend redirects: admin → `/dashboard`, salesman/customer → `/home`

---

## Storage

| Key | Type | Contents |
|-----|------|----------|
| `auth_token` | string | JWT (signed with `JWT_SECRET`) |
| `auth_user` | JSON string | `{ id, name, username, role }` |
| `auth_expires_at` | number string | Unix ms timestamp |

**Session duration**: 24 hours (configurable via `JWT_EXPIRY_HOURS` env var).

On logout: all three keys are cleared. Cross-tab logout is detected via the `storage` event.

---

## Backend

### Middleware

| File | Purpose |
|------|---------|
| `src/middleware/auth.js` | `verifyToken` — validates JWT, attaches `req.user = { userId, role, name }` |
| `src/middleware/requireRole.js` | `requireRole(...roles)` — returns 403 if `req.user.role` not in allowed roles |
| `src/middleware/routePermissions.js` | Centralized config: public routes + role-restricted routes |

### Route Protection

```
Public (no auth):         /api/auth/*, /api/health
Admin-only:               /api/users, /api/settings, /api/policies,
                          /api/credit-notes, /api/setup, /api/auto-cancel
Inline admin-only:        DELETE /api/bookings/:id
Any authenticated user:   all other /api/* routes
```

### Passwords

- Stored as bcrypt hashes (salt rounds = 10)
- Mandatory for all roles
- Admin default password: `admin`
- Migration script: `src/database/migrations/023_hash_passwords.js`

---

## Frontend

### Key Files

| File | Purpose |
|------|---------|
| `lib/authContext.tsx` | `AuthProvider` + `useAuth()` hook — global auth state |
| `lib/routePermissions.ts` | Centralized frontend route-role config |
| `components/common/RequireRole.tsx` | Role-gated UI: `mode="page"` redirects, `mode="element"` hides |
| `lib/apiInterceptor.ts` | Axios interceptor: attaches `Authorization: Bearer <token>`, handles 401 |
| `lib/authApi.ts` | `login()`, `verify()` API calls |
| `app/login/page.tsx` | Single login page for all roles |

### Route Structure

```
/login                    Public — single login page for all roles
/                         Redirects: admin → /dashboard, salesman/customer → /home
/dashboard                Admin only
/inventory                Admin only
/bookings                 All authenticated
/bookings/[id]            All authenticated (role-conditional UI)
/credit-notes             Admin only
/users                    Admin only
/complaints               All authenticated
/reports                  Admin only
/settings                 Admin only
/home                     Salesman / Customer (admin can access — superset)
/products                 All authenticated
/products/[id]            All authenticated
/cart                     All authenticated
/my-bookings              All authenticated
/customer-bookings        All authenticated
```

### Layout

- **Top horizontal nav bar**: rendered for ALL roles
- **Left sidebar**: rendered for **admin only**
- `AppLayout.tsx` handles both — checks role from `useAuth()`

### useAuth() Hook

```ts
const auth = useAuth();
// Available fields:
auth.user           // { id, name, username, role } | null
auth.token          // JWT string | null
auth.isLoading      // true while localStorage is being read on mount
auth.isAuthenticated
auth.isAdmin
auth.isSalesman
auth.isCustomer
auth.hasRole('admin', 'salesman')  // true if user has any of the listed roles
auth.login(token, user, expiresAt)
auth.logout()
```

### Coding Convention (authenticated pages)

```tsx
// At top of any (authenticated)/ page component:
const auth = useAuth();
if (!auth.user) return null;   // TypeScript narrowing — unreachable in practice
const currentUser = auth.user; // type: AuthUser (not null)

// ✅ Correct
const userName = currentUser.name;
const role     = currentUser.role;

// ❌ Wrong — never use these inside (authenticated)/ pages
auth.user?.name ?? 'Staff'  // hides real bugs
auth.user!.name             // bypasses TypeScript
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Production: yes | `dev-secret-change-in-production` | JWT signing secret |
| `JWT_EXPIRY_HOURS` | No | `24` | Token lifetime in hours |
