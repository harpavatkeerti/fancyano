# Implementation Plan: Exchange Payment Allocation Bug

> **Root cause commit**: `1a7bcc4` (2026-04-19) — "fix for correct adjustment in case of exchange"
> **Tracking**: [status_exchange_bug.md](file:///c:/Users/User/Documents/app/status_exchange_bug.md)

---

## Overview

This plan fixes 2 bugs introduced in the exchange flow on April 19, 2026. The exchange payment is incorrectly redistributed across **all** products' rent (via the generic waterfall), and a spurious "adjustment" transaction double-counts already-paid rent.

**No backward compatibility concerns** — existing exchange records may be inconsistent; only new exchanges need to follow the corrected rules.

---

## Bug Analysis

### What happens today (broken)

When product A (old, rent ₹2,637) is exchanged for product B (new, rent ₹5,200):

1. Penalties are added to product A (still `confirmed`)
2. Product B is created with charges initialized
3. **`applyAdjustment()`** queries A's `rent.paid_amount` (₹1,437) and creates a **visible adjustment transaction** → This ₹1,437 was already counted in the original ₹6,000 payments. The adjustment double-counts it.
4. **`applyPayment()`** distributes the ₹4,027 exchange payment through the **global waterfall** → Rent (priority 1) consumes everything proportionally across ALL products. The exchange penalty (₹264, priority 3) never gets reached.
5. Product A is finally marked `exchanged` — **too late**, waterfall already distributed to it.

### What should happen (correct)

1. Penalties are added to product A
2. Product B is created with charges initialized
3. Product A is marked `exchanged` → waterfall now excludes it
4. Product A's rent charges are zeroed out; its paid portion is **internally redistributed to the new product(s) only** — no other pre-existing product in the booking is touched in any way (no transaction record — the original payments already exist)
5. Exchange payment (₹4,027) is applied **targeted**: exchange penalty → downgrade penalty → **new product(s) rent only** (not all products)

### Key principle

> Exchange payment = money collected specifically for penalties + new product rent.
> It must NOT touch any pre-existing products. Only the exchanged (old) product and the new exchange product(s) are ever modified.
> Pre-existing products' rent is funded by the original booking payments and must remain exactly as-is.

### Why the bug was not caught by tests

Every `exchangeProduct()` test call omits the `payment` parameter (defaults to `{}`), so `paymentAmount = 0`. This means STEP 3 (`applyAdjustment`) and STEP 4 (`applyPayment`) — the broken code — never executed in any test. The tests only verified the structural aspects (status change, new product created, history recorded, activity log) but never tested the financial allocation behavior. No test ever:
- Passed a `payment` object to `exchangeProduct()`
- Checked `product_charges.paid_amount` after an exchange
- Verified no 'adjustment' transaction was created
- Verified that penalty charges were actually paid

The bug was only visible in production because it only triggers when a payment is collected at exchange time.

---

## Step 1: Add Targeted Exchange Methods to chargeAccountingService

**Priority**: Critical
**Layer**: Service
**Estimated scope**: Medium (1 service file + 1 test file)

### Problem

`chargeAccountingService` only has `applyPayment()` (global waterfall) and `applyAdjustment()` (same waterfall + creates transaction). Neither can:
- Redistribute charges internally without creating a transaction record
- Target payment to specific charge types on specific products

### Changes

#### [MODIFY] backend/src/services/chargeAccountingService.js

**Add method: `redistributeRentInternal()`**

Moves the exchanged product's rent `paid_amount` to the **new exchange product(s) only** (`newBookingProductIds`), proportionally. No payment_transaction created — this is internal bookkeeping only (the original payments already exist as transactions). **No other pre-existing product in the booking is touched.**

```js
/**
 * Internally redistribute an exchanged product's rent paid to the new exchange product(s) only.
 * Does NOT create a payment_transaction — the original payments already exist.
 * No other pre-existing product in the booking is touched in any way.
 * @param {number} bookingId
 * @param {number} exchangedBookingProductId - The product being exchanged (source of credit)
 * @param {number[]} newBookingProductIds - New products receiving the credit (targets only)
 * @param {Object} client - DB transaction client
 * @returns {{ redistributed: number }} Amount redistributed
 */
async redistributeRentInternal(bookingId, exchangedBookingProductId, newBookingProductIds, client) {
  // 1. Read old product's rent paid_amount
  // 2. Zero out old product's rent charge (due=0, paid=0)
  // 3. Distribute that amount proportionally to newBookingProductIds' rent charges ONLY
  //    (using _distributeProportionally by bp.rent, capped at each product's outstanding rent)
  // 4. Return { redistributed: amount }
}
```

Logic detail:
- Query `product_charges WHERE booking_product_id = exchangedId AND charge_type = 'rent'` → get `paid_amount`
- Set that charge to `due_amount = 0, paid_amount = 0` (zeroed — product is exchanged, rent is void)
- Query rent charges for **only the new exchange products**: `JOIN booking_products bp ON ... WHERE bp.id = ANY(newBookingProductIds::int[]) AND pc.charge_type = 'rent'` — must JOIN `booking_products` to get `bp.rent` for `_distributeProportionally()`
- Distribute using existing `_distributeProportionally()` by `bp.rent`, cap each allocation at product's outstanding
- Update each new product's `paid_amount += allocated`

**Add method: `applyExchangePayment()`**

A targeted payment allocator that pays penalties first, then rent ONLY for specific new products.

```js
/**
 * Apply exchange payment — targeted allocation for exchange flows.
 * Priority: exchange_penalty → downgrade_penalty → new product(s) rent only.
 * Creates a single payment_transaction record.
 * @param {number} bookingId
 * @param {number} amount - Payment amount
 * @param {number} oldBookingProductId - Exchanged product (has penalties)
 * @param {number[]} newBookingProductIds - New products (receive rent payment)
 * @param {string} method - Payment method
 * @param {string} recordedBy
 * @param {string} notes
 * @param {Object} client - DB transaction client
 */
async applyExchangePayment(bookingId, amount, oldBookingProductId, newBookingProductIds, method, recordedBy, notes, client) {
  let remaining = amount;

  // 1. Pay exchange_penalty on old product
  remaining = await this._paySpecificCharge(oldBookingProductId, 'exchange_penalty', remaining, client);

  // 2. Pay downgrade_penalty on old product
  remaining = await this._paySpecificCharge(oldBookingProductId, 'downgrade_penalty', remaining, client);

  // 3. Pay rent ONLY on new products (proportionally if multiple)
  if (remaining > 0) {
    remaining = await this._payRentForProducts(newBookingProductIds, remaining, client);
  }

  // 4. Record single payment transaction
  await client.query(
    `INSERT INTO payment_transactions
     (booking_id, amount, type, method, notes, recorded_by, transaction_date)
     VALUES ($1, $2, 'payment', $3, $4, $5, CURRENT_TIMESTAMP)`,
    [bookingId, amount, method, notes, recordedBy]
  );

  // 5. Activity log
  await client.query(
    `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
     VALUES ($1, 'exchange_payment', $2, $3)`,
    [bookingId, JSON.stringify({ amount, old_product: oldBookingProductId, new_products: newBookingProductIds }), recordedBy]
  );
}
```

**Add private helpers:**

```js
/**
 * Pay a specific charge type on a specific booking product.
 * @returns {number} remaining amount after payment
 */
async _paySpecificCharge(bookingProductId, chargeType, amount, client) {
  // Query the specific charge, pay min(amount, outstanding), return remainder
}

/**
 * Pay rent charges only for specific booking product IDs (proportionally).
 * @returns {number} remaining amount after payment
 */
async _payRentForProducts(bookingProductIds, amount, client) {
  // Query rent charges for only these product IDs
  // Distribute proportionally using _distributeProportionally()
  // Return remainder
}
```

#### [MODIFY] backend/src/services/chargeAccountingService.test.js

Add test block: **"Exchange Payment Allocation"**

Test cases for `redistributeRentInternal()`:
- Redistributes ₹1,437 from exchanged product to 2 new exchange products proportionally (pre-existing products NOT touched)
- Redistributes to single new exchange product → gets full amount
- Exchanged product with 0 paid → nothing redistributed (early return)
- Capping: new product's outstanding < redistributed portion → capped at outstanding

Test cases for `applyExchangePayment()`:
- ₹4,027 with ₹264 exchange penalty → penalty paid first (₹264), rest (₹3,763) to new product rent
- With downgrade penalty → penalty paid second
- With multiple new products → rent distributed proportionally
- No payment_transaction of type 'adjustment' created (only 'payment')
- Amount exactly covers penalties → new product rent gets ₹0

### Verification

- Run `chargeAccountingService.test.js` — all new + existing tests pass
- No adjustment transactions created in test scenarios

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/chargeAccountingService.js` | Service |
| `backend/src/services/chargeAccountingService.test.js` | Test |

---

## Step 2: Rewrite Exchange Flow in productLifecycleService

**Priority**: Critical
**Layer**: Service
**Estimated scope**: Medium (1 service file + 1 test file)
**Depends on**: Step 1

### Problem

`exchangeProduct()` in `productLifecycleService.js` uses the wrong order of operations and wrong payment methods (generic `applyAdjustment` and `applyPayment`).

### Changes

#### [MODIFY] backend/src/services/productLifecycleService.js

**Method: `exchangeProduct()`** (lines 47–258)

Rewrite Steps 3–5. Current:

```
STEP 3: applyAdjustment(rentCredit)     ← creates visible transaction, double-counts
STEP 4: applyPayment(exchangePayment)   ← global waterfall, wrong distribution
STEP 5: mark as 'exchanged'             ← too late
```

New:

```
STEP 3: mark as 'exchanged'                                         ← FIRST (waterfall excludes it)
STEP 4: redistributeRentInternal(oldProductId, newBookingProductIds) ← internal, no transaction, only touches old + new products
STEP 5: applyExchangePayment(penalties + new product rent)           ← targeted, not global
STEP 6: revokeGlobalDiscountForExchange (pre-existing, unchanged)    ← updates bookings.final_discount only, no product_charges touched
STEP 7: updateBookingStatus (pre-existing, unchanged)                ← no-op during exchange (booking stays confirmed)
```

Specific code changes in `exchangeProduct()`:

**Remove** (lines 147–167): The entire STEP 3 block that queries `oldRentPaidResult` and calls `applyAdjustment()`

**Remove** (lines 169–187): The entire STEP 4 block that calls `applyPayment()`

**Move up** (lines 189–193): The status change to `exchanged` — place it right after creating new products (current STEP 2)

**Add after status change:**
```js
// STEP 4: Internally redistribute old product's rent credit to the new product(s) only.
// No other pre-existing product is touched.
await chargeAccountingService.redistributeRentInternal(
  oldBookingProduct.booking_id,
  bookingProductId,
  newBookingProductIds,       // ONLY these products receive the credit
  client
);

// STEP 5: Apply exchange payment — targeted to penalties + new product rent only
if (paymentAmount > 0) {
  await chargeAccountingService.applyExchangePayment(
    oldBookingProduct.booking_id,
    paymentAmount,
    bookingProductId,          // old product (has penalties)
    newBookingProductIds,       // new products (receive rent)
    payment.method || 'Cash',
    payment.recorded_by || userId,
    payment.notes || 'Exchange payment',
    client
  );
}
```

**Update activity log** (line 237): Remove `rent_credit` from details since no adjustment is created.

#### [MODIFY] backend/src/services/productLifecycleService.test.js

Update exchange test block to verify:

1. **No adjustment transaction created** — query `payment_transactions WHERE type = 'adjustment'` for the booking → 0 rows from exchange
2. **Exchange penalty is paid** — query `product_charges` for old product's `exchange_penalty` → `paid_amount = 264`
3. **New product rent fully funded** — query `product_charges` for new product's `rent` → `paid_amount = 5200` (₹1,437 from redistribution + ₹3,763 from exchange payment)
4. **Pre-existing product rent unchanged** — query the original (non-exchanged) product's `rent.paid_amount` → exactly equals its pre-exchange value, unchanged
5. **Old product rent zeroed** — query old product's `rent` → `due_amount = 0, paid_amount = 0`

### Verification

- Run `productLifecycleService.test.js` — all exchange tests pass
- Run `chargeAccountingService.test.js` — all tests still pass
- Manual: recreate the order #9978 scenario:
  1. Create booking with 2 products
  2. Pay partial amount
  3. Exchange one product
  4. Verify: no adjustment in history, penalty paid, new product rent funded, balance correct

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/productLifecycleService.js` | Service |
| `backend/src/services/productLifecycleService.test.js` | Test |

---

## TODO: Robust Comprehensive Regression Tests

**Priority**: High (prevents the same category of bug from silently re-entering)
**Depends on**: Steps 1 and 2
**Files**: `chargeAccountingService.test.js`, `productLifecycleService.test.js`

The tests added in Steps 1 and 2 cover the happy path. This step adds a systematic test suite that would have caught the original bug and will catch any future regression in the exchange financial flow.

### Root cause of the test gap

The original tests passed no `payment` object to `exchangeProduct()`, so `paymentAmount = 0` and the broken STEP 3/4 code never ran. The fix: **every exchange test must pass a realistic `payment` object** so the financial path is always exercised.

### What to add to `productLifecycleService.test.js`

**Regression: the two original bugs must be explicitly pinned**
- `exchangeProduct() with payment — no adjustment transaction created`: assert `payment_transactions WHERE type='adjustment' AND booking_id=X` returns 0 rows. This pins Bug #1 (double-count via adjustment).
- `exchangeProduct() with payment — exchange penalty is paid, not discarded`: assert old product's `exchange_penalty.paid_amount = 264`. This pins Bug #2 (penalty silently dropped by global waterfall consuming everything into rent).

**Financial invariant: total paid = sum of all payment_transactions**
- After exchange, assert: `SUM(payment_transactions.amount WHERE booking_id=X)` equals the expected total (original payments + exchange payment). Guards against any future double-counting via adjustment.

**Pre-existing product isolation (the core contract)**
- Assert pre-existing (non-exchanged) product's `rent.paid_amount` is byte-for-byte identical before and after `exchangeProduct()`. This is the clearest regression guard for the "global waterfall touches everything" bug.

**Old product rent zeroed**
- Assert exchanged product's `rent.due_amount = 0` AND `rent.paid_amount = 0` after exchange.

**Edge cases**
- Exchange with **no penalty** (penalty = 0): full exchange payment goes to new product rent. New product rent fully covered.
- Exchange with **exact penalty match** (payment = penalty amount only): new product rent receives ₹0 from exchange payment; new product rent = only the redistributed amount from old product.
- Exchange with **multiple new products** (1-to-2 exchange): redistributed rent split proportionally to new products by `bp.rent`; exchange payment split proportionally to new products' rent only.
- Exchange with **old product having paid = 0** (was never paid toward): redistribution is ₹0; new product starts at 0 paid; exchange payment covers new product rent directly.
- Exchange with **downgrade penalty** in addition to exchange penalty: both penalties paid before rent, in order (exchange → downgrade → rent).
- Exchange where **new product rent < redistributed amount** (capping): redistribution capped at new product's `due_amount`; remainder is not redistributed anywhere (lost to void, acceptable since old product's rent is void).

