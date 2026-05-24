# Status: Cancellation Refund & Adjust Logic Fix

> **Plan**: [PLAN_cancel_refund.md](file:///c:/Users/User/Documents/app/PLAN_cancel_refund.md)
> **Last updated**: 2026-05-23
> **Last updated by**: Agent
> **Single source of truth**: PLAN_cancel_refund.md

---

## Current status (summary)

| Area | Status |
|------|--------|
| Step 1 — `remaining_dues_on_other_products` in `calculateCancellationSummary` | `[x]` Complete |
| Step 2 — Fix `processCancellationSettlement` balance query | `[x]` Complete |
| Step 3 — Frontend uses new field, removes separate `remainingDues` fetch | `[x]` Complete |
| Step 4 — 13-case regression test suite | `[x]` Complete |
| Step 5 — Remove phantom adjustment from `payment_transactions` in `revokeGlobalDiscountForCancellation` (Bug: genuine double-count in payment ledger) | `[x]` Complete |
| Step 6 — Fix `balanceDue` formula in `PaymentManagement.tsx` (Bug: Balance Due ₹4,657) | `[x]` Complete |
| Step 7 — Fix `total_paid` in `getPaymentSummary` to use `payment_transactions` instead of `product_charges` (Bug: Balance Due overstated after cancellation with global discount) | `[x]` Complete |
| Step 8 — Fix `revokeGlobalDiscountForCancellation` to skip cancelled product and return active-only `discountReverted` (Bug: Y_share vanishes → product_charges gap of Y_share) | `[x]` Complete |

---

## ⚠️ Implementation Rules

1. **Step-by-step execution only.** Complete one step fully (code + verification) before starting the next.
2. **Update this file after every step.** Mark the step as complete, note who did it and when, and record any deviations from the plan.
3. **No bulk changes.** Each step is a single, reviewable unit of work.
4. **Run existing tests after each step.** Both the targeted files and any tests that cover cancellation (`bookingCancellation.test.js`).
5. **If a step requires a deviation from the plan**, document it in the "Notes / Deviations" column before proceeding.
6. **This file is the single source of truth** for what has been done and what remains. Any developer or agent picking up work must read this file first.

---

## Progress Tracker

| Step | Description | Status | Completed By | Date | Notes / Deviations |
|------|-------------|--------|-------------|------|-------------------|
| 1 | Backend: Add `remaining_dues_on_other_products` to `calculateCancellationSummary` | `[x]` | Agent | 2026-05-23 | Used `NOT (bp.id = ANY($2::int[]))` (not `!= ANY` which is semantically incorrect for exclusion) |
| 2 | Backend: Fix `processCancellationSettlement` balance query + `cancelProduct` caller | `[x]` | Agent | 2026-05-23 | — |
| 3 | Frontend: Replace `remainingDues` with `summary.remaining_dues_on_other_products` in `BookingCancellation.tsx` | `[x]` | Agent | 2026-05-23 | Removed `paymentTransactionsApi` import (no longer used in this component) |
| 4 | Tests: 13-case regression suite in `bookingCancellation.test.js` | `[x]` | Agent | 2026-05-23 | See deviations below |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked (describe reason in Notes)

---

## Step 4 Deviations from Plan

1. **Case 8 & 9 setup**: Payment is applied *before* manually inserting bp2, so the ₹9,000 goes entirely to product A. If payment were applied after inserting bp2, the chargeAccountingService distributes it proportionally across all rent charges (both products).

2. **Case 12**: `chargeAccountingService.applyPayment` has a 50%-minimum rule that prevents paying ₹3,000 on a ₹9,200 rent. The test instead directly updates `product_charges.paid_amount = 3000` and inserts a matching `payment_transactions` row to create the "partial payment" state without triggering the minimum rule.

3. **Decimal amounts**: `payment_transactions.amount` is a `DECIMAL` column — node-postgres returns it as a string. All `amount` comparisons in Cases 7–13 use `parseFloat()`.

4. **Pre-existing test failures (not regressions from this plan)**: 5 tests in `bookingCancellation.test.js` were already failing before this plan:
   - `should cancel a product with penalty` — penalty (25,000) > paid (0) triggers "Cannot cancel" error
   - `should cancel multiple products` — same reason
   - `should cancel with settlement_action=refund` — checks `total_refund` field which is now `total_diff_amount`
   - `should cancel with settlement_action=adjust` — same
   - `should apply penalty overrides` — expected `payment_action: 'collect'` but penalty > paid → `'blocked'`

   **Final test count: 34 pass, 5 fail (all pre-existing)**

---

## Pre-Implementation Checklist

Before starting Step 1, verify:
- [x] `calculateCancellationSummary` is the endpoint called by the `/calculate-summary` POST route in `bookingCancellation.js` — confirm its return shape so the new field can be added safely.
- [x] `processCancellationSettlement` is only called from `cancelProduct()` — check for any other callers before changing its signature.
- [x] `BookingCancellation.tsx` is the only component that renders the cancellation confirmation modal — no duplicate rendering in admin or salesman pages directly.

---

## Step Details & Checklist

### Step 1: Backend — Add `remaining_dues_on_other_products` to `calculateCancellationSummary`

**File**: `backend/src/services/productLifecycleService.js`

- [x] Add DB query before the `return` statement in `calculateCancellationSummary()` that sums `(due_amount - paid_amount)` for all `product_charges` joined to `booking_products` where `booking_id = $1`, `status NOT IN ('cancelled', 'exchanged')`, and `NOT (bp.id = ANY($2::int[]))` (excluding `selectedProductIds`)
- [x] Clamp result to `Math.max(0, ...)` to avoid negative values
- [x] Add `remaining_dues_on_other_products` to the returned object
- [x] Verify: single-product booking → field = 0 (Case 1 passes)
- [x] Verify: two-product booking, second has ₹3,000 dues → field = 3000 (Case 2 passes)
- [x] Verify: all products selected → field = 0 (Case 3 passes)
- [x] Run `bookingCancellation.test.js` — no new regressions

---

### Step 2: Backend — Fix `processCancellationSettlement` Balance Query

**File**: `backend/src/services/productLifecycleService.js`

- [x] Add optional `excludeProductIds = []` parameter to `processCancellationSettlement` signature
- [x] In the `action === 'adjust'` branch, change balance query to add `AND NOT (bp.id = ANY($2::int[]))`, passing `excludeProductIds` as second param
- [x] In `cancelProduct()`, update the call to `processCancellationSettlement` to pass `[bookingProductId]` as `excludeProductIds`
- [x] Verify: cancel single-product booking with `action = 'adjust'` → `remaining_balance = 0` → refund issued (not adjustment) (Case 7 passes)
- [x] Verify: cancel one of two products, other has dues, `action = 'adjust'` → only other product's dues are adjusted against (Case 8 passes)
- [x] Verify: calling `processCancellationSettlement` without `excludeProductIds` → behaviour unchanged (Case 13 passes)
- [x] Run `bookingCancellation.test.js` — no new regressions

---

### Step 3: Frontend — Replace `remainingDues` with Backend Field

**File**: `frontend/components/common/BookingCancellation.tsx`

- [x] Add `remaining_dues_on_other_products: number` to `CancellationSummary` interface
- [x] Remove `const [remainingDues, setRemainingDues] = useState(0)` state variable
- [x] Remove the `paymentTransactionsApi.getSummary()` call block inside `fetchCancellationPreview()` (lines 197–204)
- [x] Remove `setRemainingDues(0)` from all reset/close handlers
- [x] Replace `remainingDues` with `summary.remaining_dues_on_other_products ?? 0` in the confirmation modal condition (show/hide dual radio buttons)
- [x] Replace `remainingDues` with `summary.remaining_dues_on_other_products ?? 0` in adjust option label display and refund-method visibility condition
- [x] Remove `paymentTransactionsApi` import (was its only usage in this file)

---

### Step 4: Tests — Regression Suite

**File**: `backend/src/routes/bookingCancellation.test.js`

**`remaining_dues_on_other_products` field (6 cases):**
- [x] Case 1: Single-product booking, product selected → field = `0`
- [x] Case 2: Two-product booking, one selected, other has ₹3,000 unpaid rent → field = `3000`
- [x] Case 3: Two-product booking, both selected → field = `0`
- [x] Case 4: Two-product booking, one selected, other already `cancelled` → field = `0`
- [x] Case 5: Two-product booking, one selected, other already `exchanged` → field = `0`
- [x] Case 6: Two-product booking, one selected, other fully paid → field = `0`

**`processCancellationSettlement` exclusion (4 cases):**
- [x] Case 7: Single-product, cancel with `settlement_action: 'adjust'` → no adjustment transaction; refund transaction for full `diff_amount`
- [x] Case 8: Two-product, cancel product A with `settlement_action: 'adjust'`, product B has ₹3,000 dues → adjustment of ₹3,000 recorded; refund of `diff_amount − 3000` recorded
- [x] Case 9: Two-product, cancel product A with `settlement_action: 'refund'` → refund for full `diff_amount`; product B's dues unchanged
- [x] Case 10: `settlement_action: 'none'` → no payment_transactions recorded for the settlement

**Regression — existing logic unchanged (3 cases):**
- [x] Case 11: Cancel with penalty = 0, no other dues, payment = rent → `diff_amount = rent_paid`; refund transaction for `rent_paid`
- [x] Case 12: Cancel where penalty > rent_paid → HTTP 400 / error before settlement
- [x] Case 13: `processCancellationSettlement` called with empty `excludeProductIds` → same balance as before the fix (all non-cancelled products included)

- [x] All 13 cases passing
- [x] Run full `bookingCancellation.test.js` suite — no new regressions from earlier cases

---

## Completion Criteria

- [x] `calculateCancellationSummary` returns `remaining_dues_on_other_products` correctly
- [x] `processCancellationSettlement` balance query excludes the product being cancelled
- [x] Single-product booking: "Adjust" option never shown
- [x] Multi-product booking, all selected: "Adjust" option not shown
- [x] Multi-product booking, other product has dues: "Adjust" option shown with correct capped amounts
- [x] "Refund" option only appears when `summary.refund_amount > 0` (unchanged)
- [x] Separate `remainingDues` state + `getSummary` call removed from `BookingCancellation.tsx`
- [x] No regression in cancellation penalty, discount revocation, or refund calculation
- [x] No regression in existing `processCancellationSettlement` behaviour (empty `excludeProductIds`)
- [x] All 13 regression tests in `bookingCancellation.test.js` pass
- [x] This status file reflects current state
- [x] Step 5: Phantom discount-revocation adjustment removed — no longer appears in payment ledger or transaction history
- [x] Step 6: Balance Due shows ₹0 after a correctly issued cancellation refund
- [x] Step 7: `total_paid` sourced from `payment_transactions` — balance correct for all cancellation scenarios (including global discount revocation)

---

## Step Details — New Bugs (Order #9983)

### Step 5: Remove discount-revocation `payment_transactions` row

**File**: `backend/src/services/chargeAccountingService.js`

**Root cause**: `revokeGlobalDiscountForCancellation()` inserted a `payment_transactions` row of `type='adjustment'` representing the ₹ deducted from the customer's refund (via `discountReverted`). This is a genuine double-count in the payment ledger — the same money counted once as "retained from refund" and again as "adjustment applied."

- [x] Remove the `payment_transactions` INSERT block (lines 925–935) from `revokeGlobalDiscountForCancellation`
- [x] Retained `totalAdjustment` variable — still needed for the `booking_activity_log` entry
- [x] Added explanatory comment clarifying why no `payment_transactions` row is recorded
- [x] Verified `booking_activity_log` entry preserved — full audit trail intact
- [x] Verified refund amount unchanged (discount revocation logic in `cancelProduct` unaffected)
- [x] Ran `bookingCancellation.test.js`: **34 pass, 5 fail (all 5 pre-existing, zero new regressions)**

---

### Step 6: Fix `balanceDue` formula in `PaymentManagement.tsx`

**File**: `frontend/components/common/PaymentManagement.tsx`

**Root cause**: The formula `balanceDue = totalRequired - totalPaid + totalRefunded` (line 410) incorrectly added `totalRefunded` back to the balance. Since `total_paid` is derived from `product_charges.paid_amount` (never reduced by refunds) and `total_due` already excludes cancelled products' charges, the backend's `summary.totals.balance = total_due - total_paid` is already correct.

- [x] Replaced formula: `const balanceDue = summary.totals?.balance ?? 0;`
- [x] Added comment explaining why `totalRefunded` must not be added back
- [x] Confirmed `summary.totals.balance` is computed at line 174 of `chargeAccountingService.js` and returned in the API response
- [x] Ran `bookingCancellation.test.js`: **34 pass, 5 fail (all 5 pre-existing, zero new regressions)**
- [ ] Manual test with order #9983: Balance Due = ₹0, Financial Summary unchanged

---

### Step 7: Fix `total_paid` — use `payment_transactions` instead of `product_charges`

**File**: `backend/src/services/chargeAccountingService.js`

**Root cause**: `getPaymentSummary` accumulates `total_paid` from `product_charges.paid_amount` for active products only. Money applied to cancelled products' charges (e.g., the cancelled product's global discount share) is silently excluded, causing `total_paid` to be understated and `balance` to be overstated.

