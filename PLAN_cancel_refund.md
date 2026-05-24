# Implementation Plan: Cancellation Refund & Adjust Logic Fix

> **Tracking**: [status_cancel_refund.md](file:///c:/Users/User/Documents/app/status_cancel_refund.md)

---

## Overview

When cancelling a product, the UI currently offers an **"Adjust against dues"** option even when there are no real outstanding dues on any other product — and a **"Refund to customer"** option based on an incorrect balance figure. Both bugs stem from the same root cause: `remainingDues` is fetched from a booking-wide `getPaymentSummary()` call that includes the outstanding charges of the product *being cancelled* (which is still `confirmed` status at fetch time). After cancellation those charges disappear, so they are not real dues.

There is also a matching backend bug: `processCancellationSettlement()` queries `WHERE bp.status != 'cancelled'` for the adjustment balance, but the product being cancelled is still `confirmed` at that point, so the adjustment is applied against the cancelling product's own outstanding charges — which is financially meaningless.

**Concrete example:**  
Rent = ₹9,200 | Security = ₹9,000 | Customer pays ₹9,000 (goes entirely to rent, per priority order)  
→ `rent_paid = 9000`, `security_paid = 0`  
→ Cancellation: refund = ₹9,000 − ₹920 penalty = **₹8,080** ✓ (correctly calculated)  
→ Bug: `getPaymentSummary()` returns balance = ₹200 (unpaid rent) + ₹9,000 (unpaid security) = **₹9,200**  
→ UI shows "Adjust ₹8,080 against ₹9,200 dues" — **but those dues are on the cancelled product itself, not other products**

**Two changes are required**:

1. **Frontend** (`BookingCancellation.tsx`) — replace the separate `remainingDues` fetch with a new backend-provided field `remaining_dues_on_other_products` that counts only dues on products that will *remain* active after cancellation.
2. **Backend** (`productLifecycleService.js`) — (a) add `remaining_dues_on_other_products` to `calculateCancellationSummary`, and (b) fix `processCancellationSettlement` to exclude the cancelling product's charges from its balance query.

**Portals in scope**: Both admin bookings page and salesman order details page (both use `BookingCancellation.tsx`).

---

## UI / UX Design

### Current (buggy) behaviour

```
Confirm Cancellation
┌──────────────────────────────────────────────────┐
│  Products: 1                                     │
│  Cancelled Product Rent:     ₹9,200              │
│  Cancelled Product Security: ₹9,000              │
│  Cancellation Penalty (10%): ₹920               │
│  Rent Paid:     ₹9,000                           │
│  Security Paid: ₹0                               │
│  ─────────────────────────────────────────────   │
│  Refund Amount: ₹8,080                           │
│                                                  │
│  How would you like to handle the ₹8,080 refund? │
│  ┌────────────────────────────────────────────┐  │
│  │ ○ Refund ₹8,080 to Customer               │  │
│  │ ● Adjust ₹8,080 against dues  ← BUG       │  │
│  │   (Clears ₹8,080 of outstanding dues)     │  │   ← dues don't exist
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Correct behaviour — no other products with dues

When `remaining_dues_on_other_products = 0`, show only a single refund option (no radio buttons):

```
Confirm Cancellation
┌──────────────────────────────────────────────────┐
│  ...summary rows...                              │
│  Refund Amount: ₹8,080                           │
│                                                  │
│  ┌── Refund to Customer ──────────────────────┐  │
│  │  ₹8,080 will be returned to the customer  │  │
│  │  (no outstanding dues on other products)  │  │
│  │  [Cash ▼]  [Notes…]                       │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Correct behaviour — another product has ₹3,000 dues remaining

When `remaining_dues_on_other_products = 3000`, show both options:

```
  How would you like to handle the ₹8,080 refund?
  ┌─────────────────────────────────────────────────┐
  │ ○ Refund ₹8,080 to Customer                    │
  │   Return the full amount to the customer        │
  ├─────────────────────────────────────────────────┤
  │ ● Adjust ₹3,000 against dues                   │
  │   + Refund ₹5,080 to customer                  │
  │   Clears ₹3,000 of outstanding dues on other   │
  │   products; remaining ₹5,080 refunded           │
  └─────────────────────────────────────────────────┘
```

### "Refund" option visibility rule

The entire refund/adjust block is shown only when `summary.refund_amount > 0`. This is already correctly implemented — no change needed here.

---

## Data Flow

```
Current (buggy):
  fetchCancellationPreview()
    → paymentTransactionsApi.getSummary(bookingId)   ← includes cancelled-product dues
      → remainingDues = 9200 (includes cancelling product!)
    → confirmation modal: remainingDues > 0 → shows Adjust option ← BUG

  cancelProduct() → processCancellationSettlement('adjust')
    → WHERE bp.status != 'cancelled'                 ← product still 'confirmed' here
    → remaining_balance = 9200 (includes cancelling product!) ← BUG
    → adjusts 8080 against cancelled product's own charges

Correct (after fix):
  calculateCancellationSummary()
    → adds remaining_dues_on_other_products           ← excludes selected product IDs
    → frontend reads summary.remaining_dues_on_other_products
    → shows Adjust only when > 0

  cancelProduct() → processCancellationSettlement('adjust', excludeProductIds=[bpId])
    → WHERE bp.status != 'cancelled' AND bp.id != ANY(excludeProductIds)
    → remaining_balance = real other-product dues only
```

---

## Step 1: Backend — Add `remaining_dues_on_other_products` to `calculateCancellationSummary`

**Priority**: Critical  
**Layer**: Service  
**Estimated scope**: Small (1 service file, ~10 lines added)

### Problem

`calculateCancellationSummary` returns a `payment_action` of `'refund'` and a `refund_amount`, but gives the frontend no information about how much is owed on *other* products (i.e., products not being cancelled). The frontend has to make a second `getPaymentSummary()` call and uses the wrong figure.

### Changes

#### [MODIFY] `backend/src/services/productLifecycleService.js`

**In `calculateCancellationSummary()`** (around line 1325, just before the `return` statement), add a query to sum outstanding dues on non-selected, non-cancelled, non-exchanged products:

```js
// Dues on products that will remain active after this cancellation
const otherDuesResult = await pool.query(
  `SELECT COALESCE(SUM(pc.due_amount - pc.paid_amount), 0)::INTEGER as remaining_dues
   FROM product_charges pc
   JOIN booking_products bp ON pc.booking_product_id = bp.id
   WHERE bp.booking_id = $1
     AND bp.status NOT IN ('cancelled', 'exchanged')
     AND bp.id != ANY($2::int[])`,
  [bookingId, selectedProductIds]
);
const remainingDuesOnOtherProducts = Math.max(
  0, otherDuesResult.rows[0].remaining_dues || 0
);
```

Add `remaining_dues_on_other_products: remainingDuesOnOtherProducts` to the returned object.

**Updated return shape**:

```js
return {
  selected_count: selectedProducts.length,
  total_count: preview.all_products.length,
  selected_rent: totalSelectedRent,
  selected_security: totalSelectedSecurity,
  selected_rent_paid: totalSelectedRentPaid,
  selected_security_paid: totalSelectedSecurityPaid,
  total_penalty: totalPenalty,
  discount_reverted: discountReverted,
  extra_refund: extraRefund,
  refund_amount: refundAmount,
  refund_blocked: refundBlocked,
  payment_action: paymentAction,
  payment_difference: paymentDifference,
  remaining_dues_on_other_products: remainingDuesOnOtherProducts,  // ← new
};
```

### Verification

- Single-product booking: `remaining_dues_on_other_products = 0`
- Two-product booking, other product has ₹3,000 rent unpaid: `remaining_dues_on_other_products = 3000`
- All selected → `remaining_dues_on_other_products = 0` (nothing left)

### Files touched

| File | Layer |
|------|-------|
| `backend/src/services/productLifecycleService.js` | Service |

---

## Step 2: Backend — Fix `processCancellationSettlement` Balance Query

**Priority**: Critical  
**Layer**: Service  
**Estimated scope**: Small (1 service file, signature change + 1 query tweak)

### Problem

`processCancellationSettlement()` for `action === 'adjust'` queries:

```js
WHERE bp.booking_id = $1 AND bp.status != 'cancelled'
```

At the time this runs (inside `cancelProduct()` before the status update), the product being cancelled is still `confirmed`. So `remaining_balance` includes that product's outstanding charges. The adjustment then applies the refund amount against the cancelling product's own unpaid rent/security — which ceases to be relevant once the product is cancelled.

### Changes

#### [MODIFY] `backend/src/services/productLifecycleService.js`

**`processCancellationSettlement` signature** — add optional `excludeProductIds = []` parameter:

```js
async processCancellationSettlement(
  bookingId, amount, action, paymentMethod, recordedBy, notes,
  existingClient, excludeProductIds = []
) {
```

**Balance query for `action === 'adjust'`** — add exclusion clause:

```js
const balanceResult = await client.query(
  `SELECT 
     (COALESCE(SUM(pc.due_amount), 0) - COALESCE(SUM(pc.paid_amount), 0))::INTEGER as remaining_balance
   FROM product_charges pc
   JOIN booking_products bp ON pc.booking_product_id = bp.id
   WHERE bp.booking_id = $1
     AND bp.status != 'cancelled'
     AND NOT (bp.id = ANY($2::int[]))`,
  [bookingId, excludeProductIds]
);
```

> The parameter is an array to support multi-product cancellation in a single call. When empty, `NOT (bp.id = ANY('{}'))` is always true, preserving existing behaviour.

#### [MODIFY] `backend/src/services/productLifecycleService.js`

**`cancelProduct()`** — pass `[bookingProductId]` as `excludeProductIds`:

```js
settlementResult = await this.processCancellationSettlement(
  bookingProduct.booking_id, settlementAmount, settlementAction,
  settlementMethod, userId, settlementNotes, client,
  [bookingProductId]   // ← new: exclude the product being cancelled
);
```

### Verification

- Cancel with `action = 'adjust'`, no other products: `remaining_balance = 0` → `adjustAmount = 0`, `refundRemainder = full refund` (falls back to a refund)
- Cancel with `action = 'adjust'`, another product has ₹3,000 dues: `remaining_balance = 3000` → `adjustAmount = min(8080, 3000) = 3000`, `refundRemainder = 5080`
- `excludeProductIds = []` (no argument): query returns full booking balance (existing behaviour unchanged)

### Files touched

| File | Layer |
|------|-------|
| `backend/src/services/productLifecycleService.js` | Service |

---

## Step 3: Frontend — Use `remaining_dues_on_other_products` in Cancellation UI

**Priority**: Critical  
**Layer**: Frontend  
**Estimated scope**: Small–Medium (1 component file)  
**Depends on**: Steps 1 and 2 (backend must return the new field)

### Problem

`BookingCancellation.tsx`:
1. Fetches `remainingDues` via a separate `paymentTransactionsApi.getSummary(bookingId)` call (line 197–204) — which returns the wrong figure as described above.
2. Uses `remainingDues` to decide whether to show the "Adjust against dues" option (line 757).
3. Shows "Adjust" even when the only outstanding dues are on the product being cancelled.

### Changes

#### [MODIFY] `frontend/components/common/BookingCancellation.tsx`

**1. Remove the separate `remainingDues` state and API call** from `fetchCancellationPreview()`:

```tsx
// REMOVE these lines (197–204):
try {
  const summaryResponse = await paymentTransactionsApi.getSummary(bookingId);
  const balance = summaryResponse.data?.totals?.balance || 0;
  setRemainingDues(Math.max(0, balance));
} catch (e) {
  setRemainingDues(0);
}
```

**2. Remove** the `remainingDues` state variable and its import of `paymentTransactionsApi` (if no longer used elsewhere):

```tsx
// REMOVE:
const [remainingDues, setRemainingDues] = useState(0);
```

**3. Update the `CancellationSummary` interface** to include the new backend field:

```tsx
interface CancellationSummary {
  // ... existing fields ...
  remaining_dues_on_other_products: number;  // ← add
}
```

**4. Replace `remainingDues` with `summary.remaining_dues_on_other_products`** in the confirmation modal condition (line 757):

```tsx
// BEFORE:
{remainingDues <= 0 ? (
  // No dues — single refund option
) : (
  // Has dues — refund + adjust options
)}

// AFTER:
{(summary.remaining_dues_on_other_products ?? 0) <= 0 ? (
  // No dues on other products — single refund option
) : (
  // Other products have dues — refund + adjust options
)}
```

**5. Update the adjust option labels** to use `summary.remaining_dues_on_other_products` for the capped display amount:

```tsx
// BEFORE (uses remainingDues):
Adjust ₹{Math.floor(Math.min(summary.refund_amount, remainingDues)).toLocaleString('en-IN')} against dues
{summary.refund_amount > remainingDues && (
  <span> + Refund ₹{Math.floor(summary.refund_amount - remainingDues).toLocaleString('en-IN')} to customer</span>
)}

// AFTER (uses backend field):
const otherDues = summary.remaining_dues_on_other_products ?? 0;
Adjust ₹{Math.floor(Math.min(summary.refund_amount, otherDues)).toLocaleString('en-IN')} against dues
{summary.refund_amount > otherDues && (
  <span> + Refund ₹{Math.floor(summary.refund_amount - otherDues).toLocaleString('en-IN')} to customer</span>
)}
```

**6. Update the refund method display condition** (line 817) the same way:

```tsx
// BEFORE:
{(settlementAction === 'refund' || summary.refund_amount > remainingDues) && (

// AFTER:
{(settlementAction === 'refund' || summary.refund_amount > (summary.remaining_dues_on_other_products ?? 0)) && (
```

**7. Remove `remainingDues` from the reset block** (lines 326 and corresponding close handlers):

```tsx
// REMOVE from reset:
setRemainingDues(0);
```

### Verification

- Single-product booking, customer paid ₹9,000, refund = ₹8,080: confirmation shows only "Refund to customer" — no "Adjust" option
- Two-product booking, other product has ₹3,000 dues: confirmation shows both options; "Adjust" label says "₹3,000 against dues + Refund ₹5,080 to customer"
- All products cancelled at once: shows only refund option
- `paymentTransactionsApi` import removed if `getSummary` was its only usage in this component

### Files touched

| File | Layer |
|------|-------|
| `frontend/components/common/BookingCancellation.tsx` | Frontend Component |

---

## Step 4: Tests — Regression Suite for Cancellation Refund/Adjust Logic

**Priority**: High  
**Layer**: Tests  
**Estimated scope**: Medium (1 new test file)  
**Depends on**: Steps 1 and 2 complete

### Problem

There are currently no targeted tests for the `remaining_dues_on_other_products` field or the `processCancellationSettlement` balance exclusion. Without them, a future refactor of either function could silently reintroduce these bugs.

### Changes

#### [ADD] `backend/src/routes/bookingCancellation.test.js` (new cases) or a dedicated test file

**File**: `backend/src/routes/bookingCancellation.test.js`

##### `POST /cancellation/calculate-summary` — `remaining_dues_on_other_products` field

| # | Scenario | Expected `remaining_dues_on_other_products` |
|---|----------|---------------------------------------------|
| 1 | Single-product booking, product partially paid (rent paid, security unpaid), product selected for cancellation | `0` |
| 2 | Two-product booking, one selected for cancellation, other has ₹3,000 unpaid rent | `3000` |
| 3 | Two-product booking, **both** selected for cancellation, each has unpaid charges | `0` |
| 4 | Two-product booking, one selected, other is already `cancelled` status | `0` (cancelled product excluded) |
| 5 | Two-product booking, one selected, other is `exchanged` status | `0` (exchanged product excluded) |
| 6 | Two-product booking, one selected, other is fully paid (no outstanding dues) | `0` |

##### `processCancellationSettlement` — balance excludes cancelling product

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| 7 | Single-product booking, cancel with `settlement_action: 'adjust'` | No adjustment transaction recorded; refund transaction issued for full `diff_amount` |
| 8 | Two-product booking, cancel product A with `settlement_action: 'adjust'`, product B has ₹3,000 dues | Adjustment of ₹3,000 recorded; refund of `diff_amount − 3000` recorded; product A's own charges **not** modified by the adjustment |
| 9 | Two-product booking, cancel product A with `settlement_action: 'refund'` | Refund for full `diff_amount`; product B's dues unchanged |
| 10 | `settlement_action: 'none'` | No payment_transactions recorded for the settlement |

##### Regression — existing cancellation logic unchanged

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| 11 | Cancel with penalty = 0, no other dues, payment = rent | `diff_amount = rent_paid`; refund transaction for `rent_paid` |
| 12 | Cancel with penalty > rent paid (should be blocked) | HTTP 400 / error thrown before settlement |
| 13 | `processCancellationSettlement` called with empty `excludeProductIds` | Same balance as before the fix (all non-cancelled products included) |

### Files touched

| File | Layer |
|------|-------|
| `backend/src/routes/bookingCancellation.test.js` | Test |

---

## Summary: Change Impact by Layer

| Layer | Files Modified | Steps |
|-------|---------------|-------|
| **Service** | `productLifecycleService.js` | 1, 2 |
| **Frontend Component** | `BookingCancellation.tsx` | 3 |
| **Tests** | `bookingCancellation.test.js` | 4 |

### Dependency Graph

```
Step 1 (add remaining_dues_on_other_products to summary)  → independent
Step 2 (fix processCancellationSettlement balance query)   → independent
Step 3 (frontend uses new field)                          → depends on Step 1
Step 4 (regression tests)                                 → depends on Steps 1 and 2
```

Steps 1 and 2 can be done in parallel. Step 3 must follow Step 1. Step 4 should be done after Steps 1 and 2.

---

## Completion Criteria

- [ ] `calculateCancellationSummary` returns `remaining_dues_on_other_products` correctly (0 when no other products, >0 when others have dues)
- [ ] `processCancellationSettlement` balance query excludes the product being cancelled
- [ ] Single-product booking: "Adjust" option is never shown during cancellation
- [ ] Multi-product booking, all selected: "Adjust" option not shown (nothing remaining)
- [ ] Multi-product booking, other product has dues: "Adjust" option shown with correct capped amounts
- [ ] "Refund" option only appears when `summary.refund_amount > 0` (unchanged)
- [ ] Separate `remainingDues` state + `paymentTransactionsApi.getSummary` call removed from `BookingCancellation.tsx`
- [ ] No regression: cancellation penalty, discount revocation, and refund calculation unaffected
- [ ] No regression: existing `processCancellationSettlement` with no `excludeProductIds` argument behaves as before
- [ ] All 13 test cases in `bookingCancellation.test.js` pass

---

## Bug Report: Order #9983 — Two Post-Refund Display Issues

The following bugs were discovered after the refund of ₹4,657 was correctly issued for order #9983.

**Order #9983 context:**
- A product was exchanged (creating Exchange Penalty ₹912 + Downgrade Penalty ₹3,011), then the replacement product was cancelled (Cancellation Penalty ₹520)
- A global discount (₹23 share allocated to the remaining active product) was in effect
- The remaining active product has Rent ₹2,900 + Security ₹3,000
- Customer paid a total of ₹10,343 (all charges fully covered)
- Cancellation refund of ₹4,657 was correctly issued: `paid_for_cancelled_product - cancellation_penalty - discount_reverted`

---

## Step 5: Bug — ₹23 Adjustment is a Phantom Entry That Double-Counts in the Payment Ledger

**Priority**: High (financial correctness, not just display)
**Layer**: Backend Service
**Estimated scope**: Small (remove ~8 lines from `chargeAccountingService.js`)

### Root Cause

The ₹23 `adjustment` in `payment_transactions` represents money that **does not exist**. Here is the precise proof:

**Money flow for the ₹23:**

1. Customer's original payment (₹10,343) was distributed to all charges via `product_charges.paid_amount`. Product B's rent was covered at ₹2,900 (discounted price). No new money enters after this.

2. `revokeGlobalDiscountForCancellation` restores Product B's rent: `due_amount` ↑ to ₹2,923, `paid_amount` ↑ to ₹2,923 (lines 908–919). This is a **direct SQL update** — it manufactures ₹23 of `paid_amount` without any real money coming in.

3. To fund this manufactured `paid_amount`, the refund to the customer is reduced by `discountReverted = 23` (line 309 of `productLifecycleService.js`). The customer gets ₹4,657 instead of ₹4,680. This reduction is the **only real money event** — ₹23 stays with the business.

4. Then `revokeGlobalDiscountForCancellation` **also records a `payment_transactions` row of ₹23 type='adjustment'** (lines 928–934).

**Why this is a genuine double-count in the ledger:**

The `payment_transactions` table is the financial ledger. If you sum it:

| Transaction | Type | Amount |
|---|---|---|
| Customer payment | payment | +10,343 |
| Discount revocation | adjustment | +23 |
| Cancellation refund | refund | −4,657 |
| **Net retained by business** | | **= 5,709** |

But the correct net retained = `10,343 − 4,657 = 5,686`. The ₹23 adjustment **inflates the ledger by ₹23** — the same ₹23 is counted twice:
- Once as "retained from refund" (the reduced refund of ₹4,657 instead of ₹4,680)
- Once as "adjustment applied" (the phantom ₹23 row)

The money was never new. It was reallocated from the refund. Recording it as a positive entry in `payment_transactions` claims it as an additional inflow that never happened.

**Why it doesn't affect `getPaymentSummary` totals today** (but is still wrong):

`total_paid` is computed from `product_charges.paid_amount`, not from `payment_transactions`. So the phantom ₹23 row doesn't distort the balance displayed. But `payment_transactions` is the canonical audit ledger — any future reporting, reconciliation, or accounting export that sums this table will produce an incorrect total.

**Note: cancelled product being included in the query is NOT a bug**

The comment at line 882 says "NOT the one being cancelled — caller sets that status first", but `cancelProduct` calls `revokeGlobalDiscountForCancellation` **before** setting `status = 'cancelled'`. So if the cancelled product has a `global_discount_share > 0`, it IS included in the query and its `paid_amount` is bumped.

This is intentional and correct:
- `rentPaid` is captured at line 285, **before** `revokeGlobalDiscountForCancellation` runs at line 302, so the bump doesn't affect the refund calculation
- `discountReverted = globalDiscount` = the **full** booking-level discount, which correctly includes the cancelled product's own share
- After cancellation, the cancelled product's charges are excluded from `getPaymentSummary` totals (`isActive = false`), so the bump on its `paid_amount` is a harmless no-op
- The full deduction of `discountReverted` from the refund is correct: it covers both the cancelled product's own share AND the remaining products' shares (which need their restored rent covered)


### Fix

Remove the `payment_transactions` INSERT from `revokeGlobalDiscountForCancellation` (lines 925–935). The accounting is fully captured by:
1. The reduced refund amount (via `discountReverted` deducted from `diffAmount`)
2. The direct `product_charges.paid_amount` update (lines 916–919) — this is the real internal ledger
3. The `booking_activity_log` entry (lines 944–953) — this is the audit trail

```js
// REMOVE these lines from revokeGlobalDiscountForCancellation:
const totalAdjustment = adjustmentDetails.reduce((sum, d) => sum + d.amount, 0);
if (totalAdjustment > 0) {
  await client.query(
    `INSERT INTO payment_transactions
     (booking_id, amount, type, method, notes, recorded_by, transaction_date)
     VALUES ($1, $2, 'adjustment', 'Adjustment', $3, 'system', CURRENT_TIMESTAMP)`,
    [bookingId, totalAdjustment, `Discount revocation adjustment: ...`]
  );
}
```

### Files Touched

| File | Layer |
|------|-------|
| `backend/src/services/chargeAccountingService.js` | Service |

### Verification

- Cancel a product from a booking with a global discount applied
- Transaction history shows **only** the `refund` row — no phantom `adjustment` row
- The refund amount is unchanged (₹23 still correctly deducted via `discountReverted` in `cancelProduct`)
- Ledger reconciliation: `payments - refunds = net retained` (no phantom ₹23 inflating the total)
- `booking_activity_log` still contains full discount revocation details
- Run `bookingCancellation.test.js` — no regressions

---

## Step 6: Bug — "Balance Due ₹4,657" Shown After Correct Refund (Wrong Formula)

**Priority**: High
**Layer**: Frontend Component
**Estimated scope**: Small (1-line fix in `PaymentManagement.tsx`)

### Problem

In `PaymentManagement.tsx` (line 410):

```js
// Display balance accounts for refunds: what's owed - (paid - refunded)
const balanceDue = totalRequired - totalPaid + totalRefunded;
```

After the ₹4,657 cancellation refund:
- `totalRequired` = `summary.totals.total_due` = ₹10,343 (remaining active product's rent ₹2,900 + security ₹3,000 + all penalties ₹4,443)
- `totalPaid` = `summary.totals.total_paid` = ₹10,343 (all active charges are fully paid in `product_charges`)
- `totalRefunded` = `summary.totals.total_refunded` = ₹4,657 (from `payment_transactions WHERE type='refund'`)

Result: `balanceDue = 10,343 − 10,343 + 4,657 = **₹4,657**` — but this is wrong. The true outstanding balance is ₹0.

### Root Cause

The formula was written under the assumption that issuing a refund creates a new liability (the customer "still owes" the refunded amount). This is correct for **security deposit refunds**, where security was collected but the product is returned — the security was already counted as `paid` in `product_charges`, so refunding it means the customer's effective payment decreases.

However, this formula is **wrong for cancellation refunds**, and indeed wrong in the general case for this codebase. The reason:

- `total_paid` in `getPaymentSummary` is computed as the **sum of `product_charges.paid_amount`** for active charges — it is **never reduced** when a refund is issued. Refunds only insert a row in `payment_transactions`; they do not touch `product_charges.paid_amount`.
- `total_due` already excludes the cancelled product's rent and security (because `isActive = !['exchanged', 'cancelled'].includes(product.status)`, lines 100–101 of `chargeAccountingService.js`).
- So after cancellation: `total_due = remaining active charges`, `total_paid = paid for those same charges` → `balance = 0`.
- The backend's `summary.totals.balance = total_due - total_paid = 0` is **already correct**.

The frontend adds `totalRefunded` back to the balance, creating a phantom liability that equals the refund amount.

### Fix

Replace the custom formula with the backend's pre-computed balance:

```tsx
// BEFORE (line 410):
const balanceDue = totalRequired - totalPaid + totalRefunded;

// AFTER:
const balanceDue = summary.totals?.balance ?? 0;
```

The backend `getPaymentSummary` already computes `totals.balance = total_due - total_paid` correctly for all scenarios (active bookings, partial cancellations, full cancellations). The frontend should trust this value rather than re-deriving it with a formula that cannot correctly account for all refund types.

### Files Touched

| File | Layer |
|------|-------|
| `frontend/components/common/PaymentManagement.tsx` | Frontend Component |

### Verification

- After issuing a cancellation refund, Balance Due should show ₹0 (green "Fully Paid")
- For an active booking with outstanding dues: Balance Due shows the correct outstanding amount
- For a partial cancellation: Balance Due reflects only the remaining active product's outstanding charges
- Security deposit refunds (from `processSecurityReturn`) should also show ₹0 balance after refund, since the security `due_amount` is excluded from active charges once the product is completed

---

## Step 7: Bug — `total_paid` Computed from `product_charges` Instead of `payment_transactions`

**Priority**: High (financial correctness — causes wrong balance in any booking with a cancelled product that had a global discount share)
**Layer**: Backend Service
**Estimated scope**: Small (~10 lines in `getPaymentSummary` in `chargeAccountingService.js`)

### Problem

`getPaymentSummary` currently computes `total_paid` by summing `product_charges.paid_amount` for **active** products only. This causes `total_paid` to be understated (and `balance` to be overstated) whenever any money was applied to a now-cancelled product's charges.

**Example — Order #9986:**
- Customer paid ₹6,000 cash
- After cancellation + global discount revocation, ₹280 (cancelled product's discount share) landed in the cancelled product's `paid_amount` → excluded from `total_paid`
- `total_paid` shows ₹5,720 instead of ₹6,000 → `balance` shows ₹12,744 instead of ₹12,464

### Root Cause

The correct formula is:

```
total_paid = total actually paid by customer − total refunded to customer
           = SUM(payment_transactions WHERE type = 'payment')
           − SUM(payment_transactions WHERE type = 'refund')
```

`payment_transactions` is the canonical ledger of all customer cash flows. It is agnostic to which internal charges the money was applied to, and therefore is never affected by cancelled-product exclusions.

### Fix

In `getPaymentSummary` (`chargeAccountingService.js`), replace the `total_paid` field computation:

**BEFORE** — derived from `product_charges.paid_amount` for active products:
```js
total_paid: <accumulated from product_charges loop>
```

**AFTER** — derived from `payment_transactions`:
```js
const paidResult = await client.query(
  `SELECT COALESCE(SUM(amount), 0)::NUMERIC as total_paid
   FROM payment_transactions
   WHERE booking_id = $1 AND type = 'payment'`,
  [bookingId]
);
const total_paid = parseFloat(paidResult.rows[0].total_paid);
```

`total_refunded` is already sourced from `payment_transactions` (type = `'refund'`). No change needed there.

`balance = total_due − total_paid` (unchanged formula, correct result since `total_paid` now correctly reflects all customer cash).

### Files Touched

| File | Layer |
|------|-------|
| `backend/src/services/chargeAccountingService.js` | Service |

### Verification

- Order #9986: `total_paid` = ₹6,000, `balance` = ₹12,464
- Order #9983 (post-refund): `total_paid` = original payments − ₹4,657 refund = ₹0 net outstanding → `balance` = ₹0
- Active booking with no cancellations: `total_paid` from `payment_transactions` matches existing behaviour
- Run `bookingCancellation.test.js` — no regressions

---

## Step 8: Fix `revokeGlobalDiscountForCancellation` — skip cancelled product, return active-only discount reverted

**Files**: `backend/src/services/chargeAccountingService.js`, `backend/src/services/productLifecycleService.js`

**Root cause**: `revokeGlobalDiscountForCancellation` currently includes the product being cancelled in its active-products loop (because its status is still `'confirmed'` at call time). This bumps the cancelled product's `rent.due_amount` and `rent.paid_amount` by its `global_discount_share` (Y_share). However, `rentPaid` used for the refund/adjustment calculation was captured **before** this bump, so Y_share is deducted from the refund (via `discountReverted = globalDiscount`) but is also added to Y's `product_charges.paid_amount` — where it is then excluded (Y is cancelled). The Y_share effectively disappears, leaving `product_charges` active total_paid understated by exactly Y_share, causing a persistent gap.

**Fix**:
1. `revokeGlobalDiscountForCancellation` accepts a new optional param `cancellingProductId`. The active products query adds `AND id != $cancellingProductId` to exclude the cancelling product.
2. Return `{ discountReverted: totalAdjustment }` (sum of active products' shares actually applied) instead of `{ discountReverted: globalDiscount }` (the full booking discount). This ensures only the portion reverted for active products is deducted from the refund.
3. Caller (`cancelProduct` in `productLifecycleService.js`) passes `bookingProductId` as the third argument.

**Result**: `diffAmount = rentPaid − penalty − X_share_only`. The adjustment applied to active dues is higher by Y_share. Active `product_charges.paid` = 6,000. Balance from both product_charges and payment_transactions = 12,464. No gap.

---

## Updated Summary: Change Impact by Layer

| Layer | Files Modified | Steps |
|-------|---------------|-------|
| **Service** | `productLifecycleService.js` | 1, 2 |
| **Frontend Component** | `BookingCancellation.tsx` | 3 |
| **Tests** | `bookingCancellation.test.js` | 4 |
| **Service** | `chargeAccountingService.js` | 5, 7, 8 |
| **Frontend Component** | `PaymentManagement.tsx` | 6 |
