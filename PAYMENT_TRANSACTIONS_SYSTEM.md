# Payment Transactions System

## Overview
Complete payment management system with audit trail, allowing admins to record payments, refunds, and adjustments while tracking full transaction history.

## Features

### 1. **Transaction Types**
- **Payment**: Money received from customer
- **Refund**: Money returned to customer (overpayments, cancellations)
- **Adjustment**: Admin corrections for accounting errors

### 2. **Audit Trail**
Every transaction records:
- Amount
- Type (payment/refund/adjustment)
- Payment method (Cash/UPI/Card/Bank Transfer)
- Who recorded it
- When it was recorded
- Optional notes explaining the transaction

### 3. **Role-Based Access**

#### Salesman Portal
- ✅ Can record payments from customers
- ✅ See overpayment warnings
- ❌ **Cannot** record refunds or adjustments
- View-only transaction history

#### Admin Portal
- ✅ Record payments
- ✅ Record refunds
- ✅ Make adjustments
- ✅ View complete transaction history
- ✅ See payment summary (totals, breakdowns)

## Database Schema

### Table: `payment_transactions`
```sql
id                SERIAL PRIMARY KEY
booking_id        INTEGER (FK to bookings)
amount            DECIMAL(10, 2)
type              VARCHAR(20) - 'payment'|'refund'|'adjustment'
method            VARCHAR(50) - 'Cash'|'UPI'|'Card'|'Bank Transfer'|'Other'
recorded_by       VARCHAR(255) - Name of person who recorded
notes             TEXT - Optional explanation
created_at        TIMESTAMP
```

## API Endpoints

### GET `/api/payment-transactions/booking/:bookingId`
Get all transactions for a booking
- **Response**: Array of PaymentTransaction objects

### GET `/api/payment-transactions/summary/:bookingId`
Get payment summary for a booking
- **Response**: PaymentSummary object with totals

### POST `/api/payment-transactions`
Create a new transaction
- **Body**: 
  ```json
  {
    "booking_id": number,
    "amount": number,
    "type": "payment" | "refund" | "adjustment",
    "method": string,
    "recorded_by": string,
    "notes": string (optional)
  }
  ```
- **Behavior**: Automatically updates booking's `paid_amount`, `due_amount`, and `payment_status`

## Usage Examples

### Example 1: Customer Overpayment

**Scenario**: Customer pays ₹7,000 for ₹5,900 order

1. **Salesman** records ₹7,000 payment
   - System shows: "Refund ₹1,100 to customer"
   - Salesman gives ₹1,100 cash back

2. **Admin** logs refund:
   - Type: Refund
   - Amount: ₹1,100
   - Method: Cash
   - Notes: "Overpayment returned by Salesman X"

3. **Result**:
   - Net payment: ₹5,900
   - Transaction history shows both transactions
   - Audit trail complete

### Example 2: Accounting Error Correction

**Scenario**: Payment of ₹3,000 accidentally recorded as ₹2,000

1. **Admin** makes adjustment:
   - Type: Adjustment
   - Amount: ₹1,000
   - Method: N/A
   - Notes: "Correction: actual payment was ₹3,000, not ₹2,000"

2. **Result**:
   - Paid amount corrected
   - Both transactions visible in history
   - Clear audit trail

### Example 3: Partial Refund

**Scenario**: Customer cancels, receives partial refund

1. **Admin** records refund:
   - Type: Refund
   - Amount: ₹2,500
   - Method: Bank Transfer
   - Notes: "Partial refund due to cancellation (50% policy)"

2. **Result**:
   - Paid amount reduced
   - Payment status updated
   - Refund documented

## Components

### Frontend Components

#### `PaymentManagement` Component
Location: `frontend/components/common/PaymentManagement.tsx`

**Props**:
- `bookingId`: Booking ID
- `totalAmount`: Total booking amount
- `securityDeposit`: Security deposit amount
- `onPaymentUpdate`: Callback when payment changes

**Features**:
- Payment summary cards (payments, refunds, adjustments, net)
- Transaction history list with color coding
- Record payment/refund/adjustment modals
- Auto-refresh on updates

### Backend Routes

Location: `backend/src/routes/paymentTransactions.js`

**Features**:
- Transaction validation
- Automatic booking amount updates
- Database transactions (ACID compliance)
- Error handling

## Benefits

### 1. **Security**
- Only admin can adjust payments
- Prevents unauthorized modifications
- Role-based access control

### 2. **Transparency**
- Complete transaction history
- Who did what, when
- Clear audit trail for accounting

### 3. **Accountability**
- Every transaction tracked
- Notes required for adjustments
- Easy to trace mistakes

### 4. **Accuracy**
- Automatic calculations
- No manual updates to `paid_amount`
- Prevents accounting errors

## Migration

### Setup Steps

1. **Database**: Run migration
   ```bash
   node backend/src/database/run_payment_transactions_migration.js
   ```

2. **Backend**: Routes automatically loaded (already done)

3. **Frontend**: Components integrated in admin portal

### Backwards Compatibility

- Existing bookings work as-is
- Old payments not migrated to transactions
- New system only tracks future transactions
- Can add historical transactions manually if needed

## Future Enhancements

Possible improvements:
1. **Receipt Generation**: Auto-generate receipts for each transaction
2. **Email Notifications**: Send receipts via email
3. **Multi-Currency**: Support multiple currencies
4. **Batch Operations**: Bulk refunds/adjustments
5. **Advanced Reporting**: Export transaction reports
6. **Approval Workflow**: Require approval for large refunds

## Troubleshooting

### Issue: Transaction not showing
**Solution**: Check browser console, refresh page, verify booking ID

### Issue: Payment not updating
**Solution**: Check backend logs, verify database connection, check for errors in network tab

### Issue: Overpayment calculation wrong
**Solution**: Verify `total_amount` and `security_deposit` are correct in booking

## Support

For issues or questions:
1. Check backend logs: `terminals/9.txt`
2. Check browser console (F12)
3. Verify API responses in Network tab
4. Check database: `SELECT * FROM payment_transactions WHERE booking_id = X`

