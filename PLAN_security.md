# Implementation Plan: Security Payment Gate & Guided Security Allocation

> **Tracking**: [status_security.md](file:///c:/Users/User/Documents/app/status_security.md)

---

## Overview

This plan implements three related security-deposit rules:

1. **Boundary warning (Points 1)** — When a single payment covers both rent and security, a visible inline warning must appear requiring explicit acknowledgment before the salesman/admin can confirm.
2. **User-controlled security allocation (Point 2)** — When any amount is to be credited against security (whether partially or fully), the user must choose which products receive the credit (when >1 eligible product exists). The backend enforces the chosen allocation.
3. **Security gate in Exchange/Cancel dialogs (Point 3)** — Products with any security already paid (`security.paid_amount > 0`) are disabled in the exchange and cancel UIs — greyed out with an explanatory label.

**Portals in scope**: Both salesman portal (Record Payment) and admin portal (Collect Payment).

**Depends on**:
- PLAN_discount.md Step 2 (security-gate service-level checks) must be complete so that `cancelProduct()` and `exchangeProduct()` already reject security-paid products at the service layer. The frontend changes here add the *visual* enforcement to match.
- PLAN_discount.md Step 7 (security order by pickup date) — our Step 1 extends the same method.

---

## UI / UX Design

### Point 1 — Boundary Warning (inline, no nested popups)

The salesman flow currently has a 2-step modal: **Enter amount → CALCULATE → breakdown panel → CONFIRM**. The boundary warning lives *within* the breakdown panel — no separate popup, no layered modals.

```
┌──────────────────────────────────────────────┐
│ ← Record Payment                            │
│                                              │
│  Enter Amount (in Rs.) *                     │
│  ┌──────────────────────────────────────┐    │
│  │ 3,000                                │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Payment Method *  [Cash ▼]                  │
│  Notes (Optional)  [________________]        │
│                                              │
│  [CALCULATE]                                 │
│                                              │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ (After CALCULATE — breakdown section)        │
│                                              │
│  Payment Breakdown                           │
│  ┌──────────────────────────────────────┐    │
│  │ Rent Due:       ₹2,500 → Fully Paid │    │
│  │ Security Due:   ₹4,000 → ₹500 paid  │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌── ⚠️ Payment spans two categories ──────┐ │
│  │                                          │ │
│  │  This payment will be credited as:       │ │
│  │                                          │ │
│  │  ₹2,500  →  Rent due                     │ │
│  │  ₹500    →  Security deposit             │ │
│  │                                          │ │
│  │  ☐  I confirm this split is correct      │ │
│  │     before proceeding                    │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  [CONFIRM PAYMENT]  ← disabled until ☑ above │
└──────────────────────────────────────────────┘
```

For the **admin portal** (PaymentManagement.tsx), there is no CALCULATE step — the breakdown appears live as the user types. The same warning block appears inline:

```
┌──────────────────────────────────────────────┐
│ 💰 Collect Payment                           │
│                                              │
│  Amount (₹) *                                │
│  ┌──────────────────────────────────────┐    │
│  │ 3,000              (live update ↓)   │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [Cash ▼]  [Notes…]                          │
│                                              │
│  ┌── ⚠️ Payment spans two categories ──────┐ │
│  │  ₹2,500 → Rent  |  ₹500 → Security      │ │
│  │  ☐ I confirm this split                  │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  (→ security allocation section below)       │
│                                              │
│  [Cancel]  [Confirm]  ← disabled until ☑    │
└──────────────────────────────────────────────┘
```

**Trigger**: The warning appears only when:
- `amountGoingToSecurity = max(0, paymentAmount − totalNonSecurityOutstanding) > 0` AND
- `totalNonSecurityOutstanding > 0` (i.e., there is also some rent/transport/penalty to cover)

If the payment is *security-only* (`totalNonSecurityOutstanding ≤ 0`), no warning — just proceed to the allocation step.

---

### Point 2 — Product Security Allocation (inline section)

This section appears in the payment modal whenever any amount is being credited to security (`amountGoingToSecurity > 0`). It is shown *below* the boundary warning (or directly after amount entry if security-only).

#### Single eligible product

```
  ┌── Security Allocation ─────────────────────┐
  │                                            │
  │  ₹500 will be credited to:                 │
  │                                            │
  │  ┌── Indo Western (LB-002) ──────────────┐ │
  │  │  Security:  ₹3,000 due               │ │
  │  │  Paid:      ₹0                        │ │
  │  │  After this payment: ₹500 paid        │ │
  │  └───────────────────────────────────────┘ │
  │                                            │
  └────────────────────────────────────────────┘
```

(Product is auto-selected, shown as read-only. No action required from user.)

#### Multiple eligible products — happy path

```
  ┌── Security Allocation ─────────────────────┐
  │  ₹1,200 to credit against security.        │
  │  Choose which product(s):                  │
  │                                            │
  │  ┌─────────────────────────────────────┐   │
  │  │ ☑  Lehenga (LA-001)                 │   │
  │  │    Security:  ₹9,000 due            │   │
  │  │    Paid:      ₹0                    │   │
  │  │    Remaining: ₹9,000                │   │
  │  ├─────────────────────────────────────┤   │
  │  │ ☐  Indo Western (LB-002)            │   │
  │  │    Security:  ₹3,000 due            │   │
  │  │    Paid:      ₹500  ← partial       │   │
  │  │    Remaining: ₹2,500                │   │
  │  └─────────────────────────────────────┘   │
  │                                            │
  │  Projected allocation:                     │
  │  ┌─────────────────────────────────────┐   │
  │  │  Lehenga (LA-001):    +₹1,200       │   │
  │  │  ─────────────────────────────────  │   │
  │  │  Total credited:       ₹1,200  ✅   │   │
  │  └─────────────────────────────────────┘   │
  │                                            │
  └────────────────────────────────────────────┘
```

#### Multiple eligible products — both selected

```
  ┌── Security Allocation ─────────────────────┐
  │  ₹1,200 to credit against security.        │
  │  Choose which product(s):                  │
  │                                            │
  │  ┌─────────────────────────────────────┐   │
  │  │ ☑  Lehenga (LA-001)                 │   │
  │  │    Security:  ₹9,000 due            │   │
  │  │    Paid:      ₹0                    │   │
  │  │    Remaining: ₹9,000                │   │
  │  ├─────────────────────────────────────┤   │
  │  │ ☑  Indo Western (LB-002)            │   │
  │  │    Security:  ₹3,000 due            │   │
  │  │    Paid:      ₹500  ← partially     │   │
  │  │       paid — filled first           │   │
  │  │    Remaining: ₹2,500                │   │
  │  └─────────────────────────────────────┘   │
  │                                            │
  │  Projected allocation:                     │
  │  ┌─────────────────────────────────────┐   │
  │  │  Indo Western (LB-002):  +₹1,200   │   │
  │  │    (partial → filled first)         │   │
  │  │  ─────────────────────────────────  │   │
  │  │  Total credited:  ₹1,200  ✅        │   │
  │  └─────────────────────────────────────┘   │
  │                                            │
  └────────────────────────────────────────────┘
```

#### Validation error — selected products cannot absorb full amount

```
  ┌─────────────────────────────────────────┐
  │ ⚠️  Selected products can only absorb   │
  │     ₹300. The security portion is ₹500. │
  │     Please select more products or      │
  │     reduce the payment amount.          │
  └─────────────────────────────────────────┘
```

CONFIRM button remains disabled until all of the security amount is absorbed by the selection.

**Distribution algorithm (client-side preview + backend enforcement):**
1. Among selected products, sort:  
   - Partially paid security (`paid_amount > 0`) → first (ascending by remaining amount)  
   - Zero-paid security → second, ordered by `booked_from` (pickup date) ascending  
2. Fill sequentially until all security amount is consumed or products exhausted.

---

### Point 3 — Exchange Dialog: Disabled Products

```
  Original Product
  ┌────────────────────────────────────────────┐
  │ Select product to exchange                 │
  │ ─────────────────────────────────────────  │
  │ Lehenga (LA-001) — ₹8,363/day             │
  │ Indo Western (LB-002) — ₹2,637/day        │
  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
  │ [disabled] Anarkali (LC-003)               │
  │            (Security paid — not            │
  │            exchangeable)                   │
  └────────────────────────────────────────────┘
```

Rendered as a `<option disabled>` with the suffix text. The disabled option is visually greyed out by the browser's native `<select>` behavior.

---

### Point 3 — Cancel Dialog: Greyed-Out Products

```
  Select Products to Cancel
  ┌─────────────────────────────────────────────┐
  │ ☑  Lehenga (LA-001)                         │
  │    Rent: ₹8,363  Security: ₹9,000           │
  │    [Penalty: _____ ]                         │
  ├─────────────────────────────────────────────┤
  │ ☐  Indo Western (LB-002)                    │
  │    Rent: ₹2,637  Security: ₹3,000           │
  │    [Penalty: _____ ]                         │
  ├─────────────────────────────────────────────┤
  │ ░░ Anarkali (LC-003)  ← greyed row          │
  │    Rent: ₹4,500  Security: ₹5,000           │
  │    🔒 Security paid (₹5,000) — cannot cancel│
  └─────────────────────────────────────────────┘
```

- Checkbox is disabled (cannot be checked).
- Row background is `bg-gray-100 opacity-60`.
- Lock icon + short message inline below product name.
- "Select All" only selects eligible (non-greyed) products.

---

## Step 1: Backend — Extend Security Allocation in chargeAccountingService

**Priority**: Critical  
**Layer**: Service  
**Estimated scope**: Small–Medium (1 service file + 1 test file)

### Problem

`_applyToSecurity()` always applies to all eligible products in pickup-date order. There is no way for the caller to restrict which products receive the security credit. The payment API endpoint also has no mechanism to pass per-product allocation intent.

### Changes

#### [MODIFY] `backend/src/services/chargeAccountingService.js`

**Method `_applyToSecurity(bookingId, amount, client)`** → add optional 4th param `productIds = null`:

```js
async _applyToSecurity(bookingId, amount, client, productIds = null) {
  // Build base query
  let query = `
    SELECT pc.id as charge_id, pc.due_amount, pc.paid_amount,
           bp.id as bp_id, bp.booked_from
    FROM product_charges pc
    JOIN booking_products bp ON pc.booking_product_id = bp.id
    WHERE bp.booking_id = $1
      AND bp.status NOT IN ('exchanged', 'cancelled', 'completed')
      AND pc.charge_type = 'security'
      AND pc.due_amount > pc.paid_amount
  `;

  let queryParams = [bookingId];

  if (productIds && productIds.length > 0) {
    // Restrict to user-selected products only
    // Sort: partially paid first (ascending remaining), then by pickup date
    query += ` AND bp.id = ANY($2::int[])
               ORDER BY (pc.paid_amount > 0) DESC,
                        (pc.due_amount - pc.paid_amount) ASC,
                        bp.booked_from ASC, bp.id ASC`;
    queryParams.push(productIds);
  } else {
    // Existing behavior: all eligible products by pickup date
    query += ` ORDER BY bp.booked_from ASC, bp.id ASC`;
  }

  const result = await client.query(query, queryParams);
  if (result.rows.length === 0) return amount;

  // Validation when productIds specified: ensure selection can absorb amount
  if (productIds) {
    const totalCapacity = result.rows.reduce(
      (sum, row) => sum + (row.due_amount - row.paid_amount), 0
    );
    if (totalCapacity < amount) {
      throw new Error(
        `Security allocation insufficient: selected products can absorb ` +
        `₹${totalCapacity} but ₹${amount} is being credited. ` +
        `Please select more products or reduce the payment amount.`
      );
    }
  }

  // Sequential fill
  let remaining = amount;
  for (const row of result.rows) {
    if (remaining <= 0) break;
    const outstanding = row.due_amount - row.paid_amount;
    const toApply = Math.min(remaining, outstanding);
    await client.query(
      `UPDATE product_charges
       SET paid_amount = paid_amount + $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [toApply, row.charge_id]
    );
    remaining -= toApply;
  }

  return remaining;
}
```

**Method `applyPayment(bookingId, amount, method, notes, recordedBy, client)`** → add optional `securityProductIds = null` parameter, thread it through to `_applyToSecurity`:

```js
// In the security tier:
remaining = await this._applyToSecurity(bookingId, securityAmount, client, securityProductIds);
```

> **Note**: The `applyPayment` signature change is backward-compatible. All existing call sites pass no `securityProductIds`, defaulting to `null` (existing behaviour).

#### [MODIFY] `backend/src/routes/bookings.js` (or wherever POST /payments is handled)

Accept optional `security_product_ids` in the request body and pass it to `chargeAccountingService.applyPayment()`:

```js
const { amount, method, notes, security_product_ids } = req.body;
// ...
await chargeAccountingService.applyPayment(
  bookingId, amount, method, notes, recordedBy, client,
  security_product_ids || null
);
```

#### [ADD] Tests

File: `backend/src/services/__tests__/securityAllocation.test.js`

- Two products, security-only payment, user allocates to product A only → product A filled, product B unchanged
- Two products, security-only payment, user allocates to both → fill partial-paid one first, then other
- Allocation capacity < payment amount → throws error with specific message
- `null` productIds → existing proportional-pickup-date behavior unchanged
- productIds is empty array → treated as null (existing behavior)
- Security amount exactly equals selected products' capacity → no error, no remainder

### Files touched

| File | Layer |
|------|-------|
| `backend/src/services/chargeAccountingService.js` | Service |
| `backend/src/routes/bookings.js` (payments route) | Route |
| `backend/src/services/__tests__/securityAllocation.test.js` | Test |

### Verification

- Run `chargeAccountingService.test.js` — all existing tests pass, new tests pass
- Manual: create booking with 2 products, enter payment that goes to security, allocate to only product A → product A's `security.paid_amount` increases, product B unchanged

---

## Step 2: Frontend — Cancel Dialog: Grey Out Security-Paid Products (Point 3)

**Priority**: High  
**Layer**: Frontend  
**Estimated scope**: Small (1 component file)  
**Depends on**: None (backend already has service-level gate; `preview.all_products` already includes `security_paid` per product)

### Problem

`BookingCancellation.tsx` shows all active products as checkboxes. Products with `security_paid > 0` are silently blocked by the backend when the cancel API is called — but the UI shows no prior indication of ineligibility. The user can attempt to cancel these products and only gets an error after submitting.

### Changes

#### [MODIFY] `frontend/components/common/BookingCancellation.tsx`

In the product list rendering (around line 406):

1. Derive eligibility flag per product:
   ```tsx
   const hasSecurityPaid = (product.security_paid ?? 0) > 0;
   ```

2. Render the row differently when `hasSecurityPaid`:
   - `<input type="checkbox" disabled>` — cannot be checked
   - Row background: `bg-gray-100 opacity-60` (instead of `bg-blue-50` when selected)
   - Below the product name/code, add:
     ```tsx
     {hasSecurityPaid && (
       <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
         <span>🔒</span>
         <span>Security paid (₹{product.security_paid.toLocaleString('en-IN')}) — cannot cancel</span>
       </p>
     )}
     ```

3. `handleSelectAll(checked)` — only include products where `!hasSecurityPaid`:
   ```tsx
   function handleSelectAll(checked: boolean) {
     if (checked && preview) {
       const eligible = preview.all_products
         .filter(p => (p.security_paid ?? 0) === 0)
         .map(p => p.product_id);
       setSelectedProducts(eligible);
     } else {
       setSelectedProducts([]);
     }
   }
   ```

4. `handleProductSelection` — guard against selecting a security-paid product (belt-and-suspenders):
   ```tsx
   function handleProductSelection(productId: number, checked: boolean) {
     const product = preview?.all_products.find(p => p.product_id === productId);
     if (product && (product.security_paid ?? 0) > 0) return; // ignore
     // ... existing logic
   }
   ```

5. Update the `Product` TypeScript interface to include `security_paid`:
   ```tsx
   interface Product {
     product_id: number;
     code: string;
     name: string;
     rent: number;
     security_deposit: number;
     rent_paid: number;
     security_paid: number;  // ← add this
   }
   ```

### Verification

- Booking with 2 products, one has security paid: that product appears greyed out, checkbox is disabled, lock icon and message shown
- "Select All" selects only the eligible product
- Attempting to cancel from the API level with a security-paid product ID → backend error (existing gate)

### Files touched

| File | Layer |
|------|-------|
| `frontend/components/common/BookingCancellation.tsx` | Frontend Component |

---

## Step 3: Frontend — Exchange Dialog: Disable Security-Paid Products (Point 3)

**Priority**: High  
**Layer**: Frontend  
**Estimated scope**: Small (1 component + 2 parent pages)  
**Depends on**: Parent pages must pass `securityPaidByProduct` prop derived from `paymentSummary`

### Problem

`ProductExchange.tsx` lets users select any active product as the "Original Product" to exchange. Products with security paid must be shown as disabled options with a text suffix.

### Changes

#### [MODIFY] `frontend/components/common/ProductExchange.tsx`

1. Add new prop:
   ```tsx
   interface ProductExchangeProps {
     // ... existing props
     securityPaidByProduct?: Record<number, number>; // bookingProductId → security paid amount
   }
   ```

2. In the "Original Product" `<select>`, for each product:
   ```tsx
   {currentProducts.map((product) => {
     const secPaid = securityPaidByProduct?.[product.id] ?? 0;
     const isDisabled = secPaid > 0;
     return (
       <option
         key={product.id}
         value={product.id}
         disabled={isDisabled}
         className={isDisabled ? 'text-gray-400' : ''}
       >
         {product.name} ({product.code}) — ₹{product.effective_rent || product.rent}/day
         {isDisabled ? ` (Security paid ₹${secPaid.toLocaleString('en-IN')} — not exchangeable)` : ''}
       </option>
     );
   })}
   ```

#### [MODIFY] `frontend/app/salesman/order-details/[id]/page.tsx`

Where `ProductExchange` is rendered (around line 1627), derive `securityPaidByProduct` from `paymentSummary`:

```tsx
const securityPaidByProduct = paymentSummary?.products?.reduce(
  (acc: Record<number, number>, p: any) => {
    acc[p.product.id] = p.charges?.security?.paid ?? 0;
    return acc;
  },
  {}
) ?? {};