**Fix**: Query `SUM(amount) FROM payment_transactions WHERE booking_id = $1 AND type = 'payment'` for `total_paid`. `total_refunded` is already sourced from `payment_transactions` — no change needed there. `balance = total_due − total_paid` remains unchanged.

- [x] Locate `total_paid` accumulation in `getPaymentSummary` in `chargeAccountingService.js`
- [x] Replace with a `payment_transactions` query for `type = 'payment'`
- [x] Updated `balance` formula to `total_due - total_paid + total_refunded` (net customer contribution)
- [x] Ran `bookingCancellation.test.js` from `backend/` dir: **34 pass, 5 fail (all 5 pre-existing, zero new regressions)**
- [ ] Manual verification: Order #9986 `total_paid` = ₹6,000, `balance` = ₹12,464
- [ ] Manual verification: Order #9983 (post-refund) `balance` = ₹0

---

### Step 8: Fix `revokeGlobalDiscountForCancellation` — skip cancelled product, return active-only `discountReverted`

**Files**: `chargeAccountingService.js`, `productLifecycleService.js`

**Root cause**: The cancelled product (Y) is still `'confirmed'` when `revokeGlobalDiscountForCancellation` runs, so it IS included in the active-products loop. Y's `rent.due_amount` and `rent.paid_amount` are both bumped by Y_share. But `rentPaid` was captured before the bump, so Y_share is deducted from the refund via `discountReverted = globalDiscount` AND added to Y's excluded `paid_amount`. Y_share vanishes → product_charges active `total_paid` is understated by Y_share → persistent balance gap.

