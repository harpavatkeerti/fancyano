# PLAN: Product Size Refactoring — One Product Code, Multiple Sizes

> **Status**: [status_size.md](file:///c:/Users/User/Documents/app/status_size.md)

---

## Overview

Refactor the product data model so that **one product = one product code**. Instead of inserting separate product rows for each (code, size) pair, a single product row holds `available_sizes: text[]` listing all sizes in stock. Booking/availability/tracking all key on **(product_id, size)**.

### Current Model
```
products table:  SHR-001 / 36 (id=5),  SHR-001 / 38 (id=6),  SHR-001 / 40 (id=7)
booking_products:  product_id=5 (the 36 one)
```

### New Model
```
products table:  SHR-001 (id=5, available_sizes=['36','38','40'])
booking_products:  product_id=5, size='36'
```

### Why
- Eliminates the "sync siblings" problem entirely (one row = one set of shared fields)
- Makes the product list cleaner (one row per product code, sub-rows per size)
- Aligns the data model with the real-world concept: a Sherwani SHR-001 is one product, with multiple size variants

---

## Architecture & Enforcement Rules

> [!IMPORTANT]
> These rules apply to **every step** in this plan. Same as PLAN_inventory.md.

### 1. Service → Route → Frontend paradigm (strictly enforced)

```
Database (constraints)  ←  Service (business logic)  ←  Route (HTTP thin layer)  ←  Shared API client  ←  Frontend
```

### 2. Dual enforcement — backend is authoritative, frontend is UX

| Constraint | Backend (authoritative) | Frontend (UX convenience) |
|---|---|---|
| Code uniqueness | `productService.createProduct` does `SELECT WHERE LOWER(code) = LOWER($1)`. Returns 409. | Code autocomplete shows existing codes; blocks submission if code conflict detected. |
| Size in available_sizes | `bookingService` validates `size IN product.available_sizes` before creating booking_product. | Frontend size selector only shows available sizes. |
| Availability per (product_id, size) | `checkProductAvailability(productId, size, from, to)` checks `booking_products WHERE product_id = $1 AND size = $2`. | Calendar disabled until size is selected. |

### 3. No direct axios calls from frontend

All API interactions flow through `shared/src/api/` → `frontend/lib/api.ts`.

### 4. Tests after every step

- Add/update tests for the step's changes
- Test updates should **ONLY add the `size` parameter** — no financial logic changes in tests
- Run the **full test suite** after each step — all existing + new tests must pass

### 5. Explicit user approval before next step

Each step is complete only when:
1. Code changes are done
2. All tests pass
3. User explicitly says "proceed" to the next step

---

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | `available_sizes` is `TEXT[]` (nullable). `NULL` = "no size concept" (e.g. Artificial Jewelleries). Empty `[]` = "all sizes removed/unavailable". | Clear semantic distinction: `null` means size doesn't apply; `[]` means product exists but has no active sizes. |
| 2 | **Tracking stays in `product_tracking` table** (single source of truth). Add `size VARCHAR(20)` column to `product_tracking`. Current status per size = latest row for `(product_id, size)`. No row = implicitly `in_house`. The existing `LEFT JOIN LATERAL` in `getProducts` is kept and extended with `size`. **No `size_tracking` JSONB column on `products`.** | Single source of truth. No denormalization to maintain. No sync risk between JSONB and table. |
| 3 | `booking_products` gets a `size VARCHAR(20)` column. All booking/availability/tracking queries filter on `(product_id, size)`. | This is the real composite key for physical items. |
| 4 | `product_tracking` gets a `size VARCHAR(20)` column. Tracking records are per `(product_id, size)`. | Each physical item (product + size) is tracked independently. |
| 5 | Constants file is **duplicated**: `backend/src/constants/productConstants.js` (for backend validation) and `frontend/lib/productConstants.ts` (for UI). Both files have cross-reference comments. No API endpoint. | These constants rarely change. Duplication is simpler than async fetch patterns. |
| 6 | Booking migration is **deferred** — product-side migration first, booking remapping done manually at the end (only 5 bookings exist). | Reduces risk; manual fix is trivial for 5 rows. |
| 7 | Size selector UX: **circles** (pill badges), not dropdown. Common garment sizing UX pattern. | More intuitive for size selection in booking/cart context. |
| 8 | Removing a size from `available_sizes` does **not** affect past/current bookings or tracking records for that size. Only future bookings are blocked. Tracking data in `product_tracking` is unaffected by size removal. Frontend only shows tracking actions for sizes in `available_sizes`, but still displays a warning for removed sizes that have non-`in_house` tracking status. | Soft removal — no cascading side effects. No cleanup logic needed. |
| 9 | During exchange, the user selects a new product AND a new size. The original product's size is irrelevant. | Clean exchange semantics — it's a completely new selection. |
| 10 | One physical unit per (product_id, size). No stock_count needed. | Matches current business model. |
| 11 | `rent_overrides JSONB` (nullable) on `products`: `{"44": 1500, "46": 1500}`. Base `rent` column stays. Effective rent resolved via **`productService.getProductRent(product, size)`** (single source of truth). Most products have `rent_overrides = null` (all sizes same rent). | Rare scenario — one JSONB column, one utility method. If rent logic ever changes, only one place to update. |

---

## Step 1: Create Backend Constants File

**Priority**: Critical (many later steps depend on this)  
**Scope**: 1 new file, 1 comment update

### Changes

#### [NEW] `backend/src/constants/productConstants.js`

Move all content from `frontend/lib/productConstants.ts` here, converted to CommonJS. Add `getSizesForProduct` helper for backend validation. Add cross-reference comment at top:

```js
/**
 * productConstants.js
 *
 * Single source of truth (backend) for product-related lists.
 * ⚠️  IMPORTANT: This file is duplicated in the frontend at:
 *     frontend/lib/productConstants.ts
 * Any changes here MUST be propagated to that file (and vice versa).
 */
```

#### [MODIFY] `frontend/lib/productConstants.ts`

Add cross-reference comment at top. No other changes — existing exports stay as-is:

```ts
/**
 * productConstants.ts
 *
 * Single source of truth (frontend) for product-related lists.
 * ⚠️  IMPORTANT: This file is duplicated in the backend at:
 *     backend/src/constants/productConstants.js
 * Any changes here MUST be propagated to that file (and vice versa).
 */
```

### Verification
- Backend `getSizesForProduct()` returns correct sizes for each product type
- Frontend still shows correct product types and sizes in all dropdowns
- `npm run build` in frontend succeeds

---

## Step 2: Database Migration — Product Table Restructure

**Priority**: Critical  
**Depends on**: Step 1

### Changes

#### [NEW] `backend/src/database/migrations/031_refactor_product_sizes.sql`

```sql
-- 1. Add new column
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS available_sizes TEXT[],
  ADD COLUMN IF NOT EXISTS rent_overrides JSONB;

-- 2. Migrate existing data: populate available_sizes from the size column
-- For each unique (code, name) group, aggregate all sizes into one row
-- This creates the available_sizes array from existing sibling rows

-- Step A: For the canonical product (lowest id per code+name), set available_sizes
UPDATE products p
SET available_sizes = sub.sizes
FROM (
  SELECT MIN(id) as canonical_id, code, name,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT size ORDER BY size), NULL) as sizes
  FROM products
  WHERE status != 'archived'
  GROUP BY code, name
) sub
WHERE p.id = sub.canonical_id;

-- Step B: For products with NULL size (Artificial Jewelleries), set available_sizes = NULL
UPDATE products SET available_sizes = NULL
WHERE size IS NULL AND available_sizes = '{}';

-- 3. Add size column to booking_products
ALTER TABLE booking_products
  ADD COLUMN IF NOT EXISTS size VARCHAR(20);

-- 4. Add size column to product_tracking
ALTER TABLE product_tracking
  ADD COLUMN IF NOT EXISTS size VARCHAR(20);

-- 5. Drop old composite unique indexes (code+size)
-- The new code-only unique index will be created in Step 11 AFTER
-- duplicate sibling rows are cleaned up.
DROP INDEX IF EXISTS uq_products_code_size;
DROP INDEX IF EXISTS uq_products_code_no_size;
```

> [!IMPORTANT]
> **The migration does NOT delete duplicate product rows, remap booking_products, or create the new unique index.** These are deliberately deferred to Step 11. After this migration, the canonical product row has `available_sizes` populated. Duplicate rows still exist but are harmless until we clean them up.

### Verification
- Migration runs without errors
- `SELECT id, code, name, available_sizes FROM products WHERE available_sizes IS NOT NULL LIMIT 10` shows merged sizes
- Server starts
- Existing bookings still work (they still reference old product_ids which still exist)

---

## Step 3: Backend — Product Service Refactor

**Priority**: Critical  
**Depends on**: Step 2

### Changes

#### [MODIFY] `backend/src/services/productService.js`

- **`createProduct`**:
  - Accept `available_sizes: string[]` instead of `size: string`
  - Uniqueness check: `WHERE LOWER(code) = LOWER($1)` (code only, not code+size)
  - INSERT includes `available_sizes`, `rent_overrides` (optional)
  - **Remove `sync_siblings`** — no longer needed
  
- **`updateProduct`**:
  - Accept `available_sizes: string[]` instead of `size: string`
  - Accept `rent_overrides: Record<string, number> | null` (optional)
  - Uniqueness check excludes self: `WHERE LOWER(code) = LOWER($1) AND id != $2`
  - UPDATE includes `available_sizes`, `rent_overrides`
  - **Remove `sync_siblings`** — no longer needed
  - No tracking logic needed in product service — tracking stays in `product_tracking` table

- **`getProducts`** (list):
  - SELECT includes `available_sizes`, `rent_overrides` (internal — used by `getProductRent` to compute `rents_by_size`, not returned to frontend)
  - Remove the old `size` column from SELECT
  - **Replace the `LEFT JOIN LATERAL`** with a subquery that returns **per-size tracking** as a JSON map. Sub-rows are always visible, so all sizes' tracking must be loaded upfront:
    ```sql
    LEFT JOIN LATERAL (
      SELECT json_object_agg(sub.size, sub.tracking_status) AS size_tracking_map
      FROM (
        SELECT DISTINCT ON (size) size, tracking_status
        FROM product_tracking
        WHERE product_id = p.id
        ORDER BY size, created_at DESC
      ) sub
    ) lt ON true
    ```
    This returns e.g. `{"36": "going_to_dry_clean", "38": "in_house"}`. Sizes in `available_sizes` but not in this map are implicitly `in_house`.

- **`getProduct`** (single):
  - Same changes as `getProducts`

#### [MODIFY] `backend/src/routes/products.js`

- POST / PUT handlers: accept `available_sizes`, `rent_overrides` instead of `size`
- Remove `sync_siblings` pass-through

In `productService.js` (Step 3), add a helper method:

- **`getProductRent(product, size)`**: returns `product.rent_overrides?.[size] ?? product.rent`. Single source of truth for rent resolution. If `size` is null/undefined (sizeless products), returns `product.rent`. Used by `bookings.js` route, `productExchanges.js` route, `bookingCalculationService`, and `calculateExchangePreview`.

In `getProducts` / `getProduct`, compute a **`rents_by_size`** map in the response using `getProductRent` for each size in `available_sizes`:
```js
// e.g. { "36": 1200, "38": 1200, "44": 1500 }
rents_by_size: available_sizes?.reduce((map, size) => {
  map[size] = productService.getProductRent(product, size);
  return map;
}, {}) ?? null
```

- **Frontend reads `rents_by_size[size]` for display** — never computes rent itself.
- **`rent_overrides`** is backend-internal only, not returned in the API response. Frontend derives edit form state from `rents_by_size` + base `rent`.

### Verification
- Create product with `available_sizes: ['36', '38']` → saved correctly
- Update product to add size `40` → `available_sizes` becomes `['36', '38', '40']`
- GET products returns `available_sizes` array and `rents_by_size` map
- Duplicate code creation blocked (409)

---

## Step 4: Backend — Booking Service + Availability Refactor

**Priority**: Critical  
**Depends on**: Step 3

### Changes

#### [MODIFY] `backend/src/services/bookingService.js`

- **`createBooking`**:
  - Each product item in the request now includes `size: string`
  - Validate: `size` must be in the product's `available_sizes` (query product row)
  - INSERT into `booking_products` includes `size` column
  - Note: rent resolution happens in the route (see `bookings.js` below), not in this service. This service receives a concrete `rent` number as before.
  - The `json_build_object` in `getBookingById` and `listBookings` includes `'size', bp.size`
  
- **`getBookingById`**:
  - Add `'size', bp.size` to the product json_build_object (line ~643)
  
- **`listBookings`**:
  - Add `'size', bp.size` to the jsonb_build_object (line ~727)

- **`getByProductId`**:
  - This currently finds bookings by `product_id`. Now it also needs `size` parameter to show per-size booking calendar.
  - Add `AND bp.size = $2` to the query (or make `size` optional — if null, return all)

#### [MODIFY] `backend/src/services/availabilityService.js`

- **`checkProductAvailability`**:
  - Accept `size` parameter
  - Add `AND bp.size = $2` to the conflict query
  - If product's `available_sizes` is null (no size concept), skip size filter

- **`checkBulkAvailability`**:
  - Each item now includes `size`
  - Passes `size` to `checkProductAvailability`

#### [MODIFY] `backend/src/utils/bookingDateUtils.js`

- **`checkProductAvailability`**:
  - Accept `size` parameter (4th positional or in opts)
  - Add `AND bp.size = $5` to the conflict query
  - If `size` is null, omit the filter (for sizeless products)

#### [MODIFY] `backend/src/routes/availability.js`

- Accept `size` in request body for both `/check` and `/check-bulk`

#### [MODIFY] `backend/src/routes/bookings.js`

- Accept `size` per product in booking creation payload
- Line ~102: change `rent: productDetails.rent` → `rent: productService.getProductRent(productDetails, p.size)`

#### [MODIFY] `shared/src/api/availability.ts`

- `AvailabilityCheckRequest`: add `size?: string`

#### [MODIFY] `backend/src/services/bookingCalculationService.js`

- **`fetchProductDetails`**: add `rent_overrides` to the SELECT query (currently: `SELECT id, name, code, rent, security_deposit`). This is used by both the booking creation route and the preview.
- **`calculateProductDiscounts`**: accept `size` per product input. Use `productService.getProductRent(product, size)` before applying discount. This powers the booking preview.

### Verification
- Create booking with `{product_id: 5, size: '36', date_from, date_to}` → saved with size
- Availability check for product 5, size 36 → conflict found
- Availability check for product 5, size 38 → available (different size, no conflict)
- Booking for sizeless product (Artificial Jewelleries) → works without size parameter

---

## Step 5: Backend — Exchange + Tracking Refactor

**Priority**: High  
**Depends on**: Step 4

### Changes

#### [MODIFY] `backend/src/services/productLifecycleService.js`

- **`exchangeProduct`**:
  - Each new product in `newProducts` array now includes `size: string`
  - Validate: `size` must be in the product's `available_sizes`
  - INSERT into `booking_products` includes `size`
  - Availability check passes `size` to `checkProductAvailability`
  - The "active product in booking" guard now checks `(product_id, size)` combination, not just `product_id`

- **`calculateExchangePreview`**:
  - Accept `size` for the new product(s)
  - Use `productService.getProductRent(product, size)` for preview calculations

#### [MODIFY] `backend/src/routes/productExchanges.js`

- Exchange endpoint accepts `size` per new product
- Rent resolution: use `productService.getProductRent(productDetails, p.size)` (same as `bookings.js` route)

#### [MODIFY] `backend/src/services/productTrackingService.js`

- **All functions**: accept `size` parameter
- **`createTrackingRecord`**: INSERT includes `size`
- **`getCurrentTrackingForProduct`**: filter by `(product_id, size)`
- **`getTrackingHistoryByProductId`**: filter by `(product_id, size)` or return all sizes if size not specified
- **`listActiveTrackingRecords`**: include `size` in output
- **TRACKING_SELECT**: add `pt.size` to SELECT

#### [MODIFY] `backend/src/routes/productTracking.js`

- Tracking endpoints accept `size` parameter (query param or in body)

#### [MODIFY] `backend/src/services/invoiceService.js`

- **`getBookingForInvoice`**: add `'size', bp.size` to the product json_build_object

### Verification
- Exchange product with size selection → new booking_product has correct size
- Tracking record for (product 5, size 36) → only returns records for that size
- Invoice shows size alongside product name and code

---

## Step 6: Shared Types + API Client Updates

**Priority**: High  
**Depends on**: Steps 3-5

### Changes

#### [MODIFY] `shared/src/types/index.ts`

- **`Product`**:
  - Remove: `size?: string`
  - Remove: `tracking_status?: string` (replaced by per-size map)
  - Remove: `tracking_booking_id?: number` (no longer a single value)
  - Add: `available_sizes: string[] | null`
  - Add: `size_tracking_map: Record<string, string> | null` (from lateral join: `{"36": "going_to_dry_clean", "38": "in_house"}`. Sizes not in this map are implicitly `in_house`.)
  - Add: `rents_by_size?: Record<string, number> | null` (computed by backend — frontend uses this for display and edit form)

- **`BookingProduct`**:
  - Add: `size?: string`

#### [MODIFY] `shared/src/api/availability.ts`

- `AvailabilityCheckRequest`: add `size?: string`

#### [MODIFY] `shared/src/api/products.ts`

- Types flow through from `Product` interface — no explicit changes needed, but verify `create()` and `update()` accept the new fields

#### [MODIFY] `shared/src/api/bookings.ts`

- `getByProductId`: add optional `size` query param: `api.get('/bookings/by-product/${productId}', { params: { size } })`

### Verification
- `npm run build` in shared succeeds
- Frontend compiles with new types

---

## Step 7: Frontend — Inventory Page Refactor

**Priority**: High  
**Depends on**: Step 6

### Changes

#### [MODIFY] `frontend/app/(authenticated)/inventory/page.tsx`

**Major restructure:**

##### 7A: Product Table — Grouped Rows

- Each product code = one main row showing: image, name, code, **base rent**, security, purchase price, vendor, status, actions
- Below the main row: **always-visible** sub-rows, one per size in `available_sizes`
- Each sub-row shows: **size circle**, **rent** (from `rents_by_size[size]` — if different from base rent, show in a distinct style), tracking status (from `size_tracking_map`), track button
- Products with `available_sizes = null` (Artificial Jewelleries): no sub-rows, single row with tracking status directly on the main row (same lateral join as before, no size filter)

##### 7B: Add Product Modal

- **Size dropdown → multi-select**: show all valid sizes for the selected product type (from local frontend constants)
- Sizes rendered as selectable **circle pills** (not a dropdown)
- Remove `sync_siblings` checkbox (no longer needed)
- **Rent overrides** (optional): a small link below rent field — "Set different rent for specific sizes". Clicking reveals a compact per-size rent table for the selected sizes, pre-filled with the base rent. Admin only changes sizes that differ. Sizes left at base rent are not stored in `rent_overrides`. If no size differs, `rent_overrides` stays `null`.
- On save: `available_sizes` array + `rent_overrides` (if any) sent to backend

##### 7C: Edit Product Modal

- Size section: show all possible sizes (from constants) as circle pills, with currently-active sizes pre-selected
- Admin can add/remove sizes freely
- Removing a size from `available_sizes`: does **not** affect existing bookings
- **Rent overrides**: same UX as Add modal. Pre-fill per-size rent table from `rents_by_size`. Sizes where rent differs from base `rent` are treated as overrides.

##### 7D: Size Filter

- Filter bar size dropdown: checks if any size in `available_sizes` matches

##### 7E: View Product Modal

- Show available sizes as circle pills
- Per-size tracking status shown

### Verification
- Product list shows grouped rows with size sub-rows always visible
- Add product with multi-select sizes → saved correctly
- Edit product, add/remove sizes → updated correctly
- Size filter works on `available_sizes`
- View modal shows sizes and per-size tracking

---

## Step 8: Frontend — Cart Page + Booking Creation

**Priority**: High  
**Depends on**: Steps 6, 7

### Changes

#### [MODIFY] `frontend/app/(authenticated)/cart/page.tsx`

- **CartItem interface**: add `size: string`
- **Product card in cart**: add size selector (circle pills, only showing product's `available_sizes`)
- **Without size selected**: date picker is disabled, cannot select dates
- **Size change**: resets dates for that product (clears `dateFrom` / `dateTo`)
- **Rent display updates on size change**: show `rents_by_size[size]` — actual rent is resolved server-side via booking preview
- **Only available sizes shown**: sizes not in `available_sizes` hidden
- **Booking creation payload**: include `size` per product (rent is resolved server-side, not sent by frontend)
- **Availability check**: passes `size` to `checkBulkAvailability`
- Show selected size next to product name/code wherever product is displayed

#### [MODIFY] `frontend/app/(authenticated)/products/[id]/page.tsx`

- This is the product detail / "add to cart" page. Needs a **size selector** before the date picker (same pattern as cart)
- `fetchProductBookings` (calls `getByProductId`): pass selected `size` so availability is per-size
- Client-side `checkAvailability` function: also consider `size` when checking cart conflicts
- Date picker disabled until size is selected
- Size change resets selected dates
- "Add to Cart" includes `size` in the cart item saved to localStorage

### Verification
- Add product to cart → size pills shown
- Select size → date picker becomes enabled
- Change size → dates reset
- Create booking → `size` stored in `booking_products`
- Product with `available_sizes = null` → no size selector, date picker immediately enabled
- Product detail page shows size selector before date picker

---

## Step 9: Frontend — Booking Detail + Exchange

**Priority**: High  
**Depends on**: Steps 6, 8

### Changes

#### [MODIFY] `frontend/app/(authenticated)/bookings/[id]/page.tsx`

- Product display: show **size** alongside name and code (e.g. "Sherwani · SHR-001 · Size 38")
- Exchange flow: same

#### [MODIFY] `frontend/components/common/ProductExchange.tsx`

- When selecting a replacement product, also show **size selector** (circle pills from `available_sizes`)
- Size must be selected before availability calendar opens
- Exchange API call includes `size` per new product

### Verification
- Booking detail shows size for each product
- Exchange: select new product → size selector appears → select size → availability checked → exchange completes with size

---

## Step 10: Frontend — All Other Pages (Size Display)

**Priority**: Medium  
**Depends on**: Step 6

### Changes — Add size display wherever product info is shown in booking context:

#### [MODIFY] `frontend/app/(authenticated)/bookings/page.tsx`

- Booking list: product pills show size (e.g. "SHR-001 · 38")
- "Add product to booking" flow: include size selector

#### [MODIFY] `frontend/app/(authenticated)/customer-bookings/page.tsx`

- Product display: show size

#### [MODIFY] `frontend/app/(authenticated)/products/page.tsx`

- Product catalog cards: show `available_sizes` as pills on each product card
- Availability date filter: currently checks per product_id. With new model this still works (one product = one code) but doesn't filter by size. Acceptable for catalog browsing.

#### [MODIFY] `frontend/components/common/ProductTrackingModal.tsx`

- Accept `size` prop (passed from the inventory sub-row's Track button)
- Pass `size` to all tracking API calls
- Show size in modal header (e.g. "Track · SHR-001 · Size 38")
- When called for a sizeless product (Artificial Jewelleries), `size` is null — modal works as before

### Verification
- Size is visible next to product name/code everywhere a product appears in booking context
- Tracking modal shows per-size history

---

## Step 11: Manual Booking Migration (Deferred)

**Priority**: Low  
**Depends on**: All previous steps

### Changes

Manual SQL for the 5 existing bookings:

1. For each `booking_products` row, look up the current product's `size` column and copy it to `booking_products.size`
2. Remap `booking_products.product_id` to the canonical product id (lowest id per code+name group)
3. Same for `product_tracking` rows
4. Delete duplicate product rows (non-canonical ids)
5. Drop the `size` column from `products` table (now fully replaced by `available_sizes`)

### Verification
- All existing bookings still load and display correctly
- No orphaned booking_products pointing to deleted product ids
- Product list shows no duplicates

---

## Files Touched — Complete Summary

### Database
| File | Type | Step |
|---|---|---|
| `backend/src/database/migrations/031_refactor_product_sizes.sql` | **NEW** | 2 |

### Backend Constants + Routes
| File | Type | Step |
|---|---|---|
| `backend/src/constants/productConstants.js` | **NEW** | 1 |
| `backend/src/routes/products.js` | **MODIFY** | 3 |

### Backend Services
| File | Type | Step |
|---|---|---|
| `backend/src/services/productService.js` | **MODIFY** | 3 |
| `backend/src/services/bookingService.js` | **MODIFY** | 4 |
| `backend/src/services/availabilityService.js` | **MODIFY** | 4 |
| `backend/src/services/bookingCalculationService.js` | **MODIFY** | 4 |
| `backend/src/utils/bookingDateUtils.js` | **MODIFY** | 4 |
| `backend/src/services/productLifecycleService.js` | **MODIFY** | 5 |
| `backend/src/services/productTrackingService.js` | **MODIFY** | 5 |
| `backend/src/services/invoiceService.js` | **MODIFY** | 5 |

### Backend Routes
| File | Type | Step |
|---|---|---|
| `backend/src/routes/availability.js` | **MODIFY** | 4 |
| `backend/src/routes/bookings.js` | **MODIFY** | 4 |
| `backend/src/routes/productExchanges.js` | **MODIFY** | 5 |
| `backend/src/routes/productTracking.js` | **MODIFY** | 5 |

### Shared
| File | Type | Step |
|---|---|---|
| `shared/src/types/index.ts` | **MODIFY** | 6 |
| `shared/src/api/availability.ts` | **MODIFY** | 6 |
| `shared/src/api/bookings.ts` | **MODIFY** | 6 |

### Frontend
| File | Type | Step |
|---|---|---|
| `frontend/lib/productConstants.ts` | **MODIFY** | 1 |
| `frontend/app/(authenticated)/inventory/page.tsx` | **MODIFY** | 7 |
| `frontend/app/(authenticated)/cart/page.tsx` | **MODIFY** | 8 |
| `frontend/app/(authenticated)/products/[id]/page.tsx` | **MODIFY** | 8 |
| `frontend/app/(authenticated)/bookings/[id]/page.tsx` | **MODIFY** | 9 |
| `frontend/components/common/ProductExchange.tsx` | **MODIFY** | 9 |
| `frontend/app/(authenticated)/bookings/page.tsx` | **MODIFY** | 10 |
| `frontend/app/(authenticated)/customer-bookings/page.tsx` | **MODIFY** | 10 |
| `frontend/app/(authenticated)/products/page.tsx` | **MODIFY** | 10 |
| `frontend/components/common/ProductTrackingModal.tsx` | **MODIFY** | 10 |

### Tests (Update alongside corresponding steps)
| File | Step |
|---|---|
| `backend/src/services/productService.test.js` | 3 |
| `backend/src/routes/products.test.js` | 3 |
| `backend/src/services/bookingService.test.js` | 4 |
| `backend/src/services/availabilityService.test.js` | 4 |
| `backend/src/routes/availability.test.js` | 4 |
| `backend/src/routes/bookings.test.js` | 4 |
| `backend/src/utils/bookingDateUtils.test.js` | 4 |
| `backend/src/services/productLifecycleService.test.js` | 5 |
| `backend/src/routes/productExchanges.test.js` | 5 |
| `backend/src/services/productTrackingService.test.js` | 5 |
| `backend/src/routes/productTracking.test.js` | 5 |
| `backend/src/services/invoiceService.test.js` | 5 |

---

## UX Flow Summary

### Adding a new product (with sizes)

```
1. Open Add Product modal
2. Select Product Type: Sherwani → gender auto-set to Male
3. Type product code: SHR-005
4. Select sizes: ○34 ●36 ●38 ●40 ○42 ○44 ○46  (circles, multi-select)
5. Fill rent, security deposit, images, vendor
6. Click Create → one product row created with available_sizes=['36','38','40']
```

### Creating a booking (cart)

```
1. Search product SHR-005 → add to cart
2. Product card shows: "Sherwani · SHR-005"
   Size: ○36 ●38 ○40  (select one)
3. After selecting size 38 → date picker enables
4. Pick dates → availability checked for (SHR-005, size 38)
5. Submit booking → booking_products row: product_id=X, size='38'
```

### Exchanging a product

```
1. Open booking detail
2. Click Exchange on "Sherwani SHR-005 · Size 38"
3. Select replacement product: "Sherwani SHR-007"
4. Select size: ○36 ○38 ●40  (pick from SHR-007's available_sizes)
5. Dates checked for (SHR-007, size 40) → available
6. Confirm exchange → new booking_product with (SHR-007, size 40)
```

### Editing product sizes (inventory)

```
1. Click Edit on SHR-005
2. Size section: ○34 ●36 ●38 ●40 ○42 ○44 ○46
3. Deselect 36, select 42 → available_sizes becomes ['38','40','42']
4. Save → updated. Existing bookings with size 36 are unaffected.
```