// Pass to component:
<ProductExchange
  // ... existing props
  securityPaidByProduct={securityPaidByProduct}
/>
```

#### [MODIFY] `frontend/app/admin/bookings/[id]/page.tsx`

Same derivation and prop pass for the admin booking details page.

### Verification

- Booking with product A (security paid ₹5,000) and product B (security unpaid): exchange modal dropdown shows product A as disabled with suffix, product B is selectable
- Attempting to exchange a security-paid product directly via API → backend error (existing gate)

### Files touched

| File | Layer |
|------|-------|
| `frontend/components/common/ProductExchange.tsx` | Frontend Component |
| `frontend/app/salesman/order-details/[id]/page.tsx` | Frontend Page |
| `frontend/app/admin/bookings/[id]/page.tsx` | Frontend Page |

---

## Step 4: Frontend — Salesman Record Payment: Boundary Warning + Security Allocation UI (Points 1 & 2)

**Priority**: Critical  
**Layer**: Frontend  
**Estimated scope**: Large (1 page file, significant modal logic changes)

### Problem

The salesman's Record Payment modal has no awareness of whether a payment crosses the rent/security boundary, and applies security to products automatically without user input.

### Changes

#### [MODIFY] `frontend/app/salesman/order-details/[id]/page.tsx`

**New state variables** (add near existing payment state):

```tsx
// Boundary warning state
const [securityPortion, setSecurityPortion]     = useState(0);  // amount going to security
const [rentPortion, setRentPortion]             = useState(0);  // amount going to rent/transport/etc.
const [boundaryAcknowledged, setBoundaryAcknowledged] = useState(false);

