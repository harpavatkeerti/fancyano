# Implementation Plan: Unified Auth, RBAC & Route Restructuring

> **Status**: [status_auth.md](file:///c:/Users/User/Documents/app/status_auth.md)

---

## Overview

Unify the three separate portals (admin, salesman, customer) into a single route structure with role-based access control. Replace the current localStorage-only "login" with a proper JWT-based session system. Create a generic authorization layer — one in the backend (JWT middleware + role middleware), one in the frontend (AuthProvider context + RequireRole component) — single point of control in each, no code duplication.

> [!CAUTION]
> **Critical rule**: This is an auth + routing change ONLY. No actual code logic changes. No API behavior or frontend functionality can be touched for anything other than auth / routing logic. All existing tests can only be updated with auth changes, nothing else. All existing tests must continue to pass. Additional tests must be written to cover auth cases for all APIs.

### Current State

| Aspect | Current |
|--------|---------|
| Route structure | `/admin/...`, `/salesman/...`, `/customer/...` — three separate trees |
| Login | Each layout has its own login modal; stores `admin_user`, `salesman_user`, `customer_user` in localStorage |
| Session expiry | None — localStorage persists forever |
| Password handling | Plain-text comparison (`user.password !== password`); optional for some users |
| Backend auth | Zero protection — all API routes are open, no middleware checks |
| Role checking | Frontend-only: each layout checks `role` from localStorage; easily spoofable |
| Booking detail page | Separate `admin/bookings/[id]/page.tsx` (1327 lines) and `salesman/order-details/[id]/page.tsx` (1693 lines) with massive code duplication |
| Page access control | Implicit: only pages under `/admin/` show admin features |

### Target State

| Aspect | Target |
|--------|---------|
| Route structure | `/login`, `/dashboard`, `/bookings`, `/bookings/[id]`, `/inventory`, `/users`, `/credit-notes`, `/complaints`, `/reports`, `/settings`, `/products`, `/cart`, `/my-bookings`, `/customer-bookings` |
| Login | Single `/login` page → calls `POST /api/auth/login` → receives JWT → stored in localStorage with expiry timestamp |
| Session expiry | 24-hour default (configurable); frontend checks expiry on every navigation; backend rejects expired tokens |
| Password handling | bcrypt hashing; passwords mandatory for all roles; migration hashes existing passwords; admin default password = `admin` |
| Backend auth | JWT middleware on all `/api/*` routes (except `/api/auth/login`, `/api/health`); extracts `userId` + `role` from token |
| Role checking | Backend: centralized route-permission config + `requireRole()` middleware; Frontend: `AuthProvider` context + `useAuth()` hook + `<RequireRole>` wrapper |
| Booking detail page | Single shared `/bookings/[id]/page.tsx` — role-based conditional rendering for admin-specific features |
| Page access control | Centralized route-permission config (single source of truth); admin access is a strict superset of salesman/customer |

---

## Design Decisions & Options Analysis

### 1. Where to Store Session Token on Frontend

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. localStorage + expiry timestamp** | Simple; survives browser restart; works with SSR/CSR | Accessible to XSS; must manually check expiry | ✅ **Chosen** |
| B. httpOnly cookie | Immune to XSS; automatic expiry; sent with every request | Requires CORS cookie config; complicates dev (different ports); CSRF risk | Too complex for current setup |
| C. sessionStorage | Tab-scoped; auto-cleared on close | Doesn't survive browser restart; bad UX for 24hr session | ❌ |

**Why localStorage**: The app already uses localStorage extensively. httpOnly cookies would be ideal for production but require significant CORS/proxy changes (frontend on :3000, backend on :3001). We mitigate the risk by:
- Setting explicit `expiresAt` timestamp and checking it on every route change
- Storing only the JWT (not raw user data) — the token itself expires server-side too
- Keeping the `user` object (id, name, role) alongside the token for quick UI reads

> [!NOTE]
> **Decided**: localStorage confirmed by user. Simpler, matches current pattern, sufficient for this use case.

### 2. JWT vs Simple Token

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. JWT (signed, stateless)** | Stateless; no DB lookup per request; standard; includes role + userId in payload | Requires `jsonwebtoken` dep; can't revoke without blocklist | ✅ **Chosen** |
| B. Random token stored in DB | Revocable; simple | DB lookup on every request; need a `sessions` table | Overkill |

**JWT structure**: `{ userId, role, name, iat, exp }` — signed with a server-side secret. Backend middleware decodes and attaches `req.user`. Expiry is set to 24h (configurable via env var `JWT_EXPIRY_HOURS`).

### 3. Password Hashing

Currently passwords are stored and compared in plain text. We will migrate to **bcrypt**.

- **Passwords are mandatory** for all roles (admin, salesman, customer).
- **Default admin password**: For first use, set admin's password to `admin` (hashed with bcrypt). Admin can then change passwords from User Management.
- **Migration**: A one-time script that reads all users, hashes existing passwords with bcrypt. Users without passwords get a temporary password set (e.g., their username) so they can log in, then admin changes it.
- **Login flow**: `bcrypt.compare(inputPassword, storedHash)`.
- **New users**: `bcrypt.hash(password, 10)` before INSERT.
- **User Management**: Admin must be able to set username + password when creating users, and update/reset passwords for existing users.

> [!WARNING]
> **Breaking change**: After the migration, plain-text passwords won't work anymore. All existing users with passwords will need to use the same password they had before (the hash is of the same value).

### 4. Backend Authorization Architecture

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. Express middleware chain** | Clean; composable; `router.use(auth)` then `router.use(requireRole('admin'))` | Slightly more boilerplate | ✅ **Chosen** |
| B. Check role inside each handler | Flexible | Code duplication; easy to forget; hard to audit | ❌ |
| C. Separate auth microservice | Scalable | Massive overkill | ❌ |

**Why router-level is sufficient (not service-level)**: In this Express architecture, the service layer (`productLifecycleService.js`, `settingsService.js`, etc.) are plain Node.js modules imported only by route files. They don't listen on any port or socket — they're internal functions. There is no way to reach them from outside without going through Express routes first. So if the router middleware blocks the request, the service never executes. Service-level auth checks would be pure redundancy.

**Implementation — Centralized Route Permission Config**:

Instead of scattering `requireRole('admin')` throughout `server.js`, we use a single centralized config object that maps API routes to allowed roles. The user can adjust permissions in one place:

```js
// middleware/routePermissions.js — SINGLE SOURCE OF TRUTH
const routePermissions = {
  // Public routes (no auth required)
  public: ['/api/auth', '/api/health'],
  
  // Route → allowed roles mapping
  // Routes not listed here default to: any authenticated user
  routes: {
    '/api/users':        ['admin'],
    '/api/settings':     ['admin'],
    '/api/policies':     ['admin'],
    '/api/credit-notes': ['admin'],
    '/api/setup':        ['admin'],
    '/api/auto-cancel':  ['admin'],
    // Add more as needed — one-line change to modify access
  }
};
```

Applied in `server.js`:
```js
// Public routes (no auth) — from config
routePermissions.public.forEach(path => app.use(path, require(routeForPath(path))));

// All other routes require authentication
app.use('/api', verifyToken);

// Apply role restrictions from config
for (const [path, roles] of Object.entries(routePermissions.routes)) {
  app.use(path, requireRole(...roles), require(routeForPath(path)));
}

// Remaining routes: any authenticated user
// ... registered normally
```

Some routes need finer control (e.g., DELETE booking is admin-only, but GET booking is for any authenticated user). For these, `requireRole` is applied at the individual route level inside the router file, but the decision of which routes need this is documented in the same config file as comments.

### 5. Frontend Authorization Architecture

**`AuthProvider` (React Context)**:
- Wraps the entire app in `layout.tsx`
- On mount: reads `auth_token` + `auth_user` + `auth_expires_at` from localStorage
- If token exists and not expired → sets user in context
- If token missing or expired → redirects to `/login`
- Provides: `user`, `role`, `isAdmin`, `isSalesman`, `isCustomer`, `logout()`, `hasRole()`
- Listens for storage events (cross-tab logout)

**`useAuth()` hook**:
- Returns the auth context
- Used by any component to check current role

**`<RequireRole roles={['admin']}>`**:
- Generic wrapper component for conditional rendering
- **Page-level use**: Wraps entire page content. If user lacks the role → redirects to their home page (not just blank screen)
- **Inline/element-level use**: Wraps specific UI elements (buttons, sections). If user lacks the role → renders nothing (element simply doesn't appear). Example: wrapping "Generate Invoice" button — salesman just never sees it

**Frontend Route Permission Config** (mirrors backend config):
```ts
// lib/routePermissions.ts — SINGLE SOURCE OF TRUTH for frontend
const routePermissions: Record<string, string[]> = {
  '/dashboard':        ['admin'],
  '/inventory':        ['admin'],
  '/credit-notes':     ['admin'],
  '/users':            ['admin'],
  '/reports':          ['admin'],
  '/settings':         ['admin'],
  // Routes not listed: any authenticated user
};
```

**Route protection**:
- The `AuthProvider` in `layout.tsx` handles redirect to `/login` for unauthenticated users
- The `(authenticated)/layout.tsx` checks the route permission config and redirects if the user's role is not in the allowed list
- Individual pages use `<RequireRole>` for inline UI elements that should only appear for certain roles

### 6. Route Restructuring Approach

**Strategy**: Move pages incrementally, starting with admin pages since those are the priority.

New route structure:
```
/login                    → Login page (public)
/                         → Redirects based on role: admin → /dashboard, salesman → /home (salesman home), customer → /home
/dashboard                → Admin only (admin dashboard with charts/stats)
/home                     → Salesman/Customer home page (product browsing, current salesman landing page)
/inventory                → Admin only
/bookings                 → All authenticated (admin sees all bookings list, salesman sees filtered)
/bookings/[id]            → All authenticated (role-based UI within the page)
/products                 → All authenticated (admin too, since admin is superset)
/cart                     → All authenticated (admin too, since admin is superset)
/credit-notes             → Admin only
/users                    → Admin only
/complaints               → All authenticated
/reports                  → Admin only
/settings                 → Admin only
/my-bookings              → Salesman, customer
/customer-bookings        → All authenticated (admin too, since admin is superset)
```

> [!NOTE]
> **Decided**: Admin access is a strict superset — admin can access every page that salesman/customer can. Top horizontal nav bar for all roles. Admin additionally gets a left sidebar. Salesman/customer do NOT get the sidebar.

---

## Step 1: Backend — JWT Auth Infrastructure

**Priority**: Critical
**Estimated scope**: Medium (5 files)
**Depends on**: Nothing

### New Dependencies

Add `jsonwebtoken` and `bcryptjs` to backend `package.json`.

#### [NEW] `backend/src/middleware/auth.js`

JWT verification middleware:
- Extracts `Authorization: Bearer <token>` header
- Decodes JWT with secret
- Attaches `req.user = { userId, role, name }` to request
- Returns 401 if token missing, invalid, or expired

#### [NEW] `backend/src/middleware/requireRole.js`

Role-checking middleware factory:
```js
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

#### [MODIFY] `backend/src/routes/auth.js`

- Add JWT token generation on successful login
- Add bcrypt password comparison (passwords mandatory — reject login if no password provided)
- Return `{ token, user, expiresAt }` instead of just `{ user }`
- Remove `role` from request body — role comes from the DB, not the client
- Add `POST /api/auth/verify` endpoint for frontend to validate token on page load
- Login requires `username` (or `name`) + `password` — no optional password anymore

#### [NEW] `backend/src/database/migrations/023_hash_passwords.js`

Node.js script (not SQL) that:
1. Reads all users from the `users` table
2. For users with existing plain-text passwords: hash with bcrypt (salt rounds = 10) and update
3. For users without passwords: set a default password (their username, hashed with bcrypt)
4. Ensure admin user exists with password `admin` (hashed) — if no admin exists, create one
5. Make password column NOT NULL after migration
6. Logs progress for each user

#### [MODIFY] `backend/src/server.js`

- Apply `verifyToken` middleware to all `/api/*` routes except public routes (from config)
- Apply role restrictions from the centralized route permission config
- Read JWT secret from `process.env.JWT_SECRET` (required in production; uses a hardcoded dev-only default in development)

### Verification

- Login with valid credentials → receive JWT token
- Call any API without token → 401
- Call admin-only API with salesman token → 403
- Call admin-only API with admin token → 200
- Call shared API with any valid token → 200
- Expired token → 401

---

## Step 2: Backend — Protect Routes by Role

**Priority**: Critical
**Estimated scope**: Medium (2 files)
**Depends on**: Step 1

#### [MODIFY] `backend/src/server.js`

Apply middleware using the centralized route permission config:

```
Public (no auth) — from routePermissions.public:
  /api/auth/*
  /api/health

Role-restricted — from routePermissions.routes:
  (Initially: /api/users, /api/settings, /api/policies, /api/credit-notes, /api/setup, /api/auto-cancel → admin only)
  (User can modify this config later without touching middleware code)

All other /api/* routes — any authenticated user:
  /api/bookings, /api/products, /api/product-tracking, /api/invoices,
  /api/payment-transactions, /api/availability, /api/complaints,
  /api/feedback, /api/lifecycle, /api/booking-preview,
  /api/product-exchanges, /api/booking-cancellation
```

#### [MODIFY] `backend/src/routes/users.js`

- All user CRUD already protected at server.js level via config
- `PUT /:id` → when updating password, hash with bcrypt before storing
- `POST /` → when creating user, require username + password, hash password before INSERT
- `GET /:id` → do NOT return password hash (admin can set/reset passwords but not view them)

#### [MODIFY] `backend/src/routes/bookings.js` (individual route protection)

- `DELETE /:id` → inline `requireRole('admin')` (finer control within shared route)
- `PUT /:id` → any authenticated user (but we attach `req.user.name` as the actor)

### Verification

- All existing backend tests should be updated to include auth headers
- Manual: try accessing `/api/users` with salesman token → 403
- Manual: try accessing `/api/bookings` with any valid token → 200

---

## Step 3: Frontend — AuthProvider, useAuth, Login Page

**Priority**: Critical
**Estimated scope**: Large (6 files)
**Depends on**: Step 1

#### [NEW] `frontend/lib/authContext.tsx`

React context providing:
```ts
interface AuthUser {
  id: number;
  name: string;
  username?: string;
  role: 'admin' | 'salesman' | 'customer';
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;           // true while checking localStorage on mount
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSalesman: boolean;
  isCustomer: boolean;
  hasRole: (...roles: string[]) => boolean;
  login: (token: string, user: AuthUser, expiresAt: number) => void;
  logout: () => void;
}
```

On mount:
1. Read `auth_token`, `auth_user`, `auth_expires_at` from localStorage
2. If `Date.now() > auth_expires_at` → clear and set `user = null`
3. Optionally call `POST /api/auth/verify` to validate token server-side
4. Set context values

On logout:
1. Clear all `auth_*` keys from localStorage
2. Also clear legacy keys (`admin_user`, `salesman_user`, `customer_user`, etc.)
3. Redirect to `/login`

#### [NEW] `frontend/components/common/RequireRole.tsx`

```tsx
interface RequireRoleProps {
  roles: string[];              // Roles allowed to see this content
  children: React.ReactNode;    // Content to show if role matches
  // When used at PAGE level: if role doesn't match, redirects to user's home page
  // When used at ELEMENT level: if role doesn't match, renders nothing (element hidden)
  mode?: 'page' | 'element';   // Default: 'element' (just hides content)
}
```

#### [MODIFY] `frontend/lib/authApi.ts`

- Update `login()` to handle new response format `{ token, user, expiresAt }`
- Add `verify(token: string)` method
- Add axios interceptor to attach `Authorization: Bearer <token>` header to all requests

#### [NEW] `frontend/lib/apiInterceptor.ts`

Axios request interceptor:
- Reads token from localStorage
- Attaches `Authorization: Bearer <token>` header
- On 401 response: clears auth state, redirects to `/login`

This should be applied to the shared axios instance used by all API calls.

#### [NEW] `frontend/app/login/page.tsx`

Single unified login page:
- Username/Name + Password fields (both required)
- No role selector — role comes from the DB
- On success: store token + user + expiresAt in localStorage, redirect based on role:
  - Admin → `/dashboard`
  - Salesman → `/home` (salesman home page)
  - Customer → `/home` (customer home page)
- Branded with FAN-C-YA-NO logo

#### [NEW] `frontend/lib/routePermissions.ts`

Centralized frontend route permission config (mirrors backend config):
- Maps route paths to allowed roles
- Routes not listed: any authenticated user
- Used by the authenticated layout to check access
- Single file to modify when access rules change

#### [MODIFY] `frontend/app/layout.tsx`

- Wrap `{children}` with `<AuthProvider>`
- AuthProvider handles redirect to `/login` for unauthenticated users (except when already on `/login`)

### Verification

- Visit any page unauthenticated → redirected to `/login`
- Login with valid admin credentials → redirected to `/dashboard`
- Login with salesman credentials → redirected to `/home` (salesman home)
- Token expires → next navigation redirects to `/login`
- Open two tabs → logout in one → other tab detects via `storage` event and redirects
- Open two tabs → login as different user in one → other tab detects role change via `storage` event and re-renders with new role
- Admin can navigate to all pages (superset access)
- Salesman cannot navigate to `/dashboard`, `/inventory`, etc. → gets redirected to `/home`

---

## Step 4: Frontend — Unified Layout with Role-Based Navigation

**Priority**: High
**Estimated scope**: Medium (4 files)
**Depends on**: Step 3

#### [MODIFY] `frontend/components/layout/Sidebar.tsx`

- Read role from `useAuth()` instead of props
- **Only rendered for admin** (sidebar is admin-only)
- Menu items: Dashboard, Inventory, Bookings, Credit Notes, Users, Complaints, Reports, Settings
- All hrefs use new flat routes (`/dashboard`, `/bookings`, `/inventory`)

#### [MODIFY] `frontend/components/layout/Header.tsx`

- Top horizontal nav bar — **rendered for ALL roles**
- Read user + role from `useAuth()` instead of localStorage
- Build nav items dynamically based on role:
  - Admin: same as sidebar links (top bar mirrors sidebar for quick access)
  - Salesman: Home, Products, Cart, My Bookings, Customer Bookings, Support
  - Customer: Home, Products, Cart, My Bookings, Support
- Logout button calls `auth.logout()`
- Remove `window.adminLogout` hack

#### [MODIFY] `frontend/components/layout/AdminLayout.tsx`

- Remove login modal (now handled by AuthProvider)
- Remove localStorage-based auth checking
- Remove `window.adminLogout` hack
- Keep sidebar + header layout structure
- Rename to `AppLayout.tsx` — role-agnostic: renders sidebar only for admin, top bar for all

#### [NEW] `frontend/app/(authenticated)/layout.tsx`

Next.js route group for all authenticated pages:
- Checks route permission config — if user's role not allowed for this route, redirects to their home page
- Renders `AppLayout` which internally shows:
  - Top horizontal nav bar (all roles)
  - Left sidebar (admin only)
- This replaces individual `admin/layout.tsx`, `salesman/layout.tsx`, `customer/layout.tsx`

### Verification

- Admin login → sees admin sidebar with all menu items
- Salesman login → sees salesman navigation
- Customer login → sees customer navigation
- All links point to new flat routes

---

## Step 5: Route Migration — Move Admin Pages to Flat Routes

**Priority**: High
**Estimated scope**: Large (8+ files)
**Depends on**: Steps 3, 4

Move pages from `/admin/...` to flat routes, wrapping each with `<RequireRole>` where needed.

| Old Route | New Route | Access (from route permission config) |
|-----------|-----------|--------|
| `/admin` (dashboard) | `/dashboard` | admin |
| `/admin/inventory` | `/inventory` | admin |
| `/admin/bookings` | `/bookings` | all authenticated |
| `/admin/bookings/[id]` | `/bookings/[id]` | all authenticated |
| `/admin/credit-notes` | `/credit-notes` | admin |
| `/admin/users` | `/users` | admin |
| `/admin/complaints` | `/complaints` | all authenticated |
| `/admin/reports` | `/reports` | admin |
| `/admin/settings` | `/settings` | admin |

For each page:
1. Move file to new location under `frontend/app/(authenticated)/...`
2. Access control handled by `(authenticated)/layout.tsx` reading from route permission config
3. Update any internal links to use new routes
4. Hard cutover — no old route redirects

### Verification

- Navigate to `/dashboard` as admin → dashboard loads
- Navigate to `/inventory` as salesman → access denied / redirect
- Navigate to `/bookings` as salesman → bookings list loads
- All internal navigation links work correctly

---

## Step 6: Unified Booking Detail Page

**Priority**: High
**Estimated scope**: Large (2 files)
**Depends on**: Steps 3, 5

This is the flagship use case: a single `/bookings/[id]` page that works for both admin and salesman.

#### [NEW] `frontend/app/(authenticated)/bookings/[id]/page.tsx`

Based on the existing `salesman/order-details/[id]/page.tsx` (the more complete, working version), with these role-based additions:

**Admin-only features** (wrapped in `<RequireRole roles={['admin']}>`):
1. **Show all products** including cancelled/exchanged (grayed out) — currently salesman filters these out
2. **Document generation** — Estimate / Invoice / Tax Invoice buttons
3. **Status update** controls
4. **Credit note** checking before status changes

**Shared features** (available to both admin and salesman):
1. Collect payment (PaymentManagement component)
2. Product exchange (ProductExchange component)
3. Product cancellation (BookingCancellation component — subject to salesman_permissions)
4. Transaction history
5. Mark Picked Up button
6. Measurements button/modal
7. Date change functionality
8. WhatsApp/Email sharing
9. Complaint/Feedback forms

**Salesman-specific restrictions**:
1. Exchange/cancellation gated by `salesman_permissions` setting (already implemented)
2. Date change only if drop date hasn't passed (already implemented)

#### [DELETE] `frontend/app/admin/bookings/[id]/page.tsx`

#### [DELETE] `frontend/app/salesman/order-details/[id]/page.tsx`

(After the unified page is verified working)

### Verification

- Admin opens booking → sees all products (including cancelled/exchanged grayed out), document buttons, all actions
- Salesman opens same booking → sees only active products, no document buttons, exchange/cancel gated by permissions
- All actions work identically to current behavior
- Navigation back button works correctly for both roles

---

## Step 7: Move Remaining Salesman & Customer Pages

**Priority**: Medium
**Estimated scope**: Large (10+ files)
**Depends on**: Steps 4, 5

Move remaining pages:

| Old Route | New Route | Access |
|-----------|-----------|--------|
| `/salesman` (home) | `/home` | all authenticated (salesman/customer landing; admin can access too) |
| `/salesman/products` | `/products` | all authenticated |
| `/salesman/products/[id]` | `/products/[id]` | all authenticated |
| `/salesman/cart` | `/cart` | all authenticated |
| `/salesman/my-bookings` | `/my-bookings` | all authenticated |
| `/salesman/customer-bookings` | `/customer-bookings` | all authenticated |
| `/salesman/complaints` | `/complaints` | all authenticated |
| `/customer` (home) | `/home` (same page, different view for customer) | all authenticated |
| `/customer/products` | `/products` | all authenticated |
| `/customer/cart` | `/cart` | all authenticated |
| `/customer/bookings` | `/my-bookings` | all authenticated |
| `/customer/complaints` | `/complaints` | all authenticated |

Page content differences by role:
- `/dashboard` → admin only (charts, stats, admin KPIs)
- `/home` → salesman/customer home (product browsing, search). Admin can access this too (superset)
- `/` → redirects: admin → `/dashboard`, salesman/customer → `/home`

### Verification

- Each page accessible by correct roles
- Each page blocked for incorrect roles
- All internal links updated
- Cart uses role-appropriate localStorage key

---

## Step 8: Cleanup — Remove Old Route Trees & Legacy Auth

**Priority**: Medium
**Estimated scope**: Medium (15+ files)
**Depends on**: Steps 5, 6, 7

1. **Delete old route directories**: `frontend/app/admin/`, `frontend/app/salesman/`, `frontend/app/customer/`
2. **Delete old home page**: `frontend/app/page.tsx` (the portal selector)
3. **Remove legacy localStorage keys**: `admin_user`, `salesman_user`, `customer_user`, `admin_name`, `salesman_name`, etc.
4. **Clean up layout components**: Remove login modals from old layouts
5. **Update LOGIN_SYSTEM.md** with new architecture
6. **Remove unused window.adminLogout** hack

### Verification

- No references to old `/admin/`, `/salesman/`, `/customer/` routes remain
- No references to legacy localStorage keys remain (except cleanup code that removes them on migration)
- All TypeScript compiles clean
- All backend tests pass

---

## File Change Summary

| File | Step | Type |
|------|------|------|
| `backend/src/middleware/auth.js` | 1 | NEW |
| `backend/src/middleware/requireRole.js` | 1 | NEW |
| `backend/src/middleware/routePermissions.js` | 1 | NEW |
| `backend/src/routes/auth.js` | 1 | MODIFY |
| `backend/src/database/migrations/023_hash_passwords.js` | 1 | NEW |
| `backend/src/server.js` | 1, 2 | MODIFY |
| `backend/package.json` | 1 | MODIFY |
| `backend/src/routes/users.js` | 2 | MODIFY |
| `backend/src/routes/bookings.js` | 2 | MODIFY |
| `frontend/lib/authContext.tsx` | 3 | NEW |
| `frontend/lib/routePermissions.ts` | 3 | NEW |
| `frontend/components/common/RequireRole.tsx` | 3 | NEW |
| `frontend/lib/authApi.ts` | 3 | MODIFY |
| `frontend/lib/apiInterceptor.ts` | 3 | NEW |
| `frontend/app/login/page.tsx` | 3 | NEW |
| `frontend/app/layout.tsx` | 3 | MODIFY |
| `frontend/components/layout/Sidebar.tsx` | 4 | MODIFY |
| `frontend/components/layout/Header.tsx` | 4 | MODIFY |
| `frontend/components/layout/AdminLayout.tsx` → `AppLayout.tsx` | 4 | MODIFY (rename) |
| `frontend/app/(authenticated)/layout.tsx` | 4 | NEW |
| `frontend/app/(authenticated)/dashboard/page.tsx` | 5 | NEW (move) |
| `frontend/app/(authenticated)/inventory/page.tsx` | 5 | NEW (move) |
| `frontend/app/(authenticated)/bookings/page.tsx` | 5 | NEW (move) |
| `frontend/app/(authenticated)/bookings/[id]/page.tsx` | 6 | NEW |
| `frontend/app/admin/bookings/[id]/page.tsx` | 6 | DELETE |
| `frontend/app/salesman/order-details/[id]/page.tsx` | 6 | DELETE |
| `frontend/app/(authenticated)/home/page.tsx` | 7 | NEW (move salesman home) |
| Multiple salesman/customer pages | 7 | MOVE |
| Old route directories | 8 | DELETE |

---

## Decisions Made

| # | Question | Decision |
|---|----------|----------|
| 1 | Layout per role | Top horizontal nav bar for ALL roles. Left sidebar for admin ONLY. Admin access is a strict superset of salesman/customer. |
| 2 | Session storage | localStorage with expiry timestamp |
| 3 | Customer auth | Password-based login for all roles (admin, salesman, customer). Passwords encrypted with bcrypt. |
| 4 | Password requirement | Mandatory for all roles. Admin default password = `admin`. Admin manages all user credentials via User Management. |
| 5 | Backward compatibility | Hard cutover. No old route redirects. |

---

## Execution Rules

1. **Step-by-step execution only.** Complete one step fully before starting the next.
2. **User review after EVERY step.**
3. **Update [status_auth.md](file:///c:/Users/User/Documents/app/status_auth.md) after every step.**
4. **Run backend tests after each backend step.**
5. **Use WSL for all terminal commands.**
6. **⚠️ AUTH + ROUTING CHANGES ONLY.** No actual code logic changes. No API behavior or frontend functionality can be modified for anything other than auth / routing. All existing tests can only be updated to add auth headers — no other test changes allowed. All existing tests must continue to pass.
7. **Write new auth tests.** Additional tests must be written to cover: unauthenticated access (401), unauthorized role access (403), authorized access (200), token expiry, and role-specific endpoint protection for ALL APIs.
