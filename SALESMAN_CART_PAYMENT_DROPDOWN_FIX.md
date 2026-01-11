# Salesman Cart - Payment Method Dropdown Fix

## Issue Found
The **Salesman Cart page** (`frontend/app/salesman/cart/page.tsx`) was still using **radio buttons** for payment method selection with only Cash and UPI options.

## Changes Made

### 1. Replaced Radio Buttons with Dropdown

**Before** (Lines 744-766):
```tsx
<div className="mb-6">
  <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment</h3>
  <div className="space-y-2">
    <label className="flex items-center justify-between p-3 border border-gray-300 rounded-lg cursor-pointer bg-red-50 border-red-200">
      <span>UPI</span>
      <input
        type="radio"
        checked={paymentMethod === 'upi'}
        onChange={() => setPaymentMethod('upi')}
        className="ml-2"
      />
    </label>
    <label className="flex items-center justify-between p-3 border border-gray-300 rounded-lg cursor-pointer bg-red-50 border-red-200">
      <span>Cash</span>
      <input
        type="radio"
        checked={paymentMethod === 'cash'}
        onChange={() => setPaymentMethod('cash')}
        className="ml-2"
      />
    </label>
  </div>
</div>
```

**After** (Lines 744-760):
```tsx
<div className="mb-6">
  <h3 className="text-sm font-semibold text-gray-700 mb-3">
    Payment Method <span className="text-red-500">*</span>
  </h3>
  <select
    value={paymentMethod}
    onChange={(e) => setPaymentMethod(e.target.value)}
    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
  >
    <option value="Cash">Cash</option>
    <option value="UPI">UPI</option>
    <option value="Card">Card</option>
    <option value="Bank Transfer">Bank Transfer</option>
    <option value="Cheque">Cheque</option>
    <option value="Other">Other</option>
  </select>
</div>
```

### 2. Updated State Type

**Before** (Line 23):
```tsx
const [paymentMethod, setPaymentMethod] = useState<'upi' | 'cash'>('upi');
```

**After** (Line 23):
```tsx
const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
```

### 3. Updated Conditional Checks

**Before** (Line 280):
```tsx
if (paymentMethod === 'upi') {
```

**After** (Line 280):
```tsx
if (paymentMethod === 'UPI') {
```

**Before** (Line 880):
```tsx
if (paymentMethod === 'upi') {
```

**After** (Line 880):
```tsx
if (paymentMethod === 'UPI') {
```

## Functionality

The dropdown now offers 6 payment method options:
- **Cash** (default)
- **UPI** - Shows UPI QR code modal
- **Card**
- **Bank Transfer**
- **Cheque**
- **Other**

### UPI Modal Behavior
- When **UPI** is selected, the UPI payment modal appears (with QR code)
- For all other methods (Cash, Card, Bank Transfer, Cheque, Other), the booking is created directly
- The actual payment recording happens later in the order details page

## Consistency Across Application

Now all three booking creation flows use the same dropdown:

1. ✅ **Admin Bookings Page** - Dropdown with 6 options
2. ✅ **Salesman Cart Page** - Dropdown with 6 options (FIXED)
3. ✅ **Salesman Order Details** (Record Payment) - Dropdown with 6 options

All use identical styling and options:
```tsx
<option value="Cash">Cash</option>
<option value="UPI">UPI</option>
<option value="Card">Card</option>
<option value="Bank Transfer">Bank Transfer</option>
<option value="Cheque">Cheque</option>
<option value="Other">Other</option>
```

## How It Works in Salesman Flow

1. **Cart Page**: Salesman selects payment method from dropdown
2. **If UPI selected**: UPI modal appears with QR code
3. **If other method**: Booking created directly
4. **Order Details Page**: Salesman records actual payment with the method

The payment method selection in the cart is for UI flow (whether to show UPI modal), not for recording the transaction. The actual transaction is recorded later when the salesman clicks "Record Payment" in the order details page.

## Testing

1. Go to Salesman Portal → Products
2. Add items to cart
3. Go to Cart
4. Scroll down to "Payment Method"
5. You should now see a **dropdown** instead of radio buttons
6. Dropdown should have: Cash, UPI, Card, Bank Transfer, Cheque, Other
7. Select different methods and verify:
   - **UPI**: Shows UPI QR modal
   - **Other methods**: Creates booking directly

## Files Changed

- `frontend/app/salesman/cart/page.tsx`
  - Line 23: Updated state type and default value
  - Lines 744-760: Replaced radio buttons with dropdown
  - Line 280: Updated UPI check (lowercase to uppercase)
  - Line 880: Updated UPI check (lowercase to uppercase)

