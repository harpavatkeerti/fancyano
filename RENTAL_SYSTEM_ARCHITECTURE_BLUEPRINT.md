# 🏗️ RENTAL BOOKING SYSTEM - COMPLETE ARCHITECTURE BLUEPRINT

**Version:** 1.0  
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
  transport_charge DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Final discount (optional, applied at finalization, default = 0)
  final_discount DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Overpayment tracking (excess payments after all dues covered)
  overpayment DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Legacy fields (DEPRECATED - will be removed after migration)
  total_amount DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'DEPRECATED: Use product_charges',
  security_deposit DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'DEPRECATED: Use product_charges',
  paid_amount DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'DEPRECATED: Use product_charges',
  discount_amount DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'DEPRECATED: Use final_discount',
  discount_type ENUM('percentage', 'fixed') COMMENT 'DEPRECATED',
  other_charges DECIMAL(10, 2) DEFAULT 0.00 COMMENT 'DEPRECATED: Use transport_charge',
  
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
  rent_per_day DECIMAL(10, 2) NOT NULL,
  days_booked INT NOT NULL,
  total_rent DECIMAL(10, 2) NOT NULL, -- rent_per_day × days_booked
  security_deposit DECIMAL(10, 2) NOT NULL,
  
  -- Per-product discount (optional, at creation only)
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  discount_type ENUM('percentage', 'fixed') DEFAULT NULL,
  effective_rent DECIMAL(10, 2) NOT NULL, -- total_rent - discount
  
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
  
  -- Charge category (8 types - payment priority order)
  charge_type ENUM(
    'rent',                  -- #1: Rental charge (per product)
    'transport',             -- #2: Transport fee (booking-level, tracked per product)
    'exchange_penalty',      -- #3: Penalty for exchanging product
    'downgrade_penalty',     -- #4: Penalty when new product cheaper than old
    'cancellation_penalty',  -- #5: Penalty for cancelling product
    'late_fee',              -- #6: Fee for delayed return
    'damage_fee',            -- #7: Fee for damaged product
    'security'               -- #8: Security deposit
  ) NOT NULL,
  
  -- Financial tracking
  -- due_amount: IMMUTABLE - what customer owes for this charge
  -- paid_amount: MUTABLE - what customer has paid towards this charge
  due_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  
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
  
  -- What this payment applies to (optional, for tracking)
  charge_category ENUM(
    'rent', 'transport', 'exchange_penalty', 'downgrade_penalty',
    'cancellation_penalty', 'late_fee', 'damage_fee', 'security'
  ) NULL,
  
  -- Link to specific product (NULL if applies to multiple products)
  booking_product_id INT NULL,
  
  -- Payment details
  amount DECIMAL(10, 2) NOT NULL,
  method VARCHAR(50) NULL COMMENT 'Cash, UPI, Card, etc.',
  
  -- Notes and audit
  notes TEXT,
  recorded_by VARCHAR(100),
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Legacy fields (DEPRECATED)
  transaction_type VARCHAR(50) NULL COMMENT 'DEPRECATED: Use charge_category',
  payment_method VARCHAR(50) NULL COMMENT 'DEPRECATED: Use method',
  
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_product_id) REFERENCES booking_products(id) ON DELETE SET NULL,
  
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
  old_rent DECIMAL(10, 2) NOT NULL,
  
  -- New products added in exchange (JSON arrays)
  new_product_ids JSON NOT NULL,
  new_booking_product_ids JSON NOT NULL,
  new_total_rent DECIMAL(10, 2) NOT NULL,
  
  -- Charges generated
  exchange_penalty DECIMAL(10, 2) NOT NULL,
  downgrade_penalty DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  
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
  rent_to_refund DECIMAL(10, 2) NOT NULL,
  security_to_refund DECIMAL(10, 2) NOT NULL,
  cancellation_penalty DECIMAL(10, 2) NOT NULL,
  penalty_waived DECIMAL(10, 2) DEFAULT 0.00,
  
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
    'downgrade_penalty', 
    'cancellation_penalty',
    'late_fee',
    'transport_fee',
    'damage_fee'
  ) NOT NULL,
  
  -- Policy value
  value_type ENUM('percentage', 'fixed', 'daily_rate') NOT NULL,
  value DECIMAL(10, 2) NOT NULL,
  
  -- Scope (global or per-product-category)
  scope ENUM('global', 'product_category') DEFAULT 'global',
  product_category VARCHAR(100) NULL,
  
  -- Constraints
  min_value DECIMAL(10, 2) DEFAULT 0.00,
  max_value DECIMAL(10, 2) NULL,
  
  -- Active status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  
  INDEX idx_policy_key (policy_key),
  INDEX idx_policy_type (policy_type),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default policies
