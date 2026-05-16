# Implementation Plan: Financial Audit Fixes

> **Reference**: [analysis_results.md](file:///C:/Users/User/.gemini/antigravity/brain/07ca2599-be21-4c6e-947d-be3b8cc9c65e/analysis_results.md) — Contains lifecycle flowcharts, state diagrams, and the full gap analysis that led to this plan.

---

## Overview

This plan addresses 8 changes identified during the financial audit of the rental system. Each step is self-contained, testable, and must be completed and verified before moving to the next. After each step, update `status_discount_implementation.md`.

**No backward compatibility concerns** — this is an in-development project. Existing bookings may become inconsistent; only new bookings need to follow the corrected rules.

---

## Step 1: Fix Percentage Discount Formula

**Priority**: Critical  
**Layer**: Utility  
**Estimated scope**: Small (1 file + 1 test file)

### Problem

Per-product percentage discount uses `rent × (1 - x/100)` (standard percentage off).  
Correct formula: `effective_rent = rent / (1 + x/100)` (tax-inclusive model).

**Example with rent = ₹10,000 and 10% discount:**
- Current (wrong): `10000 - floor(10000 × 10 / 100) = ₹9,000`
- Correct: `floor(10000 / 1.10) = ₹9,091`

### Changes

#### [MODIFY] backend/src/utils/discountCalculator.js

**Method: `calculateEffectiveRent()`** (lines 70–101)

Change the percentage branch:

```diff
 if (discountType === 'percentage') {
-  discountAmount = Math.floor((rent * discountValue) / 100);
+  const effectiveRentCalc = Math.floor(rent / (1 + discountValue / 100));
+  discountAmount = rent - effectiveRentCalc;
 }
```

No other methods need changes — `validateDiscount()` and `formatDiscount()` are unaffected since they don't compute amounts.

#### [MODIFY] backend/src/utils/discountCalculator.test.js

Update all percentage-related test cases to expect the new formula output. Add edge cases:
- 0% discount → effective_rent = rent (no change)
- 10% on ₹10,000 → effective_rent = 9091, discount = 909
- 50% on ₹10,000 → effective_rent = 6667, discount = 3333
- 100% on ₹10,000 → effective_rent = 5000, discount = 5000
- Small rent values (₹100, 15%) to verify integer rounding

### Verification

- Run `discountCalculator.test.js` — all tests pass with new expected values
- Manual: call booking preview endpoint with percentage discount, verify response values

### Files touched
| File | Layer |
|------|-------|
| `backend/src/utils/discountCalculator.js` | Utility |
| `backend/src/utils/discountCalculator.test.js` | Test |

---

## Step 2: Security-Gated Cancel & Exchange

**Priority**: Critical  
**Layer**: Service  
**Estimated scope**: Medium (1 service file + 1 new test file)

### Problem

`cancelProduct()` and `exchangeProduct()` only check product `status` to determine eligibility. They should also block the operation if **any** security has been paid for that product (`security.paid_amount > 0`).

### Changes

#### [MODIFY] backend/src/services/productLifecycleService.js

**Method: `cancelProduct()`** (around line 246)

After fetching `bookingProduct` and checking status, add a security check:

```js
// Check if any security has been paid — blocks cancel
const securityCheck = await client.query(
  `SELECT COALESCE(paid_amount, 0) as paid FROM product_charges
   WHERE booking_product_id = $1 AND charge_type = 'security'`,
  [bookingProductId]
);
const securityPaid = parseInt(securityCheck.rows[0]?.paid) || 0;
if (securityPaid > 0) {
  throw new Error('Cannot cancel product: security deposit has been partially or fully paid. Amount paid: ₹' + securityPaid);
}
```

**Method: `exchangeProduct()`** (around line 30)

Same check after fetching `oldBookingProduct` and checking status:

```js
// Check if any security has been paid — blocks exchange
const securityCheck = await client.query(
  `SELECT COALESCE(paid_amount, 0) as paid FROM product_charges
   WHERE booking_product_id = $1 AND charge_type = 'security'`,
  [bookingProductId]
);
const securityPaid = parseInt(securityCheck.rows[0]?.paid) || 0;
if (securityPaid > 0) {
  throw new Error('Cannot exchange product: security deposit has been partially or fully paid. Amount paid: ₹' + securityPaid);
}
```

**Method: `validateCancellationEligibility()`** (around line 1037)

Add the same security check so the preview/info endpoints also reflect ineligibility:

```js
// Check security paid
const securityResult = await pool.query(
  `SELECT COALESCE(paid_amount, 0) as paid FROM product_charges
   WHERE booking_product_id = $1 AND charge_type = 'security'`,
  [bookingProductId]
);
const securityPaid = parseInt(securityResult.rows[0]?.paid) || 0;
if (securityPaid > 0) {
  return {
    eligible: false,
    reason: 'Cannot cancel: security deposit already paid (₹' + securityPaid + ')',
    product,
    max_penalty: 0,
    policy: null
  };
}
```

**Method: `validateExchangeEligibility()`** (around line 996)

Same pattern — add security paid check returning `{ eligible: false, ... }`.

#### [NEW] backend/src/services/__tests__/securityGate.test.js

Test cases:
- Cancel product with 0 security paid → allowed
- Cancel product with partial security paid → blocked with error
- Cancel product with full security paid → blocked with error
- Exchange product with 0 security paid → allowed
- Exchange product with any security paid → blocked with error
- Eligibility check reflects security paid status

### Verification

- Run unit tests
- Manual: create booking, pay some security for a product, attempt cancel via API → should get 400 error

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/productLifecycleService.js` | Service |
| `backend/src/services/__tests__/securityGate.test.js` | Test |

---

## Step 3: Backend-Enforced Negative Refund Block

**Priority**: Critical  
**Layer**: Service  
**Estimated scope**: Small (1 file, 1 test)

### Problem

`cancelProduct()` computes `diffAmount = totalPaidForProduct - cancellationPenalty - discountReverted`. If negative, it proceeds anyway. The preview returns `refund_blocked: true` but the backend service doesn't enforce it.

### Changes

#### [MODIFY] backend/src/services/productLifecycleService.js

**Method: `cancelProduct()`** — after computing `diffAmount` (line ~302), add:

```js
// Block cancellation if refund is negative — penalty + discount exceeds what was paid
if (diffAmount < 0) {
  throw new Error(
    `Cannot cancel: refund would be negative (₹${diffAmount}). ` +
    `Paid: ₹${totalPaidForProduct}, Penalty: ₹${cancellationPenalty}, ` +
    `Discount reverted: ₹${discountReverted}`
  );
}
```

This goes **before** the settlement processing and status change.

#### [ADD TO] backend/src/services/__tests__/securityGate.test.js (or separate file)

Test cases:
- Cancel with diffAmount ≥ 0 → proceeds normally
- Cancel with diffAmount < 0 (penalty + discount > paid) → throws error, no status change

### Verification

- Unit test passes
- Manual: create scenario where penalty exceeds paid amount, attempt cancel → 400/500 error

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/productLifecycleService.js` | Service |
| `backend/src/services/__tests__/negativeRefund.test.js` | Test |

---

## Step 4: Remove Discount Update Endpoint & Dead Code

**Priority**: Major  
**Layer**: Route + Service + Frontend  
**Estimated scope**: Medium (3 files backend, 1 file frontend)

### Problem

`PUT /bookings/:id/discount` allows changing discounts after booking creation, contradicting the rule that discounts are immutable. This endpoint, its service method, and its frontend UI should be removed.

### Changes

#### [MODIFY] backend/src/routes/bookings.js

**Remove** the entire `PUT /:id/discount` route block (lines 273–311).

#### [MODIFY] backend/src/services/chargeAccountingService.js

**Remove** the following methods:
- `updateBookingDiscount()` (lines 719–798) — the update logic
- `_reverseGlobalDiscountShares()` (lines 955–982) — private helper only used by `updateBookingDiscount`

#### [MODIFY] frontend/app/admin/bookings/[id]/page.tsx

**Remove** the editable discount input field and its `onBlur` handler (lines 591–647). Replace with a read-only display:

```tsx
{currentDiscount > 0 && (
  <div className="flex justify-between items-center">
    <span>Booking Discount</span>
    <span className="text-green-600 font-medium">
      -₹{currentDiscount.toLocaleString('en-IN')}
    </span>
  </div>
)}
```

#### [MODIFY] frontend/lib/api.ts (if applicable)

Remove `updateDiscount()` method from the bookings API client. Search for any references to this method and remove them.

### Verification

- `PUT /api/bookings/:id/discount` → 404 (route gone)
- Admin booking detail page shows discount as read-only text
- No console errors on admin page
- Grep codebase for `updateDiscount`, `updateBookingDiscount`, `_reverseGlobalDiscountShares` — zero results

### Files touched
| File | Layer |
|------|-------|
| `backend/src/routes/bookings.js` | Route |
| `backend/src/services/chargeAccountingService.js` | Service |
| `frontend/app/admin/bookings/[id]/page.tsx` | Frontend Page |
| `frontend/lib/api.ts` | Frontend API Client |

---

## Step 5: Proportional Rent Distribution

**Priority**: Major  
**Layer**: Service  
**Estimated scope**: Medium (1 file + tests)

### Problem

`_applyToRent()` fills each product's rent charge sequentially (Product A fully, then B, then C). All rent payments should be distributed proportionally across products by their **original rent** ratio.

### Changes

#### [MODIFY] backend/src/services/chargeAccountingService.js

**Method: `_applyToRent()`** — replace the sequential fill logic with proportional distribution.

Current behavior (sequential):
```
Payment ₹5000 → Product A (rent ₹3000): fill ₹3000 → Product B (rent ₹7000): fill ₹2000
```

New behavior (proportional by original rent):
```
Payment ₹5000 → Product A (rent ₹3000, ratio 30%): ₹1500 → Product B (rent ₹7000, ratio 70%): ₹3500
```

Implementation approach:

1. Query all active products with their `rent` (original) and rent charge `due_amount`, `paid_amount`
2. Calculate each product's outstanding rent: `outstanding = due_amount - paid_amount`
3. Use `_distributeProportionally()` (already exists, line 929) to allocate payment across products by `rent` (original rent)
4. For each product, cap the allocation at its outstanding rent (don't overpay)
5. Any remainder after capping flows back to be distributed to products that still have outstanding rent
6. Return total applied to rent

```js
async _applyToRent(bookingId, amount, client) {
  // Get all active products with rent charges
  const result = await client.query(
    `SELECT bp.id, bp.rent,
            pc.id as charge_id, pc.due_amount, pc.paid_amount
     FROM booking_products bp
     JOIN product_charges pc ON pc.booking_product_id = bp.id
     WHERE bp.booking_id = $1
       AND bp.status NOT IN ('exchanged', 'cancelled')
       AND pc.charge_type = 'rent'
       AND pc.due_amount > pc.paid_amount
     ORDER BY bp.rent DESC`,
    [bookingId]
  );

  if (result.rows.length === 0) return amount; // nothing to apply to

  const products = result.rows.map(r => ({
    ...r,
    outstanding: r.due_amount - r.paid_amount
  }));

  // Distribute proportionally by original rent
  const allocations = this._distributeProportionally(products, Math.min(amount, products.reduce((s, p) => s + p.outstanding, 0)));

  let totalApplied = 0;
  for (const alloc of allocations) {
    const toApply = Math.min(alloc.share, alloc.product.outstanding);
    if (toApply > 0) {
      await client.query(
        'UPDATE product_charges SET paid_amount = paid_amount + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [toApply, alloc.product.charge_id]
      );
      totalApplied += toApply;
    }
  }

  return amount - totalApplied; // remaining flows to next priority
}
```

> **Note**: `_distributeProportionally()` uses `product.rent` for ratios. The query must alias the columns so that `product.rent` is available on each row.

#### [NEW] backend/src/services/__tests__/proportionalRent.test.js

Test cases:
- 2 products with equal rent → payment split 50/50
- 2 products with 30/70 rent ratio → payment split proportionally
- Payment exceeds total outstanding → each product capped at outstanding, remainder returned
- 1 product fully paid, 1 partially → all goes to unpaid product
- Single product → gets entire payment (up to outstanding)
- Remainder correctly calculated after capping

### Verification

- Unit tests pass
- Manual: create booking with 2 products (rent ₹3000 and ₹7000), pay ₹5000. Check `product_charges` table — A should have ₹1500 paid, B should have ₹3500 paid (proportional by original rent)

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/chargeAccountingService.js` | Service |
| `backend/src/services/__tests__/proportionalRent.test.js` | Test |

---

## Step 6: 50% Minimum Payment Rule

**Priority**: Major  
**Layer**: Service  
**Estimated scope**: Small (1 file + tests)

### Problem

No minimum payment validation exists. The first payment must be ≥ 50% of Σ(effective_rent) of all active products.

### Changes

#### [MODIFY] backend/src/services/chargeAccountingService.js

**Method: `applyPayment()`** — add validation before applying the payment.

```js
// Check 50% minimum on first payment
const rentStatus = await client.query(
  `SELECT
     COALESCE(SUM(pc.paid_amount), 0)::INTEGER as total_rent_paid,
     COALESCE(SUM(pc.due_amount), 0)::INTEGER as total_rent_due
   FROM product_charges pc
   JOIN booking_products bp ON pc.booking_product_id = bp.id
   WHERE bp.booking_id = $1
     AND bp.status NOT IN ('exchanged', 'cancelled')
     AND pc.charge_type = 'rent'`,
  [bookingId]
);

const totalRentPaid = rentStatus.rows[0].total_rent_paid || 0;
const totalRentDue = rentStatus.rows[0].total_rent_due || 0;

// Only enforce on first payment (when nothing has been paid toward rent yet)
if (totalRentPaid === 0 && totalRentDue > 0) {
  const minimumRequired = Math.ceil(totalRentDue / 2);
  // The amount going toward rent is capped at total outstanding rent
  const amountTowardRent = Math.min(amount, totalRentDue);
  if (amountTowardRent < minimumRequired) {
    throw new Error(
      `First payment must be at least 50% of total rent. ` +
      `Minimum required: ₹${minimumRequired}, provided: ₹${amount}`
    );
  }
}
```

This check runs **inside the transaction**, after BEGIN but before `_applyPaymentInternal`. If it fails, the transaction rolls back.

> **Note**: This validation is on `applyPayment()` only — not on `applyAdjustment()` or internal redistribution calls. Adjustments from cancellation/exchange are exempt.

#### [NEW] backend/src/services/__tests__/minimumPayment.test.js

Test cases:
- First payment = 50% of total rent → accepted
- First payment > 50% → accepted
- First payment < 50% → rejected with error message
- Second payment (after first) with any amount → accepted (no minimum)
- First payment with only 1 product → 50% of that product's effective_rent
- Adjustment payments → no minimum enforced

### Verification

- Unit tests pass
- Manual: create booking with total rent ₹10,000, try paying ₹4,000 → error. Pay ₹5,000 → success.

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/chargeAccountingService.js` | Service |
| `backend/src/services/__tests__/minimumPayment.test.js` | Test |

---

## Step 7: Security Distribution Order by Pickup Date

**Priority**: Minor  
**Layer**: Service  
**Estimated scope**: Small (1 file)

### Problem

When auto-distributing payments to the security tier, products should be filled in order of earliest `booked_from` (pickup date) first. Current code may not enforce this ordering.

### Changes

#### [MODIFY] backend/src/services/chargeAccountingService.js

**Method: `_applyToSecurity()`** (or wherever security charges are filled)

Ensure the query that fetches security charges orders by pickup date:

```sql
SELECT pc.*, bp.booked_from
FROM product_charges pc
JOIN booking_products bp ON pc.booking_product_id = bp.id
WHERE bp.booking_id = $1
  AND bp.status NOT IN ('exchanged', 'cancelled')
  AND pc.charge_type = 'security'
  AND pc.due_amount > pc.paid_amount
ORDER BY bp.booked_from ASC, bp.id ASC
```

The `booked_from ASC, bp.id ASC` ordering ensures earliest-pickup products get security filled first.

### Verification

- Manual: create booking with Product A (pickup Jan 5) and Product B (pickup Jan 1). Pay enough for security. B's security should fill before A's.

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/chargeAccountingService.js` | Service |

---

## Step 8: Security Return — Adjust Against Next Product's Security

**Priority**: Enhancement  
**Layer**: Service + Route  
**Estimated scope**: Medium (2 files + test)

### Problem

When a product is returned and security is being returned, the current options are `refund` (cash back) or `adjust` (against outstanding dues). A new option is needed: adjust the returned security against the **next product's security charge** instead of refunding.

### Changes

#### [MODIFY] backend/src/services/productLifecycleService.js

**Method: `processSecurityReturn()`** — add a new action `'adjust_to_security'`:

```js
if (action === 'adjust_to_security') {
  // Find next product(s) with outstanding security, ordered by booked_from
  const nextSecurity = await client.query(
    `SELECT pc.id, pc.due_amount, pc.paid_amount, bp.id as bp_id
     FROM product_charges pc
     JOIN booking_products bp ON pc.booking_product_id = bp.id
     WHERE bp.booking_id = $1
       AND bp.status NOT IN ('exchanged', 'cancelled', 'completed')
       AND pc.charge_type = 'security'
       AND pc.due_amount > pc.paid_amount
       AND bp.id != $2
     ORDER BY bp.booked_from ASC, bp.id ASC`,
    [booking_id, bookingProductId]
  );

  let remaining = total_security;
  const adjustments = [];

  for (const sec of nextSecurity.rows) {
    if (remaining <= 0) break;
    const outstanding = sec.due_amount - sec.paid_amount;
    const toApply = Math.min(remaining, outstanding);
    await client.query(
      'UPDATE product_charges SET paid_amount = paid_amount + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [toApply, sec.id]
    );
    adjustments.push({ booking_product_id: sec.bp_id, amount: toApply });
    remaining -= toApply;
  }

  // If any remainder, refund it
  if (remaining > 0) {
    // Record refund for remainder (same as refund action)
    // ...
  }

  // Record adjustment transaction + activity log
  // ...

  return { action: 'adjust_to_security', adjusted: adjustments, refunded: remaining, ... };
}
```

Also update the validation in `processSecurityReturn()` to accept `'adjust_to_security'` as a valid action.

#### [MODIFY] backend/src/routes/paymentTransactions.js (or wherever security return is exposed)

Ensure the route accepts `'adjust_to_security'` as a valid action parameter.

#### [NEW] backend/src/services/__tests__/securityAdjust.test.js

Test cases:
- Adjust ₹5000 security against next product with ₹5000 outstanding → fully covers
- Adjust ₹5000 against next product with ₹3000 outstanding → ₹3000 adjusted, ₹2000 refunded
- Adjust when no next product exists → full refund
- Adjust across multiple products → fills in pickup-date order

### Verification

- Unit tests pass
- Manual: return product, choose "adjust to security", verify next product's security charge updated

### Files touched
| File | Layer |
|------|-------|
| `backend/src/services/productLifecycleService.js` | Service |
| `backend/src/routes/paymentTransactions.js` (or security return route) | Route |
| `backend/src/services/__tests__/securityAdjust.test.js` | Test |

---

## Summary: Change Impact by Layer

| Layer | Files Modified | Steps |
|-------|---------------|-------|
| **Utility** | `discountCalculator.js` | 1 |
| **Service** | `chargeAccountingService.js` | 4, 5, 6, 7 |
| **Service** | `productLifecycleService.js` | 2, 3, 8 |
| **Route** | `bookings.js` | 4 |
| **Route** | `paymentTransactions.js` | 8 |
| **Frontend Page** | `admin/bookings/[id]/page.tsx` | 4 |
| **Frontend API** | `lib/api.ts` | 4 |
| **Tests** | 5 new test files | 1–6, 8 |

### Dependency Graph

```
Step 1 (formula)          → independent
Step 2 (security gate)    → independent
Step 3 (negative refund)  → independent
Step 4 (remove discount)  → independent
Step 5 (proportional)     → independent
Step 6 (50% minimum)      → should be done AFTER Step 5 (since payment distribution changes)
Step 7 (security order)   → independent
Step 8 (security adjust)  → should be done AFTER Step 7 (uses same ordering logic)
```

Steps 1–5 and 7 can be done in any order. Step 6 depends on Step 5. Step 8 depends on Step 7.
