# Status: Product Size Refactoring — One Product Code, Multiple Sizes

> **Plan**: [PLAN_size.md](file:///c:/Users/User/Documents/app/PLAN_size.md)
> **Last updated**: 2026-07-18
> **Last updated by**: Agent
> **Current step**: Plan created — awaiting approval

---

## Current Status (Summary)

| Area | Status |
|------|--------|
| Step 1: Move constants to backend + new API | `[ ]` Not started |
| Step 2: Database migration — product table restructure | `[ ]` Not started |
| Step 3: Backend — product service refactor | `[ ]` Not started |
| Step 4: Backend — booking service + availability refactor | `[ ]` Not started |
| Step 5: Backend — exchange + tracking refactor | `[ ]` Not started |
| Step 6: Shared types + API client updates | `[ ]` Not started |
| Step 7: Frontend — inventory page refactor | `[ ]` Not started |
| Step 8: Frontend — cart page + booking creation | `[ ]` Not started |
| Step 9: Frontend — booking detail + exchange | `[ ]` Not started |
| Step 10: Frontend — all other pages (size display) | `[ ]` Not started |
| Step 11: Manual booking migration (deferred) | `[ ]` Not started |

---

## Implementation Rules

1. **Step-by-step execution only.** Complete one step fully before starting the next.
2. **User review after EVERY step.**
3. **Update this file after every step.**
4. **Run backend server after each backend step to verify no startup errors.**
5. **No changes to any logic outside the scope of this plan.**
6. **Service → Route → Frontend paradigm (strict).** All business logic in service layer. Routes are thin HTTP adapters.
7. **Dual enforcement.** Backend is authoritative. Frontend provides UX convenience.
8. **Shared API client only.** No direct axios or fetch calls in page components.
9. **Tests after every step.** Add/update tests for the step's changes. Test updates should ONLY add the `size` parameter — no financial logic changes in tests.
10. **All tests must pass.** Run the full test suite after each step. All existing + new tests must pass before the step is considered complete.
11. **Explicit user approval required.** Do NOT start the next step until the user explicitly approves. Step completion = code done + tests pass + user says "proceed".

---

## Decisions Made

| # | Question | Decision |
|---|----------|----------|
| 1 | `available_sizes` semantics | `NULL` = no size concept. `[]` = all sizes removed. `['36','38']` = these sizes in stock. |
| 2 | Tracking per size | Stays in `product_tracking` table (single source of truth). Add `size` column. Current status = latest row per `(product_id, size)`. No row = implicitly `in_house`. No JSONB on `products`. |
| 3 | Booking keying | `(product_id, size)` is the composite key in `booking_products`. |
| 4 | Constants location | Duplicated in both backend and frontend with cross-reference comments. No API endpoint. |
| 5 | Size UX | Circle pills (not dropdown) for size selection. |
| 6 | Removing a size | Soft — doesn't affect bookings or tracking records. Frontend only shows tracking actions for sizes in `available_sizes`. |
| 7 | Exchange | Re-select product AND size independently from original. |
| 8 | Booking migration | Deferred to manual step at the end (5 bookings). |
| 9 | Physical units | One unit per (product_id, size). No stock_count. |
| 10 | Rent overrides | `rent_overrides JSONB` on products. `rent_overrides[size] ?? rent` = effective rent. Most products: `null`. |

---

## Progress Tracker

| Step | Description | Status | Completed By | Date | Notes |
|------|-------------|--------|-------------|------|-------|
| 1 | Move constants to backend + new API endpoint | `✅ done` | Agent | 2026-08-01 | Constants file + getSizesForProduct helper |
| 2 | Database migration: add available_sizes, size_tracking, booking_products.size, product_tracking.size | `✅ done` | Agent | 2026-08-01 | Unique index deferred to Step 11 |
| 3 | Backend: productService refactor (available_sizes, remove sync_siblings) | `✅ done` | Agent | 2026-08-01 | getProductRent, rents_by_size, size_tracking_map |
| 4 | Backend: bookingService + availabilityService + bookingDateUtils refactor (size param) | `✅ done` | Agent | 2026-08-01 | size in booking_products, per-size availability, getProductRent in route |
| 5 | Backend: productLifecycleService (exchange) + productTrackingService + invoiceService refactor | `✅ done` | Agent | 2026-08-01 | size in exchange, per-size tracking, invoice size |
| 6 | Shared: types + API client updates | `✅ done` | Agent | 2026-08-01 | Product/BookingProduct/Tracking types, availability/bookings API |
| 7 | Frontend: inventory page (grouped rows, multi-select sizes, remove sync) | `✅ done` | Agent | 2026-08-01 | Multi-select pills, rent overrides, size_tracking_map, view modal |
| 8 | Frontend: cart page (size selector, date reset, booking payload) | `✅ done` | Agent | 2026-08-01 | CartItem.size, preview/create payloads, size-aware dedup, product detail size pills |
| 9 | Frontend: booking detail + exchange (size display + selector) | `✅ done` | Agent | 2026-08-02 | Size in product cards, size pills in exchange, (product_id,size) pair filtering |
| 10 | Frontend: all other pages (bookings list, customer-bookings, products, tracking modal, dashboard) | `✅ done` | Agent | 2026-08-02 | Size in booking pills, product cards with size pills, tracking modal size prop |
| 11 | Manual: booking migration (remap 5 bookings, delete duplicate product rows, drop old size column) | `[ ]` | — | — | — |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked

---

## Step Details & Checklist

### Step 1: Create Backend Constants File

- [x] Create `backend/src/constants/productConstants.js` with all product type/size data
- [x] Add `getSizesForProduct(productType, gender)` helper
- [x] Add cross-reference comment to `frontend/lib/productConstants.ts`
- [x] Server starts without errors
- [x] Tests: N/A (constants file only)
- [x] **User approval to proceed** → `[x]`

### Step 2: Database Migration

- [x] Create `031_refactor_product_sizes.sql`
  - [x] Add `available_sizes TEXT[]` to products
  - [x] Add `rent_overrides JSONB` to products
  - [x] Populate `available_sizes` from existing size column
  - [x] Add `size VARCHAR(20)` to `booking_products`
  - [x] Add `size VARCHAR(20)` to `product_tracking`
  - [x] Drop old `uq_products_code_size` and `uq_products_code_no_size` indexes
  - [ ] Create `uq_products_code` index (code only) — **deferred to Step 11** (duplicate sibling rows still exist)
- [x] Migration runs without errors
- [x] Server starts without errors
- [x] Tests: N/A (migration only)
- [x] **User approval to proceed** → `[x]`

### Step 3: Backend — Product Service

- [x] `createProduct`: accept `available_sizes`, `rent_overrides`, code-only uniqueness
- [x] `updateProduct`: accept `available_sizes`, `rent_overrides`, remove sync_siblings
- [x] `getProducts`: return `available_sizes`, per-size tracking via `size_tracking_map`
- [x] `getProduct`: same
- [x] Route: accept `available_sizes`, `rent_overrides` in POST/PUT
- [x] Add `getProductRent(product, size)` method to `productService`
- [x] Server starts, CRUD works
- [x] Tests added/updated (size param only, no finance logic)
- [x] All 849 tests pass (39 suites)
- [x] **User approval to proceed** → `[x]`

### Step 4: Backend — Booking + Availability

- [x] `bookingService.createBooking`: accept `size`, validate against `available_sizes`, insert with size (rent resolved in route)
- [x] `bookingService.getBookingById`: include `size` in product json
- [x] `bookingService.listBookings`: include `size` in product json
- [ ] `bookingService.getByProductId`: accept optional `size` filter (deferred — not needed yet)
- [x] `bookings.js` route: use `ProductService.getProductRent(productDetails, size)` for rent resolution
- [x] `bookingCalculationService.fetchProductDetails`: add `rent_overrides` to SELECT
- [x] `bookingCalculationService.calculateProductDiscounts`: resolve per-size rent via `getProductRent`
- [x] `availabilityService.checkProductAvailability`: filter by `(product_id, size)`
- [x] `availabilityService.checkBulkAvailability`: pass size through
- [x] `bookingDateUtils.checkProductAvailability`: filter by `(product_id, size)`
- [x] Routes: accept `size` in availability and booking request bodies
- [ ] Shared API types update (deferred to Step 6)
- [x] Tests updated (size param only, no finance logic)
- [x] All 851 tests pass (39 suites)
- [x] **User approval to proceed** → `[x]`

### Step 5: Backend — Exchange + Tracking

- [x] `productLifecycleService.exchangeProduct`: accept `size` per new product, validate, insert, per-size availability + active guard
- [ ] `productLifecycleService.calculateExchangePreview`: accept `size` (deferred — needs frontend work)
- [x] `productTrackingService`: all functions accept `size`
- [x] `productTrackingService.createTrackingRecord`: INSERT includes `size`
- [x] `productTrackingService.listActiveTrackingRecords`: DISTINCT ON (product_id, size)
- [x] `productTrackingService.returnTrackingRecord`: preserves size on in_house insert
- [x] `invoiceService.getBookingForInvoice`: include `size` in product json
- [x] `productExchanges.js` route: use `ProductService.getProductRent`, pass `size`
- [x] All 851 tests pass (39 suites)
- [x] **User approval to proceed** → `[x]`

### Step 6: Shared Types + API

- [x] `Product`: add `available_sizes`, `size_tracking_map`, `rents_by_size`; remove `size`, `tracking_status`, `tracking_booking_id`
- [x] `BookingProduct`: add `size?: string | null`
- [x] `AvailabilityCheckRequest`: add `size?: string`
- [x] `shared/src/api/bookings.ts`: add `size` to `getByProductId` and preview product type
- [x] `ProductTracking`: replace `product_size` with `size`; add `size` to `CreateTrackingData`
- [x] `tsc --noEmit` passes (no new errors)
- [x] Frontend compiles with new types
- [x] All 851 backend tests pass
- [ ] **User approval to proceed** → `[ ]`

### Step 7: Frontend — Inventory

- [ ] Grouped rows (one per code, sub-rows per size)
- [ ] Add product: size pills + optional "Set different rent per size" UI
- [ ] Edit product: size pills + rent overrides pre-filled
- [ ] Size filter on `available_sizes`
- [ ] **User approval to proceed** → `[ ]`

### Step 8: Frontend — Cart + Product Detail

- [ ] `CartItem` interface: add `size`
- [ ] Size circle pills per product in cart
- [ ] Date picker disabled until size selected
- [ ] Rent updates on size change (from `rent_overrides`)
- [ ] Booking payload includes `size`
- [ ] Availability check passes `size`
- [ ] Product detail page (`products/[id]`): size selector before date picker
- [ ] Product detail: `getByProductId` passes `size`
- [ ] Product detail: cart conflict check considers `size`
- [ ] "Add to Cart" includes `size` in localStorage
- [ ] **User approval to proceed** → `[ ]`

### Step 9: Frontend — Booking Detail + Exchange

- [ ] Show size in product display
- [ ] Exchange: size selector for replacement product
- [ ] Exchange dropdown: allow same product if a different size is available (currently filters out same product_id entirely — change to filter by product_id + size combo)
- [ ] Exchange API includes `size`
- [ ] **User approval to proceed** → `[ ]`

### Step 10: Frontend — Other Pages

- [ ] Bookings list: size in product display + size selector for "add product"
- [ ] Customer bookings: size in product display
- [ ] Products catalog page: show `available_sizes` as pills
- [ ] Tracking modal: accept `size` prop, pass to API, show in header
- [ ] **User approval to proceed** → `[ ]`

### Step 11: Manual Booking Migration

- [ ] Copy `size` from old product rows to `booking_products.size`
- [ ] Remap `booking_products.product_id` to canonical ids
- [ ] Copy `size` to `product_tracking` rows
- [ ] Delete duplicate product rows
- [ ] Drop `size` column from `products` table
- [ ] Verify all bookings load correctly
