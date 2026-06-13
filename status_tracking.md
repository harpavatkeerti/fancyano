# Status: Product Tracking Status Refactor

> **Plan**: [PLAN_tracking.md](file:///C:/Users/User/.gemini/antigravity-ide/brain/3359db02-5a51-467e-bf93-a711663647a6/PLAN_tracking.md)
> **Last updated**: 2026-06-07
> **Last updated by**: Agent
> **Current step**: Awaiting user approval to start

---

## Current Status (Summary)

| Area | Status |
|------|--------|
| Step 1: DB Migration — `tracking_status` column | `[ ]` Not started |
| Step 2: Backend — routes + lifecycle service pickup/return hooks | `[ ]` Not started |
| Step 3: Shared types + frontend API client | `[ ]` Not started |
| Step 4: Inventory page — column, filter, Track button, QR scan | `[ ]` Not started |
| Step 5: `ProductTrackingModal` refactor | `[ ]` Not started |
| Step 6: Delete dead code | `[ ]` Not started |

---

## Implementation Rules

1. **Step-by-step execution only.** Complete one step fully before starting the next.
2. **User review after EVERY step.**
3. **Update this file after every step.**
4. **Run backend tests after each backend step.**
5. **Use WSL for all terminal commands.**

---

## Progress Tracker

| Step | Description | Status | Completed By | Date | Notes |
|------|-------------|--------|-------------|------|-------|
| 1 | DB Migration — add `tracking_status` column, migrate existing rows | `[ ]` | — | — | — |
| 2 | Backend — update `productTracking.js` routes + insert tracking rows in `pickupProducts` and `returnProducts` | `[ ]` | — | — | — |
| 3 | Shared types + `productTrackingApi.ts` updates | `[ ]` | — | — | — |
| 4 | Inventory page — tracking column, multi-select filter, Track button, QR scan, embed tracking in products API | `[ ]` | — | — | — |
| 5 | `ProductTrackingModal` refactor — remove QR/Change Product, add 3-state view | `[ ]` | — | — | — |
| 6 | Delete `BookingProductTrackingModal`, remove stale auto-track helpers | `[ ]` | — | — | — |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked

---

## Step Details & Checklist

### Step 1: DB Migration

- [ ] Create `021_product_tracking_status.sql`
- [ ] Add `tracking_status` column (nullable)
- [ ] Migrate existing rows: `status='returned'` → `in_house`, `status='out'` → `tracking_type` value
- [ ] Add NOT NULL constraint
- [ ] Add CHECK constraint for 6 valid values
- [ ] Add index on `(product_id, created_at DESC)`
- [ ] Run migration on dev DB
- [ ] Verify all rows migrated correctly

### Step 2: Backend Routes + Lifecycle Hooks

- [ ] `POST /product-tracking` accepts `tracking_status` (not `tracking_type`)
- [ ] `POST /product-tracking` rejects `in_house` and `picked_by_customer` values (lifecycle-only)
- [ ] `PATCH /:id/return` inserts new `in_house` row instead of updating old row
- [ ] `GET /active` uses `tracking_status != 'in_house'` with DISTINCT ON
- [ ] `GET /current/:productId` endpoint added
- [ ] `pickupProducts`: inserts `picked_by_customer` row per product after `in_progress` update
- [ ] `returnProducts`: inserts `in_house` row per product after `completed` update
- [ ] Verify with DB queries after each action

### Step 3: Shared Types + API Client

- [ ] `Product` interface: add `tracking_status`, `tracking_booking_id`
- [ ] `shared/src/api/products.ts`: response type updated
- [ ] `productTrackingApi.ts`: `ProductTracking` type updated
- [ ] `productTrackingApi.ts`: `create()` sends `tracking_status`
- [ ] `productTrackingApi.ts`: `getCurrentStatus()` method added
- [ ] TypeScript clean

### Step 4: Inventory Page

- [ ] `getProducts` backend query embeds `tracking_status` and `tracking_booking_id` via lateral subquery
- [ ] Per-product tracking fetch loop removed from frontend
- [ ] Tracking Status column added with 6 badge variants
- [ ] `filterMaintenance` replaced with `filterTrackingStatus: string[]`
- [ ] Multi-select tracking status dropdown added
- [ ] Track button (🗺️) added between Edit and Archive
- [ ] QR Scan button added next to search bar
- [ ] QR scan sets search filter to scanned code

### Step 5: ProductTrackingModal Refactor

- [ ] "🔄 Change Product" button removed
- [ ] "Scan QR" button and QR-related state removed
- [ ] `in_house` / no records → radio form with 4 work types
- [ ] `picked_by_customer` → booking link, no Mark Returned
- [ ] `{dry_clean, alternation, repair, other_work}` → status badge + Mark Returned button
- [ ] Mark Returned calls `PATCH /:id/return` (inserts new `in_house` row)
- [ ] History list unchanged
- [ ] TypeScript clean

### Step 6: Dead Code Deletion

- [ ] `BookingProductTrackingModal.tsx` deleted
- [ ] Export removed from `index.ts`
- [ ] Import removed from `bookings/page.tsx`
- [ ] `trackingBooking` + `showProductTrackingList` state removed
- [ ] `handleAutoTrackPickup` removed
- [ ] `handleAutoTrackReturn` removed
- [ ] `BookingProductTrackingModal` JSX block removed
- [ ] Stale auto-track hooks (lines 452–460) removed
- [ ] TypeScript clean

---

## Completion Criteria

- [ ] All 6 steps completed
- [ ] Inventory page shows correct `tracking_status` for each product
- [ ] Mark Picked Up in booking → `picked_by_customer` row in `product_tracking`
- [ ] Security return / booking completion → `in_house` row in `product_tracking`
- [ ] Track modal correctly handles all 3 states (in_house, picked_by_customer, out for work)
- [ ] `BookingProductTrackingModal` and all stale auto-track code removed
- [ ] No TypeScript errors
- [ ] Backend tests pass
