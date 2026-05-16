# Status: Financial Audit Implementation

> **Plan**: [PLAN_discount.md](file:///c:/Users/User/Documents/app/PLAN_discount.md)  
> **Last updated**: 2026-05-16  
> **Last updated by**: —

---

## ⚠️ Implementation Rules

1. **Step-by-step execution only.** Complete one step fully (code + tests + verification) before starting the next.
2. **Update this file after every step.** Mark the step as complete, note who did it and when, and record any deviations from the plan.
3. **No bulk changes.** Each step is a single, reviewable unit of work. If a step requires changes in multiple files, they are all part of that one step — but don't combine steps.
4. **Run tests after each step.** Both the new tests for that step and any existing tests that might be affected.
5. **If a step requires a deviation from the plan**, document it in the "Notes / Deviations" column before proceeding.
6. **This file is the single source of truth** for what has been done and what remains. Any developer or agent picking up work must read this file first.

---

## Progress Tracker

| Step | Description | Status | Completed By | Date | Notes / Deviations |
|------|-------------|--------|-------------|------|-------------------|
| 1 | Fix percentage discount formula | `[ ]` Not started | — | — | — |
| 2 | Security-gated cancel & exchange | `[ ]` Not started | — | — | — |
| 3 | Backend-enforced negative refund block | `[ ]` Not started | — | — | — |
| 4 | Remove discount update endpoint & dead code | `[ ]` Not started | — | — | — |
| 5 | Proportional rent distribution | `[ ]` Not started | — | — | — |
| 6 | 50% minimum payment rule | `[ ]` Not started | — | — | Depends on Step 5 |
| 7 | Security distribution order by pickup date | `[ ]` Not started | — | — | — |
| 8 | Security return: adjust against next product | `[ ]` Not started | — | — | Depends on Step 7 |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked (describe reason in Notes)

---

## Step Details & Checklist

### Step 1: Fix Percentage Discount Formula
- [ ] Modify `calculateEffectiveRent()` in `backend/src/utils/discountCalculator.js`
- [ ] Update test cases in `backend/src/utils/discountCalculator.test.js`
- [ ] All tests pass
- [ ] Verified via booking preview endpoint

### Step 2: Security-Gated Cancel & Exchange
- [ ] Add security check in `cancelProduct()` in `productLifecycleService.js`
- [ ] Add security check in `exchangeProduct()` in `productLifecycleService.js`
- [ ] Add security check in `validateCancellationEligibility()` in `productLifecycleService.js`
- [ ] Add security check in `validateExchangeEligibility()` in `productLifecycleService.js`
- [ ] Create test file `backend/src/services/__tests__/securityGate.test.js`
- [ ] All tests pass
- [ ] Manual API verification

### Step 3: Backend-Enforced Negative Refund Block
- [ ] Add `diffAmount < 0` guard in `cancelProduct()` in `productLifecycleService.js`
- [ ] Create test file `backend/src/services/__tests__/negativeRefund.test.js`
- [ ] All tests pass

### Step 4: Remove Discount Update Endpoint & Dead Code
- [ ] Remove `PUT /:id/discount` route from `backend/src/routes/bookings.js`
- [ ] Remove `updateBookingDiscount()` from `backend/src/services/chargeAccountingService.js`
- [ ] Remove `_reverseGlobalDiscountShares()` from `backend/src/services/chargeAccountingService.js`
- [ ] Remove editable discount UI from `frontend/app/admin/bookings/[id]/page.tsx`
- [ ] Remove `updateDiscount` from `frontend/lib/api.ts` (if it exists)
- [ ] Grep for dead references — zero results
- [ ] App compiles and runs without errors

### Step 5: Proportional Rent Distribution
- [ ] Rewrite `_applyToRent()` in `backend/src/services/chargeAccountingService.js`
- [ ] Create test file `backend/src/services/__tests__/proportionalRent.test.js`
- [ ] All tests pass
- [ ] Manual: 2-product booking, verify proportional split in `product_charges`

### Step 6: 50% Minimum Payment Rule
- [ ] Add validation in `applyPayment()` in `backend/src/services/chargeAccountingService.js`
- [ ] Create test file `backend/src/services/__tests__/minimumPayment.test.js`
- [ ] All tests pass
- [ ] Manual: first payment below 50% rejected, at/above 50% accepted

### Step 7: Security Distribution Order by Pickup Date
- [ ] Update security charge query ordering in `chargeAccountingService.js`
- [ ] Verified: earliest `booked_from` product gets security filled first

### Step 8: Security Return — Adjust Against Next Product
- [ ] Add `'adjust_to_security'` action in `processSecurityReturn()` in `productLifecycleService.js`
- [ ] Update route to accept new action
- [ ] Create test file `backend/src/services/__tests__/securityAdjust.test.js`
- [ ] All tests pass
- [ ] Manual: return product, adjust security against next product

---

## Completion Criteria

All 8 steps marked `[x]` with:
- All unit tests passing
- No dead code remaining
- Manual verification of critical flows (cancel, exchange, payment)
- This status file fully up to date
