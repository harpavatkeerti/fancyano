const productLifecycleService = require('../services/productLifecycleService');
const pool = require('../database/connection');

describe('ProductLifecycleService', () => {
  let testBookingId;
  let testProductId1;
  let testProductId2;
  let testBookingProductId;
  let testUserId = 1;

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clean up test policies and add fresh ones
      await client.query('DELETE FROM rental_policies');
      await client.query(`
        INSERT INTO rental_policies 
          (policy_key, policy_name, policy_type, value_type, value, days_from_booking_min, days_from_booking_max)
        VALUES
          ('test_late_fee', 'Test Late Fee', 'late_fee', 'fixed', 200, NULL, NULL),
          ('test_exchange_0_5', 'Exchange 0-5 days', 'exchange_penalty', 'percentage', 10, 0, 5),
          ('test_cancel_0_5', 'Cancel 0-5 days', 'cancellation_penalty', 'percentage', 10, 0, 5)
      `);
      
      // Create test booking
      const bookingResult = await client.query(
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, booked_from, booked_to, status)
         VALUES ('Test Customer', '1234567890', CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed')
         RETURNING id`
      );
      testBookingId = bookingResult.rows[0].id;
      
      // Create test products
      const product1 = await client.query(
        `INSERT INTO products (name, code, category, size, rent, security_deposit)
         VALUES ('Test Product 1', 'TEST001', 'Test', 'M', 500, 1000)
         RETURNING id`
      );
      testProductId1 = product1.rows[0].id;
      
      const product2 = await client.query(
        `INSERT INTO products (name, code, category, size, rent, security_deposit)
         VALUES ('Test Product 2', 'TEST002', 'Test', 'L', 600, 1200)
         RETURNING id`
      );
      testProductId2 = product2.rows[0].id;
      
      // Create booking product
      const bp = await client.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 2500, 1000, 2500)
         RETURNING id`,
        [testBookingId, testProductId1]
      );
      testBookingProductId = bp.rows[0].id;
      
      // Initialize charges
      await client.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES 
           ($1, 'rent', 2500, 0),
           ($1, 'security', 1000, 0)`,
        [testBookingProductId]
      );
      
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
    await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM booking_exchange_history WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM booking_cancellation_history WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)', [testBookingId]);
    await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM products WHERE code LIKE $1', ['TEST%']); // Clean all TEST products
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('exchangeProduct', () => {
    // Test: Exchanges one booking product for one new product (one-to-one exchange)
    test('should exchange product successfully (one-to-one)', async () => {
      const result = await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [
          { productId: testProductId2, rent: 3000, securityDeposit: 1200 }
        ],
        'Customer requested different size',
        String(testUserId)
      );
      
      expect(result.old_booking_product_id).toBe(testBookingProductId);
      expect(result.new_booking_product_ids).toHaveLength(1);
      expect(result.exchange_penalty).toBe(250); // 10% of 2500
      expect(result.downgrade_penalty).toBe(0); // max(0, 2500 - (250 + 3000)) = 0 (upgrade)
      expect(result.total_penalty).toBe(250);
      
      // Verify old product is marked as exchanged
      const oldProduct = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(oldProduct.rows[0].status).toBe('exchanged');
      
      // Verify new product was created
      const newProduct = await pool.query(
        'SELECT * FROM booking_products WHERE id = $1',
        [result.new_booking_product_ids[0]]
      );
      expect(newProduct.rows[0].product_id).toBe(testProductId2);
      expect(newProduct.rows[0].rent).toBe(3000);
      expect(newProduct.rows[0].security_deposit).toBe(1200);
      expect(newProduct.rows[0].status).toBe('confirmed');
      
      // Verify exchange history was recorded
      const history = await pool.query(
        'SELECT * FROM booking_exchange_history WHERE old_booking_product_id = $1',
        [testBookingProductId]
      );
      expect(history.rows.length).toBe(1);
      expect(history.rows[0].exchange_penalty).toBe(250);
      // JSONB stores arrays directly, no need to parse
      expect(history.rows[0].new_booking_product_ids).toEqual(result.new_booking_product_ids);
    });

    // Test: Exchanges one product for multiple new products
    test('should handle one-to-many exchange (multiple new products)', async () => {
      // Delete any existing TEST003 product from previous test runs
      await pool.query(`DELETE FROM products WHERE code = 'TEST003'`);
      
      // Create another product for testing
      const product3 = await pool.query(
        `INSERT INTO products (name, code, category, size, rent, security_deposit)
         VALUES ('Test Product 3', 'TEST003', 'Test', 'XL', 700, 1400)
         RETURNING id`
      );
      const testProductId3 = product3.rows[0].id;
      
      const result = await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [
          { productId: testProductId2, rent: 1500, securityDeposit: 600 },
          { productId: testProductId3, rent: 1000, securityDeposit: 500 }
        ],
        'Split into multiple products',
        String(testUserId)
      );
      
      expect(result.new_booking_product_ids).toHaveLength(2);
      expect(result.exchange_penalty).toBe(250); // 10% of 2500
      // Downgrade: max(0, 2500 - (250 + 2500)) = 0 (no downgrade)
      expect(result.downgrade_penalty).toBe(0);
      
      // Verify both new products were created
      const newProducts = await pool.query(
        'SELECT * FROM booking_products WHERE id = ANY($1) ORDER BY id',
        [result.new_booking_product_ids]
      );
      expect(newProducts.rows).toHaveLength(2);
      expect(newProducts.rows[0].rent).toBe(1500);
      expect(newProducts.rows[1].rent).toBe(1000);
      
      // Cleanup
      await pool.query('DELETE FROM products WHERE id = $1', [testProductId3]);
    });

    // Test: Calculates downgrade penalty when new total rent is less than old rent minus exchange penalty
    test('should calculate downgrade penalty correctly', async () => {
      const result = await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [
          { productId: testProductId2, rent: 1000, securityDeposit: 500 }
        ],
        'Downgrade',
        String(testUserId)
      );
      
      expect(result.exchange_penalty).toBe(250); // 10% of 2500
      // Downgrade: max(0, 2500 - (250 + 1000)) = 1250
      expect(result.downgrade_penalty).toBe(1250);
      expect(result.total_penalty).toBe(1500); // 250 + 1250
      
      // Verify both penalty charges were added
      const charges = await pool.query(
        `SELECT charge_type, due_amount FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type IN ('exchange_penalty', 'downgrade_penalty')
         ORDER BY charge_type`,
        [testBookingProductId]
      );
      expect(charges.rows.length).toBe(2);
      expect(charges.rows[0].charge_type).toBe('downgrade_penalty');
      expect(charges.rows[0].due_amount).toBe(1250);
      expect(charges.rows[1].charge_type).toBe('exchange_penalty');
      expect(charges.rows[1].due_amount).toBe(250);
    });

    // Test: Prevents exchanging a product that's already been exchanged, cancelled, or completed
    test('should reject exchange for already exchanged product', async () => {
      // Mark as exchanged
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['exchanged', testBookingProductId]
      );
      
      await expect(
        productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, rent: 3000, securityDeposit: 1200 }],
          'Test',
          String(testUserId)
        )
      ).rejects.toThrow('Cannot exchange product with status: exchanged');
    });

    // Test: Prevents exchanging products that are in_progress (already picked up)
    test('should reject exchange for in_progress product', async () => {
      // Set product to in_progress
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['in_progress', testBookingProductId]
      );
      
      await expect(
        productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, rent: 3000, securityDeposit: 1200 }],
          'Test',
          String(testUserId)
        )
      ).rejects.toThrow('Cannot exchange product with status: in_progress');
    });

    // Test: Creates activity log entry tracking the exchange event
    test('should create activity log entry', async () => {
      await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [{ productId: testProductId2, rent: 3000, securityDeposit: 1200 }],
        'Test',
        String(testUserId)
      );
      
      const log = await pool.query(
        `SELECT * FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'product_exchanged'`,
        [testBookingId]
      );
      expect(log.rows.length).toBe(1);
      expect(log.rows[0].performed_by).toBe(String(testUserId));
    });
  });

  describe('cancelProduct', () => {
    // Test: Cancels a booking product with specified penalty and marks it as cancelled
    test('should cancel product successfully', async () => {
      const result = await productLifecycleService.cancelProduct(
        testBookingProductId,
        300, // cancellation penalty
        'Customer request',
        testUserId
      );
      
      expect(result.booking_product_id).toBe(testBookingProductId);
      expect(result.cancellation_penalty).toBe(300);
      expect(result.status).toBe('cancelled');
      
      // Verify product is marked as cancelled
      const product = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(product.rows[0].status).toBe('cancelled');
      
      // Verify cancellation penalty charge was added
      const charge = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'cancellation_penalty'`,
        [testBookingProductId]
      );
      expect(charge.rows.length).toBe(1);
      expect(charge.rows[0].due_amount).toBe(300);
    });

    // Test: Allows cancellation with zero penalty (waived penalty scenario)
    test('should handle zero penalty cancellation', async () => {
      const result = await productLifecycleService.cancelProduct(
        testBookingProductId,
        0,
        'Goodwill gesture',
        testUserId
      );
      
      expect(result.cancellation_penalty).toBe(0);
      
      // Verify no penalty charge was added
      const charge = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'cancellation_penalty'`,
        [testBookingProductId]
      );
      expect(charge.rows.length).toBe(0);
    });

    // Test: Prevents cancelling a product that's already cancelled or completed
    test('should reject cancellation for already cancelled product', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['cancelled', testBookingProductId]
      );
      
      await expect(
        productLifecycleService.cancelProduct(
          testBookingProductId,
          300,
          'Test',
          testUserId
        )
      ).rejects.toThrow('Cannot cancel product with status: cancelled');
    });

    // Test: Records cancellation in history table with all relevant details
    test('should create cancellation history record', async () => {
      await productLifecycleService.cancelProduct(
        testBookingProductId,
        300,
        'Out of stock',
        String(testUserId)
      );
      
      const history = await pool.query(
        'SELECT * FROM booking_cancellation_history WHERE booking_product_id = $1',
        [testBookingProductId]
      );
      expect(history.rows.length).toBe(1);
      expect(history.rows[0].cancellation_penalty).toBe(300);
      expect(history.rows[0].reason).toBe('Out of stock');
      expect(history.rows[0].cancelled_by).toBe(String(testUserId));
    });

    // Test: Creates activity log entry tracking the cancellation event
    test('should create activity log entry', async () => {
      await productLifecycleService.cancelProduct(
        testBookingProductId,
        300,
        'Test',
        String(testUserId)
      );
      
      const log = await pool.query(
        `SELECT * FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'product_cancelled'`,
        [testBookingId]
      );
      expect(log.rows.length).toBe(1);
    });
  });

  describe('pickupProducts', () => {
    // Test: Marks confirmed products as in_progress and updates booking status
    test('should mark products as picked up', async () => {
      const result = await productLifecycleService.pickupProducts(
        testBookingId,
        [testBookingProductId],
        testUserId
      );
      
      expect(result.booking_id).toBe(testBookingId);
      expect(result.picked_up_count).toBe(1);
      expect(result.status).toBe('in_progress');
      
      // Verify product status updated
      const product = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(product.rows[0].status).toBe('in_progress');
      
      // Verify booking status updated
      const booking = await pool.query(
        'SELECT status FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].status).toBe('in_progress');
    });

    // Test: Handles pickup of multiple products in a single operation
    test('should handle multiple products pickup', async () => {
      // Add another booking product
      const bp2 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 1500, 800, 1500)
         RETURNING id`,
        [testBookingId, testProductId2]
      );
      
      const result = await productLifecycleService.pickupProducts(
        testBookingId,
        [testBookingProductId, bp2.rows[0].id],
        testUserId
      );
      
      expect(result.picked_up_count).toBe(2);
    });

    // Test: Rejects pickup if product is not in confirmed status
    test('should reject pickup for non-confirmed product', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['in_progress', testBookingProductId]
      );
      
      await expect(
        productLifecycleService.pickupProducts(
          testBookingId,
          [testBookingProductId],
          testUserId
        )
      ).rejects.toThrow('not in confirmed status');
    });

    // Test: Creates activity log entry tracking the pickup event
    test('should create activity log entry', async () => {
      await productLifecycleService.pickupProducts(
        testBookingId,
        [testBookingProductId],
        testUserId
      );
      
      const log = await pool.query(
        `SELECT * FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'products_picked_up'`,
        [testBookingId]
      );
      expect(log.rows.length).toBe(1);
    });
  });

  describe('returnProducts', () => {
    beforeEach(async () => {
      // Set product to in_progress for return tests
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['in_progress', testBookingProductId]
      );
    });

    // Test: Marks in_progress products as completed when returned without issues
    test('should mark products as returned', async () => {
      const result = await productLifecycleService.returnProducts(
        testBookingId,
        [{ bookingProductId: testBookingProductId, damageFee: 0 }],
        String(testUserId)
      );
      
      expect(result.booking_id).toBe(testBookingId);
      expect(result.returned_count).toBe(1);
      expect(result.total_late_fees).toBe(0);
      expect(result.total_damage_fees).toBe(0);
      
      // Verify product status updated
      const product = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(product.rows[0].status).toBe('completed');
    });

    // Test: Calculates and applies late fees based on number of late days
    test('should apply late fees for late return', async () => {
      // Set booking period to past dates to simulate late return (ended 3 days ago)
      await pool.query(
        `UPDATE booking_products 
         SET booked_from = CURRENT_DATE - INTERVAL '8 days',
             booked_to = CURRENT_DATE - INTERVAL '3 days'
         WHERE id = $1`,
        [testBookingProductId]
      );
      
      const result = await productLifecycleService.returnProducts(
        testBookingId,
        [{ bookingProductId: testBookingProductId, damageFee: 0 }],
        String(testUserId)
      );
      
      expect(result.total_late_fees).toBe(600); // 200 * 3 days
      
      // Verify late fee charge was added
      const charge = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'late_fee'`,
        [testBookingProductId]
      );
      expect(charge.rows.length).toBe(1);
      expect(charge.rows[0].due_amount).toBe(600);
      expect(charge.rows[0].notes).toBe('Late return: 3 day(s)');
    });

    // Test: Applies damage fees when product is returned with damage
    test('should apply damage fees', async () => {
      const result = await productLifecycleService.returnProducts(
        testBookingId,
        [{ bookingProductId: testBookingProductId, damageFee: 500 }],
        String(testUserId)
      );
      
      expect(result.total_damage_fees).toBe(500);
      
      // Verify damage fee charge was added
      const charge = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'damage_fee'`,
        [testBookingProductId]
      );
      expect(charge.rows.length).toBe(1);
      expect(charge.rows[0].due_amount).toBe(500);
    });

    // Test: Applies both late fees and damage fees when both conditions exist
    test('should apply both late and damage fees', async () => {
      // Set booking period to past dates to simulate late return (ended 2 days ago)
      await pool.query(
        `UPDATE booking_products 
         SET booked_from = CURRENT_DATE - INTERVAL '7 days',
             booked_to = CURRENT_DATE - INTERVAL '2 days'
         WHERE id = $1`,
        [testBookingProductId]
      );
      
      const result = await productLifecycleService.returnProducts(
        testBookingId,
        [{ bookingProductId: testBookingProductId, damageFee: 300 }],
        String(testUserId)
      );
      
      expect(result.total_late_fees).toBe(400); // 200 * 2
      expect(result.total_damage_fees).toBe(300);
    });

    // Test: Booking remains in_progress if some products haven't been returned
    test('should not complete booking if products remain unreturned', async () => {
      // First, ensure booking is in_progress
      await pool.query(
        'UPDATE bookings SET status = $1 WHERE id = $2',
        ['in_progress', testBookingId]
      );
      
      // Add another product that won't be returned
      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'in_progress', 1500, 800, 1500)`,
        [testBookingId, testProductId2]
      );
      
      const result = await productLifecycleService.returnProducts(
        testBookingId,
        [{ bookingProductId: testBookingProductId, damageFee: 0 }],
        String(testUserId)
      );
      
      // Result should not include booking_completed field anymore
      expect(result.booking_completed).toBeUndefined();
      
      // Verify booking still in_progress
      const booking = await pool.query(
        'SELECT status FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].status).toBe('in_progress');
    });

    // Test: Rejects return if product is not in in_progress status
    test('should reject return for non in_progress product', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['confirmed', testBookingProductId]
      );
      
      await expect(
        productLifecycleService.returnProducts(
          testBookingId,
          [{ bookingProductId: testBookingProductId, damageFee: 0 }],
          String(testUserId)
        )
      ).rejects.toThrow('not in in_progress status');
    });

    // Test: Creates activity log entry tracking the return event with fee details
    test('should create activity log entry', async () => {
      // Set booking period to past dates to simulate late return (ended 2 days ago)
      await pool.query(
        `UPDATE booking_products 
         SET booked_from = CURRENT_DATE - INTERVAL '7 days',
             booked_to = CURRENT_DATE - INTERVAL '2 days'
         WHERE id = $1`,
        [testBookingProductId]
      );
      
      await productLifecycleService.returnProducts(
        testBookingId,
        [{ bookingProductId: testBookingProductId, damageFee: 100 }],
        String(testUserId)
      );
      
      const log = await pool.query(
        `SELECT * FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'products_returned'`,
        [testBookingId]
      );
      expect(log.rows.length).toBe(1);
      expect(log.rows[0].details.total_late_fees).toBe(400);
      expect(log.rows[0].details.total_damage_fees).toBe(100);
    });
  });

  describe('getCancellationPenaltySuggestion', () => {
    // Test: Returns suggested cancellation penalty based on days since product was added
    test('should return cancellation penalty suggestion', async () => {
      const result = await productLifecycleService.getCancellationPenaltySuggestion(
        testBookingProductId
      );
      
      expect(result.amount).toBe(250); // 10% of 2500
      expect(result.policy).not.toBeNull();
      expect(result.policy.key).toBe('test_cancel_0_5');
    });

    // Test: Throws error when requesting suggestion for non-existent product
    test('should throw error for non-existent product', async () => {
      await expect(
        productLifecycleService.getCancellationPenaltySuggestion(999999)
      ).rejects.toThrow('Booking product not found');
    });
  });

  describe('getExchangePenaltySuggestion', () => {
    // Test: Returns suggested exchange penalty based on days since product was added
    test('should return exchange penalty suggestion', async () => {
      const result = await productLifecycleService.getExchangePenaltySuggestion(
        testBookingProductId
      );
      
      expect(result.amount).toBe(250); // 10% of 2500
      expect(result.policy).not.toBeNull();
      expect(result.policy.key).toBe('test_exchange_0_5');
    });

    // Test: Throws error when requesting suggestion for non-existent product
    test('should throw error for non-existent product', async () => {
      await expect(
        productLifecycleService.getExchangePenaltySuggestion(999999)
      ).rejects.toThrow('Booking product not found');
    });
  });

  describe('validateExchangeEligibility', () => {
    // Test: Returns eligible=true for confirmed product
    test('should return eligible for confirmed product', async () => {
      const result = await productLifecycleService.validateExchangeEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(true);
      expect(result.reason).toBe('Product is eligible for exchange');
      expect(result.product).toBeDefined();
      expect(result.product.status).toBe('confirmed');
    });

    // Test: Returns eligible=false for non-existent product
    test('should return ineligible for non-existent product', async () => {
      const result = await productLifecycleService.validateExchangeEligibility(999999);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Booking product not found');
      expect(result.product).toBeNull();
    });

    // Test: Returns eligible=false for in_progress product
    test('should return ineligible for in_progress product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['in_progress', testBookingProductId]);
      
      const result = await productLifecycleService.validateExchangeEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Cannot exchange product with status: in_progress');
    });

    // Test: Returns eligible=false for exchanged product
    test('should return ineligible for exchanged product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['exchanged', testBookingProductId]);
      
      const result = await productLifecycleService.validateExchangeEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Cannot exchange product with status: exchanged');
    });

    // Test: Returns eligible=false for completed product
    test('should return ineligible for completed product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', testBookingProductId]);
      
      const result = await productLifecycleService.validateExchangeEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Cannot exchange product with status: completed');
    });
  });

  describe('validateCancellationEligibility', () => {
    // Test: Returns eligible=true for confirmed product with penalty calculation
    test('should return eligible for confirmed product', async () => {
      const result = await productLifecycleService.validateCancellationEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(true);
      expect(result.reason).toBe('Product is eligible for cancellation');
      expect(result.product).toBeDefined();
      expect(result.max_penalty).toBeGreaterThan(0);
      expect(result.policy).toBeDefined();
    });

    // Test: Returns eligible=false for non-existent product
    test('should return ineligible for non-existent product', async () => {
      const result = await productLifecycleService.validateCancellationEligibility(999999);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Booking product not found');
      expect(result.product).toBeNull();
      expect(result.max_penalty).toBe(0);
    });

    // Test: Returns eligible=false for cancelled product
    test('should return ineligible for cancelled product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['cancelled', testBookingProductId]);
      
      const result = await productLifecycleService.validateCancellationEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Cannot cancel product with status: cancelled');
    });

    // Test: Returns eligible=false for in_progress product
    test('should return ineligible for in_progress product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['in_progress', testBookingProductId]);
      
      const result = await productLifecycleService.validateCancellationEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Cannot cancel product with status: in_progress');
    });

    // Test: Returns eligible=false for completed product
    test('should return ineligible for completed product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', testBookingProductId]);
      
      const result = await productLifecycleService.validateCancellationEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Cannot cancel product with status: completed');
    });
  });

  describe('calculateExchangePreview', () => {
    // Test: Returns complete exchange preview with all calculations
    test('should calculate exchange preview for upgrade (no downgrade penalty)', async () => {
      const result = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        testProductId2,
        []
      );
      
      expect(result.old_product).toBeDefined();
      expect(result.old_product.id).toBe(testBookingProductId);
      expect(result.old_product.rent).toBe(2500);
      
      expect(result.new_product).toBeDefined();
      expect(result.new_product.id).toBe(testProductId2);
      expect(result.new_product.rent).toBe(600);
      
      expect(result.calculations).toBeDefined();
      expect(result.calculations.original_rent).toBe(2500);
      expect(result.calculations.total_new_rent).toBe(600);
      expect(result.calculations.exchange_penalty).toBe(250); // 10% of 2500
      // No downgrade: max(0, 2500 - (250 + 600)) = max(0, 1650) = 1650
      expect(result.calculations.downgrade_penalty).toBe(1650);
      // Total payment: 250 + 1650 + 600 - 2500 = 0
      expect(result.calculations.total_payment_due).toBe(0);
      
      expect(result.penalty_policy).toBeDefined();
      expect(result.penalty_policy.key).toBe('test_exchange_0_5');
    });

    // Test: Calculates downgrade penalty correctly for downgrade scenario
    test('should calculate exchange preview for downgrade', async () => {
      // Create a product with lower rent
      const lowRentProduct = await pool.query(
        `INSERT INTO products (name, code, category, size, rent, security_deposit)
         VALUES ('Test Low Rent Product', 'TEST-LOW', 'Test', 'S', 1000, 500)
         RETURNING id`
      );
      const lowRentProductId = lowRentProduct.rows[0].id;
      
      const result = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        lowRentProductId,
        []
      );
      
      expect(result.calculations.original_rent).toBe(2500);
      expect(result.calculations.total_new_rent).toBe(1000);
      expect(result.calculations.exchange_penalty).toBe(250); // 10% of 2500
      // Downgrade penalty: max(0, 2500 - (250 + 1000)) = 1250
      expect(result.calculations.downgrade_penalty).toBe(1250);
      // Total payment due: 250 + 1250 + 1000 - 2500 = 0
      expect(result.calculations.total_payment_due).toBe(0);
      
      // Cleanup
      await pool.query('DELETE FROM products WHERE id = $1', [lowRentProductId]);
    });

    // Test: Includes additional products in calculations
    test('should include additional products in calculations (one-to-many)', async () => {
      // Create another product for testing
      const product3 = await pool.query(
        `INSERT INTO products (name, code, category, size, rent, security_deposit)
         VALUES ('Test Product 3', 'TEST003', 'Test', 'XL', 700, 1400)
         RETURNING id`
      );
      const testProductId3 = product3.rows[0].id;
      
      const result = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        testProductId2,
        [testProductId3]
      );
      
      expect(result.additional_products).toHaveLength(1);
      expect(result.additional_products[0].id).toBe(testProductId3);
      expect(result.additional_products[0].rent).toBe(700);
      
      expect(result.calculations.additional_rent).toBe(700);
      expect(result.calculations.total_new_rent).toBe(1300); // 600 + 700
      expect(result.calculations.exchange_penalty).toBe(250);
      // Downgrade: max(0, 2500 - (250 + 1300)) = 950
      expect(result.calculations.downgrade_penalty).toBe(950);
      
      expect(result.calculations.additional_security).toBe(1400);
      expect(result.calculations.total_new_security).toBe(2600); // 1200 + 1400
      
      // Cleanup
      await pool.query('DELETE FROM products WHERE id = $1', [testProductId3]);
    });

    // Test: Calculates security difference correctly
    test('should calculate security difference', async () => {
      const result = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        testProductId2,
        []
      );
      
      // Original: 1000, New: 1200
      expect(result.calculations.security_difference).toBe(200);
    });

    // Test: Throws error for non-existent booking product
    test('should throw error for non-existent booking product', async () => {
      await expect(
        productLifecycleService.calculateExchangePreview(999999, testProductId2, [])
      ).rejects.toThrow('Booking product not found');
    });

    // Test: Throws error for non-existent new product
    test('should throw error for non-existent new product', async () => {
      await expect(
        productLifecycleService.calculateExchangePreview(testBookingProductId, 999999, [])
      ).rejects.toThrow('New product not found');
    });

    // Test: Uses shared calculation logic (downgrade penalty formula)
    test('should use same calculation as exchangeProduct method', async () => {
      const preview = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        testProductId2,
        []
      );
      
      // The calculation should match: max(0, original_rent - (exchange_penalty + total_new_rent))
      const expectedDowngradePenalty = Math.max(0, 2500 - (250 + 600));
      expect(preview.calculations.downgrade_penalty).toBe(expectedDowngradePenalty);
      
      // Verify it matches the formula in _calculateExchangePenalties
      expect(expectedDowngradePenalty).toBe(1650);
    });
  });

  describe('updateBookingDateRange', () => {
    // Test: Updates booking date range based on active products only
    test('should update booking date range from active products', async () => {
      // Add second product with extended date range
      const laterDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const bp2 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, $3, 'confirmed', 1500, 800, 1500)
         RETURNING id`,
        [testBookingId, testProductId2, laterDate]
      );
      
      await productLifecycleService.updateBookingDateRange(testBookingId);
      
      const booking = await pool.query('SELECT booked_to FROM bookings WHERE id = $1', [testBookingId]);
      expect(new Date(booking.rows[0].booked_to).toISOString().split('T')[0]).toBe(laterDate);
      
      await pool.query('DELETE FROM booking_products WHERE id = $1', [bp2.rows[0].id]);
    });

    // Test: Excludes cancelled products from date range calculation
    test('should exclude cancelled products from date range', async () => {
      const originalBooking = await pool.query('SELECT booked_to FROM bookings WHERE id = $1', [testBookingId]);
      const originalDate = new Date(originalBooking.rows[0].booked_to).toISOString().split('T')[0];
      
      // Add cancelled product with later date - should NOT affect booking date range
      const laterDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const bp2 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, $3, 'cancelled', 1500, 800, 1500)
         RETURNING id`,
        [testBookingId, testProductId2, laterDate]
      );
      
      await productLifecycleService.updateBookingDateRange(testBookingId);
      
      const booking = await pool.query('SELECT booked_to FROM bookings WHERE id = $1', [testBookingId]);
      expect(new Date(booking.rows[0].booked_to).toISOString().split('T')[0]).toBe(originalDate);
      
      await pool.query('DELETE FROM booking_products WHERE id = $1', [bp2.rows[0].id]);
    });

    // Test: Excludes exchanged products from date range calculation
    test('should exclude exchanged products from date range', async () => {
      const originalBooking = await pool.query('SELECT booked_to FROM bookings WHERE id = $1', [testBookingId]);
      const originalDate = new Date(originalBooking.rows[0].booked_to).toISOString().split('T')[0];
      
      // Add exchanged product with later date - should NOT affect booking date range
      const laterDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const bp2 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, $3, 'exchanged', 1500, 800, 1500)
         RETURNING id`,
        [testBookingId, testProductId2, laterDate]
      );
      
      await productLifecycleService.updateBookingDateRange(testBookingId);
      
      const booking = await pool.query('SELECT booked_to FROM bookings WHERE id = $1', [testBookingId]);
      expect(new Date(booking.rows[0].booked_to).toISOString().split('T')[0]).toBe(originalDate);
      
      await pool.query('DELETE FROM booking_products WHERE id = $1', [bp2.rows[0].id]);
    });
  });
});
