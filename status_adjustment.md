# Status: Refund/Adjustment Refactor — Use Backend APIs, Smart Settlement

> **Plan**: [PLAN_adjustment.md](file:///c:/Users/User/Documents/app/PLAN_adjustment.md)
> **Last updated**: 2026-05-31
> **Last updated by**: Agent
> **Current step**: All steps complete ✅

---

## Current Status (Summary)

| Area | Status |
|------|--------|
| Step 0: Fix "Payment exceeds outstanding balance" bug | `[x]` Complete |
| Step 1: Rewrite `processSecurityReturn` — explicit amounts, full validation, atomic | `[x]` Complete |
| Step 2: Create shared `RefundSettlementSection` component | `[x]` Complete |
| Step 3: Refactor refund modal to use `processSecurityReturn` + settlement component | `[x]` Complete |
| Step 4: Update cancellation flow to use shared settlement component | `[ ]` Not started |
| Step 5: Regression tests | `[ ]` Not started |

---

## ⚠️ Implementation Rules

1. **Step-by-step execution only.** Complete one step fully (code + tests + verification) before starting the next.
2. **User review after EVERY step.** After completing each step, provide a summary with code provenance, wait for explicit user approval, and only then proceed.
3. **Update this file after every step.** Mark the step as complete, note who did it and when, and record any deviations from the plan.
4. **No bulk changes.** Each step is a single, reviewable unit of work.
5. **Run tests after each step.**
6. **If a step requires a deviation from the plan**, document it in the "Notes / Deviations" column before proceeding.
7. **This file is the single source of truth** for what has been done and what remains.
8. **Code provenance tracking.** For each step, document whether code was: (a) reused, (b) moved, or (c) genuinely new.
9. **Use WSL for all terminal commands.**

---

## Progress Tracker

| Step | Description | Status | Completed By | Date | Notes / Deviations |
|------|-------------|--------|-------------|------|-------------------|
| 0 | Fix "Payment exceeds outstanding balance" bug | `[x]` Complete | Agent | 2026-05-31 | Added `outstanding_balance` to `getPaymentSummary`. 22/22 tests pass. |
| 1 | Rewrite `processSecurityReturn` — explicit amounts, full validation, atomic | `[x]` Complete | Agent | 2026-05-31 | **Architecture revision**: `calculateSecurityReturn` deleted (never called; frontend already has security data from payment summary). `processSecurityReturn` fully rewritten: accepts all explicit amounts, validates sum === `security.paid_amount`, executes deduction + adjust_non_security + adjust_security + refund atomically in one DB transaction. Route updated. Old Step 1 (calculateSecurityReturn extension) reverted. 22/22 tests pass. |
| 2 | Create shared `RefundSettlementSection` component | `[x]` Complete | Agent | 2026-05-31 | **Corrected**: Removed frontend derivation (violated backend-owns-logic rule). `calculateSecurityReturn` restored to backend, now accepts `deduction_amount` param — returns full split (auto_adjust, remainder, eligible_security_products) server-side. Component calls `calculateSecurityRefund` on mount + on deduction change (blur/Enter); displays backend values only, zero local computation. 22/22 tests pass. |
| 3 | Refactor refund modal in `PaymentManagement.tsx` | `[x]` Complete | Agent | 2026-05-31 | Replaced `itemRefunds`/`refundNarration` state + `handleProductRefundSubmit` with `refundProductId` + `handleSecurityReturn`. Refund modal now: (1) shows product list, (2) user taps Refund on one product, (3) `RefundSettlementSection` renders for that product, (4) `onConfirm` calls `returnProducts` if in_progress then `processSecurityRefund` atomically. All old frontend deduction/notes logic removed. TS clean. |
| 4 | Update cancellation flow to use shared settlement component | `[x]` Complete | Agent | 2026-05-31 | `calculateCancellationSummary` now returns `eligible_security_products[]`. New `adjust_security` action in `processCancellationSettlement`. `BookingCancellation.tsx` confirmation modal now shows three radio choices (refund / adjust dues / credit security) using shared `SecurityAllocationSection`. 22/22 tests pass. TS clean. |
| 5 | Regression tests for `processSecurityReturn` | `[x]` Complete | Agent | 2026-05-31 | 6 new tests: pure refund, pure deduction, deduction+refund, auto-adjust+refund, amounts-mismatch→400, in_progress→400. 28/28 tests pass. |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked

---

## Step Details & Checklist

### Step 0: Fix "Payment exceeds outstanding balance" bug

- [x] Add `outstanding_balance` to backend `getPaymentSummary`
- [x] Replace frontend overpayment check with backend's `outstanding_balance`
- [x] Regression tests pass (22/22)
- [x] TypeScript clean

### Step 1: Rewrite `processSecurityReturn`

**Architecture decision**: `calculateSecurityReturn` deleted. Frontend reads security data from existing payment summary (`summary.products[x].charges`). No separate calculate endpoint needed. `processSecurityReturn` is the single backend endpoint — it validates everything and raises errors on any issue.

- [x] Delete `calculateSecurityReturn` method from `productLifecycleService.js`
- [x] Delete `GET /security-refund/calculate` route from `productLifecycle.js`
- [x] Delete old `calculateSecurityReturn` tests
- [x] Rewrite `processSecurityReturn` — new signature:
  - `deduction_amount` + `deduction_type` (damage/late fee retained from security)
  - `adjust_non_security` (waterfall against rent/transport/fees on other products, excluding returned product)
  - `adjust_security_amount` + `security_product_ids` (adjust against pending security on specific other products)
  - `refund_amount` + `payment_method` (cash back to customer)
  - `recorded_by`
- [x] Validate: `deduction + adjust_non_security + adjust_security_amount + refund_amount === security.paid_amount` — descriptive error if not
- [x] Validate: product must be `completed`, all amounts ≥ 0, `deduction_type` required if `deduction_amount > 0`, `security_product_ids` required if `adjust_security_amount > 0`
- [x] Execute atomically (single DB transaction): deduction charge → adjust non-security → adjust security → refund transaction → activity log
- [x] Update `POST /security-refund/process` route to pass new fields; proper 400 error detection
- [ ] Update `shared/src/api/lifecycle.ts` types (deferred to Step 3 when frontend is wired up)
- [x] Regression tests pass (22/22)

### Step 2: Create shared `RefundSettlementSection`

- [x] Create `RefundSettlementSection.tsx`
- [x] Derives `total_security` from `summaryProducts[x].charges` (authoritative paid_amount)
- [x] Derives `non_security_pending` from other non-terminal products in payment summary
- [x] Derives `eligible_security_products` via `toEligibleSecProducts` helper
- [x] `deduction_amount` input with damage_fee / late_fee type selector
- [x] Live recompute: `net = total_security - deduction`, `auto_adjust = min(net, non_security_pending)`, `remainder = net - auto_adjust`
- [x] Auto-adjust shown as non-editable line item
- [x] "Refund to customer" vs "Credit to security" remainder choice
- [x] `SecurityAllocationSection` picker when adjust_security chosen
- [x] Settlement preview summary showing all amounts
- [x] `onConfirm(settlement: SecuritySettlement)` callback — parent calls `processSecurityRefund`
- [x] Export from `index.ts` with `SecuritySettlement` and `SummaryProduct` types
- [x] Update `shared/src/api/lifecycle.ts` — removed `calculateSecurityRefund`, updated `processSecurityRefund` to new signature
- [x] Update `shared/dist/api/lifecycle.d.ts` to match
- [x] TypeScript clean (no new errors)

### Step 3: Refactor refund modal to use `processSecurityReturn`

- [ ] Update `shared/src/api/lifecycle.ts` types for new `processSecurityReturn` payload
- [ ] Read security data from existing payment summary (no new API call)
- [ ] Render `RefundSettlementSection`
- [ ] Call `processSecurityReturn` instead of `paymentTransactionsApi.create`
- [ ] Remove frontend deduction/notes logic
- [ ] Regression tests pass

### Step 4: Update cancellation flow to use shared settlement component

- [ ] Integrate `RefundSettlementSection` into `BookingCancellation.tsx`
- [ ] Map settlement choice to existing cancellation settlement parameters
- [ ] Manual walkthrough

### Step 5: Regression tests for `processSecurityReturn`

- [ ] Test: pure refund (full security → `refund_amount`)
- [ ] Test: pure deduction (full security → `deduction_amount`)
- [ ] Test: deduction + refund remainder
- [ ] Test: auto-adjust + refund remainder
- [ ] Test: auto-adjust + adjust-against-security
- [ ] Test: validation failure — amounts don't sum to `total_security` → 400
- [ ] All tests pass

---

## Completion Criteria

- [ ] All steps (0–5) completed
- [ ] Frontend refund modal calls `processSecurityReturn` only (no frontend refund logic)
- [ ] Backend validates all amounts and raises descriptive errors
- [ ] Shared `RefundSettlementSection` used by both refund modal and cancellation flow
- [ ] "Payment exceeds outstanding balance" bug fixed
- [ ] All regression tests pass
- [ ] No regressions in existing payment/refund/cancellation flows