INSERT INTO rental_policies (policy_key, policy_name, policy_type, value_type, value, max_value) VALUES
  ('exchange_penalty_default', 'Default Exchange Penalty', 'exchange_penalty', 'percentage', 10.00, 50.00),
  ('cancellation_penalty_default', 'Default Cancellation Penalty', 'cancellation_penalty', 'percentage', 20.00, 100.00),
  ('late_fee_default', 'Default Late Fee', 'late_fee', 'daily_rate', 100.00, NULL),
  ('transport_fee_default', 'Default Transport Fee', 'transport_fee', 'fixed', 500.00, NULL);
```

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

ALTER TABLE product_charges ADD CONSTRAINT chk_charge_amounts 
  CHECK (due_amount >= 0 AND paid_amount >= 0 AND paid_amount <= due_amount + 0.01);

ALTER TABLE booking_products ADD CONSTRAINT chk_rent_values 
  CHECK (rent_per_day > 0 AND days_booked > 0 AND total_rent > 0 AND effective_rent >= 0);

-- Discount constraints
ALTER TABLE booking_products ADD CONSTRAINT chk_product_discount
  CHECK (
    (discount_type IS NULL AND discount_amount = 0) OR
    (discount_type IS NOT NULL AND discount_amount >= 0)
  );
```

#### Triggers

```sql
-- Auto-calculate booking date range from products
DELIMITER //
CREATE TRIGGER trg_update_booking_dates
AFTER INSERT ON booking_products
FOR EACH ROW
BEGIN
  UPDATE bookings 
  SET 
    booked_from = (
      SELECT MIN(booked_from) FROM booking_products WHERE booking_id = NEW.booking_id
    ),
    booked_to = (
      SELECT MAX(booked_to) FROM booking_products WHERE booking_id = NEW.booking_id
    )
  WHERE id = NEW.booking_id;
END//
DELIMITER ;

-- Initialize product charges on product creation
DELIMITER //
CREATE TRIGGER trg_init_product_charges
AFTER INSERT ON booking_products
FOR EACH ROW
BEGIN
  -- Create rent charge
  INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
  VALUES (NEW.id, 'rent', NEW.effective_rent, 0.00);
  
  -- Create security charge
  INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
  VALUES (NEW.id, 'security', NEW.security_deposit, 0.00);
END//
DELIMITER ;

-- Prevent invalid status changes
DELIMITER //
CREATE TRIGGER trg_validate_product_status_change
BEFORE UPDATE ON booking_products
FOR EACH ROW
BEGIN
  -- Cannot change status of exchanged/cancelled/completed products
  IF OLD.status IN ('exchanged', 'cancelled', 'completed') AND NEW.status != OLD.status THEN
    SIGNAL SQLSTATE '45000' 
    SET MESSAGE_TEXT = 'Cannot change status of exchanged/cancelled/completed products';
  END IF;
  
  -- in_progress can only come from confirmed
  IF NEW.status = 'in_progress' AND OLD.status != 'confirmed' THEN
    SIGNAL SQLSTATE '45000' 
    SET MESSAGE_TEXT = 'Product must be confirmed before pickup';
  END IF;
  
  -- completed can only come from in_progress
  IF NEW.status = 'completed' AND OLD.status != 'in_progress' THEN
    SIGNAL SQLSTATE '45000' 
    SET MESSAGE_TEXT = 'Product must be in progress before return';
  END IF;
END//
DELIMITER ;
```

