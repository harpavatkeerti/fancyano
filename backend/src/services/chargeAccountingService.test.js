const chargeAccountingService = require('../services/chargeAccountingService');
const pool = require('../database/connection');

describe('ChargeAccountingService', () => {
  let testBookingId;
  let testProductIds = [];

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create test booking
      const bookingResult = await client.query(
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, booked_from, booked_to, status, transport_charge, transport_paid)
         VALUES ('Test Customer', '1234567890', CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 100, 0)
         RETURNING id`
      );
      testBookingId = bookingResult.rows[0].id;

      // Create test product
      const productResult = await client.query(
        `INSERT INTO products (name, code, category, size, rent, security_deposit)
         VALUES ('Test Product', 'TEST001', 'Test', 'M', 500, 1000)
         RETURNING id`
      );
      const productId = productResult.rows[0].id;

      // Create booking_products
      const bp1 = await client.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 2500, 1000, 2500)
         RETURNING id`,
        [testBookingId, productId]
      );
      testProductIds.push(bp1.rows[0].id);

      const bp2 = await client.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 1500, 1000, 1500)
         RETURNING id`,
        [testBookingId, productId]
      );
      testProductIds.push(bp2.rows[0].id);

      // Initialize charges
      await chargeAccountingService.initializeProductCharges(testProductIds[0], 2500, 1000, client);
      await chargeAccountingService.initializeProductCharges(testProductIds[1], 1500, 1000, client);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    // Cleanup in proper order (respecting foreign key constraints)
    // History tables must be deleted before booking_products
    await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM booking_cancellation_history WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM booking_exchange_history WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM product_charges WHERE booking_product_id = ANY($1)', [testProductIds]);
    await pool.query('DELETE FROM booking_products WHERE id = ANY($1)', [testProductIds]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM products WHERE code LIKE $1', ['TEST%']); // Clean all TEST products
    testProductIds = [];
  });

  afterAll(async () => {
    // pool.end() handled by global teardown
  });

  describe('getPaymentSummary', () => {
    // Test: Returns a complete financial summary with all charges, payments, and totals for a booking
    test('should return complete payment summary', async () => {
      const summary = await chargeAccountingService.getPaymentSummary(testBookingId);

      expect(summary.booking_id).toBe(testBookingId);
      expect(summary.products).toHaveLength(2);
      expect(summary.charges.rent.due).toBe(4000); // 2500 + 1500
      expect(summary.charges.security.due).toBe(2000); // 1000 + 1000
      expect(summary.charges.transport.due).toBe(100);
      expect(summary.totals.total_due).toBe(6100); // 4000 + 2000 + 100
      expect(summary.totals.total_paid).toBe(0);
      expect(summary.totals.balance).toBe(6100);
    });

    // Test: Excludes due amounts from exchanged products but preserves audit trail for paid amounts
    test('should exclude exchanged products from due calculations', async () => {
      // Mark first product as exchanged
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['exchanged', testProductIds[0]]
      );

      const summary = await chargeAccountingService.getPaymentSummary(testBookingId);

      // Should only include second product (1500 rent + 1000 security)
      expect(summary.charges.rent.due).toBe(1500);
      expect(summary.charges.security.due).toBe(1000);
      expect(summary.totals.total_due).toBe(2600); // 1500 + 1000 + 100 transport
    });

    // Test: Includes paid amounts from cancelled products in total_paid for audit purposes
    test('should include paid amounts from cancelled products', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Pay some rent on first product, then cancel it
        await client.query(
          'UPDATE product_charges SET paid_amount = 1000 WHERE booking_product_id = $1 AND charge_type = $2',
          [testProductIds[0], 'rent']
        );
        await client.query(
          'UPDATE booking_products SET status = $1 WHERE id = $2',
          ['cancelled', testProductIds[0]]
        );

        await client.query('COMMIT');

        const summary = await chargeAccountingService.getPaymentSummary(testBookingId);

        // Paid amount should include payment from cancelled product
        expect(summary.charges.rent.paid).toBe(1000);
        // But due should not include cancelled product
        expect(summary.charges.rent.due).toBe(1500); // Only second product
      } finally {
        client.release();
      }
    });

    // Test: Throws error when requesting summary for a non-existent booking ID
    test('should throw error for non-existent booking', async () => {
      await expect(chargeAccountingService.getPaymentSummary(999999))
        .rejects.toThrow('Booking not found');
    });
  });

  describe('applyPayment', () => {
    test('should apply payment to rent first (priority 1) — proportionally', async () => {
      const result = await chargeAccountingService.applyPayment(
        testBookingId,
        2000, // 50% of total rent (4000) — meets minimum
        'Cash',
        'test-user',
        'Partial payment'
      );

      expect(result.total_applied).toBe(2000);
      // Proportional: 2500/4000 * 2000 = 1250, 1500/4000 * 2000 = 750
      expect(result.breakdown).toHaveLength(2);
      expect(result.breakdown.every(b => b.category === 'rent')).toBe(true);

      // Verify proportional split on charges
      const charge0 = await pool.query(
        'SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[0], 'rent']
      );
      const charge1 = await pool.query(
        'SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[1], 'rent']
      );
      expect(charge0.rows[0].paid_amount).toBe(1250);
      expect(charge1.rows[0].paid_amount).toBe(750);
    });

    // Test: After rent is fully paid, applies remaining payment to transport (Priority 2)
    test('should apply to transport after rent is paid (priority 2)', async () => {
      // Pay full rent (4000) + some transport (100)
      const result = await chargeAccountingService.applyPayment(
        testBookingId,
        4100,
        'Cash',
        'test-user',
        'Payment'
      );

      // Proportional rent: 2 entries + 1 transport
      expect(result.breakdown).toHaveLength(3);
      const rentApps = result.breakdown.filter(b => b.category === 'rent');
      const transportApps = result.breakdown.filter(b => b.category === 'transport');
      expect(rentApps).toHaveLength(2);
      expect(transportApps).toHaveLength(1);
      expect(transportApps[0].amount).toBe(100);

      // Verify transport updated
      const booking = await pool.query(
        'SELECT transport_paid FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].transport_paid).toBe(100);
    });

    // Test: After rent and transport are paid, applies remaining payment to penalties (Priority 3)
    test('should apply to penalties after rent and transport (priority 3)', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Add exchange penalty
        await chargeAccountingService.addCharge(
          testProductIds[0],
          'exchange_penalty',
          500,
          'test_policy',
          'Test penalty',
          client
        );

        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // Pay rent (4000) + transport (100) + partial penalty (200)
      const result = await chargeAccountingService.applyPayment(
        testBookingId,
        4300,
        'Cash',
        'test-user',
        'Payment'
      );

      // Should have applied to rent, transport, then penalty
      const penaltyApp = result.breakdown.find(a => a.category === 'penalties');
      expect(penaltyApp).toBeDefined();
      expect(penaltyApp.amount).toBe(200);
    });

    // Test: After rent, transport, and penalties are paid, applies remaining payment to fees (Priority 4)
    test('should apply to fees after penalties (priority 4)', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Add late fee
        await chargeAccountingService.addCharge(
          testProductIds[0],
          'late_fee',
          300,
          'late_policy',
          'Late return',
          client
        );

        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // Pay everything up to fees: rent (4000) + transport (100) + partial fee (150)
      const result = await chargeAccountingService.applyPayment(
        testBookingId,
        4250,
        'Cash',
        'test-user',
        'Payment'
      );

      const feeApp = result.breakdown.find(a => a.category === 'fees');
      expect(feeApp).toBeDefined();
      expect(feeApp.amount).toBe(150);
    });

    // Test: After rent, transport, penalties, and fees are paid, applies remaining payment to security (Priority 5)
    test('should apply to security after fees (priority 5)', async () => {
      // Pay rent (4000) + transport (100) + partial security (500)
      const result = await chargeAccountingService.applyPayment(
        testBookingId,
        4600,
        'Cash',
        'test-user',
        'Payment'
      );

      const securityApp = result.breakdown.find(a => a.category === 'security');
      expect(securityApp).toBeDefined();
      expect(securityApp.amount).toBe(500);
    });

    // Test: Payment exceeding outstanding balance is rejected (hard cap)
    test('should reject payment exceeding outstanding balance', async () => {
      // Try to pay more than total due: rent (4000) + transport (100) + security (2000) = 6100
      await expect(
        chargeAccountingService.applyPayment(
          testBookingId,
          6600, // 500 more than total due
          'Cash',
          'test-user',
          'Payment with excess'
        )
      ).rejects.toThrow('exceeds outstanding balance');
    });

    // Test: Verifies strict priority order - payment only goes to next priority after current is fully paid
    test('should respect priority order strictly', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Add all charge types
        await chargeAccountingService.addCharge(testProductIds[0], 'exchange_penalty', 500, null, null, client);
        await chargeAccountingService.addCharge(testProductIds[0], 'late_fee', 300, null, null, client);

        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // Apply exactly enough for rent + transport
      const result = await chargeAccountingService.applyPayment(
        testBookingId,
        4100,
        'Cash',
        'test-user',
        'Payment'
      );

      // Should have applied to rent and transport only
      expect(result.breakdown.every(a => ['rent', 'transport'].includes(a.category))).toBe(true);

      // Penalties and fees should be untouched
      const penalty = await pool.query(
        'SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[0], 'exchange_penalty']
      );
      expect(penalty.rows[0].paid_amount).toBe(0);
    });
  });

  describe('initializeProductCharges', () => {
    // Test: Creates initial rent and security charges for a new booking product with correct amounts
    test('should create rent and security charges', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Create new product
        const bp = await client.query(
          `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
           VALUES ($1, (SELECT id FROM products WHERE code = 'TEST001'), 1, CURRENT_DATE, CURRENT_DATE + 3, 'pending', 3000, 1500, 3000)
           RETURNING id`,
          [testBookingId]
        );
        const newProductId = bp.rows[0].id;

        await chargeAccountingService.initializeProductCharges(newProductId, 3000, 1500, client);

        const charges = await client.query(
          'SELECT * FROM product_charges WHERE booking_product_id = $1 ORDER BY charge_type',
          [newProductId]
        );

        expect(charges.rows).toHaveLength(2);
        expect(charges.rows[0].charge_type).toBe('rent');
        expect(charges.rows[0].due_amount).toBe(3000);
        expect(charges.rows[0].paid_amount).toBe(0);
        expect(charges.rows[1].charge_type).toBe('security');
        expect(charges.rows[1].due_amount).toBe(1500);

        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });
  });

  describe('addCharge', () => {
    // Test: Adds a new charge (late_fee) to a booking product with policy reference and notes
    test('should add new charge', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const charge = await chargeAccountingService.addCharge(
          testProductIds[0],
          'late_fee',
          200,
          'late_policy_key',
          'Late by 1 day',
          client
        );

        expect(charge.charge_type).toBe('late_fee');
        expect(charge.due_amount).toBe(200);
        expect(charge.paid_amount).toBe(0);
        expect(charge.policy_reference).toBe('late_policy_key');
        expect(charge.notes).toBe('Late by 1 day');

        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });

    // Test: When adding a charge that already exists, increments the due_amount instead of creating duplicate
    test('should increment existing charge on conflict', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Add first late fee
        await chargeAccountingService.addCharge(testProductIds[0], 'late_fee', 200, null, 'Day 1', client);

        // Add second late fee (should increment)
        const charge = await chargeAccountingService.addCharge(testProductIds[0], 'late_fee', 200, null, 'Day 2', client);

        expect(charge.due_amount).toBe(400); // 200 + 200
        expect(charge.notes).toBe('Day 2'); // Latest notes

        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });
  });

  describe('applyAdjustment', () => {
    // Test: Applies adjustment following the same priority order as normal payments
    test('should apply adjustment following payment priority order', async () => {
      const result = await chargeAccountingService.applyAdjustment(
        testBookingId,
        2000,
        'Adjustment',
        'admin',
        'Goodwill adjustment'
      );

      expect(result.booking_id).toBe(testBookingId);
      expect(result.total_applied).toBe(2000);
      expect(result.residual_amount).toBe(0);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown[0].category).toBe('rent'); // First priority

      // Verify payment transaction created
      const transaction = await pool.query(
        'SELECT * FROM payment_transactions WHERE booking_id = $1 AND type = $2',
        [testBookingId, 'adjustment']
      );
      expect(transaction.rows).toHaveLength(1);
      expect(parseInt(transaction.rows[0].amount)).toBe(2000);
    });

    // Test: Adjustment exceeding outstanding balance is rejected (hard cap)
    test('should reject adjustment exceeding outstanding balance', async () => {
      // Total due: rent (4000) + transport (100) + security (2000) = 6100
      await expect(
        chargeAccountingService.applyAdjustment(
          testBookingId,
          10000, // More than total due (6100)
          'Adjustment',
          'admin',
          'Excess adjustment test'
        )
      ).rejects.toThrow('exceeds outstanding balance');
    });

    // Test: Applies adjustment to multiple charge types in correct priority
    test('should apply to multiple charge types in priority order', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Add additional charges
        await chargeAccountingService.addCharge(testProductIds[0], 'late_fee', 500, null, 'Late', client);

        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // Apply adjustment that covers rent + transport + partial late_fee
      const result = await chargeAccountingService.applyAdjustment(
        testBookingId,
        4300, // Rent (4000) + Transport (100) + Partial late_fee (200)
        'Adjustment',
        'admin',
        'Partial write-off'
      );

      expect(result.total_applied).toBe(4300);
      expect(result.residual_amount).toBe(0);

      // Should have rent, transport, and fees in breakdown
      const categories = result.breakdown.map(b => b.category);
      expect(categories).toContain('rent');
      expect(categories).toContain('transport');
      expect(categories).toContain('fees');
    });

    // Test: Creates activity log entry with adjustment details
    test('should create activity log entry', async () => {
      await chargeAccountingService.applyAdjustment(
        testBookingId,
        1000,
        'Adjustment',
        'admin',
        'Test adjustment'
      );

      const activityLog = await pool.query(
        'SELECT * FROM booking_activity_log WHERE booking_id = $1 AND event_type = $2',
        [testBookingId, 'adjustment_applied']
      );

      expect(activityLog.rows).toHaveLength(1);
      expect(activityLog.rows[0].performed_by).toBe('admin');

      const details = activityLog.rows[0].details;
      expect(details.amount).toBe(1000);
      expect(details.payment_method).toBe('Adjustment');
      expect(details.notes).toBe('Test adjustment');
    });

    // Test: Throws error when adjustment amount is zero or negative
    test('should throw error for invalid adjustment amount', async () => {
      await expect(
        chargeAccountingService.applyAdjustment(testBookingId, 0, 'Adjustment', 'admin', 'Invalid')
      ).rejects.toThrow('Adjustment amount must be greater than 0');

      await expect(
        chargeAccountingService.applyAdjustment(testBookingId, -100, 'Adjustment', 'admin', 'Invalid')
      ).rejects.toThrow('Adjustment amount must be greater than 0');
    });

    // Test: Throws error for non-existent booking
    test('should throw error for non-existent booking', async () => {
      await expect(
        chargeAccountingService.applyAdjustment(999999, 1000, 'Adjustment', 'admin', 'Test')
      ).rejects.toThrow('Booking not found');
    });

    // Test: Adjustment applies to all charge types respecting priority
    test('should apply to all charge types in strict priority', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Add all types of charges
        await chargeAccountingService.addCharge(testProductIds[0], 'exchange_penalty', 300, null, 'Exchange', client);
        await chargeAccountingService.addCharge(testProductIds[0], 'late_fee', 200, null, 'Late', client);
        await chargeAccountingService.addCharge(testProductIds[0], 'damage_fee', 100, null, 'Damage', client);

        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // Total due now: rent (4000) + transport (100) + penalties (300) + fees (200+100) + security (2000) = 6700
      const result = await chargeAccountingService.applyAdjustment(
        testBookingId,
        6700,
        'Adjustment',
        'admin',
        'Full adjustment'
      );

      expect(result.total_applied).toBe(6700);
      expect(result.residual_amount).toBe(0);

      // Verify all charges are paid
      const summary = await chargeAccountingService.getPaymentSummary(testBookingId);
      expect(summary.totals.balance).toBe(0);
    });

    // Test: Records correct transaction type in payment_transactions
    test('should record transaction with type adjustment', async () => {
      await chargeAccountingService.applyAdjustment(
        testBookingId,
        1500,
        'Cash Adjustment',
        'manager',
        'Manager approval'
      );

      const transaction = await pool.query(
        'SELECT * FROM payment_transactions WHERE booking_id = $1 AND type = $2 ORDER BY id DESC LIMIT 1',
        [testBookingId, 'adjustment']
      );

      expect(transaction.rows).toHaveLength(1);
      expect(transaction.rows[0].type).toBe('adjustment');
      expect(transaction.rows[0].method).toBe('Cash Adjustment');
      expect(transaction.rows[0].recorded_by).toBe('manager');
      expect(transaction.rows[0].notes).toContain('Manager approval');
    });
  });

  describe('recordRefund', () => {
    // Test: Records a refund transaction with type 'refund' (not 'payment')
    test('should record refund transaction with correct type', async () => {
      const result = await chargeAccountingService.recordRefund(
        testBookingId,
        500,
        'Cash',
        'admin',
        'Security refund'
      );

      expect(result.booking_id).toBe(testBookingId);
      expect(result.amount).toBe(500);
      expect(result.method).toBe('Cash');
      expect(result.recorded_by).toBe('admin');

      // Verify transaction stored as 'refund' type
      const transaction = await pool.query(
        'SELECT * FROM payment_transactions WHERE booking_id = $1 AND type = $2',
        [testBookingId, 'refund']
      );
      expect(transaction.rows).toHaveLength(1);
      expect(parseInt(transaction.rows[0].amount)).toBe(500);
      expect(transaction.rows[0].notes).toBe('Security refund');
    });

    // Test: Refund does NOT apply to charges — paid_amount must remain unchanged
    test('should not modify any charge paid_amount', async () => {
      // First apply a payment to cover rent
      await chargeAccountingService.applyPayment(
        testBookingId, 2500, 'Cash', 'test-user', 'Partial payment'
      );

      // Get charge state before refund
      const chargesBefore = await pool.query(
        'SELECT charge_type, paid_amount FROM product_charges WHERE booking_product_id = ANY($1) ORDER BY charge_type',
        [testProductIds]
      );

      // Record a refund
      await chargeAccountingService.recordRefund(
        testBookingId, 1000, 'Cash', 'admin', 'Test refund'
      );

      // Charges must be identical
      const chargesAfter = await pool.query(
        'SELECT charge_type, paid_amount FROM product_charges WHERE booking_product_id = ANY($1) ORDER BY charge_type',
        [testProductIds]
      );

      expect(chargesAfter.rows).toEqual(chargesBefore.rows);
    });

    // Test: Refund does NOT affect charge paid_amounts
    test('should not affect charge paid_amounts when refund is issued', async () => {
      await chargeAccountingService.applyPayment(
        testBookingId, 6100, 'Cash', 'test-user', 'Full payment'
      );

      const summaryBefore = await chargeAccountingService.getPaymentSummary(testBookingId);
      expect(summaryBefore.totals.balance).toBe(0);

      await chargeAccountingService.recordRefund(
        testBookingId, 2000, 'Cash', 'admin', 'Security refund'
      );

      // Balance field comes from product_charges, not payment_transactions — unchanged by refund
      const summaryAfter = await chargeAccountingService.getPaymentSummary(testBookingId);
      expect(summaryAfter.totals.balance).toBe(0);
    });

    // Test: Creates activity log entry with refund details
    test('should create activity log entry', async () => {
      await chargeAccountingService.recordRefund(
        testBookingId, 1000, 'UPI', 'admin', 'Refund notes'
      );

      const activityLog = await pool.query(
        'SELECT * FROM booking_activity_log WHERE booking_id = $1 AND event_type = $2',
        [testBookingId, 'refund_issued']
      );

      expect(activityLog.rows).toHaveLength(1);
      expect(activityLog.rows[0].performed_by).toBe('admin');

      const details = activityLog.rows[0].details;
      expect(details.amount).toBe(1000);
      expect(details.method).toBe('UPI');
      expect(details.notes).toBe('Refund notes');
    });

    // Test: Throws error for non-existent booking
    test('should throw error for non-existent booking', async () => {
      await expect(
        chargeAccountingService.recordRefund(999999, 500, 'Cash', 'admin', 'Test')
      ).rejects.toThrow('Booking not found');
    });

    // Test: Throws error for invalid amount
    test('should throw error for zero or negative amount', async () => {
      await expect(
        chargeAccountingService.recordRefund(testBookingId, 0, 'Cash', 'admin', 'Test')
      ).rejects.toThrow('Refund amount must be greater than 0');

      await expect(
        chargeAccountingService.recordRefund(testBookingId, -100, 'Cash', 'admin', 'Test')
      ).rejects.toThrow('Refund amount must be greater than 0');
    });
  });

  describe('Proportional Rent Distribution', () => {
    // Test: 2 products with different rent → proportional split
    test('should split payment proportionally by rent (62.5%/37.5%)', async () => {
      // Rents are 2500 and 1500 (62.5% / 37.5%)
      await chargeAccountingService.applyPayment(
        testBookingId, 2000, 'Cash', 'test-user', 'Proportional test'
      );

      const charge0 = await pool.query(
        'SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[0], 'rent']
      );
      const charge1 = await pool.query(
        'SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[1], 'rent']
      );
      // 2000 * 2500/4000 = 1250, 2000 * 1500/4000 = 750
      expect(charge0.rows[0].paid_amount).toBe(1250);
      expect(charge1.rows[0].paid_amount).toBe(750);
    });

    // Test: Payment exceeds total outstanding → capped, remainder returned
    test('should cap at outstanding and return remainder', async () => {
      // Pay rent fully first
      await chargeAccountingService.applyPayment(
        testBookingId, 4000, 'Cash', 'test-user', 'Full rent'
      );

      // Both products should be fully paid
      const c0 = await pool.query(
        'SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[0], 'rent']
      );
      const c1 = await pool.query(
        'SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[1], 'rent']
      );
      expect(c0.rows[0].paid_amount).toBe(2500);
      expect(c1.rows[0].paid_amount).toBe(1500);
    });

    // Test: 1 product already fully paid → all goes to remaining
    test('should give all to remaining product when one is fully paid', async () => {
      // Manually mark first product's rent as fully paid
      await pool.query(
        'UPDATE product_charges SET paid_amount = due_amount WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[0], 'rent']
      );

      // Now pay ₹500 — should only go to product[1]
      await chargeAccountingService.applyPayment(
        testBookingId, 500, 'Cash', 'test-user', 'Remaining product'
      );

      const c1 = await pool.query(
        'SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[1], 'rent']
      );
      expect(c1.rows[0].paid_amount).toBe(500);
    });
  });

  describe('settleExchange', () => {
    async function createNewProduct(client, bookingId, rent) {
      const productId = (await client.query("SELECT id FROM products WHERE code = 'TEST001'")).rows[0].id;
      const bp = await client.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', $3, 1000, $3)
         RETURNING id`,
        [bookingId, productId, rent]
      );
      const bpId = bp.rows[0].id;
      await chargeAccountingService.initializeProductCharges(bpId, rent, 1000, client);
      return bpId;
    }

    // Full exchange scenario (order #9978): credit from old product + payment covering penalty + rent
    test('should zero old rent, pay penalty, then cover new product rent from credit + payment', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Old product (testProductIds[1], rent 1500) has 1437 paid toward rent
        await client.query(
          `UPDATE product_charges SET paid_amount = 1437 WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [testProductIds[1]]
        );
        await chargeAccountingService.addCharge(testProductIds[1], 'exchange_penalty', 264, null, null, client);
        const bp3Id = await createNewProduct(client, testBookingId, 5200);

        // paymentAmount = 4027 (cash collected). Pool = 1437 + 4027 = 5464.
        // 264 goes to penalty, 5200 goes to new rent. 5464 - 264 - 5200 = 0 remaining.
        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id], 4027, 'Cash', 'maya', 'Exchange payment', client
        );

        const oldRent = await client.query(
          `SELECT due_amount, paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [testProductIds[1]]
        );
        expect(oldRent.rows[0].due_amount).toBe(0);
        expect(oldRent.rows[0].paid_amount).toBe(0);

        const penalty = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'exchange_penalty'`,
          [testProductIds[1]]
        );
        expect(penalty.rows[0].paid_amount).toBe(264);

        const bp3Rent = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [bp3Id]
        );
        expect(bp3Rent.rows[0].paid_amount).toBe(5200); // fully covered

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // Old product with 0 paid — rent still zeroed, new product funded entirely by payment
    test('should zero old rent even when old product had 0 paid, fund new product from payment only', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // testProductIds[1] has paid_amount = 0 (default from beforeEach)
        const bp3Id = await createNewProduct(client, testBookingId, 2000);

        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id], 2000, 'Cash', 'admin', 'Test', client
        );

        const oldRent = await client.query(
          `SELECT due_amount, paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [testProductIds[1]]
        );
        expect(oldRent.rows[0].due_amount).toBe(0);
        expect(oldRent.rows[0].paid_amount).toBe(0);

        const bp3Rent = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [bp3Id]
        );
        expect(bp3Rent.rows[0].paid_amount).toBe(2000);

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // Credit drains into first new product (ORDER BY rent DESC); second gets remainder
    test('should carry credit sequentially across 2 new products', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE product_charges SET paid_amount = 1200 WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [testProductIds[1]]
        );
        const bp3Id = await createNewProduct(client, testBookingId, 3000); // first (rent DESC)
        const bp4Id = await createNewProduct(client, testBookingId, 2000);

        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id, bp4Id], 0, 'Cash', 'admin', null, client
        );

        const bp3Rent = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [bp3Id]
        );
        const bp4Rent = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [bp4Id]
        );
        // bp3 (3000 due) absorbs all 1200; bp4 gets 0
        expect(bp3Rent.rows[0].paid_amount).toBe(1200);
        expect(bp4Rent.rows[0].paid_amount).toBe(0);

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // Credit capped at new product's due_amount
    test('should cap credit at new product due_amount', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE product_charges SET paid_amount = 2000 WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [testProductIds[0]]
        );

        const productId = (await client.query("SELECT id FROM products WHERE code = 'TEST001'")).rows[0].id;
        const bp3Result = await client.query(
          `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
           VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 2000, 1000, 2000) RETURNING id`,
          [testBookingId, productId]
        );
        const bp3Id = bp3Result.rows[0].id;
        await client.query(
          `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
           VALUES ($1, 'rent', 1000, 0), ($1, 'security', 1000, 0)`,
          [bp3Id]
        );

        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[0], [bp3Id], 0, 'Cash', 'admin', null, client
        );

        const bp3Rent = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [bp3Id]
        );
        expect(bp3Rent.rows[0].paid_amount).toBe(1000); // capped, not 2000

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // Downgrade penalty paid after exchange_penalty, before new product rent
    test('should pay exchange_penalty then downgrade_penalty before rent', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await chargeAccountingService.addCharge(testProductIds[1], 'exchange_penalty', 200, null, null, client);
        await chargeAccountingService.addCharge(testProductIds[1], 'downgrade_penalty', 300, null, null, client);
        const bp3Id = await createNewProduct(client, testBookingId, 5000);

        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id], 500, 'Cash', 'admin', 'Test', client
        );

        const exchPenalty = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'exchange_penalty'`,
          [testProductIds[1]]
        );
        const downgradePenalty = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'downgrade_penalty'`,
          [testProductIds[1]]
        );
        const bp3Rent = await client.query(
          `SELECT paid_amount FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [bp3Id]
        );
        expect(exchPenalty.rows[0].paid_amount).toBe(200);
        expect(downgradePenalty.rows[0].paid_amount).toBe(300);
        expect(bp3Rent.rows[0].paid_amount).toBe(0); // 500 - 200 - 300 = 0

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // Single payment_transaction of type 'payment', no 'adjustment' row
    test('should create exactly one payment transaction, never adjustment', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const bp3Id = await createNewProduct(client, testBookingId, 3000);
        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id], 1000, 'Cash', 'admin', 'Test', client
        );

        const txns = await client.query(
          `SELECT type, amount FROM payment_transactions WHERE booking_id = $1`,
          [testBookingId]
        );
        expect(txns.rows.filter(r => r.type === 'payment')).toHaveLength(1);
        expect(parseInt(txns.rows.find(r => r.type === 'payment').amount)).toBe(1000);
        expect(txns.rows.filter(r => r.type === 'adjustment')).toHaveLength(0);

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // No transaction created when paymentAmount = 0
    test('should not create payment_transaction when paymentAmount is 0', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const bp3Id = await createNewProduct(client, testBookingId, 3000);
        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id], 0, 'Cash', 'admin', null, client
        );

        const txns = await client.query(
          `SELECT id FROM payment_transactions WHERE booking_id = $1`,
          [testBookingId]
        );
        expect(txns.rows).toHaveLength(0);

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // Pre-existing products must be completely untouched
    test('should not modify pre-existing product charges', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const preExistingBefore = await client.query(
          `SELECT charge_type, paid_amount FROM product_charges
           WHERE booking_product_id = $1 ORDER BY charge_type`,
          [testProductIds[0]]
        );

        await chargeAccountingService.addCharge(testProductIds[1], 'exchange_penalty', 200, null, null, client);
        const bp3Id = await createNewProduct(client, testBookingId, 3000);
        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id], 1000, 'Cash', 'admin', 'Test', client
        );

        const preExistingAfter = await client.query(
          `SELECT charge_type, paid_amount FROM product_charges
           WHERE booking_product_id = $1 ORDER BY charge_type`,
          [testProductIds[0]]
        );
        expect(preExistingAfter.rows).toEqual(preExistingBefore.rows);

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // Full-scope isolation: snapshots ALL product_charges before and after settleExchange,
    // then asserts that only the expected rows changed (old rent zeroed, penalties paid,
    // new product rent funded) and every other row is byte-for-byte identical.
    test('full-scope isolation: only old product rent+penalties and new product rent are modified', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Pre-existing (testProductIds[0]): 500 paid rent, 0 paid security
        await client.query(
          `UPDATE product_charges SET paid_amount = 500 WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [testProductIds[0]]
        );
        // Old product (testProductIds[1]): 800 paid rent, exchange_penalty due=200
        await client.query(
          `UPDATE product_charges SET paid_amount = 800 WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [testProductIds[1]]
        );
        await chargeAccountingService.addCharge(testProductIds[1], 'exchange_penalty', 200, null, null, client);
        // New product (bp3): rent due=3000, security due=1000, both paid=0
        const bp3Id = await createNewProduct(client, testBookingId, 3000);

        // Snapshot ALL charges before settlement
        const before = await client.query(
          `SELECT pc.booking_product_id, pc.charge_type, pc.paid_amount
           FROM product_charges pc
           JOIN booking_products bp ON pc.booking_product_id = bp.id
           WHERE bp.booking_id = $1
           ORDER BY pc.booking_product_id, pc.charge_type`,
          [testBookingId]
        );

        // pool = 800 (old rent credit) + 1200 (payment) = 2000
        // pay exchange_penalty(200): remaining = 1800
        // bp3 rent (due=3000): toApply = min(1800, 3000) = 1800
        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id], 1200, 'Cash', 'admin', 'Test', client
        );

        const after = await client.query(
          `SELECT pc.booking_product_id, pc.charge_type, pc.paid_amount
           FROM product_charges pc
           JOIN booking_products bp ON pc.booking_product_id = bp.id
           WHERE bp.booking_id = $1
           ORDER BY pc.booking_product_id, pc.charge_type`,
          [testBookingId]
        );

        // Define exactly which rows should have changed and to what values
        const expectedNewValues = {
          [`${testProductIds[1]}_rent`]: 0,            // zeroed
          [`${testProductIds[1]}_exchange_penalty`]: 200, // paid in full
          [`${bp3Id}_rent`]: 1800                        // funded from pool
        };

        for (const afterRow of after.rows) {
          const key = `${afterRow.booking_product_id}_${afterRow.charge_type}`;
          const beforeRow = before.rows.find(
            r => r.booking_product_id === afterRow.booking_product_id && r.charge_type === afterRow.charge_type
          );
          if (Object.prototype.hasOwnProperty.call(expectedNewValues, key)) {
            expect(afterRow.paid_amount).toBe(expectedNewValues[key]);
          } else {
            // Every other row must be completely unchanged
            expect(afterRow.paid_amount).toBe(beforeRow.paid_amount);
          }
        }

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    // Activity log records exchange_payment with correct references
    test('should create activity log entry with correct product references', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const bp3Id = await createNewProduct(client, testBookingId, 3000);
        await chargeAccountingService.settleExchange(
          testBookingId, testProductIds[1], [bp3Id], 1000, 'Cash', 'admin', 'Test', client
        );

        const log = await client.query(
          `SELECT details FROM booking_activity_log WHERE booking_id = $1 AND event_type = 'exchange_payment'`,
          [testBookingId]
        );
        expect(log.rows).toHaveLength(1);
        expect(log.rows[0].details.old_product).toBe(testProductIds[1]);
        expect(log.rows[0].details.new_products).toContain(bp3Id);
        expect(log.rows[0].details.amount).toBe(1000);

        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  });

  describe('50% Minimum Payment Rule', () => {
    // Test: First payment exactly 50% → accepted
    test('should accept first payment at exactly 50% of total rent', async () => {
      // Total rent = 4000, 50% = 2000
      const result = await chargeAccountingService.applyPayment(
        testBookingId, 2000, 'Cash', 'test-user', 'Exactly 50%'
      );
      expect(result.total_applied).toBe(2000);
    });

    // Test: First payment > 50% → accepted
    test('should accept first payment above 50% of total rent', async () => {
      const result = await chargeAccountingService.applyPayment(
        testBookingId, 3000, 'Cash', 'test-user', 'Above 50%'
      );
      expect(result.total_applied).toBe(3000);
    });

    // Test: First payment < 50% → rejected
    test('should reject first payment below 50% of total rent', async () => {
      // Total rent = 4000, 50% = 2000, trying to pay 1000
      await expect(
        chargeAccountingService.applyPayment(
          testBookingId, 1000, 'Cash', 'test-user', 'Below 50%'
        )
      ).rejects.toThrow('First payment must be at least 50% of total rent');
    });

    // Test: Second payment with any amount → accepted (no minimum)
    test('should accept any amount on second payment', async () => {
      // First payment meets minimum
      await chargeAccountingService.applyPayment(
        testBookingId, 2000, 'Cash', 'test-user', 'First payment'
      );

      // Second payment with small amount — should succeed
      const result = await chargeAccountingService.applyPayment(
        testBookingId, 100, 'Cash', 'test-user', 'Small second payment'
      );
      expect(result.total_applied).toBe(100);
    });

    // Test: Adjustment → no minimum enforced
    test('should not enforce minimum on adjustments', async () => {
      // ₹500 adjustment should succeed even though it's < 50% of rent
      const result = await chargeAccountingService.applyAdjustment(
        testBookingId, 500, 'Adjustment', 'admin', 'Small adjustment'
      );
      expect(result.total_applied).toBe(500);
    });
  });
});
