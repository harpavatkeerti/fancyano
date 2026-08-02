# PLAN: Inventory Enhancements — Vendors, Product Code Search, Theme & UX

> **Status**: [status_inventory.md](file:///c:/Users/User/Documents/app/status_inventory.md)

---

## Overview

Enhance the Inventory module with four interconnected improvements:

1. **Vendor management** — new `vendors` table, admin-only CRUD page in sidebar, vendor search/auto-fill when adding a product
2. **Product code search + auto-fill** — type a product code → dropdown shows existing products → select to auto-fill details + disable already-used sizes
3. **Red/white premium theme** for the Add/Edit product modal
4. **Auto-uppercase** product code field

> [!NOTE]
> **Image upload (Point A)** was already implemented — `MultipleImageUpload.tsx` now handles primary + additional images with drag-to-reorder, "MAIN" badge, and "★ Set as Main" controls. No further work needed.

---

## Architecture & Enforcement Rules

> [!IMPORTANT]
> These rules apply to **every step** in this plan. Violations are not acceptable.

### 1. Service → Route → Frontend paradigm (strictly enforced)

```
Database (constraints)  ←  Service (business logic)  ←  Route (HTTP thin layer)  ←  Shared API client  ←  Frontend
```

- **Service layer** (`vendorService.js`, `productService.js`) contains ALL business logic: validation, guards, uniqueness checks, DB queries
- **Route layer** (`vendors.js`, `products.js`) is a thin HTTP adapter: parse request → call service → send response. **No business logic in routes.**
- **Frontend** calls the backend via the **shared API client** (`@rental/shared` → `vendorsApi`, `productsApi`). **No direct axios calls.** All API functions must be defined in `shared/src/api/` and wired through `shared/src/api/index.ts`.

### 2. Dual enforcement — backend is authoritative, frontend is UX

| Constraint | Backend (authoritative) | Frontend (UX convenience) |
|---|---|---|
| Code + size uniqueness | `productService.createProduct` does explicit `SELECT` check before INSERT. DB partial indexes as safety net. Returns 409 with clear message. | Product code search shows existing sizes; size dropdown disables used sizes. Prevents most duplicates before submit. |
| Vendor delete guard | `vendorService.deleteVendor` queries products table, throws if non-archived products exist. | Frontend shows error toast from 409 response. |
| Vendor required fields | `vendorService.createVendor` validates name + phone are present, returns 400 if missing. | Frontend form marks Name* and Phone* as required, disables submit. |
| Sizeless product uniqueness | DB `uq_products_code_no_size` index + service-layer check. Returns 409. | Frontend code search shows "code already exists (no size variant possible)". |

**The frontend NEVER relies solely on client-side state for enforcement.** It is always a UX optimization. If the frontend check is bypassed (e.g. race condition, direct API call), the backend must independently catch and reject the violation.

### 3. No direct axios calls from frontend

All API interactions must flow through:
```
frontend/lib/api.ts  →  @rental/shared  →  shared/src/api/vendors.ts (or products.ts, etc.)
```

Never `import axios from 'axios'` or `fetch()` directly in a page component.

---

## Design Decisions

### 1. Vendor Identity — Name is the anchor key

Unlike customers (identified by unique phone), vendors have **no unique constraint** on any field. Instead:

- **Vendor `id`** (auto-increment) is the real PK and FK used internally
- When adding a product:
  - **Search by name** → debounced dropdown with matching vendors
  - **Select a vendor** → auto-fill all fields (phone, address, GST, PAN, notes)
  - **If vendor details are changed but name stays the same** → confirm dialog: *"Vendor details differ from saved record. Update vendor?"* (shows old → new diff)
  - **If vendor name is changed** → new vendor will be created when the product is saved

In the UI this is communicated via a clear badge:
- After selecting a vendor from dropdown: `✓ Linked to vendor: ABC Traders (ID #5)` with a "✕ Clear" button
- If name is then edited: badge changes to `⚠ Vendor name changed — a new vendor will be created`
- If only other details change: badge changes to `ℹ Vendor details modified — saved vendor record will be updated`

### 2. Product Code Search — Pre-fill + Size Gating

This replaces the current "duplicate code" check with a more intelligent flow:

- As user types a product code → debounced search against loaded products
- If matches found → dropdown showing: product name, code, sizes already added
- Select one → auto-fill: name, purchase_price, rent, security_deposit, category, gender, images, vendor_id (and display vendor details)
- **Size dropdown disabling**: existing sizes for that code are disabled (greyed out with "(already exists)" label) — this naturally enforces (code + size) uniqueness
- User can still manually change any pre-filled detail — these are **per-product values** (no cascading update to other products with the same code)

### 3. Vendor Deletion Guard

A vendor **cannot be deleted** if any non-archived product references it (`WHERE vendor_id = $1 AND status != 'archived'`). Same paradigm as user delete guard with active booking check.

### 4. DB Unique Constraint Change

The `products` table currently has `code VARCHAR(100) UNIQUE NOT NULL`. This must be changed to a **composite unique index** on `(code, size)` to allow same code with different sizes. Two partial indexes handle the NULL size case:
- `uq_products_code_size` — for products WITH a size
- `uq_products_code_no_size` — for products WITHOUT a size (e.g. Artificial Jewelleries)

### 5. Vendor in Edit Mode

When editing an existing product, the vendor section shows the currently linked vendor (pre-filled). Same name-change detection logic applies: change name → new vendor created; change other details → update existing vendor (with confirmation).

---

## Step 1: Database — Vendors Table + Product Schema Changes

**Priority**: Critical (all other steps depend on this)  
**Scope**: 2 migration files

### Changes

#### [NEW] `backend/src/database/migrations/027_create_vendors_table.sql`

```sql
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT,
  gst_number VARCHAR(20),
  pan_number VARCHAR(15),
  notes VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE RESTRICT;
```

> [!NOTE]
> `ON DELETE RESTRICT` (not `SET NULL`) — enforces the deletion guard at the DB level too. The service layer checks first and gives a user-friendly 409, but if bypassed, the DB constraint prevents orphaning.

#### [NEW] `backend/src/database/migrations/028_composite_unique_code_size.sql`

```sql
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_code_size
  ON products (LOWER(code), LOWER(size))
  WHERE size IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_code_no_size
  ON products (LOWER(code))
  WHERE size IS NULL;
```

### Verification
- Run migrations
- Server starts without errors
- `\d vendors` and `\d products` show expected schema

---

## Step 2: Backend — Vendor Service + Route + Product Service Updates

**Priority**: Critical  
**Depends on**: Step 1

### Changes

#### [NEW] `backend/src/services/vendorService.js`

All business logic lives here. Routes are thin HTTP adapters.

```
class VendorService {
  listVendors(filters)       — GET all, optional name/phone search
  searchVendors(query)       — ILIKE search by name, min 2 chars, returns top 10
  getVendorById(id)          — GET by ID, throws 404 if not found
  createVendor(data)         — Validates name+phone required (400 if missing), then INSERT
  updateVendor(id, data)     — Validates vendor exists (404), then UPDATE all fields
  deleteVendor(id)           — Guard: block if any non-archived product references this vendor (409), then DELETE
}
```

**Validation in service layer (NOT in route):**
- `createVendor`: `if (!name || !phone) throw { status: 400, message: 'Name and phone are required' }`
- `deleteVendor` guard: `SELECT 1 FROM products WHERE vendor_id = $1 AND status != 'archived' LIMIT 1` → 409 if found

#### [NEW] `backend/src/routes/vendors.js`

All endpoints are admin-only (since inventory/product creation is admin-only, no other role needs vendor access).

```
GET    /api/vendors           — list all
GET    /api/vendors/search?q= — search by name
GET    /api/vendors/:id       — get details
POST   /api/vendors           — create
PUT    /api/vendors/:id       — update
DELETE /api/vendors/:id       — delete (guarded)
```

#### [MODIFY] `backend/src/middleware/routePermissions.js`

Add to `routes` (admin-only):
```js
'/api/vendors': ['admin'],
```

Add to `files` map:
```js
'/api/vendors': 'vendors',
```

#### [MODIFY] `backend/src/services/productService.js`

- `createProduct`:
  - Accept `vendor_id`, include in INSERT query
  - **Add explicit pre-INSERT uniqueness check** (authoritative backend validation):
    ```js
    // Check (code + size) uniqueness BEFORE inserting
    const normalizedSize = size || null;
    const dupCheck = await pool.query(
      `SELECT id, size FROM products
       WHERE LOWER(code) = LOWER($1)
       AND (
         ($2::text IS NULL AND size IS NULL) OR
         ($2::text IS NOT NULL AND LOWER(size) = LOWER($2))
       )`,
      [code, normalizedSize]
    );
    if (dupCheck.rows.length > 0) {
      const err = new Error('A product with this code and size already exists');
      err.code = 'DUPLICATE_CODE_SIZE';
      throw err;
    }
    ```
  - DB partial indexes act as a safety net (catch race conditions)
- `updateProduct`:
  - Accept `vendor_id`, include in UPDATE SET clause
  - Same uniqueness check but **exclude self** (`AND id != $3`)
- `getProducts`: LEFT JOIN `vendors` to include `vendor_name` in list response
- Route handler (`products.js`): **Update existing `error.code === '23505'` handler** (line 56) to also catch the new `DUPLICATE_CODE_SIZE` custom code. The current handler returns "Product code already exists" — after this change, it should distinguish between the service-layer pre-check (custom error) and the DB safety-net (PostgreSQL 23505):
  ```js
  if (error.code === 'DUPLICATE_CODE_SIZE') {
    return res.status(409).json({ error: error.message, hint: 'duplicate_code_size' });
  }
  if (error.code === '23505') { // DB safety net
    return res.status(409).json({ error: 'A product with this code and size already exists' });
  }
  ```

### Verification
- Server starts without errors
- Test vendor CRUD via curl/Postman
- Test vendor delete guard (create product with vendor → try delete → blocked)
- Test product create with vendor_id

---

## Step 3: Shared API Client + Types

**Priority**: High  
**Depends on**: Step 2

### Changes

#### [NEW] `shared/src/api/vendors.ts`

```ts
export function createVendorsApi(api: AxiosInstance) {
  return {
    getAll: () => api.get<Vendor[]>('/vendors'),
    search: (query: string) => api.get<Vendor[]>(`/vendors/search?q=${encodeURIComponent(query)}`),
    getById: (id: number) => api.get<Vendor>(`/vendors/${id}`),
    create: (data: Omit<Vendor, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Vendor>('/vendors', data),
    update: (id: number, data: Partial<Vendor>) =>
      api.put<Vendor>(`/vendors/${id}`, data),
    delete: (id: number) => api.delete(`/vendors/${id}`),
  };
}
```

#### [MODIFY] `shared/src/types/index.ts`

Add `Vendor` interface:
```ts
export interface Vendor {
  id: number;
  name: string;
  phone: string;
  address?: string;
  gst_number?: string;
  pan_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
```

Add to `Product` interface:
```ts
vendor_id?: number;
vendor_name?: string;  // joined from vendors table
```

#### [MODIFY] `shared/src/api/index.ts`

Import and wire `createVendorsApi`.

#### [MODIFY] `frontend/lib/api.ts`

Export `vendorsApi`.

### Verification
- `npm run build` in shared succeeds
- Frontend compiles with new types

---

## Step 4: Frontend — Vendor Management Page

**Priority**: High  
**Depends on**: Step 3

### Changes

#### [NEW] `frontend/app/(authenticated)/vendors/page.tsx`

Admin-only vendor management page, following the [users/page.tsx](file:///c:/Users/User/Documents/app/frontend/app/(authenticated)/users/page.tsx) pattern:

- **List view**: Table with columns — ID, Name, Phone, Address, GST, PAN, Notes (truncated), Actions (Edit, Delete)
- **Add/Edit modal**: Form with fields — Name*, Phone*, Address, GST Number, PAN Number, Notes (textarea, maxLength=255, shows char count)
- **Delete**: Guarded — if vendor has non-archived products, show error toast
- **Search bar**: Filter vendors by name/phone
- **Theme**: Red/white to match the rest of the app

#### [MODIFY] `frontend/components/layout/Sidebar.tsx`

Add after User Management:
```ts
{ name: 'Vendor Management', href: '/vendors', icon: '🏭' },
```

#### [MODIFY] `frontend/lib/routePermissions.ts`

Add:
```ts
'/vendors': ['admin'] as Role[],
```

### Verification
- Navigate to /vendors as admin → see list page
- Add, edit, delete vendors
- Verify salesman cannot access /vendors
- Verify delete guard works (vendor with active products → error)

---

## Step 5: Frontend — Add Product Modal Enhancements

**Priority**: High  
**Depends on**: Steps 3, 4

This is the largest step — modifying [inventory/page.tsx](file:///c:/Users/User/Documents/app/frontend/app/(authenticated)/inventory/page.tsx).

### 5A: Product Code Search + Auto-Fill + Size Gating

**Replace** the current `checkCodeDuplicate` (boolean taken/available) with a richer search:

New state:
```ts
type CodeSearchStatus = 'idle' | 'searching' | 'no_match' | 'has_matches';
const [codeSearchStatus, setCodeSearchStatus] = useState<CodeSearchStatus>('idle');
const [codeSearchResults, setCodeSearchResults] = useState<Product[]>([]);
const [showCodeDropdown, setShowCodeDropdown] = useState(false);
```

**Code input behavior:**
1. User types code → auto-uppercased → debounced search (400ms) against loaded `products` array
2. If matches found → dropdown shows: product name, code, existing sizes as badges
3. Select one → auto-fill: `name`, `purchase_price`, `rent`, `security_deposit`, `category`, `gender`, `images`, `vendor_id`
4. Size dropdown → disable entries for sizes already used by this code (greyed with "(already exists)")
5. If no match → `✓ New product code — available`

**Auto-fill on select:**
```ts
function handleProductCodeSelect(existingProduct: Product) {
  setShowCodeDropdown(false);
  // Fill all product fields from the existing product
  setFormData({
    ...formData,
    name: existingProduct.name,
    code: existingProduct.code.toUpperCase(),
    purchase_price: existingProduct.purchase_price?.toString() || '',
    rent: existingProduct.rent.toString(),
    security_deposit: existingProduct.security_deposit?.toString() || '',
    category: existingProduct.category || '',
    gender: (existingProduct as any).gender || '',
    size: '',  // RESET — user picks from available sizes
    description: existingProduct.description || '',
    images: /* parse from existing product image */,
  });
  // Also populate vendor if the existing product has one
  if ((existingProduct as any).vendor_id) {
    loadAndSetVendor((existingProduct as any).vendor_id);
  }
}
```

**Size disabling (in each size `<select>`):**
```tsx
const usedSizes = products
  .filter(p => p.code.toLowerCase() === formData.code.toLowerCase()
            && p.id !== editingProduct?.id)
  .map(p => (p as any).size?.toLowerCase())
  .filter(Boolean);

<option value="38" disabled={usedSizes.includes('38')}>
  38 {usedSizes.includes('38') ? '(already exists)' : ''}
</option>
```

### 5B: Vendor Section in Add/Edit Product Modal

**Pattern**: Mirrors [cart page customer search](file:///c:/Users/User/Documents/app/frontend/app/(authenticated)/cart/page.tsx#L312-L346) and [confirm dialog](file:///c:/Users/User/Documents/app/frontend/app/(authenticated)/cart/page.tsx#L1231-L1291)

New state:
```ts
const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
const [vendorSearchResults, setVendorSearchResults] = useState<Vendor[]>([]);
const [showVendorDropdown, setShowVendorDropdown] = useState(false);
const vendorSearchTimerRef = useRef<...>(null);
// Confirm dialog for vendor updates
const [showVendorConfirmDialog, setShowVendorConfirmDialog] = useState(false);
const [vendorConfirmDiff, setVendorConfirmDiff] = useState<{field:string, old:string, new:string}[]>([]);
```

**Vendor section in modal (collapsible accordion, after Description/Sub-Category):**
```
── 🏭 Vendor Details (Optional) ──────────────────
  Vendor Name         [type to search...     ▼]
  ✓ Linked to vendor: ABC Traders (#5)  [✕ Clear]

  Phone*              [9876543210            ]
  Address             [__________________    ]
  GST Number          [22AAAAA0000A1Z5       ]
  PAN Number          [ABCDE1234F            ]
  Notes               [textarea, max 255     ]
```

**Badge states:**
| State | Badge |
|---|---|
| Vendor selected, no changes | `✓ Linked to vendor: ABC Traders (#5) [✕ Clear]` |
| Vendor selected, details changed (name same) | `ℹ Vendor details modified — saved vendor record will be updated` |
| Vendor selected, name changed | `⚠ Vendor name changed — a new vendor 'XYZ' will be created` |
| No vendor selected, name typed | `➕ New vendor 'XYZ' will be created` |
| No vendor info entered | *(section collapsed, nothing shown)* |

**Vendor name change detection:**
```ts
function handleVendorNameChange(newName: string) {
  setFormVendorName(newName);
  if (selectedVendor && newName.trim().toLowerCase() !== selectedVendor.name.trim().toLowerCase()) {
    setSelectedVendor(null); // Clears link — badge shows "new vendor will be created"
  }
  vendorSearch(newName); // trigger dropdown search
}
```

**On product submit:**
1. If `selectedVendor` exists and details changed → show confirm dialog (old→new diff) → "Update & Save" or "Keep Old"
2. If `selectedVendor` exists and details unchanged → use `vendor_id` directly
3. If no `selectedVendor` but vendor name is filled → create new vendor via `vendorsApi.create()` → get `vendor_id` → attach to product
4. If no vendor name → `vendor_id = null`

> [!NOTE]
> The vendor confirm dialog must render **outside/on top of the product modal** (same z-index pattern as the tight-schedule warning modal in cart). It should be a separate fixed overlay that appears above the product modal, not nested inside it.

### 5C: Auto-Uppercase Product Code

```tsx
onChange={(e) => {
  const newCode = e.target.value.toUpperCase();
  setFormData({ ...formData, code: newCode });
  handleCodeSearch(newCode);
}}
```

### 5D: Red/White Premium Theme for Modal

- Modal container: `border-t-4 border-red-600`, wider `max-w-2xl`
- Header: styled with product icon, subtitle text
- Section headers with red accent: `── 📦 Product Details ──────`
- Input focus rings: `focus:ring-red-500 focus:border-red-400`
- Submit button: `bg-red-600 hover:bg-red-700 text-white`
- Cancel button: `border border-gray-300 text-gray-700`
- Rental policy box: `bg-red-50 border-red-200`
- Labels: `text-xs uppercase tracking-wide font-semibold text-gray-600`
- Two-column layout where space allows (code + size side-by-side, rent + security side-by-side)

### Verification
- Add product with existing code → auto-fill works, sizes disabled
- Add product with vendor search → select vendor → modify phone → confirm dialog shows
- Change vendor name → badge changes to "new vendor will be created"
- Submit → new vendor created, product linked
- Product code auto-uppercases
- Modal looks premium with red/white theme
- Edit existing product → vendor pre-filled, code search pre-filled

---

## Step 6: View Product Modal — Show Vendor Info

**Priority**: Medium  
**Depends on**: Step 5

#### [MODIFY] `inventory/page.tsx` — View Details modal

Add vendor section to the product detail view modal:
```
── 🏭 Vendor ──────────────────
  ABC Traders
  📞 9876543210
  📍 123 Market Road, Surat
  GST: 24AABCU9603R1ZM
```

Only shown if the product has a linked vendor. Read-only display.

### Verification
- View product with vendor → vendor section visible
- View product without vendor → section hidden

---

## Files Touched — Summary

| File | Type | Step |
|---|---|---|
| `backend/src/database/migrations/027_create_vendors_table.sql` | **NEW** | 1 |
| `backend/src/database/migrations/028_composite_unique_code_size.sql` | **NEW** | 1 |
| `backend/src/services/vendorService.js` | **NEW** | 2 |
| `backend/src/routes/vendors.js` | **NEW** | 2 |
| `backend/src/middleware/routePermissions.js` | **MODIFY** | 2 |
| `backend/src/services/productService.js` | **MODIFY** | 2 |
| `shared/src/api/vendors.ts` | **NEW** | 3 |
| `shared/src/types/index.ts` | **MODIFY** | 3 |
| `shared/src/api/index.ts` | **MODIFY** | 3 |
| `frontend/lib/api.ts` | **MODIFY** | 3 |
| `frontend/app/(authenticated)/vendors/page.tsx` | **NEW** | 4 |
| `frontend/components/layout/Sidebar.tsx` | **MODIFY** | 4 |
| `frontend/lib/routePermissions.ts` | **MODIFY** | 4 |
| `frontend/app/(authenticated)/inventory/page.tsx` | **MODIFY** | 5, 6 |

---

## UX Flow Summary

### Adding a new size variant of an existing product

```
1. Open Add Product modal
2. Type product code "SHW" → auto-uppercased to "SHW"
   → Dropdown: "SHW001 — Sherwani (sizes: 38, 40)"
3. Select "SHW001" → form fills: name=Sherwani, rent=2500, vendor=ABC Traders, etc.
4. Size dropdown: 38 (greyed, "already exists"), 40 (greyed), 42, 44, 46
5. Pick size 42
6. Click Create → product saved
```

### Adding a product — new vendor

```
1. Scroll to Vendor Details section
2. Type vendor name "New Supplier" → no search results
3. Fill phone, address → badge: "➕ New vendor 'New Supplier' will be created"
4. Submit → new vendor created → vendor_id linked to product
```

### Modifying vendor details (name unchanged)

```
1. Select vendor "ABC Traders" from dropdown → auto-fills
2. Change phone from 9876543210 → 9999999999
3. Badge: "ℹ Vendor details modified — saved vendor record will be updated"
4. On submit → confirm dialog:
   "Phone: 9876543210 → 9999999999. Update vendor ABC Traders?"
5. "Update & Save" → vendor updated, product saved
   "Keep Old" → reverts phone, product saved with original vendor
```

### Modifying vendor name

```
1. Select vendor "ABC Traders" from dropdown → auto-fills
2. Change name to "XYZ Suppliers"
3. Badge: "⚠ Vendor name changed — a new vendor 'XYZ Suppliers' will be created"
4. On submit → new vendor "XYZ Suppliers" created with current form values
```