---

### 1.3 Indexes for Performance

```sql
-- Composite indexes for common queries
CREATE INDEX idx_booking_product_status_dates 
  ON booking_products(booking_id, status, booked_from, booked_to);

CREATE INDEX idx_product_availability 
  ON booking_products(product_id, status, booked_from, booked_to)
  WHERE status IN ('confirmed', 'in_progress');

CREATE INDEX idx_pending_pickups 
  ON booking_products(status, booked_from)
  WHERE status = 'confirmed';

CREATE INDEX idx_pending_returns 
  ON booking_products(status, booked_to)
  WHERE status = 'in_progress';

-- Financial queries
CREATE INDEX idx_unpaid_charges 
  ON product_charges(booking_product_id, charge_type, due_amount, paid_amount);

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

1. **Rent**: Product A → Product B → Product C → ...
2. **Transport**: Booking-level fee
3. **Exchange Penalties**: Product A → Product B → ...
4. **Downgrade Penalties**: Product A → Product B → ...
5. **Cancellation Penalties**: Product A → Product B → ...
6. **Late Fees**: Product A → Product B → ...
7. **Damage Fees**: Product A → Product B → ...
8. **Securities**: Product A → Product B → ...
9. **Overpayment**: Any remaining amount

**Key Points**:
- `due_amount` is IMMUTABLE (set at charge creation)
- `paid_amount` is MUTABLE (increases with payments/adjustments)
- Pending = `due_amount - paid_amount`
- Adjustment transaction increases `paid_amount` WITHOUT money changing hands

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
    // - Per-product charge breakdown (all 8 categories)
    // - Totals (grand_total_due, grand_total_paid, balance_due)
    // - Overpayment amount
    // - Final discount
    // - Transaction history
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
   */
  async validatePickupEligibility(bookingProductId) {
    // Returns: {eligible: true/false, reason, security_pending}
  }
  
  /**
   * Process product pickup
   * - Update status: confirmed → in_progress
   * - Record picked_up_at, picked_up_by
   * - Update booking status if needed
   */
  async pickupProduct(bookingProductId, pickedUpBy) {
    // Validates then updates
  }
  
  /**
   * Process product return
   * - Calculate late fee if applicable (daily rate × days late)
   * - Add damage fee if provided (0 to security_amount)
   * - Update status: in_progress → completed
   * - Record returned_at, returned_to
   */
  async returnProduct(bookingProductId, {lateFee, damageFee, notes}, returnedTo) {
    // 1. Validate status = in_progress
    // 2. Calculate late fee from policy
    // 3. Add charges (late_fee, damage_fee)
    // 4. Update product status
    // 5. Update booking status
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
   */
  async validateExchangeEligibility(bookingProductId) {
    // Returns: {eligible, reason, product}
  }
  
  /**
   * Exchange 1 old product for N new products
   * Logic:
   * 1. Calculate exchange_penalty = policy% of old_rent
   * 2. Check new products availability
   * 3. Add new products to booking (status=confirmed)
   * 4. Calculate downgrade_penalty = max(0, old_rent - (exchange_penalty + new_total_rent))
   * 5. Update old product status → exchanged
   * 6. Set old product charges (rent, security) due=0
   * 7. Add penalty charges
   * 8. Record exchange history
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
   * Returns max penalty based on policy
   */
  async validateCancellationEligibility(bookingProductId) {
    // Returns: {eligible, max_penalty, policy}
  }
  
  /**
   * Cancel product
   * Logic:
   * 1. Update status → cancelled
   * 2. Set charges (rent, security) due=0
   * 3. Add cancellation_penalty charge (0 to max_penalty)
   * 4. Record penalty_waived amount
   * 5. Calculate refund (rent_paid + security_paid)
   * 6. Record cancellation history
   * 7. Update booking status
   */
  async cancelProduct(bookingProductId, penaltyAmount, reason, cancelledBy) {
    // penaltyAmount: 0 to max_penalty (from policy)
    // Returns: {penalty_charged, penalty_waived, refund_amount, requires_settlement}
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
  products: [{
    product: {...},
    charges: {
      rent: {due, paid, pending},
      transport: {due, paid, pending},
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
  penalty_waived: number,
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
  scope: string,
  product_category: string,
  max_value: number,
  is_active: boolean
}]

// Create policy
POST /api/policies
Body: {
  policy_key: string,
  policy_name: string,
  policy_type: string,
  value_type: string,
  value: number,
  scope: 'global' | 'product_category',
  product_category: string (if scope=product_category),
  min_value: number,
  max_value: number
}

// Update policy
PUT /api/policies/:id
Body: {
  value: number,
  max_value: number,
  is_active: boolean
}
```