// Security allocation state
const [eligibleSecProducts, setEligibleSecProducts] = useState<any[]>([]);
const [selectedSecProductIds, setSelectedSecProductIds] = useState<number[]>([]);
const [projectedSecAllocation, setProjectedSecAllocation] = useState<{bpId: number; name: string; amount: number}[]>([]);
const [secAllocationError, setSecAllocationError] = useState<string | null>(null);
```

**Extend `calculatePaymentBreakdown()`** (called on CALCULATE):

After computing `rentPayment` and `securityPayment`, also:

```tsx
setRentPortion(rentPayment);
setSecurityPortion(securityPayment);
setBoundaryAcknowledged(false); // reset on new calculation

// Derive eligible security products — MUST match GET /payment-transactions/summary/:id shape:
// products[].charges is an array; find charge_type === 'security'. Do not use p.product or charges.security.
// Prefer shared helper: toEligibleSecProducts(paymentSummary?.products ?? []) (see Addendum).
if (securityPayment > 0) {
  const eligible = toEligibleSecProducts(paymentSummary?.products ?? []);
  setEligibleSecProducts(eligible);
  setSelectedSecProductIds(eligible.map((p) => p.bpId));
} else {
  setEligibleSecProducts([]);
  setSelectedSecProductIds([]);
  setProjectedSecAllocation([]);
  setSecAllocationError(null);
}
```

> **Implementation note:** Prefer **`useSecurityAllocation()`** — call `updateSplit(securityPayment, rentPayment, paymentSummary?.products ?? [])` instead of duplicating the state updates above. The hook also owns preview recomputation (`computeSecAllocationPreview`) and `canConfirmSecurity`.

**New function `computeSecAllocationPreview(selectedIds, securityAmount)`**:

```tsx
function computeSecAllocationPreview(selectedIds: number[], secAmount: number) {
  const selected = eligibleSecProducts
    .filter(p => selectedIds.includes(p.bpId))
    // Sort: partial-paid first (ascending remaining), then by pickup date
    .sort((a, b) => {
      if (a.paid > 0 && b.paid === 0) return -1;
      if (a.paid === 0 && b.paid > 0) return 1;
      if (a.paid > 0 && b.paid > 0) return a.remaining - b.remaining;
      return new Date(a.bookedFrom).getTime() - new Date(b.bookedFrom).getTime();
    });

  const totalCapacity = selected.reduce((s, p) => s + p.remaining, 0);

  if (totalCapacity < secAmount) {
    setSecAllocationError(
      `Selected products can absorb ₹${totalCapacity.toLocaleString('en-IN')} ` +
      `but ₹${secAmount.toLocaleString('en-IN')} needs to be credited. ` +
      `Select more products or reduce the payment amount.`
    );
    setProjectedSecAllocation([]);
    return;
  }

  setSecAllocationError(null);

  let remaining = secAmount;
  const alloc = [];
  for (const p of selected) {
    if (remaining <= 0) break;
    const toApply = Math.min(remaining, p.remaining);
    alloc.push({ bpId: p.bpId, name: p.name, amount: toApply });
    remaining -= toApply;
  }
  setProjectedSecAllocation(alloc);
}
```

**Call `computeSecAllocationPreview` whenever `selectedSecProductIds` or `securityPortion` changes**:

```tsx
useEffect(() => {
  if (securityPortion > 0) {
    computeSecAllocationPreview(selectedSecProductIds, securityPortion);
  }
}, [selectedSecProductIds, securityPortion]);
```

**Extend `confirmPaymentRecord()`** to include `security_product_ids`:

```tsx
const payload: any = {
  booking_id: bookingId,
  amount: parseFloat(paymentAmount),
  type: 'payment',
  method: paymentMethod,
  recorded_by: userName,
  notes: paymentNotes || undefined,
};

