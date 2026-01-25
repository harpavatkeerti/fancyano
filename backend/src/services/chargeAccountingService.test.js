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
    await pool.end();
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
    // Test: Applies payment to rent charges first (Priority 1) before any other charge category
    test('should apply payment to rent first (priority 1)', async () => {
      const result = await chargeAccountingService.applyPayment(
        testBookingId, 
        1000, 
        'Cash', 
        'test-user', 
        'Partial payment'
      );
      
      expect(result.total_applied).toBe(1000);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].category).toBe('rent');
      expect(result.breakdown[0].amount).toBe(1000);
      
      // Verify rent charge updated
      const charges = await pool.query(
        'SELECT * FROM product_charges WHERE booking_product_id = $1 AND charge_type = $2',
        [testProductIds[0], 'rent']
      );
      expect(charges.rows[0].paid_amount).toBe(1000);
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
      
      expect(result.breakdown).toHaveLength(3);
      expect(result.breakdown[0].category).toBe('rent'); // 2500
      expect(result.breakdown[1].category).toBe('rent'); // 1500
      expect(result.breakdown[2].category).toBe('transport'); // 100
      expect(result.breakdown[2].amount).toBe(100);
      
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

    // Test: After all charges are fully paid, records any excess as overpayment (Priority 6)
    test('should create overpayment after all charges paid (priority 6)', async () => {
      // Pay more than total due: rent (4000) + transport (100) + security (2000) + extra (500)
      const result = await chargeAccountingService.applyPayment(
        testBookingId, 
        6600, 
        'Cash', 
        'test-user', 
        'Payment with excess'
      );
      
      const overpaymentApp = result.breakdown.find(a => a.category === 'overpayment');
      expect(overpaymentApp).toBeDefined();
      expect(overpaymentApp.amount).toBe(500);
      expect(result.residual_amount).toBe(500);
      
      // Verify overpayment in booking
      const booking = await pool.query(
        'SELECT overpayment FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].overpayment).toBe(500);
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

    // Test: Returns residual amount when adjustment exceeds total due
    test('should return residual when adjustment exceeds total due', async () => {
      const result = await chargeAccountingService.applyAdjustment(
        testBookingId,
        10000, // More than total due (6100)
        'Adjustment',
        'admin',
        'Overpayment test'
      );

      expect(result.total_applied).toBe(6100);
      expect(result.residual_amount).toBe(3900);
      
      // Verify overpayment recorded
      const booking = await pool.query(
        'SELECT overpayment FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].overpayment).toBe(3900);
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
});
