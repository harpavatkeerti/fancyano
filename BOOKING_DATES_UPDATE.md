# Booking Dates Recalculation Enhancement

## Overview
Updated the backend to automatically recalculate overall booking dates (`booked_from` and `booked_to`) based on all products in a booking. The booking dates are now calculated as:
- **`booked_from`**: Minimum (earliest) start date of all products
- **`booked_to`**: Maximum (latest) end date of all products

## Changes Made

### 1. Product Exchange - Create Exchange
**File**: `backend/src/routes/productExchanges.js`

When a product is exchanged (replaced with another product or multiple products):
- The system now recalculates booking dates using `MIN(bp.booked_from)` and `MAX(bp.booked_to)` from all products
- This ensures the overall booking dates encompass all product rental periods
- Located in the `POST /` endpoint (create exchange)

**What was updated**:
- Added `MIN(bp.booked_from) as min_booked_from` and `MAX(bp.booked_to) as max_booked_to` to the recalculation query
- Updated the booking UPDATE statement to include `booked_from = $3` and `booked_to = $4` parameters

### 2. Product Exchange - Delete Exchange
**File**: `backend/src/routes/productExchanges.js`

When an exchange is deleted (reverting back to original product):
- The system recalculates booking dates from all remaining products
- Logs the calculated min/max dates for debugging
- Located in the `DELETE /:id` endpoint

**What was updated**:
- Added min/max date calculations to the recalculation query
- Updated the booking UPDATE statement to include the recalculated dates
- Added console logs to show the calculated dates

### 3. Add Product to Booking
**File**: `backend/src/routes/bookings.js`

When a new product is added to an existing booking (e.g., during exchange with additional products):
- The system now recalculates booking dates to include the new product's dates
- Located in the `POST /:id/products` endpoint

**What was updated**:
- Added `MIN(bp.booked_from)` and `MAX(bp.booked_to)` to the recalculation query
- Updated the booking UPDATE statement to include `booked_from` and `booked_to`
- Added other_charges handling to ensure it's preserved during recalculation

### 4. Booking Cancellation (Partial)
**File**: `backend/src/routes/bookingCancellation.js`

When one or more products are cancelled from a booking:
- For **partial cancellations**: booking dates are recalculated from remaining active products
- For **full cancellations**: booking dates remain unchanged (all products cancelled)
- Located in the `POST /` endpoint (cancel booking)

**What was updated**:
- Added min/max date calculations to the remaining products query
- Updated the booking UPDATE logic to conditionally update dates for partial cancellations
- Kept original dates for full cancellations

## Impact

### Before
- Booking dates remained static even when products were exchanged or cancelled
- Could lead to incorrect date ranges in booking overview
- Availability calendar might show incorrect blocking periods

### After
- Booking dates automatically adjust to reflect all products' rental periods
- Accurate date ranges in booking overview and reports
- Proper availability blocking based on actual product rental dates

## Example Scenarios

### Scenario 1: Product Exchange with Different Dates
**Before**:
- Booking: Jan 1 - Jan 10
- Product A: Jan 1 - Jan 10
- Exchange A → B: Jan 5 - Jan 15
- **Booking dates remained**: Jan 1 - Jan 10 ❌

**After**:
- Booking: Jan 1 - Jan 10
- Product A: Jan 1 - Jan 10
- Exchange A → B: Jan 5 - Jan 15
- **Booking dates updated to**: Jan 5 - Jan 15 ✅

### Scenario 2: Exchange with Additional Products
**Before**:
- Booking: Jan 1 - Jan 5
- Product A: Jan 1 - Jan 5
- Exchange A → (B + C): B (Jan 3 - Jan 7), C (Jan 1 - Jan 10)
- **Booking dates remained**: Jan 1 - Jan 5 ❌

**After**:
- Booking: Jan 1 - Jan 5
- Product A: Jan 1 - Jan 5
- Exchange A → (B + C): B (Jan 3 - Jan 7), C (Jan 1 - Jan 10)
- **Booking dates updated to**: Jan 1 - Jan 10 ✅

### Scenario 3: Partial Cancellation
**Before**:
- Booking: Jan 1 - Jan 10
- Product A: Jan 1 - Jan 10
- Product B: Jan 3 - Jan 7
- Cancel B
- **Booking dates remained**: Jan 1 - Jan 10 ❌

**After**:
- Booking: Jan 1 - Jan 10
- Product A: Jan 1 - Jan 10
- Product B: Jan 3 - Jan 7
- Cancel B
- **Booking dates updated to**: Jan 1 - Jan 10 ✅ (matches Product A)

## Database Queries

The recalculation query pattern used across all endpoints:

```sql
SELECT 
  COALESCE(SUM(p.rent_per_day), 0) as total_rent,
  COALESCE(SUM(p.security_deposit), 0) as total_security,
  MIN(bp.booked_from) as min_booked_from,
  MAX(bp.booked_to) as max_booked_to
FROM booking_products bp
JOIN products p ON bp.product_id = p.id
WHERE bp.booking_id = $1
  AND bp.status = 'active' -- For cancellation queries
```

The UPDATE statement pattern:

```sql
UPDATE bookings 
SET total_amount = $1,
    security_deposit = $2,
    booked_from = $3,
    booked_to = $4,
    updated_at = CURRENT_TIMESTAMP 
WHERE id = $5
```

## Testing Recommendations

1. **Test Product Exchange**: 
   - Exchange a product with different dates
   - Verify booking dates update to reflect the new product's dates
   
2. **Test Multiple Products Exchange**:
   - Exchange one product with multiple products having different date ranges
   - Verify booking dates span the minimum start to maximum end
   
3. **Test Partial Cancellation**:
   - Cancel one product from a multi-product booking
   - Verify booking dates adjust to remaining products
   
4. **Test Full Cancellation**:
   - Cancel all products
   - Verify booking dates remain unchanged

## Notes

- The `other_charges` field (transportation costs) is preserved during all recalculations
- Only `active` products are considered when calculating dates for cancellation scenarios
- The system handles edge cases where dates might be NULL
- All updates are done within transactions to ensure data consistency

## Files Modified

1. `backend/src/routes/productExchanges.js` - Lines ~205-240 and ~715-755
2. `backend/src/routes/bookings.js` - Lines ~492-530
3. `backend/src/routes/bookingCancellation.js` - Lines ~202-243
4. `frontend/components/common/ProductExchange.tsx` - Lines ~522, ~659, ~742 (frontend refresh fixes)

## Frontend Refresh Fix

**Issue**: When adding products during exchange, the date picker was autofilling with old booking dates instead of newly calculated dates.

**Solution**: Added `fetchBookingDates()` calls in the ProductExchange component after:
- Exchange creation without payment collection
- Exchange creation with payment collection  
- Exchange deletion

This ensures the frontend always has the latest booking dates from the backend after any product modification.