if (securityPortion > 0 && selectedSecProductIds.length > 0) {
  payload.security_product_ids = selectedSecProductIds;
}

await paymentTransactionsApi.create(payload);
```

**In the modal JSX**, after the breakdown section add:

```tsx
{/* Boundary warning — shown only when payment crosses rent/security line */}
{showPaymentBreakdown && securityPortion > 0 && rentPortion > 0 && (
  <div className="mt-4 bg-amber-50 border border-amber-300 rounded-lg p-4">
    <div className="flex items-start gap-3 mb-3">
      <span className="text-xl flex-shrink-0">⚠️</span>
      <div>
        <p className="font-semibold text-amber-900 mb-1">Payment spans two categories</p>
        <p className="text-sm text-amber-800">This payment will be credited as:</p>
      </div>
    </div>
    <div className="ml-8 space-y-1 mb-4">
      <div className="flex justify-between text-sm font-medium text-amber-900">
        <span>Rent / other charges</span>
        <span>₹{rentPortion.toLocaleString('en-IN')}</span>
      </div>
      <div className="flex justify-between text-sm font-medium text-amber-900">
        <span>Security deposit</span>
        <span>₹{securityPortion.toLocaleString('en-IN')}</span>
      </div>
    </div>
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={boundaryAcknowledged}
        onChange={e => setBoundaryAcknowledged(e.target.checked)}
        className="mt-1 w-4 h-4 text-amber-600 rounded"
      />
      <span className="text-sm text-amber-900">
        I confirm this split is correct before proceeding
      </span>
    </label>
  </div>
)}