---

## 4. POLICY FRAMEWORK

### 4.1 Policy Types & Configuration

| Policy Type | Value Type | Current Default | Configurable | Per-Category |
|-------------|-----------|----------------|--------------|--------------|
| Exchange Penalty | Percentage | 10% (max 50%) | ✅ Yes | ✅ Yes |
| Cancellation Penalty | Percentage | 20% (max 100%) | ✅ Yes | ✅ Yes |
| Late Fee | Daily Rate | ₹100/day | ✅ Yes | ✅ Yes |
| Transport Fee | Fixed | ₹500 | ✅ Yes | ❌ Booking-level |
| Downgrade Penalty | Calculated | Auto (formula) | ❌ No | ❌ No |
| Damage Fee | Manual Entry | N/A | ❌ No | ❌ No |

### 4.2 Policy Application Examples

#### Exchange Penalty

```
Policy: 10% of rent, max 50%
Old Product: Rent = ₹5,000

Calculation:
exchange_penalty = min(5000 × 0.10, 50% × 5000)
                 = min(500, 2500)
                 = ₹500

Admin can adjust: ₹0 to ₹2,500
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

#### Cancellation Penalty

```
Policy: 20% of rent, max 100%
Product: Rent = ₹8,000

Max Penalty: min(8000 × 0.20, 8000)
           = ₹1,600

UI shows: "Max penalty: ₹1,600"
Admin enters: ₹1,200 (can be 0 to 1600)
Waived: ₹400
```

#### Late Fee

```
Policy: ₹100/day
Product returned: 5 days late

Calculated: 5 × 100 = ₹500

Admin can adjust before confirming return
```

### 4.3 Admin UI for Policy Management

```
Settings → Rental Policies

┌─────────────────────────────────────────────┐
│ GLOBAL POLICIES                             │
├─────────────────────────────────────────────┤
│                                             │
│ Exchange Penalty                            │
│ ├─ Type: [Percentage ▼]                    │
│ ├─ Value: [10] %                           │
│ └─ Max: [50] % (cap)                       │
│                                             │
│ Cancellation Penalty                        │
│ ├─ Type: [Percentage ▼]                    │
│ ├─ Value: [20] %                           │
│ └─ Max: [100] %                            │
│                                             │
│ Late Fee                                    │
│ ├─ Type: [Daily Rate ▼]                   │
│ └─ Value: [100] ₹/day                      │
│                                             │
│ Transport Fee                               │
│ └─ Default: [500] ₹                        │
│    (editable per booking)                   │
│                                             │
│ [Save Changes]                              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ PRODUCT CATEGORY OVERRIDES                  │
├─────────────────────────────────────────────┤
│ [+ Add Category Override]                   │
│                                             │
│ Lehenga                              [Edit] │
│ ├─ Exchange: 15% (max 60%)                 │
│ └─ Late Fee: ₹150/day                      │
│                                             │
│ Sherwani                             [Edit] │
│ └─ Late Fee: ₹120/day                      │
└─────────────────────────────────────────────┘
```

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

*Document Version: 1.0*  
*Last Updated: January 2026*  
*Status: Approved for Implementation*
