# Status: Security Payment Gate & Guided Security Allocation

> **Plan**: [PLAN_security.md](file:///c:/Users/User/Documents/app/PLAN_security.md)
> **Last updated**: 2026-05-23 (Bug 1, 2, 3 fixed; regression tests added; pre-existing 500→400 fixes)
> **Last updated by**: Agent
> **Single source of truth**: PLAN_security.md

---

## Current status (summary)

| Area | Status |
|------|--------|
| Steps 1–5 (planned scope) | **Code complete** — backend allocation, cancel/exchange UI gates, salesman + admin payment modals |
| Shared frontend modules | **Done** — `SecurityAllocationSection.tsx`, `toEligibleSecProducts()`, `computeSecAllocationPreview()`, `useSecurityAllocation()` |
| Payment-summary contract | **Documented** — single route `GET /payment-transactions/summary/:bookingId`; per-line `charges` is an array |
| Salesman / admin **payment** allocation | **Fixed** — uses `toEligibleSecProducts()` + hook (no `p.product` / `charges.security`) |
| Exchange **`securityPaidByProduct`** (Step 3 parents) | **Fixed** — `securityPaidByProductFromSummary()` helper added to `SecurityAllocationSection.tsx`; both salesman and admin pages now use it (correct `booking_product_id` + `charges[]` array shape) |
| Security allocation error HTTP status | **Fixed** — `"Security allocation insufficient"` now returns HTTP 400 (`paymentTransactions.js` route updated) |
| Unused import in salesman page | **Fixed** — duplicate `toEligibleSecProducts` import removed from salesman page |
| Regression tests for Bug 1 + Bug 2 | **Added** — `paymentTransactions.test.js`: summary shape contract test + 3 `security_product_ids` route tests; 25/25 passing |
| Pre-existing 500→400 gaps in route | **Fixed** — `"exceeds outstanding balance"` now returns 400 in both payment and adjustment catch blocks |
| Manual QA | **Outstanding** — see unchecked items under each step and Completion Criteria |

---

## ⚠️ Implementation Rules

1. **Step-by-step execution only.** Complete one step fully (code + tests + verification) before starting the next.
2. **Update this file after every step.** Mark the step as complete, note who did it and when, and record any deviations from the plan.
3. **No bulk changes.** Each step is a single, reviewable unit of work.
4. **Run tests after each step.** Both the new tests for that step and any existing tests that might be affected.
5. **If a step requires a deviation from the plan**, document it in the "Notes / Deviations" column before proceeding.
6. **This file is the single source of truth** for what has been done and what remains. Any developer or agent picking up work must read this file first.

---

## Progress Tracker

| Step | Description | Status | Completed By | Date | Notes / Deviations |
|------|-------------|--------|-------------|------|-------------------|
| 1 | Backend: Extend `_applyToSecurity()` with product allocation + validation + update payment API route | `[x]` Completed | Agent | 2026-05-17 | Test file at `backend/src/services/securityAllocation.test.js`. Pre-existing failure in `chargeAccountingService.test.js` (`cancelled product paid amounts`) unrelated. |
| 2 | Frontend: Cancel dialog — grey out security-paid products (Point 3) | `[x]` Completed | Agent | 2026-05-17 | Uses cancel preview `security_paid` (separate API from payment-summary). Pre-existing `effective_rent` TS error unrelated. |
| 3 | Frontend: Exchange dialog — disable security-paid products in dropdown (Point 3) | `[x]` Completed | Agent | 2026-05-17 | `ProductExchange` prop + disabled `<option>` done. Bug 1 fixed 2026-05-23: both parent pages now use `securityPaidByProductFromSummary()` with correct API shape. Pending manual verification. |
| 4 | Frontend: Salesman Record Payment — boundary warning + security allocation UI (Points 1 & 2) | `[x]` Completed | Agent | 2026-05-17 | **Follow-up fix:** `toEligibleSecProducts()` + `useSecurityAllocation()`; correct `GET /payment-transactions/summary/:id` parsing. |
| 5 | Frontend: Admin Collect Payment — boundary warning + security allocation UI (Points 1 & 2) | `[x]` Completed | Agent | 2026-05-17 | Same summary route + shared hook/helpers as salesman; `booked_from` on summary product lines in backend. |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked (describe reason in Notes)
- `Completed*` — UI shipped; small follow-up documented below

---

## Pre-Implementation Checklist

Before starting Step 1, verify:
- [ ] PLAN_discount.md Step 2 is complete — `cancelProduct()` and `exchangeProduct()` already throw errors when `security.paid_amount > 0` at the service layer. (Steps 2 and 3 here only add the *visual* enforcement.)
- [ ] PLAN_discount.md Step 7 is complete — `_applyToSecurity()` already sorts by pickup date. (Step 1 extends this method further.)
- [x] Payment-summary API is **`GET /payment-transactions/summary/:bookingId`** (via `bookingsApi.getPaymentSummary` and `paymentTransactionsApi.getSummary`). Per-product security is in **`products[i].charges`** as an **array** of rows; use `charge_type === 'security'` with `due_amount` / `paid_amount` — not `charges.security.paid`. See PLAN addendum and Step 3 follow-up.

---

## Step Details & Checklist

### Step 1: Backend — Extend Security Allocation

**Depends on**: PLAN_discount.md Step 7 (security sort by pickup date)

- [x] `_applyToSecurity(bookingId, amount, client, productIds = null)` — optional `productIds` filter + capacity validation
- [x] When `productIds` provided: partial-paid first (remaining ASC), then `booked_from` ASC
- [x] When `productIds` is null/empty: existing waterfall unchanged
- [x] `applyPayment()` accepts optional `securityProductIds`, threads to `_applyToSecurity`
- [x] Payment route (`POST /payment-transactions`) accepts `security_product_ids`
- [x] Tests: 6 cases pass (`securityAllocation.test.js`)
- [x] Existing `chargeAccountingService.test.js` — pre-existing unrelated failure noted
- [x] **Bug 2 fixed** — `paymentTransactions.js` route now catches `error.message.startsWith('Security allocation insufficient')` and returns HTTP 400 with the descriptive message, before the generic 500 fallback.
- [x] **Bug 2 regression test** — `paymentTransactions.test.js` › `POST /payments — security_product_ids routing` › 3 new cases: insufficient capacity → 400 with descriptive message; exact capacity → 201; single-product isolation verified via DB query.
- [x] **Pre-existing fix** — `"exceeds outstanding balance"` errors in both `POST /payments` and `POST /payments/adjustment` catch blocks now return 400 (were 500). All 25 tests in `paymentTransactions.test.js` pass.

### Step 2: Frontend — Cancel Dialog Greying Out

**Depends on**: Nothing (data already in cancel preview response)

- [x] `Product` interface includes `security_paid`
- [x] Greyed rows, disabled checkbox, lock message
- [x] Select All / selection guards skip security-paid products
- [ ] Manual verification: booking with mixed security-paid/unpaid products

### Step 3: Frontend — Exchange Dialog Disabling

**Depends on**: Parent derives `securityPaidByProduct` from payment summary (`GET /payment-transactions/summary/:id`)

- [x] `ProductExchange`: `securityPaidByProduct?: Record<number, number>` (key = **booking product id**)
- [x] Original product `<select>`: disabled option + suffix when `secPaid > 0`
- [x] Salesman + admin pages pass `securityPaidByProduct` from `paymentSummary.products`
- [x] **Bug 1 fixed** — `securityPaidByProductFromSummary()` added to `SecurityAllocationSection.tsx` and exported via `components/common/index.ts`; both salesman and admin pages now import and call it (correct `booking_product_id` + `charges[]` array lookup). Exchange gate is functional.
- [x] **Bug 1 regression test** — `paymentTransactions.test.js` › `GET /payments/summary/:bookingId` › new case asserts `products[0].booking_product_id` (number) and `products[0].charges` is an array containing a row with `charge_type === 'security'`, `due_amount`, `paid_amount`. Will catch any regression in the API contract that `securityPaidByProductFromSummary()` depends on.
- [ ] Manual verification: security-paid product greyed out in exchange dropdown with suffix

### Step 4: Frontend — Salesman Record Payment UX

**Depends on**: Step 1 (backend must accept `security_product_ids`)

- [x] **`useSecurityAllocation()`** — state, preview, `updateSplit`, `resetAll`, `canConfirmSecurity`
- [x] `calculatePaymentBreakdown()` → **`updateSplit(..., paymentSummary?.products ?? [])`** via **`toEligibleSecProducts()`**
- [x] Shared **`computeSecAllocationPreview()`** (in hook)
- [x] Boundary warning + `SecurityAllocationSection`; CONFIRM gated with `canConfirmSecurity`
- [x] `security_product_ids` on submit; `resetSecurityState()` on close / success
- [x] **Bug 3 fixed** — duplicate standalone `import { toEligibleSecProducts }` line removed from salesman page (was merged into the main `@/components/common` import and removed since it is unused at page level).
- [ ] Regression: rent-only payment
- [ ] Regression: existing tests (if any)

### Step 5: Frontend — Admin Collect Payment UX

**Depends on**: Steps 1 and 4 (shared modules)

- [x] **`useSecurityAllocation()`** in `PaymentManagement.tsx`
- [x] Live split on `[formData.amount, summary, transactionType]` → **`updateSplit(...)`**
- [x] Boundary warning + allocation section; `canConfirmSecurity` on Confirm
- [x] `security_product_ids` on submit; `resetSecurityState()` on Cancel / success
- [x] Refund/adjustment flows unchanged
- [ ] Manual verification: cross-boundary payment in admin modal

---

### Addendum: Single payment-summary route + shared parsing helpers

- **Route:** `GET /payment-transactions/summary/:bookingId` — salesman (`bookingsApi.getPaymentSummary`) and admin (`paymentTransactionsApi.getSummary`).
- **Bug (Step 4):** Salesman payment modal read `p.product` / `charges.security` → empty allocation list. **Fixed** with `toEligibleSecProducts()` + hook.
- **Same shape issue (Step 3):** Exchange parents now use `securityPaidByProductFromSummary()` — **fixed** in Bug 1 fix; exchange UI correctly disables security-paid products.
- **Backend:** `booked_from` included on each product in `getPaymentSummary` response.
- **Shared code:** `frontend/components/common/SecurityAllocationSection.tsx`, `frontend/hooks/useSecurityAllocation.ts`. See **PLAN_security.md → Addendum**.

---

## Completion Criteria

Planned implementation is in place; items below are for **verification** and **remaining follow-up**:

- [x] Backend allocates security to user-selected products when `security_product_ids` sent
- [x] Backend validation blocks over-allocation (tests in `securityAllocation.test.js`)
- [ ] Existing security waterfall unchanged under manual regression
- [ ] Cancel dialog: greyed security-paid products (manual)
- [ ] Exchange dialog: disabled options when security paid — Bug 1 fixed; pending manual verification
- [ ] Salesman payment: boundary warning + allocation (manual)
- [ ] Admin payment: same as salesman (manual)
- [ ] Projected allocation matches backend rule (manual)
- [x] All new backend tests pass locally — `paymentTransactions.test.js` 25/25 ✅; `securityAllocation.test.js` 6/6 ✅
- [ ] No regression in payment, exchange, cancel flows
- [x] Salesman/admin **payment** modals parse summary `charges` as charge rows (`toEligibleSecProducts`)
- [x] **Bug 1 fixed**: Salesman/admin **exchange** pass correct `securityPaidByProduct` via `securityPaidByProductFromSummary()` (uses `booking_product_id` + `charges[]` array)
- [x] **Bug 2 fixed**: Security allocation validation error returns HTTP 400 (not 500) from `POST /payment-transactions`
- [x] **Bug 3 fixed**: Unused `toEligibleSecProducts` import removed from salesman page
- [x] This status file reflects current state and known gaps
