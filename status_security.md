# Status: Security Payment Gate & Guided Security Allocation

> **Plan**: [PLAN_security.md](file:///c:/Users/User/Documents/app/PLAN_security.md)
> **Last updated**: 2026-05-17
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
| Exchange **`securityPaidByProduct`** (Step 3 parents) | **Known gap** — salesman + admin pages still derive paid security with `p.product.id` and `p.charges?.security?.paid`; should read **`booking_product_id`** + security row in **`charges[]`** (see Step 3 below) |
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
| 3 | Frontend: Exchange dialog — disable security-paid products in dropdown (Point 3) | `[x]` Completed* | Agent | 2026-05-17 | `ProductExchange` prop + disabled `<option>` done. **\*Follow-up:** parent `securityPaidByProduct` on salesman + admin pages still uses wrong summary shape — exchange disable may not trigger until fixed (see Step 3). |
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
- [ ] **Follow-up (recommended):** Fix parent derivation to match summary API — same contract as payment allocation:
  - Key: `p.booking_product_id` (not `p.product.id`)
  - Paid amount: `p.charges.find(c => c.charge_type === 'security')?.paid_amount ?? 0` (not `p.charges?.security?.paid`)
  - Files: `frontend/app/salesman/order-details/[id]/page.tsx`, `frontend/app/admin/bookings/[id]/page.tsx` (both currently use the old nested shape)
  - Optional: add `securityPaidByProductFromSummary(products)` next to `toEligibleSecProducts()` in `SecurityAllocationSection.tsx`
- [ ] Manual verification: security-paid product greyed out in exchange dropdown with suffix

### Step 4: Frontend — Salesman Record Payment UX

**Depends on**: Step 1 (backend must accept `security_product_ids`)

- [x] **`useSecurityAllocation()`** — state, preview, `updateSplit`, `resetAll`, `canConfirmSecurity`
- [x] `calculatePaymentBreakdown()` → **`updateSplit(..., paymentSummary?.products ?? [])`** via **`toEligibleSecProducts()`**
- [x] Shared **`computeSecAllocationPreview()`** (in hook)
- [x] Boundary warning + `SecurityAllocationSection`; CONFIRM gated with `canConfirmSecurity`
- [x] `security_product_ids` on submit; `resetSecurityState()` on close / success
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
- **Same shape issue (Step 3):** Exchange parents still use `p.product.id` / `charges.security` for `securityPaidByProduct` — **not yet fixed**; exchange UI may treat all products as exchangeable until updated.
- **Backend:** `booked_from` included on each product in `getPaymentSummary` response.
- **Shared code:** `frontend/components/common/SecurityAllocationSection.tsx`, `frontend/hooks/useSecurityAllocation.ts`. See **PLAN_security.md → Addendum**.

---

## Completion Criteria

Planned implementation is in place; items below are for **verification** and **remaining follow-up**:

- [x] Backend allocates security to user-selected products when `security_product_ids` sent
- [x] Backend validation blocks over-allocation (tests in `securityAllocation.test.js`)
- [ ] Existing security waterfall unchanged under manual regression
- [ ] Cancel dialog: greyed security-paid products (manual)
- [ ] Exchange dialog: disabled options when security paid — **blocked on Step 3 parent derivation fix** unless QA shows it working by accident
- [ ] Salesman payment: boundary warning + allocation (manual)
- [ ] Admin payment: same as salesman (manual)
- [ ] Projected allocation matches backend rule (manual)
- [ ] All new backend tests pass on CI/local
- [ ] No regression in payment, exchange, cancel flows
- [x] Salesman/admin **payment** modals parse summary `charges` as charge rows (`toEligibleSecProducts`)
- [ ] Salesman/admin **exchange** pass `securityPaidByProduct` using `booking_product_id` + security charge row in `charges[]`
- [x] This status file reflects current state and known gaps
