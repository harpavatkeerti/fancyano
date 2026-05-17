# Status: Exchange Payment Allocation Bug Fix

> **Plan**: [PLAN_exchange_bug.md](file:///c:/Users/User/Documents/app/PLAN_exchange_bug.md)
> **Last updated**: 2026-05-17
> **Last updated by**: Antigravity
> **Single source of truth**: PLAN_exchange_bug.md — do NOT reference the pre-implementation analysis plan at `c:\Users\User\.cursor\plans\exchange_bug_pre-implementation_analysis_d0872e81.plan.md`

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
| 1 | Add targeted exchange methods to chargeAccountingService | `[x]` Completed | Antigravity | 2026-05-17 | Plan called for `redistributeRentInternal` + `applyExchangePayment` + `_paySpecificCharge` + `_payRentForProducts`. During implementation these were simplified and merged: `_payRentForProducts` was eliminated (inlined), then `redistributeRentInternal` and `applyExchangePayment` were merged into a single `settleExchange()` method that zeroes old rent, combines old credit + payment amount into one pool, pays penalties, then drains into new product rent in one pass. `_paySpecificCharge` kept as private helper. 9 tests for `settleExchange` all pass. 1 pre-existing unrelated test failure (`should include paid amounts from cancelled products`) not touched. |
| 2 | Rewrite exchange flow in productLifecycleService | `[x]` Completed | Antigravity | 2026-05-17 | Plan called for separate `redistributeRentInternal` + `applyExchangePayment` calls; since Step 1 merged these into `settleExchange()`, Step 2 calls that single method instead. Status change moved to STEP 3 (before settlement). `applyAdjustment` + `applyPayment` removed. `rent_credit` removed from activity log. 1 new financial test added: pins Bug #1 (no adjustment tx), Bug #2 (penalty paid), old rent zeroed, new rent fully funded, pre-existing product unchanged. All 7 exchange tests pass; chargeAccountingService still 44/45 (same pre-existing failure). |
| 3 | Add robust comprehensive regression tests | `[x]` Completed | Antigravity | 2026-05-17 | Plan chargeAccountingService tests referenced `redistributeRentInternal`/`applyExchangePayment` (now `settleExchange`); adapted accordingly. Added 1 full-scope isolation test to chargeAccountingService (chargeAccountingService now 45/46 — same pre-existing failure). Added 4 financial edge case tests in productLifecycleService under `describe('financial edge cases')`: SUM invariant, zero-redistribution, 1-to-2 sequential fill, downgrade penalty ordering. productLifecycleService exchange group: 11/11 pass. Pre-existing unrelated failures unchanged. |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked (describe reason in Notes)

---

## Step Details & Checklist

### Step 1: Add Targeted Exchange Methods to chargeAccountingService
- [x] Add `settleExchange(bookingId, oldBookingProductId, newBookingProductIds, paymentAmount, method, recordedBy, notes, client)` — zeroes old product's rent, combines old rent credit + payment into one pool, pays exchange_penalty → downgrade_penalty, drains remainder into new product(s)' rent; records single 'payment' transaction only when paymentAmount > 0
- [x] Add `_paySpecificCharge()` private helper — pays a specific charge type on a specific product
- [x] 9 tests for `settleExchange`: full scenario, zero-credit path, sequential 2-product drain, credit capping, penalty ordering, single payment tx, no tx when amount=0, pre-existing isolation, activity log
- [x] All new tests pass (44/45 — 1 pre-existing unrelated failure excluded)
- [x] Existing chargeAccountingService tests still pass

### Step 2: Rewrite Exchange Flow in productLifecycleService
- [x] Move status change to `exchanged` BEFORE payment allocation (old STEP 5 → new STEP 3)
- [x] Remove `applyAdjustment()` call — replaced by `settleExchange()`
- [x] Remove `applyPayment()` call — replaced by `settleExchange()`
- [x] Add `settleExchange(bookingId, bookingProductId, newBookingProductIds, paymentAmount, ...)` call after status change — passes `newBookingProductIds`, NOT `bookingId`-scoped active products
- [x] Remove `rent_credit` from activity log details
- [x] New financial test: passes `payment` object; verifies no adjustment transaction, exchange penalty paid, new product rent = redistribution + exchange payment, pre-existing product rent unchanged, old product rent zeroed
- [x] All exchange tests pass (7/7)
- [x] All chargeAccountingService tests still pass (44/45 — same pre-existing failure)
- [ ] Manual verification: recreate order #9978 scenario — original Lehenga rent stays at pre-exchange value, Indo Western rent zeroed, New Lehenga rent fully covered, single 'Exchange payment' transaction in history

### Step 3: Add Robust Comprehensive Regression Tests

**chargeAccountingService.test.js:**
- [x] Full-scope isolation: snapshot ALL `product_charges` before and after `settleExchange` — every row except (old product rent zeroed, old product penalties paid, new products' rent funded) is byte-for-byte identical to before (45/46 pass — same pre-existing failure)

**productLifecycleService.test.js — regression pins (covered in Step 2 financial test):**
- [x] Exchange with payment: assert 0 rows in `payment_transactions WHERE type='adjustment'` (pins Bug #1)
- [x] Exchange with payment: assert old product's `exchange_penalty.paid_amount` equals penalty amount (pins Bug #2)
- [x] Pre-existing product isolation: assert pre-existing product's `rent.paid_amount` identical before and after
- [x] Old product rent zeroed: assert `rent.due_amount = 0` AND `rent.paid_amount = 0`

**productLifecycleService.test.js — financial edge cases (added in Step 3):**
- [x] Financial invariant: `SUM(payment_transactions.amount WHERE type='payment')` equals total payments collected — guards double-count
- [x] Exchange where old product paid = 0 (never paid toward): redistribution = ₹0; new product funded entirely by exchange payment
- [x] 1-to-2 exchange: pool fills highest-rent new product first (ORDER BY rent DESC), remainder flows to second
- [x] Downgrade penalty: both exchange_penalty then downgrade_penalty paid in full before new product rent is funded

---

## Completion Criteria

All steps marked `[x]` with:
- [x] All unit tests passing (both service files — new exchange tests 100%, pre-existing unrelated failure unchanged)
- [x] No adjustment transactions created during exchange (only a single 'payment' transaction)
- [x] Exchange penalty correctly paid from exchange payment (not silently dropped)
- [x] New exchange product rent = (old product's redistributed paid) + exchange payment remainder
- [x] New exchange product rent fully covered (outstanding = 0) — the backend-computed `payment_amount` is exact
- [x] Pre-existing products' rent completely unaffected (paid_amount identical to pre-exchange value)
- [x] Old exchanged product rent zeroed (due=0, paid=0)
- [ ] Manual verification of order #9978 scenario shows correct final state
- [x] This status file fully up to date
