# Implementation Plan: Unify Payment Buttons into Shared PaymentManagement Component

> **Tracking**: [status_payment_buttons.md](file:///c:/Users/User/Documents/app/status_payment_buttons.md)

---

## ⚠️ Terminal Command Note

**All terminal commands must be run via WSL.** Use `wsl` prefix or execute inside a WSL shell. Do not use PowerShell or cmd directly for build/test commands.

---

## Overview

The salesman booking page ([page.tsx](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx)) currently has **two sets of payment/refund buttons**:

1. **Shared Component Buttons** — "💰 Collect Payment" and "💸 Refund Payment" inside [PaymentManagement.tsx](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx) (line ~426–446). Shared with the admin page.
2. **Salesman-only Buttons** — "RECORD PAYMENT" / "RECORD REFUND" rendered directly in the salesman page (lines ~1958–1982), with modals (lines ~2357–2759) and submit handlers [confirmPaymentRecord](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L889-L939) and [handleRecordRefund](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L987-L1134).

**Goal**: Transfer all correct behaviour from buttons #2 into buttons #1 (shared component), then remove buttons #2 and their modals/state/handlers.

**Core constraint**: Admin and salesman behaviour is **identical** for now. The shared component must replicate the salesman button behaviour exactly — no regressions.

---

## Design Decisions (from user feedback)

1. **`recorded_by`** — Read from `userRole` prop for now (map `'admin'` → `'Admin'`, `'salesman'` → `'Salesman'`). Auth context implementation deferred.
2. **Auto-confirm on first payment** — Applies to BOTH admin and salesman (not salesman-only).
3. **Measurement prompt after first payment** — Extract measurement modal into standalone component. On first payment (when booking transitions from `pending` to `confirmed`), call a callback to surface it. Works for both roles. Both admin and salesman pages will open the MeasurementModal on first payment.
4. **Product lifecycle transitions before refund** — Same behaviour for admin and salesman. Auto-transition products through lifecycle (pickup → return) before recording refund, based on current product status.
5. **`hasProductRefund` detection** — Use `product.status === 'completed'` (backend-driven). No fragile text matching.
6. **`transaction_type: 'booking'`** — The DB column `payment_transactions.transaction_type` (added by [009_add_transaction_type.sql](file:///c:/Users/User/Documents/app/backend/migrations/009_add_transaction_type.sql)) has `DEFAULT 'booking'`. The current backend INSERT at [chargeAccountingService.js line 657](file:///c:/Users/User/Documents/app/backend/src/services/chargeAccountingService.js#L657-L660) does NOT include `transaction_type` in the column list — it relies on the DB default. However, the invoice generator ([invoiceGenerator.js](file:///c:/Users/User/Documents/app/backend/src/utils/invoiceGenerator.js#L252)) reads `transaction.transaction_type` to classify transactions. **This field is important and should be set explicitly.** We will update the backend INSERT to explicitly include `transaction_type` (passed from the frontend or defaulting to `'booking'`), and update the route to forward it.
7. **Refund amount auto-fill** — Keep the shared component's auto-fill behaviour (fills security deposit on checkbox).
8. **Refund processing order** — Salesman uses `Promise.all` (parallel). Shared uses sequential `for` loop. Both work; adopt `Promise.all` for consistency with the salesman (which is the source of truth).

---

## Step 0: Write Regression Tests (Pre-Implementation)

**Priority**: Critical — MUST be done FIRST  
**Estimated scope**: Medium  
**Purpose**: Capture the exact current behaviour of the salesman buttons as automated test baselines. Every subsequent step must pass these tests.

### Approach

All payment/refund logic lives in the **backend** (chargeAccountingService, productLifecycleService, routes). The frontend only makes API calls. Therefore, all regression tests are **backend API tests** — they call the actual route endpoints and verify responses and DB state.

Existing test files:
- [paymentTransactions.test.js](file:///c:/Users/User/Documents/app/backend/src/routes/paymentTransactions.test.js) — 606 lines, covers basic payment/refund/adjustment routes
- [productLifecycle.test.js](file:///c:/Users/User/Documents/app/backend/src/routes/productLifecycle.test.js) — covers pickup/return transitions

We need a new test file that tests the **complete flow** end-to-end as the frontend handlers execute it (the exact sequence of API calls the shared component will make).

### Changes

#### [NEW] `backend/src/routes/paymentButtonsRegression.test.js`

End-to-end tests that replicate the salesman button flows as API call sequences:

| Test Case | Description |
|-----------|-------------|
| **Payment: basic payment records correctly** | POST payment → verify 201, amount applied, `recorded_by` stored in DB |
| **Payment: overpayment rejected** | Pay more than outstanding balance → verify 400 |
| **Payment: first payment must cover ≥50% rent** | Pay less than 50% of rent as first payment → verify 400 with descriptive error |
| **Payment: security allocation passes through** | Pay with `security_product_ids` → verify only those products credited in DB |
| **Payment: security allocation insufficient** | Pay with `security_product_ids` where capacity < amount → verify 400 |
| **Payment: payment on non-existent booking** | Pay on booking_id 999999 → verify 404 |
| **Payment: zero/negative amount rejected** | Pay 0 or -100 → verify 400 |
| **Lifecycle: pickup confirmed→in_progress** | Confirm booking → pickup → verify product status = `in_progress` in DB |
| **Lifecycle: return in_progress→completed** | Confirm + pickup → return → verify product status = `completed` in DB |
| **Lifecycle: full refund flow** | Confirm → pickup → return → refund → verify transaction + product status `completed` |
| **Lifecycle: pickup + return in sequence (confirmed→completed)** | Confirm → pickup → return in one flow (like salesman refund handler does) → verify status |
| **Refund: refund transaction records correctly** | Full payment → lifecycle complete → POST refund → verify 201, transaction type = `refund` in DB |
| **Refund: refund with deduction (damage_fee)** | Refund with `deduction_amount` + `deduction_type` → verify damage_fee charge created and marked paid |
| **Refund: multiple products refunded in parallel** | Two products, both refunded via concurrent POST calls → both transactions recorded |
| **Refund: refund on booking with no payment** | Attempt refund on unpaid booking → verify it still records (refunds are not gated by payment balance) |
| **Booking confirm: confirm pending booking** | Create pending booking → POST confirm → verify status = `confirmed` |
| **Booking confirm: confirm already confirmed booking** | Confirm twice → verify no error (idempotent) |
| **Summary: payment summary shape contract** | GET summary → verify `products` array with `booking_product_id`, `charges` as array with `charge_type` / `due_amount` / `paid_amount` |

#### Audit existing tests

Review [paymentTransactions.test.js](file:///c:/Users/User/Documents/app/backend/src/routes/paymentTransactions.test.js) (606 lines) and [productLifecycle.test.js](file:///c:/Users/User/Documents/app/backend/src/routes/productLifecycle.test.js) for any missing coverage.

### Verification

```bash
wsl bash -c "cd /mnt/c/Users/User/Documents/app/backend && npx jest src/routes/paymentButtonsRegression.test.js --verbose"
```

All tests must pass BEFORE proceeding to Step 1.

> **Review gate**: After this step, provide the test file for user review and wait for explicit approval before proceeding.

---

## Step 1: Fix `recorded_by` in Shared Component

**Priority**: Critical  
**Estimated scope**: Small (1 file, 2 line changes)  
**Depends on**: Step 0

### Problem

[PaymentManagement.tsx](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx) hardcodes `recorded_by: 'Admin'` in both [handleSubmit (line 204)](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx#L204) and [handleProductRefundSubmit (line 354)](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx#L354).

### Changes

#### [MODIFY] `frontend/components/common/PaymentManagement.tsx`

1. **Line 204**: `recorded_by: 'Admin'` → `recorded_by: userRole === 'admin' ? 'Admin' : 'Salesman'`
2. **Line 354**: `recorded_by: 'Admin'` → `recorded_by: userRole === 'admin' ? 'Admin' : 'Salesman'`

No new props needed — `userRole` is already received and defaults to `'admin'`.

### Verification

- `wsl bash -c "cd /mnt/c/Users/User/Documents/app/frontend && npx next build"` — no build errors
- Regression tests from Step 0 still pass

### Code Provenance

- **Source**: No new code. Just changing the hardcoded string `'Admin'` to use the existing `userRole` prop which is already passed in.

### Files touched

| File | Change |
|------|--------|
| `frontend/components/common/PaymentManagement.tsx` | 2 lines changed |

> **Review gate**: After this step, provide a summary of changes for user review before proceeding.

---

## Step 2: Fix `hasProductRefund` in Shared Component

**Priority**: Critical  
**Estimated scope**: Small (1 function replacement)  
**Depends on**: Step 0

### Problem

[hasProductRefund (line 267)](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx#L267-L277) uses fragile text matching on transaction notes to detect if a product was already refunded. The salesman page correctly checks `product.status === 'completed'` ([line 1160](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L1160-L1163)).

### Changes

#### [MODIFY] `frontend/components/common/PaymentManagement.tsx`

Replace the `hasProductRefund` function (lines 267–277):

**Before:**
```tsx
function hasProductRefund(productId: number): boolean {
  return transactions.some((t: any) => {
    if (t.type !== 'refund') return false;
    const method = String(t.method || '').toLowerCase().trim();
    if (method === 'lapsed_refund') return false;
    const notes = t.notes || '';
    const product = products.find(p => p.id === productId);
    if (!product) return false;
    return notes.includes(`(${product.code})`);
  });
}
```

**After:**
```tsx
function hasProductRefund(productId: number): boolean {
  const product = products.find(p => p.id === productId);
  return product?.status === 'completed';
}
```

### Code Provenance

- **Source**: Function body directly taken from salesman page's [hasProductRefund (line 1160–1163)](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L1160-L1163). No new code.

### Verification

- Build passes
- Regression tests pass
- Manual: open refund modal on a booking with a completed product → product should show as already refunded (greyed out)

### Files touched

| File | Change |
|------|--------|
| `frontend/components/common/PaymentManagement.tsx` | 1 function replaced |

> **Review gate**: After this step, provide a summary of changes for user review before proceeding.

---

## Step 3: Add Product Lifecycle Transitions to Shared Refund Handler

**Priority**: Critical  
**Estimated scope**: Medium (1 file, ~40 lines added)  
**Depends on**: Steps 0, 2

### Problem

The shared component's [handleProductRefundSubmit (line 280)](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx#L280-L385) only records refund transactions. It does NOT transition products through their lifecycle. The salesman button's [handleRecordRefund (line 987)](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L987-L1134) correctly does:

1. **Pickup** confirmed products (`confirmed` → `in_progress`)
2. **Return** in_progress products (`in_progress` → `completed`)
3. **Then** record refund transactions

Without this, products remain in `confirmed`/`in_progress` status after refund, breaking order completion logic.

### Changes

#### [MODIFY] `frontend/components/common/PaymentManagement.tsx`

1. **Add import**: `import { lifecycleApi, bookingsApi } from '@/lib/api';` — `bookingsApi` is already imported; add `lifecycleApi`.

2. **Insert lifecycle transition block** in `handleProductRefundSubmit`, after validation and before the refund transaction loop (after line 321, before line 323). The code is directly transplanted from the salesman's `handleRecordRefund` (lines 1038–1077):

```tsx
// Step 1: Transition product statuses through proper lifecycle before refunding
const selectedProducts = selectedItems.map(([idStr]) => {
  const productId = parseInt(idStr);
  return products.find(p => p.id === productId);
}).filter(Boolean) as Product[];

const confirmedProducts = selectedProducts.filter(p => p.status === 'confirmed');
const inProgressProducts = selectedProducts.filter(p => p.status === 'in_progress');

// Pickup confirmed products (confirmed → in_progress)
if (confirmedProducts.length > 0) {
  try {
    await lifecycleApi.pickupProducts(bookingId, {
      booking_product_ids: confirmedProducts.map(p => p.id),
      picked_up_by: userRole === 'admin' ? 'Admin' : 'Salesman',
    });
  } catch (pickupError: any) {
    const msg = pickupError.response?.data?.details || pickupError.response?.data?.error || pickupError.message;
    toast.error(`Pickup failed: ${msg}`);
    return;
  }
}

// Return products (in_progress → completed)
const productsToReturn = [...confirmedProducts, ...inProgressProducts];
if (productsToReturn.length > 0) {
  try {
    await lifecycleApi.returnProducts(bookingId, {
      returns: productsToReturn.map(p => ({
        booking_product_id: p.id,
        damage_fee: 0,
      })),
      returned_by: userRole === 'admin' ? 'Admin' : 'Salesman',
    });
  } catch (returnError: any) {
    const msg = returnError.response?.data?.details || returnError.response?.data?.error || returnError.message;
    toast.error(`Return failed: ${msg}`);
    return;
  }
}
```

3. **Change refund processing from sequential to parallel** — Replace the `for` loop (lines 324–363) with `Promise.all`, matching the salesman button's approach:

```tsx
// Step 2: Record refund transactions (parallel, matching salesman behaviour)
const refundPromises = selectedItems.map(async ([productIdStr, refundData]) => {
  // ... existing per-item logic (build notes, create payload) ...
  return paymentTransactionsApi.create({ ... });
});

await Promise.all(refundPromises);
```

4. **After refund success, refresh booking data** to pick up the new product statuses (this already happens via `fetchBookingData()` + `onPaymentUpdate()`).

### Code Provenance

- **Lifecycle transition block**: Directly transplanted from salesman page's [handleRecordRefund lines 1038–1077](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L1038-L1077). Only change: `'Salesman'` replaced with `userRole`-based string.
- **`Promise.all` pattern**: Directly taken from salesman page's [line 1080–1115](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L1080-L1115).
- **No new logic written.** This is a move of existing code.

### Verification

- Build passes
- Regression tests pass — especially lifecycle transition tests from Step 0
- Manual: refund a product on a booking where products are in `confirmed` status → verify they transition through `in_progress` → `completed` → refund recorded

### Files touched

| File | Change |
|------|--------|
| `frontend/components/common/PaymentManagement.tsx` | ~40 lines added, `for` loop replaced with `Promise.all` |

> **Review gate**: After this step, provide a summary of changes for user review before proceeding.

---

## Step 4: Add Auto-Confirm on First Payment + Explicit `transaction_type`

**Priority**: High  
**Estimated scope**: Medium (3 files: backend route, backend service, frontend component)  
**Depends on**: Step 1

### Problem

The shared component's [handleSubmit](file:///c:/Users/User/Documents/app/frontend/components/common/PaymentManagement.tsx#L174-L233) does not:
1. Auto-confirm the booking after first payment (when status is `pending`)
2. Include `transaction_type: 'booking'` in the payload

Additionally, the backend does not explicitly set `transaction_type` in the INSERT — it relies on the DB default. This should be made explicit.

### Changes

#### [MODIFY] `backend/src/routes/paymentTransactions.js`

Forward `transaction_type` from request body to the service:

1. **Destructure `transaction_type`** from `req.body` (line ~49–61).
2. **Pass it to `chargeAccountingService.applyPayment`** as an additional parameter.

#### [MODIFY] `backend/src/services/chargeAccountingService.js`

1. **Add `transactionTypeLabel` parameter** to `_applyPaymentOrAdjustment` (line ~565) — default `'booking'`.
2. **Update the INSERT** at line 657 to explicitly include `transaction_type`:

```sql
-- Before:
INSERT INTO payment_transactions 
 (booking_id, amount, type, method, notes, recorded_by, transaction_date)
 VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)

-- After:
INSERT INTO payment_transactions 
 (booking_id, amount, type, method, notes, recorded_by, transaction_date, transaction_type)
 VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
```

3. **Thread the parameter** through `applyPayment` → `_applyPaymentOrAdjustment`.

#### [MODIFY] `frontend/components/common/PaymentManagement.tsx`

1. **In `handleSubmit`, add `transaction_type` to payload** (line ~206):

```tsx
const payload: any = {
  booking_id: bookingId,
  amount: amount,
  type: transactionType,
  transaction_type: 'booking',  // ← add
  method: formData.method,
  recorded_by: userRole === 'admin' ? 'Admin' : 'Salesman',
  notes: formData.notes || undefined,
};
```

2. **After successful payment, auto-confirm if booking is pending** (after line 217, before `fetchTransactions`):

```tsx
// Auto-confirm booking after first payment if still pending
if (transactionType === 'payment' && bookingStatus === 'pending') {
  try {
    await bookingsApi.confirm(bookingId, {
      confirmed_by: userRole === 'admin' ? 'Admin' : 'Salesman'
    });
  } catch (confirmError) {
    console.error('Auto-confirm failed:', confirmError);
    // Non-fatal — payment was already recorded
  }
}
```

3. **Add a new optional callback prop `onFirstPayment`** to the interface — called when the booking transitions from `pending` to another state (i.e., this was the first payment). This allows the parent page to show the measurement modal:

```tsx
interface PaymentManagementProps {
  // ... existing
  onFirstPayment?: () => void;  // Called after first payment auto-confirms booking
}
```

4. **Call `onFirstPayment` after auto-confirm**:

```tsx
if (transactionType === 'payment' && bookingStatus === 'pending') {
  // ... confirm code ...
  onFirstPayment?.();
}
```

### Code Provenance

- **Auto-confirm block**: Directly taken from salesman page's [confirmPaymentRecord lines 924–927](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L924-L927). Only change: `'Salesman'` replaced with `userRole`-based string.
- **`transaction_type: 'booking'`**: Directly from salesman page's [line 904](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L904).
- **`onFirstPayment` prop**: New — a simple optional callback. The component already has `onPaymentUpdate`; this is a separate hook specifically for the first-payment-triggers-measurement-modal flow.
- **Backend INSERT change**: Modifying existing code to explicitly include `transaction_type` column — previously relied on DB default.
- **Backend route change**: Forwarding an existing request body field that was previously ignored.

### Verification

- Build passes (both backend and frontend)
- Regression tests pass
- Manual: create a pending booking → pay → verify booking auto-confirms, and `onFirstPayment` callback fires
- Verify `transaction_type = 'booking'` is explicitly stored in DB (check via SQL query)

### Files touched

| File | Change |
|------|--------|
| `backend/src/routes/paymentTransactions.js` | ~2 lines added (destructure + pass through) |
| `backend/src/services/chargeAccountingService.js` | ~5 lines changed (parameter + INSERT) |
| `frontend/components/common/PaymentManagement.tsx` | ~15 lines added, 1 prop added |

> **Review gate**: After this step, provide a summary of changes for user review before proceeding.

---

## Step 5: Extract Measurement Modal into Standalone Component

**Priority**: Medium  
**Estimated scope**: Large (extract ~280 lines of JSX + state + handlers from salesman page into new component)  
**Depends on**: None (can be parallelized with Steps 1–4)

### Problem

The salesman page currently has **two separate measurement modals**:
1. **`showMeasurementModal`** ([line 98](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L98)) — the post-payment measurement confirmation modal ([lines 2762–3189](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L2762-L3189))
2. **`showViewMeasurements`** ([line 106](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L106)) — the per-product "View/Edit Measurements" modal opened from product cards ([lines 3191–4057](file:///c:/Users/User/Documents/app/frontend/app/salesman/order-details/%5Bid%5D/page.tsx#L3191-L4057))

#### Differences between the two modals:

| Aspect | Modal 1 (`showMeasurementModal`) | Modal 2 (`showViewMeasurements`) |
|--------|------|------|
| **Trigger** | Post-payment confirmation (line 933) | Product card button (line 1495) |
| **Scope** | Shows ALL products in the booking | Shows ONE selected product only |
| **Header** | "Your Payment Has Been Confirmed" + green checkmark | "Measurements" + close (X) button |
| **Mode** | Always edit mode (input fields) | View/Edit toggle — starts in view mode if measurements exist, edit mode if none |
| **View mode** | ❌ No view mode, always shows input fields | ✅ Read-only display with styled cards (e.g. "Waist: 32\"") |
| **Edit locking** | No lock checks | Locks editing when `hasProductRefund()` or `isProductDropDatePassed()` — shows warning banner |
| **State** | Uses shared `measurements` + `measurementErrors` state | Uses separate `editingMeasurements` + `editingSpecialRequirements` state, syncs back to `measurements` on change |
| **Save handler** | Inline: `bookingsApi.update(bookingId, { measurements, special_requirements })` then `fetchBooking()` | Inline: same API call but with more robust error handling (404 check, detailed error messages) |
| **Cancel/Close** | "CANCEL" + "SAVE" buttons | View mode: "Close" + "Edit" buttons; Edit mode: "Cancel" + "Save" buttons |
| **Product info** | Product image + name + code + rent + dates | Product image + name + code + rent (no dates) |
| **No measurements** | Shows empty input fields | Shows "No measurements recorded yet" + "➕ Add Measurements" button |
| **Measurement fields** | Same fields (female: waist/bust/shoulder/sleevesUp/sleevesE/sleevesB/lehengaLength; male: sideTight/sleevesTight/sleevesLength/pantLength/sideLoose/sleevesLoose/sleevesLengthLoose/pantLengthLoose; generic: waist/bust/chest/shoulder) | Same fields, identical form layout in edit mode |
| **Special requirements** | Textarea always shown | Shown only if non-empty in view mode; textarea in edit mode |

Both modals share the same measurement fields and the same `isFemaleClothing`/`isMaleClothing` classification logic, but Modal 2 is significantly more feature-rich (view/edit toggle, locking, error handling). The extracted component should preserve all of Modal 2's capabilities and add Modal 1's multi-product + post-payment header as a mode.

### Changes

#### [NEW] `frontend/components/common/MeasurementModal.tsx`

Extract from salesman page (code moved, not rewritten):
- The measurement modal JSX (currently rendered when `showMeasurementModal` / `showViewMeasurements` is `true`)
- Measurement state: `measurements`, `measurementErrors`, `specialRequirements`
- Handler functions: `handleMeasurementChange`, measurement validation, `handleMeasurementSubmit`
- Helper functions: `isFemaleClothing`, `isMaleClothing` (these can be module-level helpers)

**Props interface**:
```tsx
interface MeasurementModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: any;  // booking object with products
  products: any[];  // active products list
  onSubmit: (measurements: Record<string, any>, specialRequirements: Record<string, string>) => void;
  existingMeasurements?: Record<string, any>;  // pre-fill from existing data
  existingSpecialRequirements?: Record<string, string>;
  selectedProductId?: number;  // when opened from product card, focus on this product
  mode?: 'confirmation' | 'edit';  // post-payment confirmation vs product card edit
}
```

#### [MODIFY] `frontend/app/salesman/order-details/[id]/page.tsx`

1. Replace BOTH inline measurement modals (`showMeasurementModal` + `showViewMeasurements`) with `<MeasurementModal />`
2. Wire `onFirstPayment` callback from `PaymentManagement` to open the modal:

```tsx
<PaymentManagement
  // ... existing props
  onFirstPayment={() => setShowMeasurementModal(true)}
/>
```

3. The existing "Add measurements" button in product cards (line 1495) already opens a modal — update it to use the same `<MeasurementModal />` component instead of the inline `showViewMeasurements` modal

#### [MODIFY] `frontend/components/common/index.ts`

Export the new `MeasurementModal` component.

### Code Provenance

- **100% moved code.** All measurement modal JSX, state, and handlers are extracted directly from the salesman page. The two inline modals (`showMeasurementModal` at lines ~2762+ and `showViewMeasurements` at line ~3191+) are combined into one component.
- **Only new code**: The props interface and the `mode` / `selectedProductId` props to handle the two use cases (post-payment confirmation vs. product card edit). This is structural glue, not new business logic.

### Verification

- Build passes
- Measurement modal opens and functions identically to before (visual regression check)
- "Add measurements" button in product cards opens the same extracted component
- First payment triggers the measurement modal
- All regression tests pass

### Files touched

| File | Change |
|------|--------|
| `frontend/components/common/MeasurementModal.tsx` | **NEW** ~300 lines (moved from salesman page) |
| `frontend/app/salesman/order-details/[id]/page.tsx` | ~500+ lines removed (two modals consolidated), replaced with component |
| `frontend/components/common/index.ts` | 1 export added |

> **Review gate**: After this step, provide a summary of changes for user review before proceeding.

---

## Step 6: Wire `onFirstPayment` in Admin Page

**Priority**: Medium  
**Estimated scope**: Small  
**Depends on**: Steps 4, 5

### Changes

#### [MODIFY] `frontend/app/admin/bookings/[id]/page.tsx`

1. Import `MeasurementModal` from `@/components/common`
2. Add state: `const [showMeasurementModal, setShowMeasurementModal] = useState(false);`
3. Pass `onFirstPayment` to `PaymentManagement` to open the measurement modal:

```tsx
<PaymentManagement
  // ... existing props
  onFirstPayment={() => setShowMeasurementModal(true)}
/>
```

4. Render `<MeasurementModal />` in the admin page (same as salesman page).

### Code Provenance

- **`onFirstPayment` callback**: Same pattern as salesman page (Step 5). Just wiring the same callback.
- **`MeasurementModal` usage**: Reusing the component extracted in Step 5.
- **New code**: Only the state variable and JSX to render the modal (~5 lines).

### Verification

- Build passes
- Admin page auto-confirms on first payment
- Admin page shows measurement modal on first payment
- No regression in admin payment/refund flows

### Files touched

| File | Change |
|------|--------|
| `frontend/app/admin/bookings/[id]/page.tsx` | ~10 lines added (import + state + modal render) |

> **Review gate**: After this step, provide a summary of changes for user review before proceeding.

---

## Step 7: Add Refund Auto-Fill Behaviour

**Priority**: Low  
**Estimated scope**: Small  
**Depends on**: Step 2

### Problem

The shared component already auto-fills refund amount with security deposit when a product is selected. Verify this matches user expectation and that it works correctly after Step 2's `hasProductRefund` fix.

### Changes

Verify existing auto-fill code in `PaymentManagement.tsx` — the shared component already does this. No code change expected; this step is a verification checkpoint.

### Verification

- Open refund modal → check a product → verify amount auto-fills with security deposit
- Uncheck → verify amount clears
- Already-refunded products (status `completed`) → verify checkbox is disabled

> **Review gate**: After this step, report verification results for user review before proceeding.

---

## Step 8: Remove Salesman-Only Buttons, Modals, State, and Handlers

**Priority**: High  
**Estimated scope**: Large (delete ~800+ lines from salesman page)  
**Depends on**: ALL previous steps (1–7) must be verified as working

> [!CAUTION]
> This step is destructive. It removes the old code. Only proceed after confirming ALL regression tests pass with the new shared component handling everything.

### Changes

#### [MODIFY] `frontend/app/salesman/order-details/[id]/page.tsx`

**Remove state variables:**
- `showRecordPayment`, `showRecordRefund`
- `paymentAmount`, `paymentMethod`, `paymentNotes`
- `showPaymentBreakdown`, `paymentBreakdown`
- `refundMethod`, `refundNarration`
- Salesman-specific `itemRefunds` (the shared component has its own)

**Remove handler functions:**
- `handleRecordPayment` (~lines 870–887) — CALCULATE button handler
- `confirmPaymentRecord` (~lines 889–939) — CONFIRM & SAVE handler
- `calculatePaymentBreakdown` (~lines 828–868) — breakdown calculator
- `handleRecordRefund` (~lines 987–1134) — refund submit handler

**Remove JSX:**
- "RECORD PAYMENT" / "RECORD REFUND" buttons (~lines 1958–1982)
- Record Payment modal (~lines 2357–2538)
- Record Refund modal (~lines 2540–2759)
- The surrounding IIFE that decides which buttons to show (~lines 1641–1982)

**Keep:**
- The `PaymentManagement` component usage (~line 1629)
- The order completion status display (refactor if it depended on removed state)

### Verification

- Build passes with no TypeScript errors
- ALL regression tests from Step 0 pass
- Manual walkthrough:
  - Pending booking → "💰 Collect Payment" → enter amount → CALCULATE → breakdown → security allocation → CONFIRM → booking auto-confirms → measurement modal appears
  - Fully paid booking → "💸 Refund Payment" → select products → enter amounts → lifecycle transitions → refund recorded → products show as completed
  - Admin page → same flows work identically
  - Cancelled booking → read-only payment history (no buttons)

### Code Provenance

- **No new code.** This step is purely deletion. All functionality has been moved to the shared `PaymentManagement` component and `MeasurementModal` in previous steps.

### Files touched

| File | Change |
|------|--------|
| `frontend/app/salesman/order-details/[id]/page.tsx` | ~800+ lines removed |

> **Review gate**: After this step, provide a summary of all deletions for user review.

---

## Regression Test Matrix

After EACH step, verify against this matrix:

| Scenario | Expected | Check |
|----------|----------|-------|
| **Payment: pending booking** | Payment records, booking auto-confirms, measurement modal opens | |
| **Payment: confirmed booking** | Payment records, no auto-confirm, no measurement modal | |
| **Payment: security allocation** | Split warning shown, products selectable, allocation correct | |
| **Payment: overpayment** | Blocked with error message | |
| **Payment: rent-only** | No security allocation section shown | |
| **Refund: confirmed products** | Lifecycle: confirmed→in_progress→completed, then refund recorded | |
| **Refund: in_progress products** | Lifecycle: in_progress→completed, then refund recorded | |
| **Refund: completed products** | Shown as greyed out / already refunded | |
| **Refund: partial refund** | Requires narration when amount < security deposit | |
| **Refund: deduction tracking** | When refund < security, deduction recorded as damage_fee | |
| **Refund: cancelled products** | Not shown in refund modal | |
| **recorded_by** | Shows `'Salesman'` for salesman, `'Admin'` for admin | |
| **Admin page: payment** | Same as salesman (auto-confirm, allocation, etc.) | |
| **Admin page: refund** | Same as salesman (lifecycle transitions, etc.) | |
| **Cancelled booking** | Read-only payment history, no action buttons | |

---

## File Change Summary

| File | Steps | Type |
|------|-------|------|
| `backend/src/routes/paymentButtonsRegression.test.js` | 0 | NEW |
| `frontend/components/common/PaymentManagement.tsx` | 1, 2, 3, 4 | MODIFY |
| `frontend/components/common/MeasurementModal.tsx` | 5 | NEW |
| `frontend/components/common/index.ts` | 5 | MODIFY |
| `frontend/app/salesman/order-details/[id]/page.tsx` | 5, 8 | MODIFY |
| `frontend/app/admin/bookings/[id]/page.tsx` | 6 | MODIFY |

---

## Execution Rules

1. **Step-by-step execution only.** Complete one step fully (code + tests + verification) before starting the next.
2. **User review after EVERY step.** After completing each step, provide a summary with code provenance (where code came from — reused/moved/new), wait for explicit user approval, and only then proceed to the next step.
3. **Update [status_payment_buttons.md](file:///c:/Users/User/Documents/app/status_payment_buttons.md) after every step.** Mark the step complete, note deviations.
4. **No bulk changes.** Each step is a single, reviewable unit.
5. **Run tests after each step.** Both the new tests for that step and any existing tests that might be affected.
6. **If a step requires deviation**, document it in status file before proceeding.
7. **Code provenance tracking.** For each step, document whether code was: (a) reused from existing functions, (b) moved from salesman page to shared component, or (c) genuinely new code (with justification for why new code is needed).
8. **Use WSL for all terminal commands.**
