# Implementation Plan: Product Tracking Status Refactor

> **Tracking**: [status_tracking.md](file:///c:/Users/User/Documents/app/status_tracking.md)

---

## Overview

Refactor product tracking to use a single `tracking_status` field per tracking record, expose tracking status as a column on the inventory page, wire the "Mark Picked Up" button to create tracking records, wire security return (backend) to reset tracking to `in_house`, move QR scan to inventory page, and remove the dead `BookingProductTrackingModal`.

### Current State

| Aspect | Current |
|--------|---------|
| `product_tracking` schema | `tracking_type` (5 values) + `status` (`out`/`returned`) |
| "returned" tracking | `status='returned'` row update |
| "in_house" concept | Implicit: no active `status='out'` row |
| Inventory tracking display | Separate fetch per product, checks for non-`picked_by_customer` `status='out'` rows |
| Inventory tracking filter | Binary: `all / maintenance / available` |
| Inventory action buttons | View, Edit, Archive — no Track button |
| QR Scan | Inside `ProductTrackingModal` |
| Booking pickup tracking | `handleAutoTrackPickup` tied to booking-level `confirmed` status change |
| `BookingProductTrackingModal` | Imported, rendered, but never opened from any button |

### Target State

| Aspect | Target |
|--------|---------|
| `product_tracking` schema | Single `tracking_status` enum column; history rows kept for audit |
| "returned" tracking | Insert a new row with `tracking_status = 'in_house'` |
| Inventory tracking column | Displays current `tracking_status` for each product |
| Inventory tracking filter | Multi-select dropdown for any subset of the 6 statuses |
| Inventory action buttons | View, Edit, **Track**, Archive |
| QR Scan | On inventory main page next to search bar |
| Booking pickup tracking | `pickupProducts` backend method creates `tracking_status = 'picked_by_customer'` row |
| `BookingProductTrackingModal` | Deleted |
| Security return backend | `returnProducts` inserts `tracking_status = 'in_house'` row after setting `completed` |

---

## Tracking Status Values

| Value | Meaning | Who sets it |
|-------|---------|-------------|
| `in_house` | Product is at rest in the store | Backend: `returnProducts`. Track modal "Mark Returned" button |
| `picked_by_customer` | Product is with a customer | Backend: `pickupProducts` |
| `going_to_dry_clean` | Sent for dry cleaning | Track modal in inventory |
| `alternation_related_work` | Sent for alteration/tailoring | Track modal in inventory |
| `repair` | Sent for repair | Track modal in inventory |
| `other_work` | Any other external work | Track modal in inventory |

**Rules:**
- `in_house` ↔ `picked_by_customer` transitions are exclusively controlled by the booking lifecycle (backend).
- `in_house` ↔ `{dry_clean, alternation, repair, other_work}` transitions are controlled by the Track modal.
- The Track modal does NOT show `in_house` or `picked_by_customer` as radio options.
- "Mark Returned" in the Track modal inserts a new `in_house` row.
- For `picked_by_customer`, the Track modal shows a booking link instead of "Mark Returned".

---

## Step 1: DB Migration — Add `tracking_status` Column

**Priority**: Critical
**Estimated scope**: Small (1 file)
**Depends on**: Nothing

#### [NEW] `backend/src/database/migrations/021_product_tracking_status.sql`

```sql
-- Migration 021: Add tracking_status to product_tracking
-- Single field replaces two-field model (tracking_type + status: out/returned).
-- History rows are preserved for audit.

ALTER TABLE product_tracking
  ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(50);

-- Populate from existing data:
-- returned rows → in_house, out rows → their tracking_type value
UPDATE product_tracking
  SET tracking_status = CASE
    WHEN status = 'returned' THEN 'in_house'
    ELSE tracking_type
  END;

ALTER TABLE product_tracking
  ALTER COLUMN tracking_status SET NOT NULL;

ALTER TABLE product_tracking
  ADD CONSTRAINT chk_tracking_status CHECK (
    tracking_status IN (
      'in_house',
      'picked_by_customer',
      'going_to_dry_clean',
      'alternation_related_work',
      'repair',
      'other_work'
    )
  );

CREATE INDEX IF NOT EXISTS idx_product_tracking_tracking_status
  ON product_tracking(product_id, created_at DESC);
```

### Verification

- All existing rows migrate correctly.
- `SELECT DISTINCT tracking_status FROM product_tracking;` returns only valid values.

---

## Step 2: Backend — Update Routes + `productLifecycleService.js`

**Priority**: Critical
**Estimated scope**: Medium (2 files)
**Depends on**: Step 1

#### [MODIFY] `backend/src/routes/productTracking.js`

1. **POST `/`** — Create tracking record:
   - Accept `tracking_status` (replaces `tracking_type`)
   - Only allow: `going_to_dry_clean`, `alternation_related_work`, `repair`, `other_work` via this endpoint
   - `in_house` and `picked_by_customer` are set only by the lifecycle service
   - Still require `work_description` when `tracking_status = 'other_work'`

2. **PATCH `/:id/return`** — "Mark Returned":
   - Instead of updating the existing row, INSERT a new row with `tracking_status = 'in_house'` for the same `product_id` and `product_code`
   - Returns the new row

3. **GET `/active`**: Replace `WHERE status = 'out'` with `WHERE tracking_status != 'in_house'`, use `DISTINCT ON (product_id) ORDER BY product_id, created_at DESC`

4. **NEW GET `/current/:productId`**: Returns the single latest tracking record for a product.

```js
router.get('/current/:productId', async (req, res) => {
  const result = await pool.query(
    `SELECT pt.*, b.id as booking_id
     FROM product_tracking pt
     LEFT JOIN bookings b ON pt.booking_id = b.id
     WHERE pt.product_id = $1
     ORDER BY pt.created_at DESC
     LIMIT 1`,
    [req.params.productId]
  );
  res.json({ data: result.rows[0] || null });
});
```

#### [MODIFY] `backend/src/services/productLifecycleService.js`

**A. `pickupProducts` method** — After updating `booking_products` to `in_progress`, INSERT `picked_by_customer` tracking rows:

```js
// Inside the loop over bookingProductIds, after the UPDATE:
const bpRow = await client.query(
  `SELECT bp.product_id, p.code
   FROM booking_products bp
   JOIN products p ON p.id = bp.product_id
   WHERE bp.id = $1`,
  [bpId]
);
if (bpRow.rows[0]) {
  await client.query(
    `INSERT INTO product_tracking
       (product_id, booking_id, product_code, tracking_status, notes)
     VALUES ($1, $2, $3, 'picked_by_customer', $4)`,
    [bpRow.rows[0].product_id, bookingId, bpRow.rows[0].code,
     `Picked up by customer for booking #${bookingId}`]
  );
}
```

**B. `returnProducts` method** — After `UPDATE booking_products SET status = 'completed'` (line 904–907), INSERT `in_house` tracking row:

```js
const prodRow = await client.query(
  `SELECT bp.product_id, p.code
   FROM booking_products bp
   JOIN products p ON p.id = bp.product_id
   WHERE bp.id = $1`,
  [bookingProductId]
);
if (prodRow.rows[0]) {
  await client.query(
    `INSERT INTO product_tracking
       (product_id, booking_id, product_code, tracking_status, notes)
     VALUES ($1, $2, $3, 'in_house', $4)`,
    [prodRow.rows[0].product_id, bookingId, prodRow.rows[0].code,
     `Returned by customer, booking #${bookingId} product completed`]
  );
}
```

### Verification

- Call `pickupProducts` → new `picked_by_customer` row appears in `product_tracking`.
- Call `returnProducts` → new `in_house` row appears in `product_tracking`.
- `PATCH /:id/return` → inserts new `in_house` row (not updating old row).

---

## Step 3: Update Shared Types + Frontend API Client

**Priority**: High
**Estimated scope**: Small (3 files)
**Depends on**: Step 2

#### [MODIFY] `shared/src/types/index.ts`

Add to `Product` interface:
```ts
tracking_status?: 'in_house' | 'picked_by_customer' | 'going_to_dry_clean' | 'alternation_related_work' | 'repair' | 'other_work' | null;
tracking_booking_id?: number | null;
```

#### [MODIFY] `shared/src/api/products.ts`

Ensure `GetProductsResponse` includes `tracking_status` and `tracking_booking_id`.

#### [MODIFY] `frontend/lib/productTrackingApi.ts`

- Update `ProductTracking` interface: add `tracking_status` field
- Update `create()`: send `tracking_status` (not `tracking_type`)
- Add `getCurrentStatus(productId: number)` calling `GET /product-tracking/current/:productId`

---

## Step 4: Inventory Page — Tracking Column, Filter, Track Button, QR Scan

**Priority**: High
**Estimated scope**: Large (2 files)
**Depends on**: Steps 2, 3

#### [MODIFY] `backend/src/routes/products.js` — `getProducts`

Embed current tracking status via a lateral subquery:

```sql
LEFT JOIN LATERAL (
  SELECT tracking_status, booking_id
  FROM product_tracking
  WHERE product_id = p.id
  ORDER BY created_at DESC
  LIMIT 1
) latest_tracking ON true
```

Add `latest_tracking.tracking_status AS tracking_status`, `latest_tracking.booking_id AS tracking_booking_id` to SELECT.

#### [MODIFY] `frontend/app/admin/inventory/page.tsx`

1. **Remove** the per-product tracking fetch loop (`trackingPromises`) — tracking status now comes embedded in the products API response.

2. **Add Tracking Status column** after the Status column:

| `tracking_status` | Badge |
|---|---|
| `in_house` or null | 🏠 In House (green) |
| `picked_by_customer` | 👤 With Customer (blue) |
| `going_to_dry_clean` | 🧼 Dry Clean (yellow) |
| `alternation_related_work` | ✂️ Alteration (purple) |
| `repair` | 🔧 Repair (orange) |
| `other_work` | 📝 Other Work (gray) |

3. **Replace** binary `filterMaintenance` state with `filterTrackingStatus: string[]` (empty = show all).
   - Multi-select dropdown: all 6 values as options
   - Filter logic: if array is empty, show all; otherwise show products whose `tracking_status` matches any selected value (treat null as `in_house`)

4. **Add Track button** (🗺️) in each product row's action column, between Edit and Archive. Opens `ProductTrackingModal` for that product.

5. **Add QR Scan button** next to search bar. On successful scan:
   - Call `GET /products?search=<scanned_code>`
   - Set search state to the scanned code so the product row appears

---

## Step 5: Update `ProductTrackingModal`

**Priority**: High
**Estimated scope**: Medium (1 file)
**Depends on**: Step 3

#### [MODIFY] `frontend/components/common/ProductTrackingModal.tsx`

**Remove:**
- "🔄 Change Product" button
- "Scan QR" button and all QR-related state/imports

**Modify the current-status view based on `tracking_status` of the latest record:**

- **`in_house` (or no records):**
  - Show the radio form with 4 options: `going_to_dry_clean`, `alternation_related_work`, `repair`, `other_work`
  - Notes field (required for `other_work`)
  - "Track Out" submit button → calls `POST /product-tracking` with the selected `tracking_status`

- **`picked_by_customer`:**
  - Show: "👤 This product is currently with a customer"
  - Show link: "Check booking #`<booking_id>`" → opens `/admin/bookings/<id>` in new tab
  - No "Mark Returned" button

- **`going_to_dry_clean` / `alternation_related_work` / `repair` / `other_work`:**
  - Show current status badge
  - Show "✓ Mark Returned" button → calls `PATCH /product-tracking/:id/return` which inserts new `in_house` row
  - After success, refresh tracking records

**Keep unchanged:**
- History list of past tracking records at bottom of modal

---

## Step 6: Delete Dead Code — `BookingProductTrackingModal` + Old Auto-Track Helpers

**Priority**: Medium
**Estimated scope**: Small (3 files)
**Depends on**: Step 5

#### [DELETE] `frontend/components/common/BookingProductTrackingModal.tsx`

#### [MODIFY] `frontend/components/common/index.ts`
- Remove: `export { BookingProductTrackingModal } from './BookingProductTrackingModal';`

#### [MODIFY] `frontend/app/admin/bookings/page.tsx`
- Remove import of `BookingProductTrackingModal`
- Remove `trackingBooking` and `showProductTrackingList` state declarations
- Remove `handleAutoTrackPickup` function
- Remove `handleAutoTrackReturn` function
- Remove the `BookingProductTrackingModal` JSX render block
- Remove the stale auto-track hooks (lines 452–460)

---

## File Change Summary

| File | Step | Type |
|------|------|------|
| `backend/src/database/migrations/021_product_tracking_status.sql` | 1 | NEW |
| `backend/src/routes/productTracking.js` | 2 | MODIFY |
| `backend/src/services/productLifecycleService.js` | 2 | MODIFY |
| `shared/src/types/index.ts` | 3 | MODIFY |
| `shared/src/api/products.ts` | 3 | MODIFY |
| `frontend/lib/productTrackingApi.ts` | 3 | MODIFY |
| `backend/src/routes/products.js` | 4 | MODIFY |
| `frontend/app/admin/inventory/page.tsx` | 4 | MODIFY |
| `frontend/components/common/ProductTrackingModal.tsx` | 5 | MODIFY |
| `frontend/components/common/BookingProductTrackingModal.tsx` | 6 | DELETE |
| `frontend/components/common/index.ts` | 6 | MODIFY |
| `frontend/app/admin/bookings/page.tsx` | 6 | MODIFY |

---

## Execution Rules

1. **Step-by-step execution only.** Complete one step fully before starting the next.
2. **User review after EVERY step.**
3. **Update [status_tracking.md](file:///c:/Users/User/Documents/app/status_tracking.md) after every step.**
4. **Run backend tests after each backend step.**
5. **Use WSL for all terminal commands.**
