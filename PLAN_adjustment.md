# Implementation Plan: Refund/Adjustment Refactor — Use Backend APIs, Smart Settlement

> **Tracking**: [status_adjustment.md](file:///c:/Users/User/Documents/app/status_adjustment.md)

---

## ⚠️ Terminal Command Note

**All terminal commands must be run via WSL.** Use `wsl` prefix or execute inside a WSL shell. Do not use PowerShell or cmd directly for build/test commands.

---

## 🚨 Non-Negotiable Rule: Backend Owns All Business Logic

**ALL business logic — filtering, aggregation, amount computation, split calculation — MUST be computed in the backend.**

**The frontend MUST NOT:**
- Filter products by status
- Sum or aggregate charge amounts
- Compute `min()`, `max()`, or any split formula
- Derive any amount from raw DB data

**The frontend MAY ONLY:**
- Call backend endpoints and display the returned values
- Collect user input (text fields, checkboxes, dropdowns)
- Send collected inputs to backend endpoints

Violating this rule will be caught in review.

## Overview

### Problem Statement

The current refund modal in [PaymentManagement.tsx](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx) writes all refund logic on the frontend — manual amount entry, `security_deposit` face-value capping, direct `paymentTransactionsApi.create` calls, and no consideration of outstanding dues.

The backend has `processSecurityReturn` which will become the single endpoint that validates and executes the full security return atomically. The frontend sends user-chosen amounts; the backend validates everything and raises errors on any issue.

Additionally:

1. **Bug #4 (done)**: Fixed "Payment exceeds outstanding balance" bug.
2. **No smart settlement**: When settling security, the user should see: how much goes toward pending dues on other products, and what remains for cash refund vs adjust against other products' pending security.
3. The settlement UI from the cancellation flow and the refund flow should share the same `RefundSettlementSection` component.

### Steps

| # | Change | Scope |
|---|--------|-------|
| 0 ✅ | Fix "Payment exceeds outstanding balance" bug | Backend |
| 1 | Rewrite `processSecurityReturn`: explicit amounts, full validation, atomic execution | Backend |
| 2 | Create shared `RefundSettlementSection` component | Frontend |
| 3 | Refactor refund modal to use `processSecurityReturn` + settlement component | Frontend |
| 4 | Update cancellation flow to use shared settlement component | Frontend |
| 5 | Regression tests | Backend |

---

## Architecture — RESOLVED

### Single endpoint: `processSecurityReturn`

The frontend reads security data from the **existing payment summary** (already loaded — `summary.products[x].charges` has `charge_type: 'security'` with `due_amount` and `paid_amount`). No separate calculate call needed.

User opens the refund modal, enters:
- `deduction_amount` (damage/late fee to retain)
- How to settle the remainder: refund cash vs adjust against other products' dues

Frontend sends one request to `processSecurityReturn`. The backend:
1. Queries `security.paid_amount` to get authoritative `total_security`
2. Validates: `deduction + adjust_non_security + refund_amount + adjust_security_amount === total_security`
3. Validates product is `completed`, amounts are non-negative, etc.
4. Raises descriptive errors on any issue
5. Executes atomically

`calculateSecurityReturn` is **deleted** — it was never called and is no longer needed.

### `RefundSettlementSection` component

A shared UI component that both the refund modal and the cancellation flow use. It receives `total_security` (from payment summary) and `eligible_security_products` (from payment summary — other products with unpaid security). The user fills in amounts; the component calls `processSecurityReturn`.

---

## Open Questions

> [!WARNING]
> ### Q1: `processSecurityReturn` currently uses `security.paid_amount`, not `security.due_amount`
> The backend's `calculateSecurityReturn` (line 878) uses `security.paid_amount` as the total refundable amount. The frontend currently uses `product.security_deposit` (face value from `booking_products`). These could differ if:
> - Security was partially paid (shouldn't happen — pickup requires full payment)
> - The charge `due_amount` was manually adjusted
>
> Using `paid_amount` (backend) is correct — you can only refund what was actually paid. Just confirming this is the intended behaviour.

> [!WARNING]
> ### Q2: Should `recordRefund` decrement `product_charges.paid_amount` for the security charge?
> Currently, after a refund, the security charge's `paid_amount` stays at its full value in `product_charges`. This doesn't cause data corruption because:
> - Completed products' security `due_amount` is excluded from `total_due` (line 101 of `getPaymentSummary`)
> - Refunds are tracked in `payment_transactions` with `type='refund'`
>
> But it does contribute to the balance calculation confusion. The new `processSecurityReturn` would handle this correctly by calling `applyAdjustment` (for adjust) or recording the refund transaction. Should we also zero out the security charge's `paid_amount` when processing the refund? This would keep `product_charges` consistent with reality (money was returned).

---

## Bug Analysis: "Payment exceeds outstanding balance" (Issue #4)

### Root Cause

There are **three** different "outstanding balance" computations in the codebase, and they diverge after refunds:

| # | Source | Formula | Used by |
|---|--------|---------|---------|
| 1 | **Category breakdown** (what user sees) | `sum(charge_breakdown[type].due - charge_breakdown[type].paid)` — uses `product_charges` for both due and paid | Display rows in payment summary |
| 2 | **`summary.totals.balance`** | `total_due - total_paid + total_refunded` — uses `product_charges` for `total_due` but `payment_transactions` for `total_paid` and `total_refunded` | Confirm button disabled check (line 1154), Total row display (line 537) |
| 3 | **`handleSubmit` formula** | `total_due - total_paid` — same as #2 but ignores refunds entirely | Toast error on submit (line 191) |

**Why they diverge:** `recordRefund` does NOT decrement `product_charges.paid_amount` for the security charge. So after a refund:
- `product_charges.paid_amount` still shows the full security as "paid" (but excluded from display for completed products)
- `payment_transactions` ledger correctly records the refund as a separate row
- The category breakdown uses charge-based paid → shows correct pending
- `summary.totals.balance` uses ledger-based paid + refunded → can give a different number
- `handleSubmit` uses ledger-based paid without refunds → gives yet another wrong number

**The backend's own overpayment check** (line 590-610 of `chargeAccountingService.js`) uses `product_charges` for BOTH due and paid (approach #1). So **the category breakdown is the source of truth** — it matches what the backend enforces.

### Fix

Compute `remainingBalance` from `summary.charges` (the same data that feeds the category breakdown), not from `summary.totals.balance` or `total_due - total_paid`. This makes the frontend validation consistent with both the display AND the backend:

```tsx
const remainingBalance = summary
  ? Math.max(0,
      (summary.charges.rent.due - summary.charges.rent.paid) +
      (summary.charges.security.due - summary.charges.security.paid) +
      (summary.charges.transport.due - summary.charges.transport.paid) +
      (summary.charges.penalties.due - summary.charges.penalties.paid) +
      (summary.charges.fees.due - summary.charges.fees.paid)
    )
  : 0;
```

Both the `handleSubmit` guard AND the Confirm button disabled check need to use this.

---

## Step 0: Fix "Payment exceeds outstanding balance" Bug

**Priority**: Critical — blocking user workflow right now
**Estimated scope**: Small (1 file, ~15 lines)
**Depends on**: None

### Changes

#### [MODIFY] `frontend/components/common/PaymentManagement.tsx`

1. **Add a helper** to compute outstanding balance from charge categories:

```tsx
function getOutstandingBalance(): number {
  if (!summary) return 0;
  return Math.max(0,
    (summary.charges.rent.due - summary.charges.rent.paid) +
    (summary.charges.security.due - summary.charges.security.paid) +
    (summary.charges.transport.due - summary.charges.transport.paid) +
    (summary.charges.penalties.due - summary.charges.penalties.paid) +
    (summary.charges.fees.due - summary.charges.fees.paid)
  );
}
```

2. **Replace handleSubmit overpayment check** (lines 189-198) to use the helper:

```tsx
if (transactionType === 'payment' && summary) {
  const remainingBalance = getOutstandingBalance();
  if (amount > remainingBalance) {
    toast.error(`Payment exceeds outstanding balance. Maximum allowed: ₹${Math.floor(remainingBalance).toLocaleString('en-IN')}`);
    return;
  }
}
```

3. **Replace Confirm button disabled check** (line 1154) to use the same helper:

```tsx
disabled={transactionType === 'payment' && (
  !canConfirmSecurity ||
  (!!summary && (Number(formData.amount) || 0) > 0 && (Number(formData.amount) || 0) > getOutstandingBalance())
)}
```

### Verification

- Regression tests pass
- Manual: refund one product's security on order #10006, then try to collect payment for remaining products → should allow up to the correct remaining balance (matching the category breakdown display)
- TypeScript clean

---

## Step 1: Rewrite Backend `processSecurityReturn` — Explicit Amounts, Full Validation, Atomic Execution

**Priority**: Critical
**Estimated scope**: Medium (1 file, ~60 lines)
**Depends on**: Step 0 ✅
**Note**: `calculateSecurityReturn` is deleted as part of this step (along with its route and tests).

### Changes

#### [DELETE] `calculateSecurityReturn` from `productLifecycleService.js`

Delete the method and its HTTP route (`GET /security-refund/calculate`). Delete the two Step 1 regression tests.

#### [REWRITE] `processSecurityReturn` in `productLifecycleService.js`

New signature:

```js
processSecurityReturn(bookingProductId, {
  deduction_amount,       // ≥ 0 — damage/late fee retained from security
  deduction_type,         // 'damage_fee' | 'late_fee' (required if deduction_amount > 0)
  adjust_non_security,    // ≥ 0 — applied against rent/transport/fees on other products
  adjust_security_amount, // ≥ 0 — applied against pending security on other products
  security_product_ids,   // number[] — required if adjust_security_amount > 0
  refund_amount,          // ≥ 0 — cash refunded to customer
  payment_method,         // 'Cash' | 'UPI' | etc.
  recorded_by
})
```

**Validation (raises descriptive errors):**
- Product must be `completed`
- `total_security = security.paid_amount` (authoritative, from `product_charges`)
- `deduction_amount + adjust_non_security + adjust_security_amount + refund_amount === total_security` — if not, throw with clear message
- All amounts ≥ 0
- `deduction_type` required if `deduction_amount > 0`
- `security_product_ids` required (non-empty) if `adjust_security_amount > 0`

**Execution (single DB transaction):**
1. **Deduction** (`deduction_amount > 0`): `INSERT INTO product_charges` for `deduction_type`, mark `paid_amount = deduction_amount`
2. **Adjust non-security** (`adjust_non_security > 0`): `_applyPaymentInternal` on booking, excluding the returned product, paying rent → transport → penalties → fees waterfall
3. **Adjust security** (`adjust_security_amount > 0`): `_applyPaymentInternal` with `security_product_ids` targeting only security charges
4. **Refund** (`refund_amount > 0`): `INSERT INTO payment_transactions` with `type='refund'`, `method=payment_method`
5. Log to `booking_activity_log`

#### [MODIFY] `backend/src/routes/productLifecycle.js`

- Delete the `GET /security-refund/calculate` route
- Update `POST /security-refund/process` to pass new fields through

---

## Step 2: Extend Backend `processSecurityReturn` to Support Split Transactions

**Priority**: Critical
**Estimated scope**: Medium (1 file, ~40 lines)
**Depends on**: Step 1

### Problem

`processSecurityReturn` currently (a) calls `calculateSecurityReturn` internally to decide what to do, and (b) only supports `action: 'refund' | 'adjust'` applied to the full security amount. Both of these need to change.

### New Design

`processSecurityReturn` must:
- Accept **explicit amounts** decided by the frontend/user (no internal recalculation)
- **NOT call `calculateSecurityReturn`** — the frontend already has those values from the prior GET call
- Query `security.paid_amount` directly **only to validate** that submitted amounts are consistent
- Execute all operations atomically in a single DB transaction

### Changes

#### [MODIFY] `backend/src/services/productLifecycleService.js`

Replace `processSecurityReturn(bookingProductId, action, recordedBy)` with:

```js
processSecurityReturn(bookingProductId, {
  deduction_amount,       // ≥ 0, damage/late fee to settle from security first
  deduction_type,         // 'damage_fee' | 'late_fee' — charge type for the deduction row
  adjust_non_security,    // ≥ 0, auto-adjust against rent/transport/fees on other products
  refund_amount,          // ≥ 0, cash refund to customer
  adjust_security_amount, // ≥ 0, adjust against other products' pending security
  security_product_ids,   // number[], which products receive the security adjustment
  payment_method,         // 'Cash' | 'UPI' | etc. — method for the refund transaction
  recorded_by
})
```

**Execution order (all in one DB transaction):**

1. Query `security.paid_amount` → `total_security`. Validate:
   `deduction_amount + adjust_non_security + refund_amount + adjust_security_amount === total_security`
   Throw if mismatch.
2. **Deduction** (if `deduction_amount > 0`): `INSERT INTO product_charges` for `deduction_type` on the product, `paid_amount = deduction_amount`. This settles the damage/late fee.
3. **Auto-adjust** (if `adjust_non_security > 0`): call `chargeAccountingService._applyPaymentInternal` on the booking, excluding the product being returned.
4. **Security adjust** (if `adjust_security_amount > 0`): call `_applyPaymentInternal` targeting only `security_product_ids`.
5. **Refund** (if `refund_amount > 0`): `INSERT INTO payment_transactions` with `type='refund'`, `method=payment_method`.
6. Log to `booking_activity_log`.

**Frontend split computation** (NOT done by backend `calculateSecurityReturn`):
```
net_security = total_security - deduction_amount   // user enters deduction
auto_adjust  = min(net_security, non_security_pending)  // from calculateSecurityReturn response
remainder    = net_security - auto_adjust
// user then chooses: refund remainder, or adjust against security
```
The frontend recomputes `auto_adjust` / `remainder` live as the user types the deduction amount.

#### [MODIFY] `backend/src/routes/productLifecycle.js`

Update the `POST /security-refund/process` route:
- Drop `action` validation (no longer an enum)
- Pass `deduction_amount`, `deduction_type`, `adjust_non_security`, `refund_amount`, `adjust_security_amount`, `security_product_ids`, `payment_method`, `recorded_by` through to the service

#### [MODIFY] `shared/src/api/lifecycle.ts`

Update `processSecurityRefund` request/response types to match the new payload.

### Verification

- New test cases in `paymentButtonsRegression.test.js`:
  - Deduction only (full damage fee, zero refund)
  - Deduction + refund remainder
  - Auto-adjust + refund remainder (no deduction)
  - Auto-adjust + adjust-against-security
  - Validation failure: amounts don't sum to total_security → 400
- Existing tests pass

---

## Step 3: Create Shared `RefundSettlementSection` Component

**Priority**: High
**Estimated scope**: Large (~200 lines new component)
**Depends on**: Steps 1, 2

### Problem

Both the refund modal and the cancellation flow need a "refund vs adjust against security" picker with security allocation. This must be a shared component.

### Changes

#### [NEW] `frontend/components/common/RefundSettlementSection.tsx`

A shared component that:

1. Receives the `calculateSecurityReturn` response (or equivalent data for cancellation)
2. Shows auto-adjusted amount as a non-editable line item (e.g., "₹3000 will be adjusted against pending rent")
3. For the remainder, presents two choices:
   - **Refund to customer** — shows `PaymentMethodInput` for method selection
   - **Adjust against pending security** — shows `SecurityAllocationSection` (the same component already used in the payment modal) for selecting which products' security to credit
4. Calls back with the user's settlement decision

**Props interface:**
```tsx
interface RefundSettlementSectionProps {
  autoAdjustAmount: number;          // non-security pending, auto-adjusted
  remainderAmount: number;           // amount needing user choice
  securityPending: number;           // total security pending on other products
  eligibleSecurityProducts: Array<{  // for allocation picker
    booking_product_id: number;
    product_name: string;
    product_code: string;
    security_pending: number;
  }>;
  onSettlementChange: (settlement: {
    refundAmount: number;
    refundMethod: string;
    adjustSecurityAmount: number;
    securityProductIds: number[];
  }) => void;
}
```

#### Reuse: `SecurityAllocationSection`

The existing [SecurityAllocationSection.tsx](file:///c:/Users/User/Documents/app/frontend/components/common/SecurityAllocationSection.tsx) already handles the "select which products to allocate security to" UX. It's already exported and used in the payment modal. The `RefundSettlementSection` will compose it.

#### [MODIFY] `frontend/components/common/index.ts`

Export `RefundSettlementSection`.

### Code Provenance

- `SecurityAllocationSection` — 100% reused, already exists
- `PaymentMethodInput` — 100% reused, already exists
- `RefundSettlementSection` — new glue component, ~200 lines of JSX + state

### Verification

- TypeScript clean
- Manual: visual check in storybook-style isolation (render with mock data)

---

## Step 4: Refactor Refund Modal to Use Backend APIs + Settlement Component

**Priority**: Critical
**Estimated scope**: Large (major rewrite of `handleProductRefundSubmit`)
**Depends on**: Steps 1, 2, 3

### Problem

The current `handleProductRefundSubmit` in [PaymentManagement.tsx](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx#L283-L410):
1. Uses frontend `security_deposit` face value
2. Manually creates refund transactions via `paymentTransactionsApi.create`
3. Does not consider outstanding dues at all
4. Has no adjust-vs-refund choice

### Changes

#### [MODIFY] `frontend/components/common/PaymentManagement.tsx`

**New refund flow (per product):**

1. **When product is checked for refund**: Call `lifecycleApi.calculateSecurityRefund(bookingId, productId)` to get the backend's calculation
2. **Display**: Auto-filled amounts from backend (`total_security`, `auto_adjust_amount`, `remainder_amount`), not from `product.security_deposit`
3. **Settlement section**: Render `<RefundSettlementSection>` for each product with a remainder
4. **On submit**: Call `lifecycleApi.processSecurityRefund(bookingId, productId, { action, ... })` instead of `paymentTransactionsApi.create`
5. **Lifecycle transitions**: Still handled before refund (pickup → return → then process security return). The `processSecurityReturn` backend already validates that product status is `completed`.

**Key changes:**

- Remove `deduction_amount` / `deduction_type` / `damage_fee` frontend logic — `processSecurityReturn` handles this internally via its `action` parameter
- Remove manual `refundAmount > productSecurity` validation — backend enforces limits
- Remove manual notes building — backend generates appropriate notes
- Keep the "notes required if refund < security" UX requirement? → Yes, pass user notes to the backend

**State changes:**

- `itemRefunds` state now stores the backend calculation result per product, plus the user's settlement choice
- New state: `productCalculations: { [productId: number]: CalculateSecurityReturnResponse }`

#### Interactions with `fetchBookingData`:

Currently line 134 filters out `confirmed` products from the refund list. This is correct — only `in_progress` and `completed` products should appear. After the lifecycle transition block (pickup → return), the products will be `completed` and the backend's `calculateSecurityReturn` will work.

But there's a subtlety: the user selects products first, THEN we do lifecycle transitions. The calculation can only happen after the product is `completed`. So the flow becomes:

1. User selects products and enters any notes/deduction reasons
2. On submit: lifecycle transitions (pickup → return) for non-completed products
3. Then: call `calculateSecurityReturn` for each product
4. Show `RefundSettlementSection` if any product has a remainder
5. User confirms settlement choice
6. Call `processSecurityReturn` for each product

This means the refund modal needs a **two-step confirm**: first "Proceed" (does lifecycle + calculation), then "Confirm Settlement" (does the actual refund/adjustment).

### Verification

- All regression tests pass
- Manual: refund one product when another has pending security → settlement choice appears
- Manual: refund with auto-adjust (no remainder) → goes straight through
- TypeScript clean

---

## Step 5: Apply Settlement UX to Cancellation Flow

**Priority**: Medium
**Estimated scope**: Medium
**Depends on**: Steps 3, 4

### Problem

The cancellation flow in [BookingCancellation.tsx](file:///c:/Users/User/Documents/app/frontend/components/common/BookingCancellation.tsx#L742-L796) has its own settlement UI. When there are outstanding dues on other products, it currently shows either:
- "Refund to Customer" (no dues) 
- "Adjust against outstanding dues" (has dues)

It does NOT offer the security-specific allocation choice. It should use the same `RefundSettlementSection` for the security portion.

### Changes

#### [MODIFY] `frontend/components/common/BookingCancellation.tsx`

After computing the cancellation `diffAmount`:
1. Auto-adjust against `non_security_pending` (same as refund flow)
2. For remainder: use `<RefundSettlementSection>` for the "refund vs adjust against security" choice
3. The `settlement_action` sent to the backend's `cancelProduct` endpoint should map to the split action

#### [MODIFY] `backend/src/services/productLifecycleService.js` — `processCancellationSettlement`

Already supports `'refund' | 'adjust' | 'collect'`. For the split case, extend to accept security allocation product IDs so the adjustment targets the right security charges.

### Verification

- Cancellation with partial refund + adjust-against-security works
- Existing cancellation tests pass
- Manual walkthrough

---

## Step 6: Add Regression Tests

**Priority**: Critical
**Estimated scope**: Medium
**Depends on**: Steps 0-5

### Changes

#### [MODIFY] `backend/src/routes/paymentButtonsRegression.test.js`

New test cases:

| Test | Description |
|------|-------------|
| calculateSecurityReturn returns split amounts | After full payment + return, verify non_security_pending and security_pending |
| processSecurityReturn with action=split | Auto-adjust + refund, verify transactions |
| processSecurityReturn pure refund | Full refund, verify transaction |
| processSecurityReturn pure adjust | Full adjust against dues, verify charges paid |
| Payment after refund works | Refund product A, then pay for product B — should succeed |
| Payment after refund respects correct balance | Verify `balance` is correct post-refund |

### Verification

All tests pass.

---

## Differences: Frontend Refund Logic vs Backend `calculateSecurityReturn` / `processSecurityReturn`

| Aspect | Frontend (current) | Backend |
|--------|-------------------|---------|
| **Refundable amount source** | `product.security_deposit` (face value from `booking_products`) | `security.paid_amount` from `product_charges` (actual paid) |
| **Cap enforcement** | `refundAmount > productSecurity` → toast warning | Backend enforces: can't refund more than `total_security` (paid) |
| **Balance awareness** | None — no consideration of outstanding dues | `calculateSecurityReturn` checks `balance_due`, splits into `adjusted_amount` + `refund_amount` |
| **Deduction handling** | Frontend builds `deduction_amount` + `deduction_type: 'damage_fee'`, sends to `recordRefund` which creates the charge and marks it paid | `processSecurityReturn` will accept `deduction_amount` + `deduction_type`; deduction is settled first, then net amount is split into adjust/refund (Step 2) |
| **Transaction type** | `paymentTransactionsApi.create` with `type: 'refund'` — goes through `recordRefund` | `processSecurityReturn` with `action: 'refund'` — inserts transaction directly |
| **Lifecycle transition** | Frontend does pickup → return before refund | Backend's `calculateSecurityReturn` requires `status === 'completed'`, so transition must happen first |
| **Notes** | Frontend builds detailed notes with product name, code, deduction amount | Backend uses generic "Security deposit refund for product #N" |
| **Payment method** | Frontend sends `method` (Cash/UPI/etc.) to `recordRefund` | Backend's `processSecurityReturn` hardcodes `'Cash'` for refund (line 973) |
| **Damage fee tracking** | Frontend sends `deduction_amount` → `recordRefund` creates a `damage_fee` charge and marks it paid | Backend's `processSecurityReturn` has NO deduction handling |

> [!IMPORTANT]
> ### Deduction handling — RESOLVED
> **Decision**: Move deduction logic to `processSecurityReturn` on the backend, mirroring the current frontend pattern.
>
> `calculateSecurityReturn` is NOT involved — it returns raw totals and the split assuming full security. The deduction is a user input entered **after** the calculate call, so the frontend recomputes the net split locally:
> ```
> net_security = total_security - deduction_amount
> auto_adjust  = min(net_security, non_security_pending)
> remainder    = net_security - auto_adjust
> ```
>
> `processSecurityReturn` accepts all explicit amounts and validates they sum to `total_security` before executing.

> [!WARNING]
> ### Payment method gap
> `processSecurityReturn` hardcodes `'Cash'` for refunds. Needs to accept `payment_method` as a parameter.

---

## File Change Summary

| File | Steps | Type |
|------|-------|------|
| `frontend/components/common/PaymentManagement.tsx` | 0, 4 | MODIFY |
| `backend/src/services/productLifecycleService.js` | 1, 2, 5 | MODIFY |
| `backend/src/routes/productLifecycle.js` | 2 | MODIFY |
| `frontend/components/common/RefundSettlementSection.tsx` | 3 | NEW |
| `frontend/components/common/index.ts` | 3 | MODIFY |
| `frontend/components/common/BookingCancellation.tsx` | 5 | MODIFY |
| `backend/src/routes/paymentButtonsRegression.test.js` | 6 | MODIFY |
| `shared/src/api/lifecycle.ts` | 2 | MODIFY (extend types) |

---

## Execution Rules

1. **Step-by-step execution only.** Complete one step fully (code + tests + verification) before starting the next.
2. **User review after EVERY step.** After completing each step, provide a summary with code provenance, wait for explicit user approval.
3. **Update [status_adjustment.md](file:///c:/Users/User/Documents/app/status_adjustment.md) after every step.**
4. **No bulk changes.** Each step is a single, reviewable unit.
5. **Run tests after each step.**
6. **Code provenance tracking.** For each step, document whether code was: (a) reused, (b) moved, or (c) genuinely new.
7. **Use WSL for all terminal commands.**