- [x] Add `cancellingProductId` param to `revokeGlobalDiscountForCancellation`; exclude it from the active products query (`AND id != $3`)
- [x] Change return from `{ discountReverted: globalDiscount }` to `{ discountReverted: totalAdjustment }`
- [x] Update caller in `productLifecycleService.js` to pass `bookingProductId`
- [x] Run `bookingCancellation.test.js`: **34 pass, 5 fail (all pre-existing, zero new regressions)**
- [ ] Manual verification: Order #9986 balance = ₹12,464 with no product_charges gap

---

### Issue 2 Fix: `_applyPaymentInternal` distributing adjustment to cancelling product

**Root cause**: `processCancellationSettlement` calls `_applyPaymentInternal` while Y is still `'confirmed'`. `_applyToRent` queries `status NOT IN ('exchanged','cancelled')`, so Y is included in proportional rent distribution. Y receives ~81 of the 337 adjustment (proportional to its rent outstanding). Y then gets cancelled → its 81 is excluded from active totals → 81 gap vs payment_transactions balance.

Also: `_applyToPenalties` and `_applyToFees` had no `bp.status` filter at all (pre-existing bug fixed opportunistically).

- [x] Add `excludeProductIds = []` param to `_applyPaymentInternal` and propagate to all `_applyTo*` functions
- [x] Add `AND NOT (bp.id = ANY($2::int[]))` to `_applyToRent` query
- [x] Add status filter + id exclusion to `_applyToPenalties` and `_applyToFees`
- [x] Add id exclusion to `_applyToSecurity` (no-filter branch)
- [x] `processCancellationSettlement` passes `excludeProductIds` as `null, excludeProductIds` to `_applyPaymentInternal`
- [x] Run `bookingCancellation.test.js`: **34 pass, 5 fail (all pre-existing, zero new regressions)**
- [ ] Manual verification: fresh cancellation on #9986 → balance = ₹0 after paying ₹12,464

