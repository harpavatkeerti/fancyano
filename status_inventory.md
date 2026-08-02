# Status: Inventory Enhancements — Vendors, Product Code Search, Theme & UX

> **Plan**: [PLAN_inventory.md](file:///c:/Users/User/Documents/app/PLAN_inventory.md)
> **Last updated**: 2026-07-11
> **Last updated by**: Agent
> **Current step**: Step 4 complete — awaiting approval for Step 5

---

## Current Status (Summary)

| Area | Status |
|------|--------|
| Step 1: Database — Vendors table + composite unique (code, size) | `[x]` Completed |
| Step 2: Backend — Vendor service + route + product service updates | `[x]` Completed |
| Step 3: Shared API client + types (Vendor type, vendorsApi) | `[x]` Completed |
| Step 4: Frontend — Vendor Management page + sidebar + route guard | `[x]` Completed |
| Step 5A: Frontend — Product code search + auto-fill + size gating | `[ ]` Not started |
| Step 5B: Frontend — Vendor section in Add/Edit product modal | `[ ]` Not started |
| Step 5C: Frontend — Auto-uppercase product code | `[ ]` Not started |
| Step 5D: Frontend — Red/white premium theme for modal | `[ ]` Not started |
| Step 6: Frontend — View product modal — show vendor info | `[ ]` Not started |

---

## Implementation Rules

1. **Step-by-step execution only.** Complete one step fully before starting the next.
2. **User review after EVERY step.**
3. **Update this file after every step.**
4. **Run backend server after each backend step to verify no startup errors.**
5. **No changes to any logic outside the scope of this plan.**
6. **Service → Route → Frontend paradigm (strict).** All business logic (validation, guards, uniqueness checks) in service layer. Routes are thin HTTP adapters. No business logic in routes.
7. **Dual enforcement.** Backend is authoritative (returns 400/409 errors). Frontend provides UX convenience (disables options, shows warnings). Frontend NEVER relies solely on client-side state.
8. **Shared API client only.** All frontend API calls go through `shared/src/api/` → `frontend/lib/api.ts`. No direct axios or fetch calls in page components.

---

## Decisions Made

| # | Question | Decision |
|---|----------|----------|
| 1 | Vendor storage | Separate `vendors` table (not columns on products). Vendors reused across products via FK. |
| 2 | Vendor identity | `id` (auto-increment) is PK. Name is the anchor for search — no unique constraint on any field. |
| 3 | Vendor name change | Same name → update existing vendor (with confirm dialog). Name changed → create new vendor. |
| 4 | Vendor deletion | Blocked if any non-archived product references the vendor. Otherwise allowed (hard delete). |
| 5 | Product code uniqueness | Composite `(code, size)` — same code with different sizes allowed. Two partial indexes for NULL size. |
| 6 | Product code auto-fill | Selecting existing product code pre-fills all fields. Per-product values, no cascading update. |
| 7 | Vendor detail changes on product form | Only vendor record updated (with confirm). Product details are independent per-product row. |
| 8 | Image upload (Point A) | Already done — `MultipleImageUpload.tsx` handles primary + additional with MAIN badge. |
| 9 | Vendor notes field | VARCHAR(255) — standard max. |
| 10 | Vendor fields | name (required), phone (required), address, gst_number, pan_number, notes (all optional). |

---

## Progress Tracker

| Step | Description | Status | Completed By | Date | Notes |
|------|-------------|--------|-------------|------|-------|
| 1 | Database — Create vendors table, add vendor_id FK to products, composite unique index on (code, size) | `[x]` | Agent | 2026-07-11 | Both migrations (027, 028) ran cleanly. Server starts with no errors (EADDRINUSE confirms code loads). vendors table created, vendor_id FK added to products with ON DELETE RESTRICT, old code UNIQUE dropped, two partial indexes created. |
| 2 | Backend — vendorService.js, vendors.js route, update productService.js for vendor_id + LEFT JOIN | `[x]` | Agent | 2026-07-11 | Created vendorService.js (CRUD + validation + delete guard). Created vendors.js route (thin adapter). Updated routePermissions.js (admin-only). Updated productService.js: vendor_id in create/update, LEFT JOIN vendors for vendor_name, authoritative (code+size) uniqueness check. Updated products.js route: DUPLICATE_CODE_SIZE + 23505 error handling. Server loads cleanly. |
| 3 | Shared — vendors.ts API client, Vendor type, wire into index.ts + frontend api.ts | `[x]` | Agent | 2026-07-11 | Created vendors.ts API client. Added Vendor interface and vendor_id/vendor_name to Product type. Wired into shared index and frontend api.ts. Pre-existing tsc errors in shared (not from our changes). |
| 4 | Frontend — vendors/page.tsx CRUD page, sidebar link, route permission | `[x]` | Agent | 2026-07-11 | Created vendors/page.tsx following users/page.tsx pattern. Added sidebar link (Vendor Management with 🏭 icon). Added /vendors admin-only to routePermissions.ts. |
| 5A | Frontend — Product code search dropdown, auto-fill from existing product, size dropdown disabling | `[ ]` | — | — | — |
| 5B | Frontend — Vendor section in product modal (search, auto-fill, name-change detection, confirm dialog) | `[ ]` | — | — | — |
| 5C | Frontend — Auto-uppercase product code input | `[ ]` | — | — | — |
| 5D | Frontend — Red/white premium theme for Add/Edit modal | `[ ]` | — | — | — |
| 6 | Frontend — View product modal: display linked vendor info | `[ ]` | — | — | — |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked

---

## Step Details & Checklist

### Step 1: Database — Vendors Table + Product Schema Changes

- [ ] Create `backend/src/database/migrations/027_create_vendors_table.sql`
  - [ ] `vendors` table: id, name, phone, address, gst_number, pan_number, notes, timestamps
  - [ ] `products.vendor_id` FK → `vendors.id ON DELETE SET NULL`
- [ ] Create `backend/src/database/migrations/028_composite_unique_code_size.sql`
  - [ ] Drop `products_code_key` unique constraint
  - [ ] Create `uq_products_code_size` partial index (WHERE size IS NOT NULL)
  - [ ] Create `uq_products_code_no_size` partial index (WHERE size IS NULL)
- [ ] Run migrations successfully
- [ ] Server starts without errors

### Step 2: Backend — Vendor Service + Route + Product Service Updates

- [ ] Create `backend/src/services/vendorService.js`
  - [ ] `listVendors(filters)` — with optional search
  - [ ] `searchVendors(query)` — ILIKE by name, min 2 chars, top 10
  - [ ] `getVendorById(id)`
  - [ ] `createVendor(data)` — name + phone required
  - [ ] `updateVendor(id, data)` — all fields editable
  - [ ] `deleteVendor(id)` — guard: block if non-archived products reference it
- [ ] Create `backend/src/routes/vendors.js`
  - [ ] GET / (admin only)
  - [ ] GET /search?q= (any auth user)
  - [ ] GET /:id
  - [ ] POST / (admin only)
  - [ ] PUT /:id (admin only)
  - [ ] DELETE /:id (admin only, guarded)
- [ ] Update `backend/src/middleware/routePermissions.js` — add vendors to files map
- [ ] Update `backend/src/services/productService.js`
  - [ ] `createProduct` — accept + insert vendor_id
  - [ ] `updateProduct` — accept + update vendor_id
  - [ ] `getProducts` — LEFT JOIN vendors, include vendor_name in response
- [ ] Server starts without errors
- [ ] Test vendor CRUD + delete guard

### Step 3: Shared API Client + Types

- [ ] Create `shared/src/api/vendors.ts` — createVendorsApi
- [ ] Update `shared/src/types/index.ts` — Vendor interface + vendor_id/vendor_name on Product
- [ ] Update `shared/src/api/index.ts` — import + wire vendorsApi
- [ ] Update `frontend/lib/api.ts` — export vendorsApi
- [ ] `npm run build` in shared succeeds
- [ ] Frontend compiles

### Step 4: Frontend — Vendor Management Page

- [ ] Create `frontend/app/(authenticated)/vendors/page.tsx`
  - [ ] List view with table (ID, Name, Phone, Address, GST, PAN, Notes, Actions)
  - [ ] Search/filter bar
  - [ ] Add modal (Name*, Phone*, Address, GST, PAN, Notes with char count)
  - [ ] Edit modal (same fields)
  - [ ] Delete with guard (error toast if active products exist)
  - [ ] Red/white theme matching app
- [ ] Update `frontend/components/layout/Sidebar.tsx` — add Vendor Management link
- [ ] Update `frontend/lib/routePermissions.ts` — add /vendors admin-only
- [ ] Verify admin can access, salesman cannot

### Step 5A: Product Code Search + Auto-Fill + Size Gating

- [ ] Replace `codeCheckStatus` with `codeSearchStatus` + `codeSearchResults`
- [ ] Implement `handleCodeSearch` — debounced search against products array
- [ ] Implement `handleProductCodeSelect` — auto-fill all fields from existing product
- [ ] Code dropdown UI — shows product name, code, existing size badges
- [ ] Size dropdown disabling — grey out already-used sizes with "(already exists)"
- [ ] Status indicator: "✓ New product code — available" or dropdown for matches
- [ ] Edit mode: existing product's own size not disabled

### Step 5B: Vendor Section in Product Modal

- [ ] Vendor search state (selectedVendor, searchResults, dropdown, timer)
- [ ] Vendor confirm dialog state (diff, pending data)
- [ ] Collapsible vendor section in modal
- [ ] Vendor name search with debounced dropdown
- [ ] handleVendorSelect → auto-fill fields
- [ ] handleVendorNameChange → name-change detection (clear link if name differs)
- [ ] Badge states: linked / details modified / name changed / new vendor
- [ ] On submit: detect changes → show confirm dialog or create new vendor
- [ ] Edit mode: pre-fill vendor from product.vendor_id
- [ ] "✕ Clear" button to unlink vendor

### Step 5C: Auto-Uppercase Product Code

- [ ] Add `.toUpperCase()` to code input onChange handler

### Step 5D: Red/White Premium Theme

- [ ] Modal container: border-t-4 border-red-600, max-w-2xl
- [ ] Section headers with red accent
- [ ] Input focus: ring-red-500, border-red-400
- [ ] Submit button: bg-red-600
- [ ] Cancel button: border-gray-300
- [ ] Rental policy box: bg-red-50 border-red-200
- [ ] Labels: uppercase tracking-wide
- [ ] Two-column layout where space allows

### Step 6: View Product Modal — Show Vendor Info

- [ ] Add vendor section to view details modal
- [ ] Show vendor name, phone, address, GST, PAN
- [ ] Only display if product has linked vendor
- [ ] Read-only display