### What to add to `chargeAccountingService.test.js`

**`redistributeRentInternal` — isolation assertions**
- After redistribution, query ALL `product_charges` for the booking and assert that every row except (old product's rent) and (new products' rent) has identical `paid_amount` to before. This is the full-scope guard.

**`applyExchangePayment` — no spillover to other products**
- Set up a booking with 3 products (old, new, pre-existing). Run `applyExchangePayment`. Assert the pre-existing product's `product_charges` rows are completely unchanged.

**`applyExchangePayment` — single payment_transaction, correct type**
- Assert exactly 1 row inserted into `payment_transactions`, with `type='payment'` and `amount=X`. No 'adjustment' rows.

**`applyExchangePayment` — activity log**
- Assert `booking_activity_log` entry created with correct `old_product` and `new_products` in details JSON.

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/chargeAccountingService.test.js` | Test |
| `backend/src/services/productLifecycleService.test.js` | Test |

---

## Summary: Change Impact by Layer

| Layer | Files Modified | Steps |
|-------|---------------|-------|
| **Service** | `chargeAccountingService.js` | 1 |
| **Service** | `productLifecycleService.js` | 2 |
| **Tests** | `chargeAccountingService.test.js` | 1, TODO |
| **Tests** | `productLifecycleService.test.js` | 2, TODO |

**Frontend**: No changes needed. The `ProductExchange.tsx` component already sends `payment_amount`, `payment_method`, `payment_recorded_by`, and `payment_notes` in the exchange API call. The backend change is transparent.

### Dependency Graph

```
Step 1 (chargeAccountingService methods)  → independent
Step 2 (productLifecycleService rewrite)  → depends on Step 1
```

---

## Worked Example: Order #9978 (Expected After Fix)

**Setup:** 2 products, ₹6,000 paid before exchange

| Product | Rent | Security | Status |
|---------|------|----------|--------|
| #12633 Lehenga | ₹8,363 | ₹9,000 | confirmed |
| #12634 Indo Western | ₹2,637 | ₹3,000 | confirmed |

**Pre-exchange rent distribution (₹6,000 across two separate payments: ₹5,500 + ₹500, each applied proportionally):**
- #12633 Lehenga: ₹4,563
- #12634 Indo Western: ₹1,437
- Total: ₹6,000 ✓
- Note: Each payment runs `_distributeProportionally()` independently using `floor()` + remainder-to-first. Two-batch integer rounding differs from a single-batch calculation by ₹1 — ₹1,437 is the actual `paid_amount` stored for #12634.

**Exchange: #12634 → #12635 (Lehenga IN-000152, rent ₹5,200, security ₹4,500)**
Exchange penalty: ₹264. Payment collected: ₹4,027.

**Step 3:** Mark #12634 as `exchanged`

**Step 4:** `redistributeRentInternal(#12634, newBookingProductIds=[#12635])`
- #12634 rent paid = ₹1,437. Zero it out (due=0, paid=0).
- Redistribute ₹1,437 to **new exchange product(s) only** = [#12635]. **#12633 is NOT touched at all.**
- #12635 is the only new product → it receives the full 100%: ₹1,437
- After redistribution:
  - **#12633 Lehenga rent: paid = ₹4,563 — UNCHANGED** (pre-existing product, not involved in exchange)
  - **#12634 Indo Western rent: due = ₹0, paid = ₹0** (zeroed — rent is void for exchanged product)
  - **#12635 New Lehenga rent: paid = ₹0 + ₹1,437 = ₹1,437** (outstanding = 5,200 − 1,437 = ₹3,763)

**Step 5:** `applyExchangePayment(₹4,027, old=#12634, new=[#12635])`
- The ₹4,027 amount was computed by the backend `calculateExchangePreview()` API (not the frontend). It is exact: ₹264 (penalty) + ₹3,763 (outstanding rent on new product) = ₹4,027.
- Pay exchange_penalty on #12634: ₹264 → paid. Remaining: ₹3,763
- Pay rent ONLY on #12635: outstanding = ₹3,763 → apply ₹3,763 → #12635 rent paid = 1,437 + 3,763 = **₹5,200** (fully covered ✅). Remaining: ₹0

**Final state:**

| Product | Charge | Due | Paid | Outstanding |
|---------|--------|-----|------|-------------|
| #12633 | rent | 8,363 | 4,563 | 3,800 |
| #12633 | security | 9,000 | 0 | 9,000 |
| #12634 | rent | 0 | 0 | 0 (exchanged, zeroed) |
| #12634 | exchange_penalty | 264 | 264 | 0 ✅ |
| #12634 | security | 3,000 | 0 | 0 (exchanged, not collected) |
| #12635 | rent | 5,200 | 5,200 | 0 ✅ |
| #12635 | security | 4,500 | 0 | 4,500 |

**Totals (excluding exchanged product's rent/security):**
- Rent due: 8,363 + 5,200 = 13,563
- Rent paid: 4,563 + 5,200 = 9,763 (= ₹6,000 original + ₹3,763 from exchange payment)
- Penalty due: 264, paid: 264
- Security due: 9,000 + 4,500 = 13,500, paid: 0
- **Total due: 27,327** | **Total paid: 10,027** | **Balance: 17,300**

**Transaction History (visible to user):**
1. ₹5,500 — payment (Cash, Admin)
2. ₹500 — payment (Cash, Salesman)
3. ₹4,027 — payment (Cash, maya) — "Exchange payment"

**No adjustment transaction.** ✅
