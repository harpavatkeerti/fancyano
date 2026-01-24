# 🏗️ RENTAL BOOKING SYSTEM - COMPLETE ARCHITECTURE BLUEPRINT

**Version:** 2.0  
**Date:** January 2026  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Backend Architecture](#2-backend-architecture)
3. [API Endpoints](#3-api-endpoints)
4. [Policy Framework](#4-policy-framework)
5. [Frontend Changes](#5-frontend-changes)
6. [Migration Assessment](#6-migration-assessment)

---

## 1. DATABASE SCHEMA

### 1.1 Core Tables

#### 1.1.1 `bookings` Table (Modified)

```sql
CREATE TABLE bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(255),
  customer_address TEXT,
  alternate_phone VARCHAR(20),
  
  -- Booking lifecycle
  status ENUM('pending', 'confirmed', 'in_progress', 'partially_completed', 'completed', 'cancelled') 
    DEFAULT 'pending' NOT NULL,
  booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Date range (union of all product dates)
  booked_from DATE NOT NULL,
  booked_to DATE NOT NULL,
  
  -- Transport (booking-level, optional, editable)
  transport_opted BOOLEAN DEFAULT FALSE,
  transport_charge INT DEFAULT 0,
  transport_paid INT DEFAULT 0,
  
  -- Final discount (optional, applied at finalization, default = 0)
  final_discount INT DEFAULT 0,
  
  -- Overpayment tracking (excess payments after all dues covered)
  overpayment INT DEFAULT 0,
  
  -- Legacy fields (DEPRECATED - will be removed after migration)
  total_amount INT DEFAULT 0 COMMENT 'DEPRECATED: Use product_charges',
  security_deposit INT DEFAULT 0 COMMENT 'DEPRECATED: Use product_charges',
  paid_amount INT DEFAULT 0 COMMENT 'DEPRECATED: Use product_charges',
  discount_amount INT DEFAULT 0 COMMENT 'DEPRECATED: Use final_discount',
  discount_type ENUM('percentage', 'fixed') COMMENT 'DEPRECATED',
  other_charges INT DEFAULT 0 COMMENT 'DEPRECATED: Use transport_charge',
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  
  INDEX idx_status (status),
  INDEX idx_booking_date (booking_date),
  INDEX idx_date_range (booked_from, booked_to),
  INDEX idx_customer_phone (customer_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.1.2 `booking_products` Table (Modified)

```sql
CREATE TABLE booking_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  product_id INT NOT NULL,
  
  -- Product lifecycle status (6 states)
  status ENUM('pending', 'confirmed', 'in_progress', 'completed', 'exchanged', 'cancelled') 
    DEFAULT 'pending' NOT NULL,
  
  -- Booking dates (per product)
  booked_from DATE NOT NULL,
  booked_to DATE NOT NULL,
  
  -- Base charges (immutable after creation, except via exchange)
  rent INT NOT NULL,
  security_deposit INT NOT NULL,
  
  -- Per-product discount (optional, at creation only)
  discount_amount INT DEFAULT 0,
  discount_type ENUM('percentage', 'fixed') DEFAULT NULL,
  effective_rent INT NOT NULL, -- rent - discount
  
  -- Lifecycle tracking
  picked_up_at TIMESTAMP NULL,
  picked_up_by VARCHAR(100) NULL,
  returned_at TIMESTAMP NULL,
  returned_to VARCHAR(100) NULL,
  
  -- Exchange tracking (if this product was exchanged)
  exchanged_at TIMESTAMP NULL,
  exchanged_for_product_ids JSON NULL COMMENT 'Array of new product IDs',
  
  -- Cancellation tracking (if this product was cancelled)
  cancelled_at TIMESTAMP NULL,
  cancellation_reason TEXT NULL,
  
  -- Measurements and special requirements (existing)
  measurements JSON,
  special_requirements TEXT,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  
  INDEX idx_booking_status (booking_id, status),
  INDEX idx_product_dates (product_id, booked_from, booked_to),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.1.3 `product_charges` Table (NEW - Core Financial Tracking)

```sql
CREATE TABLE product_charges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_product_id INT NOT NULL,
  
  -- Charge category (7 types - payment priority order)
  charge_type ENUM(
    'rent',                  -- #1: Rental charge (per product)
    'exchange_penalty',      -- #2: Penalty for exchanging product
    'downgrade_penalty',     -- #3: Penalty when new product cheaper than old
    'cancellation_penalty',  -- #4: Penalty for cancelling product
    'late_fee',              -- #5: Fee for delayed return
    'damage_fee',            -- #6: Fee for damaged product
    'security'               -- #7: Security deposit
  ) NOT NULL,
  
  -- Financial tracking
  -- due_amount: IMMUTABLE - what customer owes for this charge
  -- paid_amount: MUTABLE - what customer has paid towards this charge
  due_amount INT NOT NULL DEFAULT 0,
  paid_amount INT NOT NULL DEFAULT 0,
  
  -- Metadata
  notes TEXT NULL,
  policy_reference VARCHAR(100) NULL COMMENT 'Which policy rule generated this charge',
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (booking_product_id) REFERENCES booking_products(id) ON DELETE CASCADE,
  
  -- Ensure one charge per type per product
  UNIQUE KEY unique_product_charge (booking_product_id, charge_type),
  
  INDEX idx_booking_product (booking_product_id),
  INDEX idx_charge_type (charge_type),
  INDEX idx_pending_charges (booking_product_id, charge_type) 
    WHERE (due_amount - paid_amount) > 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.1.4 `payment_transactions` Table (Modified)

```sql
CREATE TABLE payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  
  -- Transaction type (money flow direction - 3 types)
  type ENUM('payment', 'refund', 'adjustment') NOT NULL,
  
  -- What this payment applies to (optional, for tracking/display purposes only)
  charge_category ENUM(
    'rent', 'exchange_penalty', 'downgrade_penalty',
    'cancellation_penalty', 'late_fee', 'damage_fee', 'security', 'transport'
  ) NULL COMMENT 'Display label only - actual application handled by backend',
  
  -- Payment details
  amount INT NOT NULL,
  method ENUM('Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Voucher') NULL,
  
  -- Notes and audit
  notes TEXT,
  recorded_by VARCHAR(100),
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Legacy fields (DEPRECATED)
  transaction_type VARCHAR(50) NULL COMMENT 'DEPRECATED: Use charge_category',
  payment_method VARCHAR(50) NULL COMMENT 'DEPRECATED: Use method',
  
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  
  INDEX idx_booking_type (booking_id, type),
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_charge_category (charge_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.1.5 `booking_exchange_history` Table (NEW)

```sql
CREATE TABLE booking_exchange_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  
  -- Old product being exchanged
  old_product_id INT NOT NULL,
  old_booking_product_id INT NOT NULL,
  old_rent INT NOT NULL,
  
  -- New products added in exchange (JSON arrays)
  new_product_ids JSON NOT NULL,
  new_booking_product_ids JSON NOT NULL,
  new_total_rent INT NOT NULL,
  
  -- Charges generated
  exchange_penalty INT NOT NULL,
  downgrade_penalty INT NOT NULL DEFAULT 0,
  
  -- Audit
  exchanged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  exchanged_by VARCHAR(100),
  reason TEXT,
  
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (old_booking_product_id) REFERENCES booking_products(id) ON DELETE RESTRICT,
  
  INDEX idx_booking (booking_id),
  INDEX idx_old_product (old_booking_product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.1.6 `booking_cancellation_history` Table (NEW)

```sql
CREATE TABLE booking_cancellation_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  booking_product_id INT NOT NULL,
  
  -- Charge details
  rent_to_refund INT NOT NULL,
  security_to_refund INT NOT NULL,
  cancellation_penalty INT NOT NULL,
  
  -- Audit
  cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_by VARCHAR(100),
  reason TEXT,
  
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_product_id) REFERENCES booking_products(id) ON DELETE RESTRICT,
  
  INDEX idx_booking (booking_id),
  INDEX idx_cancelled_at (cancelled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.1.7 `rental_policies` Table (NEW)

```sql
CREATE TABLE rental_policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Policy identification
  policy_key VARCHAR(100) NOT NULL UNIQUE,
  policy_name VARCHAR(255) NOT NULL,
  policy_type ENUM(
    'exchange_penalty',
    'cancellation_penalty',
    'late_fee',
    'transport_fee'
  ) NOT NULL,
  
  -- Policy value
  value_type ENUM('percentage', 'fixed') NOT NULL,
  value INT NOT NULL,
  
  -- Days from booking condition (optional)
  -- If NULL, applies always. If set, applies when days since product was added matches condition
  days_from_booking_min INT NULL COMMENT 'Minimum days since product added (booking_product.created_at)',
  days_from_booking_max INT NULL COMMENT 'Maximum days since product added (booking_product.created_at)',
  
  -- Constraints
  min_value INT DEFAULT 0,
  max_value INT NULL,
  
  -- Active status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  
  INDEX idx_policy_key (policy_key),
  INDEX idx_policy_type (policy_type),
  INDEX idx_active (is_active),
  
  -- Ensure no overlapping date ranges for same policy type
  CONSTRAINT chk_no_date_overlap CHECK (
    days_from_booking_min IS NULL OR 
    days_from_booking_max IS NULL OR 
    days_from_booking_min <= days_from_booking_max
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default policies
INSERT INTO rental_policies (policy_key, policy_name, policy_type, value_type, value, days_from_booking_min, days_from_booking_max) VALUES
  -- Transport fee (fixed amount, always applicable)
  ('transport_fee_default', 'Default Transport Fee', 'transport_fee', 'fixed', 100, NULL, NULL),
  
  -- Late fee (fixed per extra day, always applicable)
  ('late_fee_default', 'Default Late Fee', 'late_fee', 'fixed', 200, NULL, NULL),
  
  -- Exchange penalty (time-based rules - non-overlapping ranges)
  ('exchange_penalty_within_5_days', 'Exchange Penalty (Within 5 Days)', 'exchange_penalty', 'percentage', 10, 0, 5),
  ('exchange_penalty_within_10_days', 'Exchange Penalty (6-10 Days)', 'exchange_penalty', 'percentage', 20, 6, 10),
  ('exchange_penalty_after_10_days', 'Exchange Penalty (After 10 Days)', 'exchange_penalty', 'percentage', 30, 11, NULL),
  
  -- Cancellation penalty (time-based rules - non-overlapping ranges)
  ('cancellation_penalty_within_5_days', 'Cancellation Penalty (Within 5 Days)', 'cancellation_penalty', 'percentage', 10, 0, 5),
  ('cancellation_penalty_within_10_days', 'Cancellation Penalty (6-10 Days)', 'cancellation_penalty', 'percentage', 20, 6, 10),
  ('cancellation_penalty_after_10_days', 'Cancellation Penalty (After 10 Days)', 'cancellation_penalty', 'percentage', 30, 11, NULL);
```

**Validation Rules:**
- Date ranges for the same policy_type MUST NOT overlap
- Backend validates this when creating/updating policies
- If admin tries to create overlapping rules, API returns error: "Date range overlaps with existing policy"

#### 1.1.8 `booking_activity_log` Table (NEW)

```sql
CREATE TABLE booking_activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  
  -- Activity type
  activity_type VARCHAR(50) NOT NULL,
  
  -- Related product (if applicable)
  booking_product_id INT NULL,
  
  -- References to detailed records (instead of duplicating data)
  exchange_history_id INT NULL,
  cancellation_history_id INT NULL,
  payment_transaction_id INT NULL,
  
  -- Human-readable description
  description TEXT NOT NULL,
  
  -- Lightweight metadata (only for activities without dedicated tables)
  metadata JSON NULL,
  
  -- Who performed this action
  performed_by VARCHAR(100),
  
  -- When it happened
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_product_id) REFERENCES booking_products(id) ON DELETE SET NULL,
  FOREIGN KEY (exchange_history_id) REFERENCES booking_exchange_history(id) ON DELETE SET NULL,
  FOREIGN KEY (cancellation_history_id) REFERENCES booking_cancellation_history(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id) ON DELETE SET NULL,
  
  INDEX idx_booking_activity (booking_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Activity Types:**
- `booking_created` - Booking initially created
- `product_added` - Product added to booking
- `product_exchanged` - Product exchanged (ref: exchange_history_id)
- `product_cancelled` - Product cancelled (ref: cancellation_history_id)
- `product_picked_up` - Product picked up
- `product_returned` - Product returned
- `payment_received` - Payment recorded (ref: payment_transaction_id)
- `refund_issued` - Refund issued (ref: payment_transaction_id)
- `adjustment_made` - Payment adjustment (ref: payment_transaction_id)
- `booking_completed` - Booking finalized

**Example Activity Log Entries:**

```javascript
// Booking created
{ 
  activity_type: 'booking_created',
  description: 'Booking created with 2 products',
  metadata: { 
    product_count: 2,
    product_ids: [45, 46]
  },
  performed_by: 'admin_user'
}

// Product exchanged (references exchange_history table)
{
  activity_type: 'product_exchanged',
  booking_product_id: 123,
  exchange_history_id: 78,  // Points to booking_exchange_history record
  description: 'Product L001 exchanged for S002',
  performed_by: 'salesman_user'
  // All exchange details (penalties, products) in booking_exchange_history table
}

// Product cancelled (references cancellation_history table)
{
  activity_type: 'product_cancelled',
  booking_product_id: 124,
  cancellation_history_id: 56,  // Points to booking_cancellation_history record
  description: 'Product L002 cancelled',
  performed_by: 'admin_user'
  // All cancellation details (penalty, refund) in booking_cancellation_history table
}

// Payment received (references payment_transactions table)
{
  activity_type: 'payment_received',
  payment_transaction_id: 456,  // Points to payment_transactions record
  description: 'Payment of ₹5000 received via UPI',
  performed_by: 'salesman_user'
  // All payment details in payment_transactions table
}

// Product picked up (no dedicated table, uses metadata)
{
  activity_type: 'product_picked_up',
  booking_product_id: 125,
  description: 'Product L003 picked up',
  metadata: {
    product_code: 'L003'
  },
  performed_by: 'salesman_user'
}
```

**API Endpoint:**
```javascript
GET /api/bookings/:id/activity-log
Response: [{
  id: number,
  activity_type: string,
  description: string,
  booking_product_id: number | null,
  exchange_history_id: number | null,
  cancellation_history_id: number | null,
  payment_transaction_id: number | null,
  metadata: object | null,
  performed_by: string,
  created_at: timestamp
}]

// Frontend can fetch detailed records using the reference IDs when needed
```

#### 1.1.8 Product Availability - No Separate Table Needed! ✅

**Current Implementation (Keep It!):**
The existing system already uses an optimal approach - **date range overlap queries** directly on `booking_products`. This is scalable and works well.

**How Availability Checking Works:**

```sql
-- Check if product is available for date range
SELECT COUNT(*) FROM booking_products bp
JOIN bookings b ON bp.booking_id = b.id
WHERE bp.product_id = ?
  AND b.status NOT IN ('cancelled', 'completed')
  AND bp.status IN ('confirmed', 'in_progress')
  AND (
    -- Date range overlap logic
    (bp.booked_from <= ? AND bp.booked_to >= ?) OR  -- Overlaps start date
    (bp.booked_from <= ? AND bp.booked_to >= ?) OR  -- Overlaps end date
    (bp.booked_from >= ? AND bp.booked_to <= ?)     -- Contained within range
  );
-- If COUNT > 0, product is NOT available
```

**Why This Approach is Better:**
- ✅ **No extra table** - Uses existing `booking_products` structure
- ✅ **Highly scalable** - Stores only 2 dates per booking (start/end), not one row per day
- ✅ **Fast performance** - With proper indexes (see below)
- ✅ **Simple maintenance** - No triggers needed to populate/update calendar
- ✅ **Already working** - Proven in current system

**Required Index for Performance:**
```sql
CREATE INDEX idx_product_availability 
  ON booking_products(product_id, status, booked_from, booked_to);
```

**Optional: Manual Blocking Table (for maintenance/holds):**
If you need to manually block products (e.g., maintenance, reserved), add a lightweight table:

```sql
CREATE TABLE product_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  blocked_from DATE NOT NULL,
  blocked_to DATE NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_product_dates (product_id, blocked_from, blocked_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Availability check includes blocks
SELECT COUNT(*) FROM (
  SELECT 1 FROM booking_products bp
  WHERE bp.product_id = ? AND bp.status IN ('confirmed', 'in_progress')
    AND (date overlap logic)
  UNION ALL
  SELECT 1 FROM product_blocks pb
  WHERE pb.product_id = ? 
    AND (date overlap logic)
) AS conflicts;
```

**Scale Test:**
- 1,000 products × 365 days/year = 365K rows (per-date approach) ❌ Bad
- 1,000 products × 50 bookings/year = 50K rows (date range approach) ✅ Good
- Even with 10 years of data: 500K rows vs 3.65M rows (7x more efficient)

---

### 1.2 Constraints & Business Rules

#### Check Constraints

```sql
-- Booking dates validity
ALTER TABLE bookings ADD CONSTRAINT chk_booking_dates 
  CHECK (booked_to >= booked_from);

ALTER TABLE booking_products ADD CONSTRAINT chk_product_dates 
  CHECK (booked_to >= booked_from);

-- Financial constraints
ALTER TABLE bookings ADD CONSTRAINT chk_overpayment 
  CHECK (overpayment >= 0);

ALTER TABLE bookings ADD CONSTRAINT chk_transport_paid
  CHECK (transport_paid >= 0 AND transport_paid <= transport_charge);

ALTER TABLE product_charges ADD CONSTRAINT chk_charge_amounts 
  CHECK (due_amount >= 0 AND paid_amount >= 0 AND paid_amount <= due_amount);

ALTER TABLE booking_products ADD CONSTRAINT chk_rent_values 
  CHECK (rent > 0 AND effective_rent >= 0);

-- Discount constraints
ALTER TABLE booking_products ADD CONSTRAINT chk_product_discount
  CHECK (
    (discount_type IS NULL AND discount_amount = 0) OR
    (discount_type IS NOT NULL AND discount_amount >= 0)
  );
```

#### Backend-Handled Logic (No Database Triggers)

**Design Decision:** All dynamic logic is handled in backend APIs rather than database triggers for better debuggability and maintainability.

**1. Booking Date Range Updates:**
- **When:** Product added/removed/dates changed
- **Where:** Booking creation/update APIs
- **Logic:** Calculate `MIN(booked_from)` and `MAX(booked_to)` from all products, update booking table

**2. Product Charges Initialization:**
- **When:** Product added to booking
- **Where:** `POST /api/bookings` and `POST /api/bookings/:id/products/:productId/exchange`
- **Logic:** 
  ```javascript
  // Create rent charge
  INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
  VALUES (bookingProductId, 'rent', effective_rent, 0);
  
  // Create security charge
  INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
  VALUES (bookingProductId, 'security', security_deposit, 0);
  ```

**3. Product Status Validation:**
- **When:** Status update requested
- **Where:** All lifecycle APIs (pickup, return, exchange, cancel)
- **Validation Rules:**
  - Cannot change status of exchanged/cancelled/completed products
  - `in_progress` can only come from `confirmed`
  - `completed` can only come from `in_progress`
- **Implementation:** Validate before UPDATE, return error if invalid transition

---

### 1.3 Indexes for Performance

```sql
-- Composite indexes for common queries
CREATE INDEX idx_booking_product_status_dates 
  ON booking_products(booking_id, status, booked_from, booked_to);

-- CRITICAL: Main availability check index
CREATE INDEX idx_product_availability 
  ON booking_products(product_id, status, booked_from, booked_to);

CREATE INDEX idx_pending_pickups 
  ON booking_products(status, booked_from)
  WHERE status = 'confirmed';

CREATE INDEX idx_pending_returns 
  ON booking_products(status, booked_to)
  WHERE status = 'in_progress';

-- Financial queries
CREATE INDEX idx_product_charges_lookup 
  ON product_charges(booking_product_id, charge_type);

-- For calculating unpaid amounts (computed column not indexable)
-- Query will use above index and filter in memory

CREATE INDEX idx_booking_transactions 
  ON payment_transactions(booking_id, type, transaction_date);

-- Full-text search
CREATE FULLTEXT INDEX idx_customer_search 
  ON bookings(customer_name, customer_phone, customer_email);
```

---

## 2. BACKEND ARCHITECTURE

### 2.1 Payment Application Logic

**Critical Rule**: Payment applies in this exact order:

1. **Rent**: Product A → Product B → Product C → ... (from `product_charges`)
2. **Transport**: Booking-level fee (from `bookings.transport_charge`, NOT in product_charges)
3. **Exchange Penalties**: Product A → Product B → ... (from `product_charges`)
4. **Downgrade Penalties**: Product A → Product B → ... (from `product_charges`)
5. **Cancellation Penalties**: Product A → Product B → ... (from `product_charges`)
6. **Late Fees**: Product A → Product B → ... (from `product_charges`)
7. **Damage Fees**: Product A → Product B → ... (from `product_charges`)
8. **Securities**: Product A → Product B → ... (from `product_charges`)
9. **Overpayment**: Any remaining amount (to `bookings.overpayment`)

**Key Points**:
- `due_amount` is IMMUTABLE (set at charge creation)
- `paid_amount` is MUTABLE (increases with payments/adjustments)
- Pending = `due_amount - paid_amount`
- Adjustment transaction increases `paid_amount` WITHOUT money changing hands
- **Transport is special**: Tracked at booking level in `bookings.transport_charge`, not in `product_charges` table
- All amounts are integers (no decimals)

**CRITICAL - Exchanged/Cancelled Products:**
- When product is exchanged or cancelled, its status changes to 'exchanged'/'cancelled'
- **due_amount stays INTACT** (never set to 0) - preserves audit trail
- **paid_amount stays INTACT** - preserves payment history
- In calculations:
  - `total_due` = SUM of due_amount WHERE status NOT IN ('exchanged', 'cancelled')
  - `total_paid` = SUM of paid_amount (ALL products, including exchanged/cancelled)
- This ensures: balance = (active dues) - (all payments made), which is correct

**Payment Application Algorithm**:
```javascript
async function applyPayment(bookingId, amount) {
  let remaining = amount;
  
  // 1. Apply to all product rents (priority #1)
  remaining = await applyToChargeType(bookingId, 'rent', remaining);
  
  // 2. Apply to transport (booking-level, priority #2)
  remaining = await applyToTransport(bookingId, remaining);
  
  // 3-7. Apply to penalties and fees (priorities #3-#7)
  for (const type of ['exchange_penalty', 'downgrade_penalty', 'cancellation_penalty', 'late_fee', 'damage_fee']) {
    remaining = await applyToChargeType(bookingId, type, remaining);
  }
  
  // 8. Apply to securities (priority #8)
  remaining = await applyToChargeType(bookingId, 'security', remaining);
  
  // 9. Any remainder goes to overpayment
  if (remaining > 0) {
    await updateBookingOverpayment(bookingId, remaining);
  }
}

async function applyToTransport(bookingId, amount) {
  const booking = await getBooking(bookingId);
  const transportDue = booking.transport_charge;
  const transportPaid = booking.transport_paid;
  const transportPending = transportDue - transportPaid;
  
  if (transportPending > 0) {
    const toApply = Math.min(amount, transportPending);
    await updateBooking(bookingId, { 
      transport_paid: transportPaid + toApply 
    });
    return amount - toApply;
  }
  
  return amount;
}
```

---

### 2.2 Core Services

#### ChargeAccountingService.js

```javascript
class ChargeAccountingService {
  
  /**
   * Get complete payment summary for a booking
   */
  async getPaymentSummary(bookingId) {
    // Returns:
    // - Per-product charge breakdown (7 categories: rent, 3 penalties, 2 fees, security)
    // - Booking-level transport charge
    // - Totals (grand_total_due, grand_total_paid, balance_due)
    // - Overpayment amount
    // - Final discount
    // - Transaction history
    
    // CRITICAL: For exchanged/cancelled products:
    // - due_amount is EXCLUDED from total_due calculations
    // - paid_amount is INCLUDED in total_paid calculations
    // This preserves audit trail while correctly calculating balance
  }
  
  /**
   * Apply payment to booking charges in priority order
   * Automatically distributes amount across charges
   */
  async applyPayment(bookingId, amount, method, notes, recordedBy) {
    // 1. Get all charges sorted by priority (rent→transport→...→security)
    // 2. Apply amount sequentially
    // 3. Update paid_amount for each charge
    // 4. Excess goes to overpayment
    // 5. Record transaction
    // 6. Return allocation breakdown
  }
  
  /**
   * Calculate balance due
   */
  async calculateBalance(bookingId) {
    // Formula: total_due - final_discount - total_paid - overpayment
    // Returns breakdown by charge type
  }
  
  /**
   * Process adjustment (security refund adjusted against dues)
   */
  async processAdjustment(bookingId, refundAmount, notes, recordedBy) {
    // 1. Call applyPayment (increases paid_amount)
    // 2. Record as adjustment transaction (type='adjustment')
    // 3. No actual money transfer
  }
  
  /**
   * Initialize product charges when booking_product created
   * NOTE: Called explicitly in booking creation APIs (no database trigger)
   */
  async initializeProductCharges(bookingProductId, effectiveRent, securityDeposit) {
    // Create rent charge
    await db.query(`
      INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
      VALUES ($1, 'rent', $2, 0)
    `, [bookingProductId, effectiveRent]);
    
    // Create security charge
    await db.query(`
      INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
      VALUES ($1, 'security', $2, 0)
    `, [bookingProductId, securityDeposit]);
  }
}
```

#### ProductLifecycleService.js

```javascript
class ProductLifecycleService {
  
  /**
   * Validate if product can be picked up
   * Requirements:
   * - Status = 'confirmed'
   * - Today <= booked_to
   * - Full security paid
   * NOTE: Validates status transition (no database trigger)
   */
  async validatePickupEligibility(bookingProductId) {
    // Returns: {eligible: true/false, reason, security_pending}
  }
  
  /**
   * Process product pickup
   * - Validate status transition (confirmed → in_progress)
   * - Update status, picked_up_at, picked_up_by
   * - Update booking status if needed
   * - Update booking date range if needed
   */
  async pickupProduct(bookingProductId, pickedUpBy) {
    // 1. Validate current status = 'confirmed'
    // 2. Update product status to 'in_progress'
    // 3. Set picked_up_at, picked_up_by
    // 4. Update booking status if all products picked up
    // 5. Recalculate booking dates
  }
  
  /**
   * Process product return
   * - Validate status transition (in_progress → completed)
   * - Calculate late fee if applicable (daily rate × days late)
   * - Add damage fee if provided (0 to security_amount)
   * - Update status, returned_at, returned_to
   */
  async returnProduct(bookingProductId, {lateFee, damageFee, notes}, returnedTo) {
    // 1. Validate status = 'in_progress'
    // 2. Calculate late fee from policy
    // 3. Add charges (late_fee, damage_fee) to product_charges
    // 4. Update product status to 'completed'
    // 5. Set returned_at, returned_to
    // 6. Update booking status if all products returned
  }
  
  /**
   * Process security refund or adjustment
   * Options:
   * - 'refund': Return money to customer
   * - 'adjust': Apply against outstanding dues
   */
  async processSecurityReturn(bookingProductId, action, recordedBy) {
    // 1. Get security paid amount
    // 2. Check balance due
    // 3. If balance > 0 and action='refund': 
    //    - Adjust portion against dues
    //    - Refund remainder
    // 4. If action='adjust': Full adjustment
  }
  
  /**
   * Update booking date range from products
   * NOTE: Called explicitly after product changes (no database trigger)
   */
  async updateBookingDateRange(bookingId) {
    const result = await db.query(`
      SELECT MIN(booked_from) as min_from, MAX(booked_to) as max_to
      FROM booking_products
      WHERE booking_id = $1 AND status NOT IN ('cancelled', 'exchanged')
    `, [bookingId]);
    
    await db.query(`
      UPDATE bookings 
      SET booked_from = $1, booked_to = $2
      WHERE id = $3
    `, [result.rows[0].min_from, result.rows[0].max_to, bookingId]);
  }
}
```

#### ExchangeService.js

```javascript
class ExchangeService {
  
  /**
   * Validate exchange eligibility
   * Requirements:
   * - Booking status: confirmed/in_progress/partially_completed
   * - Product status: confirmed (not picked up yet)
   * NOTE: Validates status (no database trigger)
   */
  async validateExchangeEligibility(bookingProductId) {
    // Returns: {eligible, reason, product}
  }
  
  /**
   * Exchange 1 old product for N new products
   * Logic:
   * 1. Validate old product status = 'confirmed'
   * 2. Calculate exchange_penalty = policy% of old_rent (based on days since product added)
   * 3. Check new products availability
   * 4. Add new products to booking (status=confirmed)
   * 5. Initialize charges for new products (call ChargeAccountingService.initializeProductCharges)
   * 6. Calculate downgrade_penalty = max(0, old_rent - (exchange_penalty + new_total_rent))
   * 7. Update old product status → 'exchanged'
   * 8. Keep old product charges (rent, security) due_amount INTACT (audit trail)
   *    NOTE: Exchanged product charges excluded from total_due but included in total_paid
   * 9. Add penalty charges to product_charges
   * 10. Record exchange history
   * 11. Update booking date range (call ProductLifecycleService.updateBookingDateRange)
   */
  async exchangeProduct(oldProductId, newProducts[], exchangedBy) {
    // newProducts: [{product_id, booked_from, booked_to, discount}]
    // Returns: {old_product_id, new_product_ids, penalties}
  }
}
```

#### CancellationService.js

```javascript
class CancellationService {
  
  /**
   * Validate cancellation eligibility
   * Returns max penalty based on policy (calculated from days since product added)
   * NOTE: Validates status (no database trigger)
   */
  async validateCancellationEligibility(bookingProductId) {
    // Returns: {eligible, max_penalty, policy}
  }
  
  /**
   * Cancel product
   * Logic:
   * 1. Validate product can be cancelled
   * 2. Calculate max penalty from policy (based on booking_product.created_at)
   * 3. Update status → 'cancelled'
   * 4. Set cancelled_at, cancellation_reason
   * 5. Keep charges (rent, security) due_amount INTACT (audit trail)
   *    NOTE: Cancelled product charges excluded from total_due but included in total_paid
   * 6. Add cancellation_penalty charge (0 to max_penalty)
   * 7. Calculate refund (rent_paid + security_paid)
   * 8. Record cancellation history
   * 9. Update booking status
   * 10. Update booking date range (call ProductLifecycleService.updateBookingDateRange)
   */
  async cancelProduct(bookingProductId, penaltyAmount, reason, cancelledBy) {
    // penaltyAmount: 0 to max_penalty (from policy)
    // Returns: {penalty_charged, refund_amount, requires_settlement}
  }
}
```

---

## 3. API ENDPOINTS

### 3.1 Payment & Financial APIs

```javascript
// Get complete payment summary
GET /api/bookings/:id/payment-summary
Response: {
  booking_id: number,
  booking_status: string,
  
  // Booking-level charges
  transport: {due, paid, pending},
  
  // Per-product charges
  products: [{
    product: {...},
    charges: {
      rent: {due, paid, pending},
      exchange_penalty: {due, paid, pending},
      downgrade_penalty: {due, paid, pending},
      cancellation_penalty: {due, paid, pending},
      late_fee: {due, paid, pending},
      damage_fee: {due, paid, pending},
      security: {due, paid, pending}
    }
  }],
  totals: {
    rent: {due, paid},
    transport: {due, paid},
    penalties: {due, paid},
    fees: {due, paid},
    security: {due, paid},
    grand_total_due: number,
    grand_total_paid: number,
    overpayment: number,
    final_discount: number,
    balance_due: number
  },
  transactions: [...],
  overpayment: number,
  final_discount: number
}

// Record payment (auto-applies in priority order)
POST /api/bookings/:id/payments
Body: {
  amount: number,
  method: string,
  notes: string
}
Response: {
  success: true,
  amount_paid: number,
  allocations: [{charge_id, charge_type, product_id, amount}],
  overpayment_added: number
}

// Process adjustment (security refund → dues)
POST /api/bookings/:id/adjustments
Body: {
  amount: number,
  notes: string
}
Response: {
  success: true,
  adjusted_amount: number,
  allocations: [...]
}

// Get balance due
GET /api/bookings/:id/balance
Response: {
  total_due: number,
  total_paid: number,
  overpayment: number,
  final_discount: number,
  balance_due: number,
  breakdown: {...}
}
```

### 3.2 Product Lifecycle APIs

```javascript
// Pickup product
POST /api/bookings/:id/products/:productId/pickup
Body: {}
Response: {
  success: true,
  message: "Product picked up successfully",
  product_id: number
}
Error Response: {
  error: "Full security deposit must be paid before pickup",
  details: {
    eligible: false,
    security_due: number,
    security_paid: number,
    security_pending: number
  }
}

// Return product
POST /api/bookings/:id/products/:productId/return
Body: {
  lateFee: number (optional),
  damageFee: number (optional, 0 to security_amount),
  notes: string (required if damageFee > 0)
}
Response: {
  success: true,
  message: "Product returned successfully",
  late_fee: number,
  damage_fee: number,
  security_refund_eligible: true
}

// Process security refund
POST /api/bookings/:id/products/:productId/security-refund
Body: {
  action: 'refund' | 'adjust'
}
Response: {
  success: true,
  refund_amount: number,
  adjusted_amount: number,
  total_security: number
}
```

### 3.3 Exchange APIs

```javascript
// Check exchange eligibility
GET /api/bookings/:id/products/:productId/exchange-eligibility
Response: {
  eligible: boolean,
  reason: string (if not eligible),
  product: {...}
}

// Exchange product
POST /api/bookings/:id/products/:productId/exchange
Body: {
  newProducts: [{
    product_id: number,
    booked_from: date,
    booked_to: date,
    discount: {
      type: 'percentage' | 'fixed',
      amount: number
    } (optional)
  }]
}
Response: {
  success: true,
  old_product_id: number,
  new_product_ids: [number],
  exchange_penalty: number,
  downgrade_penalty: number,
  old_rent: number,
  new_total_rent: number
}
```

### 3.4 Cancellation APIs

```javascript
// Get cancellation info (including max penalty)
GET /api/bookings/:id/products/:productId/cancellation-info
Response: {
  eligible: boolean,
  product: {...},
  max_penalty: number,
  policy: {...}
}

// Cancel product
POST /api/bookings/:id/products/:productId/cancel
Body: {
  penaltyAmount: number (0 to max_penalty),
  reason: string
}
Response: {
  success: true,
  product_id: number,
  penalty_charged: number,
  max_penalty: number,
  refund_amount: number,
  has_active_products: boolean,
  requires_settlement: boolean
}
```

### 3.5 Policy Management APIs

```javascript
// Get all active policies
GET /api/policies
Response: [{
  id: number,
  policy_key: string,
  policy_name: string,
  policy_type: string,
  value_type: string,
  value: number,
  days_from_booking_min: number | null,
  days_from_booking_max: number | null,
  is_active: boolean
}]

// Get applicable policy for specific scenario
GET /api/policies/applicable?type=exchange_penalty&booking_product_id=456
Response: {
  policy: {...},
  value: number,
  value_type: string,
  days_since_product_added: number,
  max_penalty: number (calculated based on rent)
}

// Create policy
POST /api/policies
Body: {
  policy_key: string,
  policy_name: string,
  policy_type: 'exchange_penalty' | 'cancellation_penalty' | 'late_fee' | 'transport_fee',
  value_type: 'percentage' | 'fixed',
  value: number,
  days_from_booking_min: number (optional),
  days_from_booking_max: number (optional),
  max_value: number (optional)
}
Response: {
  success: true,
  policy: {...}
}
Error Response: {
  error: "Date range overlaps with existing policy: Exchange Penalty (6-10 Days)",
  overlapping_policy: {...}
}

// Update policy
PUT /api/policies/:id
Body: {
  value: number,
  days_from_booking_min: number,
  days_from_booking_max: number,
  max_value: number,
  is_active: boolean
}
Response: {
  success: true,
  policy: {...}
}
Error Response: {
  error: "Date range overlaps with existing policy",
  overlapping_policy: {...}
}
```

---

## 4. POLICY FRAMEWORK

### 4.1 Policy Types & Configuration

| Policy Type | Value Type | Current Default | Time-Based | Configurable |
|-------------|-----------|----------------|------------|--------------|
| Exchange Penalty | Percentage | 10%/20%/30% (based on days) | ✅ Yes | ✅ Yes |
| Cancellation Penalty | Percentage | 10%/20%/30% (based on days) | ✅ Yes | ✅ Yes |
| Late Fee | Fixed | ₹200/day | ❌ No | ✅ Yes |
| Transport Fee | Fixed | ₹100 | ❌ No | ✅ Yes |

**Non-Policy Charges (Ad-hoc):**
- **Downgrade Penalty**: Calculated via formula: `max(0, old_rent - (exchange_penalty + new_total_rent))`
- **Damage Fee**: Entered manually at return time (0 to security_deposit amount)

### 4.2 Time-Based Policy Rules

Exchange and Cancellation penalties are calculated **per product** based on how many days have passed **since that specific product was added to the booking**:

**Formula:** `days_since_product_added = current_date - booking_product.created_at`

| Days Since Product Added | Exchange Penalty | Cancellation Penalty |
|--------------------------|-----------------|---------------------|
| 0-5 days | 10% of rent | 10% of rent |
| 6-10 days | 20% of rent | 20% of rent |
| 11+ days | 30% of rent | 30% of rent |

**Example:**
```
Booking created: Jan 1 with Product A (Product A created_at = Jan 1)
Product A exchanged on: Jan 5 for Product B
  → Exchange penalty for Product A: 4 days since added × 10% policy
  → Product B added (Product B created_at = Jan 5)
Cancel Product B on: Jan 8 (current_date)

Days since Product B added = Jan 8 - Jan 5 = 3 days
Cancellation policy applied: 10% (0-5 days range)

NOT 7 days from original booking creation!
```

**Why per-product timing?**
- ✅ Fair to customer - new products get their own timeline
- ✅ Exchange scenario - exchanged product penalty based on when it was added
- ✅ Per-product logic - consistent with exchange/cancel being product-level operations

**Calculation Logic:**
```javascript
// Example: Product added on Jan 5, today is Jan 12
const product = await getBookingProduct(productId);
const days_since_product_added = dateDiff(currentDate, product.created_at); // 7 days

// Query matching policy (only one will match due to non-overlapping ranges)
SELECT * FROM rental_policies
WHERE policy_type = 'exchange_penalty'
  AND is_active = TRUE
  AND (days_from_booking_min IS NULL OR ? >= days_from_booking_min)
  AND (days_from_booking_max IS NULL OR ? <= days_from_booking_max)
LIMIT 1;
// Pass days_since_product_added (7) to both parameters

// Result: 20% policy (6-10 days range)
```

**Overlap Prevention:**
Backend validates on policy creation/update:
```javascript
async function validateNoOverlap(policyType, minDays, maxDays, excludePolicyId = null) {
  // Check if any existing policy of same type has overlapping date range
  // Note: Days are measured from booking_product.created_at (when product was added)
  const overlapping = await db.query(`
    SELECT * FROM rental_policies
    WHERE policy_type = ?
      AND is_active = TRUE
      AND id != ?
      AND (
        -- New range overlaps with existing range
        (? IS NULL OR ? IS NULL OR days_from_booking_max IS NULL OR ? <= days_from_booking_max)
        AND (? IS NULL OR ? IS NULL OR days_from_booking_min IS NULL OR ? >= days_from_booking_min)
      )
  `, [policyType, excludePolicyId, minDays, minDays, minDays, maxDays, maxDays, maxDays]);
  
  if (overlapping.length > 0) {
    throw new Error(`Date range overlaps with existing policy: ${overlapping[0].policy_name}`);
  }
}
```

### 4.3 Policy Application Examples

#### Exchange Penalty (Time-Based)

```
Scenario 1: Exchange 5 days after product was added
Original booking: Jan 1 with Product A
Product A added: Jan 1 (booking_product.created_at)
Exchange Product A on: Jan 6
Days since Product A added: 5 days
Policy: 10% (0-5 days)
Old Product Rent: ₹5,000

Calculation:
exchange_penalty = 5000 × 0.10 = ₹500
```

```
Scenario 2: Exchange of already-exchanged product
Original booking: Jan 1 with Product A (Product A created_at = Jan 1)
First exchange on: Jan 5
  → Product A exchanged for Product B
  → Exchange penalty for Product A: 4 days (Jan 1-5) → 10% policy
  → Product B added (Product B created_at = Jan 5)
Second exchange on: Jan 20
  → Product B exchanged for Product C
  → Exchange penalty for Product B: 15 days (Jan 5-20) → 30% policy (11+ days)
Old Product (B) Rent: ₹5,000

Calculation for second exchange:
exchange_penalty = 5000 × 0.30 = ₹1,500

Note: The 15 days are counted from when Product B was added, 
NOT the 19 days from original booking!
```

#### Downgrade Penalty

```
Formula: max(0, old_rent - (exchange_penalty + new_total_rent))

Example:
old_rent = ₹5,000
exchange_penalty = ₹500
new_total_rent = ₹3,000

downgrade_penalty = max(0, 5000 - (500 + 3000))
                  = max(0, 1500)
                  = ₹1,500

Total customer pays: 500 + 1500 + 3000 = ₹5,000 (same as original)
```

#### Cancellation Penalty (Time-Based)

```
Scenario 1: Cancel 3 days after product was added
Booking created: Jan 17 with Product A (booking_product.created_at = Jan 17)
Cancel Product A on: Jan 20
Days since Product A added: 3 days
Policy: 10% (0-5 days)
Product Rent: ₹8,000

Max Penalty: 8000 × 0.10 = ₹800

UI shows: "Max penalty: ₹800"
Admin enters: ₹600 (can be 0 to 800)
Charged: ₹600
```

```
Scenario 2: Cancel 12 days after product was added
Booking created: Jan 8 with Product A (booking_product.created_at = Jan 8)
Cancel Product A on: Jan 20
Days since Product A added: 12 days
Policy: 30% (11+ days)
Product Rent: ₹8,000

Max Penalty: 8000 × 0.30 = ₹2,400

UI shows: "Max penalty: ₹2,400"
Admin enters: ₹2,000 (can be 0 to 2400)
Charged: ₹2,000
```

#### Late Fee

```
Policy: ₹200/day
Booking end date: Jan 20
Product returned: Jan 25
Days late: 5 days

Calculated: 5 × 200 = ₹1,000

Admin can adjust before confirming return
```

### 4.4 Admin UI for Policy Management

```
Settings → Rental Policies

┌─────────────────────────────────────────────┐
│ GLOBAL POLICIES                             │
├─────────────────────────────────────────────┤
│                                             │
│ Transport Fee                               │
│ └─ Default: [100] ₹ (editable per booking) │
│                                             │
│ Late Fee                                    │
│ └─ Rate: [200] ₹/day                       │
│                                             │
│ [Save Changes]                              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ TIME-BASED POLICIES                         │
├─────────────────────────────────────────────┤
│                                             │
│ Exchange Penalty Rules                      │
│ ┌───────────────────────────────────────┐  │
│ │ Within 5 days        [Active ✓]      │  │
│ │ ├─ Days: 0 to 5                      │  │
│ │ └─ Penalty: [10] %                   │  │
│ │                              [Edit]  │  │
│ ├───────────────────────────────────────┤  │
│ │ 6-10 days            [Active ✓]      │  │
│ │ ├─ Days: 6 to 10                     │  │
│ │ └─ Penalty: [20] %                   │  │
│ │                              [Edit]  │  │
│ ├───────────────────────────────────────┤  │
│ │ After 10 days        [Active ✓]      │  │
│ │ ├─ Days: 11+                         │  │
│ │ └─ Penalty: [30] %                   │  │
│ │                              [Edit]  │  │
│ └───────────────────────────────────────┘  │
│                                             │
│ [+ Add Exchange Rule]                       │
│                                             │
│ Cancellation Penalty Rules                  │
│ (Same structure as Exchange)                │
│                                             │
│ [Save All Changes]                          │
└─────────────────────────────────────────────┘

⚠️ Note: Date ranges cannot overlap. System validates on save.
    Days are counted from when the product was added (booking_product.created_at).
    Example: Product added Jan 1, exchange on Jan 8 = 7 days → 20% penalty.
    For exchanged products, new product gets its own timeline from when it was added.
```

---

### 4.5 Final Discount at Settlement

**Purpose:** Manual adjustment at final settlement to account for goodwill, negotiations, or special circumstances outside systematic calculations.

**When Applied:** ONLY at final settlement when:
- Booking is being completed (all products returned), OR
- Booking is being fully cancelled

**How It Works:**

#### Scenario 1: Customer Owes Money (Underpayment)

```
Total Due (all charges): ₹10,000
Total Paid: ₹8,000
Balance Due: ₹2,000 (customer owes us)

Admin enters Final Discount: ₹500
Final Amount to Collect from Customer: ₹1,500

Formula: Final Collection = Balance Due - Final Discount
         ₹1,500 = ₹2,000 - ₹500

Effect: Discount reduces what customer owes
```

#### Scenario 2: Customer Overpaid (We Owe Refund)

```
Total Due (all charges): ₹10,000  
Total Paid: ₹11,000
Overpayment: ₹1,000 (we owe customer)

Admin enters Final Discount: ₹300
Final Amount to Refund to Customer: ₹1,300

Formula: Final Refund = Overpayment + Final Discount
         ₹1,300 = ₹1,000 + ₹300

Effect: Discount INCREASES what customer gets back
```

#### Scenario 3: Perfectly Settled (No Balance)

```
Total Due: ₹10,000
Total Paid: ₹10,000
Balance: ₹0

Admin enters Final Discount: ₹200
Final Amount to Refund to Customer: ₹200

Formula: Final Refund = Final Discount
         ₹200 = ₹200

Effect: Discount given as pure refund
```

#### Implementation Logic

```javascript
/**
 * Calculate final settlement amount
 * @param {number} totalDue - Sum of all charges (rent, transport, penalties, fees, security)
 * @param {number} totalPaid - Sum of all payments
 * @param {number} finalDiscount - Optional discount at settlement (default 0)
 * @returns {Object} { action: 'collect'|'refund'|'none', amount: number }
 */
function calculateFinalSettlement(totalDue, totalPaid, finalDiscount = 0) {
  const rawBalance = totalDue - totalPaid;
  const finalAmount = rawBalance - finalDiscount;
  
  if (finalAmount > 0) {
    // Customer owes money
    return { 
      action: 'collect', 
      amount: finalAmount,
      discount_applied: finalDiscount
    };
  } else if (finalAmount < 0) {
    // We owe customer money (refund)
    return { 
      action: 'refund', 
      amount: Math.abs(finalAmount),
      discount_applied: finalDiscount
    };
  } else {
    // Perfectly settled (finalAmount = 0)
    return { 
      action: 'none', 
      amount: 0,
      discount_applied: finalDiscount
    };
  }
}
```

#### Database Update

```sql
-- Store final discount in bookings table
UPDATE bookings 
SET final_discount = ?,
    status = 'completed',
    updated_at = NOW()
WHERE id = ?;
```

#### API Endpoint

```javascript
// Apply final discount and complete booking
POST /api/bookings/:id/finalize
Body: {
  finalDiscount: number (optional, default 0)
}
Response: {
  success: true,
  settlement: {
    total_due: number,
    total_paid: number,
    raw_balance: number,
    final_discount: number,
    action: 'collect' | 'refund' | 'none',
    amount: number
  }
}
```

**Key Points:**
- ✅ Final discount ALWAYS benefits the customer
- ✅ Underpayment: Reduces what they owe
- ✅ Overpayment: Increases what they get back
- ✅ Applied only once at final settlement
- ✅ Optional field (defaults to 0)
- ✅ UI should show calculation preview before applying

---

## 5. FRONTEND CHANGES

### 5.1 Files to Cleanup (Remove Calculations)

#### Before → After

| File | Current Lines | After Cleanup | Changes |
|------|--------------|---------------|---------|
| `admin/bookings/[id]/page.tsx` | 1,889 | ~800 | Remove all local calculations |
| `salesman/order-details/[id]/page.tsx` | 6,388 | ~2,500 | Remove duplicate payment logic |
| `PaymentManagement.tsx` | 2,437 | ~1,000 | Use API for calculations |

**Total Lines Reduced**: 10,714 → 4,300 (60% reduction!)

### 5.2 API Integration Pattern

**❌ BEFORE (Bad - Scattered Calculations)**

```typescript
// admin/bookings/[id]/page.tsx - lines 1008-1060
const totalAmount = booking.total_amount;
const securityDeposit = products.reduce((sum, p) => 
  sum + parseFloat(p.security_deposit), 0); // Calculated locally!
const paidAmount = transactions.reduce((sum, t) => 
  t.type === 'payment' ? sum + t.amount : sum, 0); // Calculated locally!
const balance = totalAmount + securityDeposit - paidAmount; // Wrong formula!

// salesman/order-details/[id]/page.tsx - lines 2600-3100
// DUPLICATE of above logic
const totalRequired = totalAmount + securityDeposit; // Missing penalties!
const overpayment = paidAmount - totalRequired; // Wrong!
```

**✅ AFTER (Good - Single API Call)**

```typescript
// One API call, no local calculations
const { data: summary } = await fetch(`/api/bookings/${id}/payment-summary`);

// Use directly in UI:
<div>Total Due: ₹{summary.totals.grand_total_due}</div>
<div>Total Paid: ₹{summary.totals.grand_total_paid}</div>
<div>Balance Due: ₹{summary.totals.balance_due}</div>
<div>Overpayment: ₹{summary.overpayment}</div>

// Per-product charges
{summary.products.map(p => (
  <ChargeBreakdownCard 
    product={p.product}
    charges={p.charges}
  />
))}
```

### 5.3 New Components Required

#### 1. PickupProductModal.tsx

```typescript
interface PickupModalProps {
  bookingProductId: number;
  onSuccess: () => void;
}

// Features:
// - Show product details
// - Display pending dues (especially security)
// - Payment form if security unpaid
// - [Confirm Pickup] button
```

#### 2. ReturnProductModal.tsx

```typescript
interface ReturnModalProps {
  bookingProductId: number;
  onSuccess: () => void;
}

// Features:
// - Auto-calculate late fee (if late)
// - Damage assessment (0 to security_amount)
// - Notes field (required if damage > 0)
// - [Confirm Return] button
```

#### 3. SecurityRefundModal.tsx

```typescript
interface SecurityRefundProps {
  bookingProductId: number;
  securityAmount: number;
  balanceDue: number;
  onSuccess: () => void;
}

// Features:
// - Show security amount available
// - If balance_due > 0:
//   └─ Option 1: Refund ₹X, Adjust ₹Y
//   └─ Option 2: Adjust full ₹Z
// - If balance_due = 0:
//   └─ Refund full ₹X
// - [Confirm] button
```

#### 4. ChargeBreakdownCard.tsx

```typescript
interface ChargeBreakdownProps {
  product: any;
  charges: {
    rent: {due, paid, pending},
    transport: {due, paid, pending},
    // ... all 8 charge types
  };
}

// Features:
// - Expandable card per product
// - Shows all charges in grid
// - Color-coded (green=paid, red=pending)
// - Progress bars for visual clarity
```

#### 5. FinalSettlementModal.tsx

```typescript
interface SettlementProps {
  bookingId: number;
  onComplete: () => void;
}

// Features:
// - Calculate: remaining_due - security_refund - overpayment
// - If > 0: "Collect ₹X from customer"
// - If < 0: "Refund ₹X to customer"
// - Payment/refund form
// - [Complete Booking] button
```

### 5.4 UI Workflow Changes

**Booking Details Page (Admin/Salesman)**

```
┌──────────────────────────────────────────┐
│ Booking #123 - Customer Name             │
│ Status: In Progress                      │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ PRODUCTS                                 │
├──────────────────────────────────────────┤
│ Product A (Code: L001)          ✅ Picked │
│ Status: In Progress                      │
│ Dates: 15 Jan - 20 Jan                  │
│ [Return Product] [Exchange] [Cancel]     │
│                                          │
│ Product B (Code: S002)                   │
│ Status: Confirmed                        │
│ Dates: 15 Jan - 20 Jan                  │
│ [Pick Up] [Exchange] [Cancel]            │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ PAYMENT SUMMARY (from API)               │
├──────────────────────────────────────────┤
│ Grand Total Due: ₹18,900                 │
│ Total Paid: ₹18,200                      │
│ Balance Due: ₹700                        │
│                                          │
│ [Record Payment]                         │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ CHARGE BREAKDOWN                         │
├──────────────────────────────────────────┤
│ ▼ Product A                              │
│   Rent: ₹5,000 (Paid ✅)                │
│   Security: ₹3,000 (Paid ✅)            │
│   Late Fee: ₹200 (Pending 🔴)          │
│                                          │
│ ▼ Product B                              │
│   Rent: ₹4,200 (Paid ✅)                │
│   Security: ₹6,000 (Paid ✅)            │
│   Exchange Penalty: ₹500 (Pending 🔴)   │
└──────────────────────────────────────────┘
```

---

## 6. MIGRATION ASSESSMENT

### 6.1 Current vs New System

| Aspect | Current System | New System |
|--------|---------------|------------|
| Financial Tracking | Booking-level aggregates | Per-product, per-charge |
| Calculations | Frontend (duplicated 6+ places) | Backend (single source) |
| Product Status | 3 states | 6 states |
| Payment Order | Ad-hoc | Systematic (1-8) |
| Policies | Hardcoded/JSON settings | Database-driven |
| Overpayment | Calculated on-fly | Tracked in DB |
| Lifecycle | Manual tracking | Automated (pickup/return) |

### 6.2 Migration Options

#### Option A: Gradual Migration (8-10 weeks)

```
Phase 1: Schema (Week 1-2)
├─ Add new tables
├─ Add new columns
├─ Create triggers
└─ Test on dev

Phase 2: Backend (Week 3-5)
├─ Implement services
├─ Create APIs
├─ Unit tests
└─ Dual code paths (old + new)

Phase 3: Frontend (Week 6-7)
├─ New components
├─ Replace calculations with APIs
├─ Update existing pages
└─ E2E tests

Phase 4: Data Migration (Week 8)
├─ Script: old → new
├─ Validate calculations
└─ Manual review

Phase 5: Cleanup (Week 9-10)
├─ Remove legacy columns
├─ Remove dual paths
└─ Documentation
```

**Pros**: Safe, both systems coexist  
**Cons**: Complex, maintain two systems temporarily

#### Option B: Fresh Start (2-3 weeks) ⭐ RECOMMENDED

```
Requirements:
1. Export current active bookings (PDF/Excel)
2. Complete all in-progress bookings manually
3. Close accounting for current system
4. Archive old database
5. Deploy new system

Timeline:
Week 1: Prepare migration, close old bookings
Week 2: Deploy new schema + backend
Week 3: Deploy frontend, test, go live
```

**Pros**: Clean, simple, fast  
**Cons**: Cannot import historical bookings

### 6.3 Recommendation

**START FRESH IF:**
- ✅ Less than 50 active bookings
- ✅ Can close existing bookings within 1 week
- ✅ Historical data not critical for operations
- ✅ Willing to archive old system

**GRADUAL MIGRATION IF:**
- ❌ More than 100 active bookings
- ❌ Cannot interrupt operations
- ❌ Need historical data integration
- ❌ Large backlog of incomplete bookings

### 6.4 Data Validation (If Migrating)

```sql
-- Validate: Total due matches
SELECT 
  b.id,
  b.total_amount + b.security_deposit as old_total,
  (SELECT SUM(due_amount) FROM product_charges pc 
   JOIN booking_products bp ON pc.booking_product_id = bp.id 
   WHERE bp.booking_id = b.id) as new_total
FROM bookings b
HAVING old_total != new_total;
-- Should return 0 rows

-- Validate: Paid amount matches
SELECT 
  b.id,
  b.paid_amount as old_paid,
  (SELECT SUM(paid_amount) FROM product_charges pc 
   JOIN booking_products bp ON pc.booking_product_id = bp.id 
   WHERE bp.booking_id = b.id) as new_paid
FROM bookings b
HAVING old_paid != new_paid;
-- Should return 0 rows
```

---

## 7. IMPLEMENTATION CHECKLIST

### Phase 1: Database ✅

- [ ] Execute schema migration SQL
- [ ] Create all new tables
- [ ] Add triggers and constraints
- [ ] Insert default policies
- [ ] Create indexes
- [ ] Test on dev database

### Phase 2: Backend ✅

- [ ] Implement ChargeAccountingService
- [ ] Implement ProductLifecycleService
- [ ] Implement ExchangeService
- [ ] Implement CancellationService
- [ ] Create all API endpoints
- [ ] Write unit tests (>80% coverage)
- [ ] Integration tests

### Phase 3: Frontend ✅

- [ ] Create new components (5 listed)
- [ ] Remove calculation logic from:
  - [ ] admin/bookings/[id]/page.tsx
  - [ ] salesman/order-details/[id]/page.tsx
  - [ ] PaymentManagement.tsx
- [ ] Integrate API calls
- [ ] Update ProductExchange component
- [ ] Update BookingCancellation component
- [ ] E2E tests

### Phase 4: Policies ✅

- [ ] Admin UI for policy management
- [ ] Test policy application
- [ ] Document policy configuration
- [ ] Train admin on policy settings

### Phase 5: Testing ✅

- [ ] Complete booking lifecycle test
- [ ] Exchange workflow test
- [ ] Cancellation workflow test
- [ ] Payment application test
- [ ] Edge cases (overpayment, partial payments, etc.)
- [ ] Performance testing

### Phase 6: Deployment ✅

- [ ] Backup current database
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Monitor for errors
- [ ] User training
- [ ] Documentation

---

## 8. ARCHITECTURAL BENEFITS

### Before vs After Comparison

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Lines of Code** | 10,714 | 4,300 | -60% |
| **Calculation Logic Locations** | 6+ places | 1 place | Single source of truth |
| **Product States** | 3 | 6 | Better lifecycle tracking |
| **Charge Tracking** | Aggregated | Per-product, per-type | Granular control |
| **Payment Application** | Ad-hoc | Systematic (1-8 priority) | Predictable |
| **Overpayment** | Calculated | Tracked | Accurate |
| **Policies** | Hardcoded | Database-driven | Flexible |
| **Frontend Calculations** | Yes (duplicated) | No | API-driven |
| **Financial Accuracy** | Risk of inconsistency | Guaranteed consistent | Reliable |
| **Maintainability** | Low (scattered logic) | High (centralized) | Easy updates |

### Key Improvements

1. **✅ Single Source of Truth**: All financial calculations in backend
2. **✅ Immutable Due Amounts**: `due_amount` never changes (auditability)
3. **✅ Clear Payment Flow**: Systematic application in priority order
4. **✅ Policy-Driven**: Easy to adjust penalties/fees without code changes
5. **✅ Complete Audit Trail**: History tables track all changes
6. **✅ Type Safety**: Enums prevent invalid states
7. **✅ Scalable**: Add new charge types without schema changes
8. **✅ Clean Frontend**: UI displays data, doesn't calculate it

---

## 9. CONCLUSION

### Ready for Implementation ✅

This blueprint provides:
- ✅ Complete database schema with constraints
- ✅ Backend services with exact business logic
- ✅ API endpoints with request/response formats
- ✅ Policy framework integration
- ✅ Frontend cleanup strategy
- ✅ Migration assessment and recommendation

### Critical Success Factors

1. **Database First**: Implement schema before services
2. **Test Services**: Unit tests before API integration
3. **Gradual Frontend**: Replace one page at a time
4. **Data Validation**: Verify calculations match during migration
5. **User Training**: Teach new workflow (pickup/return/settle)

### Estimated Timeline

- **Fresh Start**: 2-3 weeks
- **Gradual Migration**: 8-10 weeks

### Recommendation

**Start Fresh** if possible. The new system is fundamentally different in architecture. Gradual migration requires maintaining dual code paths which adds complexity without significant benefit unless you have hundreds of active bookings.

---

**🎯 All logic documented. Zero ambiguity. Ready for implementation.**

---

## 10. KEY ARCHITECTURAL DECISIONS

This blueprint incorporates the following critical architectural decisions:

1. **✅ All amounts are integers (INT)** - No DECIMAL types for financial calculations, ensures precision
2. **✅ Transport tracked at booking level** - `bookings.transport_charge`, NOT in `product_charges` table
3. **✅ No availability calendar table** - Uses date range overlap queries on `booking_products` (7x more efficient)
4. **✅ Time-based policies** - Penalties calculated from `booking_product.created_at` (per-product timeline, not booking date)
5. **✅ Global policies only** - No per-category overrides, simpler policy management
6. **✅ Transactions are booking-level** - Payment application handled by backend, not tied to specific products
7. **✅ Per-product charge tracking** - Granular `product_charges` table for rent, penalties, fees, security (7 types)

---

*Document Version: 2.0*  
*Last Updated: January 2026*  
*Status: Approved for Implementation*