{/* Security allocation — shown when any amount goes to security */}
{showPaymentBreakdown && securityPortion > 0 &&
  (rentPortion === 0 || boundaryAcknowledged) && (
  <SecurityAllocationSection
    securityAmount={securityPortion}
    eligibleProducts={eligibleSecProducts}
    selectedIds={selectedSecProductIds}
    onSelectionChange={setSelectedSecProductIds}
    projectedAllocation={projectedSecAllocation}
    error={secAllocationError}
  />
)}
```

**CONFIRM button gate**:

```tsx
const canConfirm =
  !paymentBreakdown.refundToCustomer &&     // no overpayment
  (securityPortion === 0 || (                // no security, OR
    (rentPortion === 0 || boundaryAcknowledged) && // boundary ack'd (if needed)
    !secAllocationError &&                   // allocation valid
    (eligibleSecProducts.length === 0 ||     // no eligible products, OR
     selectedSecProductIds.length > 0)       // at least one selected
  ));
```

**New shared component `SecurityAllocationSection`** (can be in the same file as a local component or in `components/common/`):

```tsx
function SecurityAllocationSection({
  securityAmount, eligibleProducts, selectedIds, onSelectionChange,
  projectedAllocation, error
}) {
  return (
    <div className="mt-4 border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">
        🔒 Security Allocation
        <span className="ml-2 text-gray-500 font-normal text-xs">
          ₹{securityAmount.toLocaleString('en-IN')} to credit
        </span>
      </h4>

      {eligibleProducts.length === 1 ? (
        // Single product — informational, no choice
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
          <p>Will be credited to <strong>{eligibleProducts[0].name}</strong>
             ({eligibleProducts[0].code})</p>
          <p className="text-xs text-gray-500 mt-1">
            Security: ₹{eligibleProducts[0].due.toLocaleString('en-IN')} due /
            ₹{eligibleProducts[0].paid.toLocaleString('en-IN')} paid /
            ₹{eligibleProducts[0].remaining.toLocaleString('en-IN')} remaining
          </p>
        </div>
      ) : (
        // Multiple products — user chooses
        <div className="space-y-2">
          <p className="text-xs text-gray-600 mb-2">
            Choose which product(s) to credit security against:
          </p>
          {eligibleProducts.map(p => {
            const isSelected = selectedIds.includes(p.bpId);
            return (
              <label
                key={p.bpId}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => {
                    if (e.target.checked) {
                      onSelectionChange([...selectedIds, p.bpId]);
                    } else {
                      onSelectionChange(selectedIds.filter(id => id !== p.bpId));
                    }
                  }}
                  className="mt-0.5 w-4 h-4 text-green-600 rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.code}</p>
                    </div>
                    <div className="text-right text-xs text-gray-600">
                      <p>Due: ₹{p.due.toLocaleString('en-IN')}</p>
                      <p>Paid: ₹{p.paid.toLocaleString('en-IN')}</p>
                      {p.paid > 0 && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                          partially paid
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* Projected allocation */}
      {projectedAllocation.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-2">Projected allocation:</p>
          <div className="space-y-1">
            {projectedAllocation.map(a => (
              <div key={a.bpId} className="flex justify-between text-xs text-gray-600">
                <span>{a.name}</span>
                <span className="font-medium">+₹{a.amount.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs font-semibold text-green-700 pt-1 border-t border-gray-200 mt-1">
              <span>Total credited</span>
              <span>₹{securityAmount.toLocaleString('en-IN')} ✅</span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">⚠️ {error}</p>
        </div>
      )}
    </div>
  );
}
```

**Reset new state on modal close**:

```tsx
// In the close/reset logic:
setSecurityPortion(0);
setRentPortion(0);
setBoundaryAcknowledged(false);
setEligibleSecProducts([]);
setSelectedSecProductIds([]);
setProjectedSecAllocation([]);
setSecAllocationError(null);
```

### Verification

- Payment amount covers only rent → no warning, no allocation section shown
- Payment amount covers only security → no warning, allocation section shown (with product selection if >1 eligible)
- Payment amount crosses boundary → warning shown, CONFIRM disabled until checkbox checked, then allocation section appears
- Uncheck all products → CONFIRM disabled with error
- Select insufficient products → error shown, CONFIRM disabled
- Select sufficient products → allocation preview correct, CONFIRM enabled
- Confirm → API called with `security_product_ids`, backend allocates correctly

### Files touched

| File | Layer |
|------|-------|
| `frontend/app/salesman/order-details/[id]/page.tsx` | Frontend Page |

---

## Step 5: Frontend — Admin Collect Payment: Boundary Warning + Security Allocation UI (Points 1 & 2)

**Priority**: Critical  
**Layer**: Frontend  
**Estimated scope**: Medium (1 component file)  
**Depends on**: Step 1 (backend), Step 4 (can reuse `SecurityAllocationSection` logic)

### Problem

`PaymentManagement.tsx` has a simpler modal (no CALCULATE step). The boundary warning and allocation section must appear live as the user types the amount.

### Changes

#### [MODIFY] `frontend/components/common/PaymentManagement.tsx`

**New state** (same as Step 4 but on `formData.amount` changes):

```tsx
const [securityPortion, setSecurityPortion] = useState(0);
const [rentPortion, setRentPortion] = useState(0);
const [boundaryAcknowledged, setBoundaryAcknowledged] = useState(false);
const [eligibleSecProducts, setEligibleSecProducts] = useState<any[]>([]);
const [selectedSecProductIds, setSelectedSecProductIds] = useState<number[]>([]);
const [projectedSecAllocation, setProjectedSecAllocation] = useState<any[]>([]);
const [secAllocationError, setSecAllocationError] = useState<string | null>(null);
```

**`useEffect` to recompute on amount change** (triggered by `formData.amount` and `summary` changes):

```tsx
useEffect(() => {
  if (transactionType !== 'payment' || !summary) return;
  const amount = parseFloat(formData.amount) || 0;
  if (amount <= 0) {
    setSecurityPortion(0); setRentPortion(0);
    setBoundaryAcknowledged(false);
    return;
  }

  const nonSecOutstanding = Math.max(0,
    (summary.totals?.total_due ?? 0) -
    (summary.totals?.security_due ?? 0) -   // ← need per-category totals in summary
    (summary.totals?.total_paid ?? 0) +
    (summary.totals?.security_paid ?? 0)
  );
  // Simpler: use payment-summary per-category breakdown
  // ... (mirror the breakdown logic from salesman page)
  
  const secAmt = Math.max(0, amount - nonSecOutstanding);
  const rentAmt = amount - secAmt;
  setSecurityPortion(secAmt);
  setRentPortion(rentAmt);
  setBoundaryAcknowledged(false); // reset on amount change
}, [formData.amount, summary, transactionType]);
```

**In `handleSubmit()`** — add `security_product_ids` to the payload when applicable:

```tsx
const payload: any = {
  booking_id: bookingId,
  amount: parseFloat(formData.amount),
  type: transactionType,
  method: formData.method,
  recorded_by: 'Admin',
  notes: formData.notes || undefined,
};

if (transactionType === 'payment' && securityPortion > 0 && selectedSecProductIds.length > 0) {
  payload.security_product_ids = selectedSecProductIds;
}

await paymentTransactionsApi.create(payload);
```

**In the modal JSX** — add boundary warning + allocation section between the notes field and the Confirm button (same markup as Step 4).

**CONFIRM button gate** — same logic as Step 4.

**Reset new state on modal close**.

### Files touched

| File | Layer |
|------|-------|
| `frontend/components/common/PaymentManagement.tsx` | Frontend Component |

---

## Summary: Change Impact by Layer

| Layer | Files Modified | Steps |
|-------|---------------|-------|
| **Service** | `chargeAccountingService.js` | 1 |
| **Route** | `bookings.js` (payments) | 1 |
| **Tests** | `securityAllocation.test.js` | 1 |
| **Frontend Component** | `BookingCancellation.tsx` | 2 |
| **Frontend Component** | `ProductExchange.tsx` | 3 |
| **Frontend Page** | `salesman/order-details/[id]/page.tsx` | 3, 4 |
| **Frontend Page** | `admin/bookings/[id]/page.tsx` | 3 |
| **Frontend Component** | `PaymentManagement.tsx` | 5 |
| **Frontend Component** | `SecurityAllocationSection.tsx` (UI + `toEligibleSecProducts` + `computeSecAllocationPreview`) | Addendum |
| **Frontend Hook** | `useSecurityAllocation.ts` | Addendum |
| **Shared types** | `shared/src/types/index.ts` (`PaymentSummary.products.booked_from`) | Addendum |

### Dependency Graph

```
Step 1 (backend security allocation)  → independent
Step 2 (cancel greying out)           → independent (data already in cancel preview)
Step 3 (exchange greying out)         → independent (parent passes securityPaidByProduct)
Step 4 (salesman payment UX)          → depends on Step 1 (backend must accept security_product_ids)
Step 5 (admin payment UX)             → depends on Step 1; shares SecurityAllocationSection from Step 4
```

Steps 1–3 can be done in parallel. Step 4 should be done after Step 1. Step 5 should be done after Step 4 (to reuse the `SecurityAllocationSection` logic).

---

## Addendum: Payment summary — single endpoint, correct client parsing (follow-up fix)

Both the **salesman** portal (`bookingsApi.getPaymentSummary(bookingId)`) and **admin** payment UI (`paymentTransactionsApi.getSummary(bookingId)`) resolve to the **same** backend route: **`GET /payment-transactions/summary/:bookingId`**, implemented by `chargeAccountingService.getPaymentSummary()`. There are not two different payment-summary APIs.

**Actual `products[]` shape** (per product line):

- `booking_product_id`, `product_id`, `product_name`, `product_code`, `status`, `rent`, `security_deposit`
- `booked_from` — included in the service response so pickup-date sort matches the backend (added in `getPaymentSummary` mapping).
- `charges` — **JSON array** of charge rows: `{ charge_type, due_amount, paid_amount, ... }`. Security is the row where `charge_type === 'security'`, not a nested `charges.security.{due,paid}` object, and there is no nested `product` object on each summary line.

**Bug in early Step 4 implementation:** The salesman Record Payment flow read `p.product.*` and `p.charges?.security?.due`, which do not match the API. That made the security-allocation UI derive **no eligible products** even though the correct endpoint was called.

**Fix (implemented after Steps 4–5):**

- **`toEligibleSecProducts(summary.products)`** — shared adapter in `frontend/components/common/SecurityAllocationSection.tsx` maps API rows to `EligibleSecProduct[]` (find security charge in the `charges` array, filter by `status`).
- **`computeSecAllocationPreview(...)`** — pure function in the same module; projection logic is not duplicated in pages.
- **`useSecurityAllocation()`** — `frontend/hooks/useSecurityAllocation.ts` centralizes boundary/allocation state, preview recomputation, `updateSplit()`, `resetAll()`, and `canConfirmSecurity` for both salesman and admin modals.
- **Backend:** `getPaymentSummary` product mapping includes `booked_from`.
- **Types:** `shared/src/types/index.ts` — `PaymentSummary.products[].booked_from` documented.

---

---

## Known Bugs (found post-commit, not yet fixed)

### Bug 1 — `securityPaidByProduct` uses wrong API shape (Step 3, exchange gate broken)

**Severity**: High — exchange dropdown will never disable security-paid products  
**Files**: `frontend/app/salesman/order-details/[id]/page.tsx`, `frontend/app/admin/bookings/[id]/page.tsx`

Both pages derive the `securityPaidByProduct` prop passed to `<ProductExchange>` using the old nested summary shape that does not match the actual API response:

```tsx
// WRONG — currently in both pages:
paymentSummary?.products?.reduce(
  (acc: Record<number, number>, p: any) => {
    acc[p.product.id] = p.charges?.security?.paid ?? 0;  // ← p.product does not exist; charges is an array
    return acc;
  },
  {}
) ?? {}
```

`GET /payment-transactions/summary/:bookingId` returns each product as:
- `p.booking_product_id` — the booking product ID (not `p.product.id`)
- `p.charges` — a **JSON array** of charge rows (`{ charge_type, due_amount, paid_amount, ... }`), not a nested object

**Correct derivation**:

```tsx
paymentSummary?.products?.reduce(
  (acc: Record<number, number>, p: any) => {
    const secCharge = p.charges?.find((c: any) => c.charge_type === 'security');
    acc[p.booking_product_id] = secCharge?.paid_amount ?? 0;
    return acc;
  },
  {}
) ?? {}
```

A shared helper `securityPaidByProductFromSummary(products)` should be added next to `toEligibleSecProducts()` in `SecurityAllocationSection.tsx` and used in both pages.

---

### Bug 2 — Security allocation validation error returns HTTP 500 instead of 400

**Severity**: Medium — user sees a generic server error instead of the descriptive validation message  
**File**: `backend/src/routes/paymentTransactions.js`

When `_applyToSecurity()` throws `"Security allocation insufficient: selected products can absorb ₹X but ₹Y is being credited..."`, the `POST /payment-transactions` route catch block does not match it as a known validation error. It falls through to the generic 500 handler:

```js
// Current catch — missing the security allocation case:
} catch (error) {
  if (error.message === 'Booking not found') { ... }
  if (error.message === 'Payment amount must be greater than 0') { ... }
  // ↓ Security allocation error lands here as 500
  res.status(500).json({ error: 'Failed to record transaction', details: error.message });
}
```

**Fix**: Add a specific 400 case before the generic 500:

```js
if (error.message.startsWith('Security allocation insufficient')) {
  return res.status(400).json({ error: error.message });
}
```

---

### Bug 3 — Unused `toEligibleSecProducts` import in salesman page

**Severity**: Minor — lint warning only, no runtime impact  
**File**: `frontend/app/salesman/order-details/[id]/page.tsx`

`toEligibleSecProducts` is imported at the top of the file but never called directly — it is invoked internally by `updateSplit()` inside `useSecurityAllocation()`. The import should be removed.

```tsx
// Line 11 — remove this:
import { toEligibleSecProducts } from '@/components/common';
```

---

## Completion Criteria

All steps marked `[x]` with:
- [ ] Backend correctly allocates security to user-specified products only
- [ ] Backend validation blocks over-allocation (selected products' capacity < security amount)
- [ ] Existing security waterfall (no `security_product_ids`) behavior unchanged
- [ ] Cancel dialog greys out security-paid products with lock icon + message; Select All skips them
- [ ] Exchange dialog disables security-paid products in dropdown with suffix
- [ ] Salesman payment: boundary warning shows correct rent/security split; CONFIRM disabled until acknowledged
- [ ] Salesman payment: security allocation section shows when any security is credited
- [ ] Security allocation projection matches backend rule (partial first, then by pickup date)
- [ ] Validation: CONFIRM disabled when selected products cannot absorb security amount
- [ ] Admin payment: same behavior as salesman for both warning and allocation
- [ ] All new backend tests pass
- [ ] No regression in existing payment, exchange, cancel flows
- [ ] Salesman and admin parse **`GET /payment-transactions/summary/:id`** consistently (`charges` as array; security via `charge_type === 'security'`); allocation UI shows eligible products when security is credited
