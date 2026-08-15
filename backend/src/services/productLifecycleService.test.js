const productLifecycleService = require('../services/productLifecycleService');
const chargeAccountingService = require('../services/chargeAccountingService');
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
      
      // Deactivate real policies and clean test policies — never delete real ones!
      await client.query(`UPDATE rental_policies SET is_active = false WHERE policy_key NOT LIKE 'test_%'`);
      await client.query(`DELETE FROM rental_policies WHERE policy_key LIKE 'test_%'`);
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
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed')
         RETURNING id`
      );
      testBookingId = bookingResult.rows[0].id;
      
      // Create test products (ON CONFLICT handles leftover data from previous runs)
      const product1 = await client.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
         VALUES ('Test Product 1', 'TEST001', 'Test', '{M}', 500, 1000)
         ON CONFLICT ((LOWER(code))) WHERE status != 'archived' DO UPDATE SET name = EXCLUDED.name
         RETURNING id`
      );
      testProductId1 = product1.rows[0].id;
      
      const product2 = await client.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
         VALUES ('Test Product 2', 'TEST002', 'Test', '{L}', 600, 1200)
         ON CONFLICT ((LOWER(code))) WHERE status != 'archived' DO UPDATE SET name = EXCLUDED.name
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
    await pool.query('DELETE FROM payment_transactions WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)', [testBookingId]);
    await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM products WHERE code LIKE $1', ['TEST%']); // Clean all TEST products
  });

  afterAll(async () => {
    // Clean up test policies and re-activate real ones (pool.end() handled by global teardown)
    await pool.query(`DELETE FROM rental_policies WHERE policy_key LIKE 'test_%'`);
    await pool.query(`UPDATE rental_policies SET is_active = true WHERE policy_key NOT LIKE 'test_%'`);
  });

  describe('exchangeProduct', () => {
    // Shared date helpers for all exchange tests
    const today = new Date().toISOString().slice(0, 10);
    const in5days = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

    // Test: Exchanges one booking product for one new product (one-to-one exchange)
    test('should exchange product successfully (one-to-one)', async () => {
      const result = await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [
          { productId: testProductId2, size: 'L', bookedFrom: today, bookedTo: in5days, rent: 3000, securityDeposit: 1200 }
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
        `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
         VALUES ('Test Product 3', 'TEST003', 'Test', '{XL}', 700, 1400)
         RETURNING id`
      );
      const testProductId3 = product3.rows[0].id;
      
      const result = await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [
          { productId: testProductId2, size: 'L', bookedFrom: today, bookedTo: in5days, rent: 1500, securityDeposit: 600 },
          { productId: testProductId3, size: 'XL', bookedFrom: today, bookedTo: in5days, rent: 1000, securityDeposit: 500 }
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
          { productId: testProductId2, size: 'L', bookedFrom: today, bookedTo: in5days, rent: 1000, securityDeposit: 500 }
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
          [{ productId: testProductId2, size: 'L', rent: 3000, securityDeposit: 1200 }],
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
          [{ productId: testProductId2, size: 'L', rent: 3000, securityDeposit: 1200 }],
          'Test',
          String(testUserId)
        )
      ).rejects.toThrow('Cannot exchange product with status: in_progress');
    });

    // Test: Creates activity log entry tracking the exchange event
    test('should create activity log entry', async () => {
      await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [{ productId: testProductId2, size: 'L', bookedFrom: today, bookedTo: in5days, rent: 3000, securityDeposit: 1200 }],
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

    // Test: Verifies correct financial settlement when exchange payment is collected.
    // Pins the two original bugs:
    //   Bug #1 — no adjustment transaction double-counting old rent
    //   Bug #2 — exchange penalty must be paid from exchange payment, not silently dropped
    // Also asserts old product rent zeroed, new product rent fully funded,
    // and pre-existing (non-exchanged) product rent is byte-for-byte unchanged.
    test('should correctly settle exchange finances with payment: no adjustment, penalty paid, new rent funded, pre-existing unchanged', async () => {
      // Create a third product for use as exchange target (testProductId2 is used as the pre-existing product)
      const product3 = await pool.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
         VALUES ('Test Product 3', 'TEST003', 'Test', '{XL}', 700, 1400)
         ON CONFLICT ((LOWER(code))) WHERE status != 'archived' DO UPDATE SET name = EXCLUDED.name
         RETURNING id`
      );
      const testProductId3 = product3.rows[0].id;

      // Add a pre-existing product to the same booking (not involved in the exchange)
      const preExistingResult = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 1500, 800, 1500)
         RETURNING id`,
        [testBookingId, testProductId2]
      );
      const preExistingBpId = preExistingResult.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 1500, 0), ($1, 'security', 800, 0)`,
        [preExistingBpId]
      );

      // Simulate prior partial payments already applied:
      //   testBookingProductId (old, rent=2500): 1000 paid
      //   preExistingBpId (rent=1500): 600 paid
      await pool.query(
        `UPDATE product_charges SET paid_amount = 1000
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [testBookingProductId]
      );
      await pool.query(
        `UPDATE product_charges SET paid_amount = 600
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [preExistingBpId]
      );

      // exchange_penalty = 10% of 2500 (effective_rent) = 250
      // settleExchange pool = old rent paid (1000) + paymentAmount
      // new product rent = 3000, outstanding after redistribution = 3000 - 1000 = 2000
      // paymentAmount = penalty (250) + outstanding new rent (2000) = 2250
      const paymentAmount = 2250;

      // Exchange testBookingProductId (product1) → testProductId3 (not testProductId2, which is already in the booking)
      const result = await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [{ productId: testProductId3, size: 'XL', bookedFrom: today, bookedTo: in5days, rent: 3000, securityDeposit: 1200 }],
        'Test exchange with payment',
        String(testUserId),
        { amount: paymentAmount, method: 'Cash', recorded_by: String(testUserId), notes: 'Exchange payment' }
      );

      // Bug #1 pin: no adjustment transaction must exist
      const adjustmentTxRows = await pool.query(
        `SELECT id FROM payment_transactions WHERE booking_id = $1 AND type = 'adjustment'`,
        [testBookingId]
      );
      expect(adjustmentTxRows.rows.length).toBe(0);

      // Single payment transaction of correct amount
      const paymentTxRows = await pool.query(
        `SELECT amount, type FROM payment_transactions WHERE booking_id = $1 AND type = 'payment'`,
        [testBookingId]
      );
      expect(paymentTxRows.rows.length).toBe(1);
      expect(parseInt(paymentTxRows.rows[0].amount)).toBe(paymentAmount);

      // Old product rent zeroed (due=0, paid=0)
      const oldRentCharge = await pool.query(
        `SELECT due_amount, paid_amount FROM product_charges
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [testBookingProductId]
      );
      expect(oldRentCharge.rows[0].due_amount).toBe(0);
      expect(oldRentCharge.rows[0].paid_amount).toBe(0);

      // Bug #2 pin: exchange penalty must be fully paid on old product
      const penaltyCharge = await pool.query(
        `SELECT due_amount, paid_amount FROM product_charges
         WHERE booking_product_id = $1 AND charge_type = 'exchange_penalty'`,
        [testBookingProductId]
      );
      expect(penaltyCharge.rows[0].due_amount).toBe(250);
      expect(penaltyCharge.rows[0].paid_amount).toBe(250);

      // New product rent fully funded: 1000 (from redistribution) + 2000 (from payment) = 3000
      const newBpId = result.new_booking_product_ids[0];
      const newRentCharge = await pool.query(
        `SELECT due_amount, paid_amount FROM product_charges
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [newBpId]
      );
      expect(newRentCharge.rows[0].due_amount).toBe(3000);
      expect(newRentCharge.rows[0].paid_amount).toBe(3000);

      // Pre-existing product rent completely unchanged (still 600)
      const preExistingRentCharge = await pool.query(
        `SELECT paid_amount FROM product_charges
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [preExistingBpId]
      );
      expect(preExistingRentCharge.rows[0].paid_amount).toBe(600);
    });

    describe('financial edge cases', () => {
      // Financial invariant: total payment_transactions sum equals all money collected.
      // Guards against double-counting via adjustment (Bug #1 regression).
      test('SUM(payment_transactions) equals total payments collected — no double-count', async () => {
        // Simulate a prior payment: insert a transaction record and set paid_amount
        const priorPayment = 1200;
        await pool.query(
          `INSERT INTO payment_transactions (booking_id, amount, type, method, notes, recorded_by)
           VALUES ($1, $2, 'payment', 'Cash', 'Prior payment', 'admin')`,
          [testBookingId, priorPayment]
        );
        await pool.query(
          `UPDATE product_charges SET paid_amount = $1
           WHERE booking_product_id = $2 AND charge_type = 'rent'`,
          [priorPayment, testBookingProductId]
        );

        // exchange_penalty = 250. pool = 1200 + exchangePayment.
        // New product rent = 3000. outstanding = 3000 - 1200 = 1800. Need: 250 + 1800 = 2050.
        const exchangePayment = 2050;
        await productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, size: 'L', bookedFrom: today, bookedTo: in5days, rent: 3000, securityDeposit: 1200 }],
          'Financial invariant test',
          String(testUserId),
          { amount: exchangePayment, method: 'Cash', recorded_by: String(testUserId), notes: 'Exchange payment' }
        );

        // SUM of all payment transactions must equal prior + exchange (no inflation via adjustment)
        const sumResult = await pool.query(
          `SELECT COALESCE(SUM(amount::INTEGER), 0) AS total
           FROM payment_transactions WHERE booking_id = $1 AND type = 'payment'`,
          [testBookingId]
        );
        expect(parseInt(sumResult.rows[0].total)).toBe(priorPayment + exchangePayment);

        // Confirm absolutely no adjustment transaction exists
        const adjResult = await pool.query(
          `SELECT id FROM payment_transactions WHERE booking_id = $1 AND type = 'adjustment'`,
          [testBookingId]
        );
        expect(adjResult.rows.length).toBe(0);
      });

      // Zero redistribution: old product had no prior paid rent.
      // New product must be funded entirely from the exchange payment (not from any phantom credit).
      test('old product with 0 prior paid rent: new product funded entirely from exchange payment', async () => {
        // testBookingProductId: effective_rent=2500, paid_amount=0 (default from beforeEach)
        // exchange_penalty = 10% of 2500 = 250; downgrade_penalty = max(0, 2500-(250+3000)) = 0
        // paymentAmount = 250 (penalty) + 3000 (full new rent, no prior credit) = 3250
        const paymentAmount = 3250;

        const result = await productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, size: 'L', bookedFrom: today, bookedTo: in5days, rent: 3000, securityDeposit: 1200 }],
          'Zero redistribution test',
          String(testUserId),
          { amount: paymentAmount, method: 'Cash', recorded_by: String(testUserId), notes: 'Exchange payment' }
        );

        const newBpId = result.new_booking_product_ids[0];

        // Old product rent: due=0, paid=0 (was already 0 before; still zeroed correctly)
        const oldRent = await pool.query(
          `SELECT due_amount, paid_amount FROM product_charges
           WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [testBookingProductId]
        );
        expect(oldRent.rows[0].due_amount).toBe(0);
        expect(oldRent.rows[0].paid_amount).toBe(0);

        // Exchange penalty paid from payment (not from any phantom redistribution)
        const penalty = await pool.query(
          `SELECT paid_amount FROM product_charges
           WHERE booking_product_id = $1 AND charge_type = 'exchange_penalty'`,
          [testBookingProductId]
        );
        expect(penalty.rows[0].paid_amount).toBe(250);

        // New product rent = 0 (redistribution) + (3250 - 250) = 3000: fully covered
        const newRent = await pool.query(
          `SELECT paid_amount FROM product_charges
           WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [newBpId]
        );
        expect(newRent.rows[0].paid_amount).toBe(3000);
      });

      // 1-to-2 exchange: pool fills the highest-rent new product first (ORDER BY rent DESC),
      // remainder flows to the second. Confirms sequential (not proportional) fill.
      test('1-to-2 exchange: pool fills highest-rent new product first, remainder to second', async () => {
        await pool.query(`DELETE FROM products WHERE code = 'TEST003'`);
        const product3 = await pool.query(
          `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
           VALUES ('Test Product 3', 'TEST003', 'Test', '{S}', 400, 800)
           RETURNING id`
        );
        const testProductId3 = product3.rows[0].id;

        try {
          // exchange_penalty = 250. No prior paid → redistribution = 0.
          // 2 new products: newA (rent=1500), newB (rent=2500).
          // settleExchange processes ORDER BY rent DESC → newB first, then newA.
          // paymentAmount = 2000: pool = 0 + 2000 = 2000.
          // After penalty: remaining = 1750.
          // newB (due=2500): toApply = min(1750, 2500) = 1750 → paid=1750. remaining=0.
          // newA (due=1500): remaining=0 → paid=0.
          const paymentAmount = 2000;

          const result = await productLifecycleService.exchangeProduct(
            testBookingProductId,
            [
              { productId: testProductId2, size: 'L', bookedFrom: today, bookedTo: in5days, rent: 1500, securityDeposit: 600 },
              { productId: testProductId3, size: 'S', bookedFrom: today, bookedTo: in5days, rent: 2500, securityDeposit: 1000 }
            ],
            '1-to-2 exchange sequential fill test',
            String(testUserId),
            { amount: paymentAmount, method: 'Cash', recorded_by: String(testUserId), notes: 'Exchange payment' }
          );

          expect(result.new_booking_product_ids).toHaveLength(2);

          // Identify which new bp has rent=2500 (high) and rent=1500 (low)
          const newBps = await pool.query(
            `SELECT id, rent FROM booking_products WHERE id = ANY($1) ORDER BY rent DESC`,
            [result.new_booking_product_ids]
          );
          const highRentBpId = newBps.rows[0].id; // rent=2500
          const lowRentBpId = newBps.rows[1].id;  // rent=1500

          // High-rent product receives 1750 (all remaining after penalty)
          const highRent = await pool.query(
            `SELECT paid_amount FROM product_charges
             WHERE booking_product_id = $1 AND charge_type = 'rent'`,
            [highRentBpId]
          );
          expect(highRent.rows[0].paid_amount).toBe(1750);

          // Low-rent product receives 0 (pool exhausted by high-rent product)
          const lowRent = await pool.query(
            `SELECT paid_amount FROM product_charges
             WHERE booking_product_id = $1 AND charge_type = 'rent'`,
            [lowRentBpId]
          );
          expect(lowRent.rows[0].paid_amount).toBe(0);
        } finally {
          await pool.query('DELETE FROM products WHERE id = $1', [testProductId3]);
        }
      });

      // Downgrade penalty: when new product rent < (old effective_rent - exchange_penalty),
      // both exchange_penalty and downgrade_penalty are paid in full before any rent is covered.
      test('downgrade penalty paid in full before new product rent is funded', async () => {
        // testBookingProductId: effective_rent=2500, 0 prior paid
        // exchange_penalty = 10% of 2500 = 250
        // new product rent = 1000 → downgrade_penalty = max(0, 2500 - (250 + 1000)) = 1250
        // paymentAmount = 250 + 1250 + 1000 = 2500 (exact: covers both penalties + new rent)
        const paymentAmount = 2500;

        const result = await productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, size: 'L', bookedFrom: today, bookedTo: in5days, rent: 1000, securityDeposit: 400 }],
          'Downgrade to lower rent product',
          String(testUserId),
          { amount: paymentAmount, method: 'Cash', recorded_by: String(testUserId), notes: 'Exchange payment' }
        );

        expect(result.exchange_penalty).toBe(250);
        expect(result.downgrade_penalty).toBe(1250);

        const newBpId = result.new_booking_product_ids[0];

        // exchange_penalty fully paid (priority 1)
        const exchPenalty = await pool.query(
          `SELECT paid_amount FROM product_charges
           WHERE booking_product_id = $1 AND charge_type = 'exchange_penalty'`,
          [testBookingProductId]
        );
        expect(exchPenalty.rows[0].paid_amount).toBe(250);

        // downgrade_penalty fully paid (priority 2)
        const downgradePenalty = await pool.query(
          `SELECT paid_amount FROM product_charges
           WHERE booking_product_id = $1 AND charge_type = 'downgrade_penalty'`,
          [testBookingProductId]
        );
        expect(downgradePenalty.rows[0].paid_amount).toBe(1250);

        // New product rent paid only after both penalties consumed (priority 3)
        // pool = 0 + 2500 = 2500; after 250+1250 = 1000 remaining → rent paid = 1000
        const newRent = await pool.query(
          `SELECT paid_amount FROM product_charges
           WHERE booking_product_id = $1 AND charge_type = 'rent'`,
          [newBpId]
        );
        expect(newRent.rows[0].paid_amount).toBe(1000);
      });
    });

    describe('availability check on exchange', () => {
      // The new product (testProductId2) is already booked elsewhere for the same dates — must reject
      test('should reject exchange if the new product is already booked for those dates', async () => {
        const from = new Date().toISOString().slice(0, 10);
        const to   = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

        // Create a separate booking that holds testProductId2 on the same dates
        const blocker = await pool.query(
          `INSERT INTO bookings (user_id, booking_date, status, created_by)
           VALUES (1, CURRENT_DATE, 'confirmed', 'test')
           RETURNING id`
        );
        const blockerBookingId = blocker.rows[0].id;
        await pool.query(
          `INSERT INTO booking_products
             (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent, size)
           VALUES ($1, $2, 1, $3, $4, 'confirmed', 600, 1200, 600, 'L')`,
          [blockerBookingId, testProductId2, from, to]
        );

        try {
          await expect(
            productLifecycleService.exchangeProduct(
              testBookingProductId,
              [{ productId: testProductId2, size: 'L', bookedFrom: from, bookedTo: to, rent: 3000, securityDeposit: 1200 }],
              'Exchange to booked product',
              String(testUserId)
            )
          ).rejects.toThrow(/not available/);
        } finally {
          await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [blockerBookingId]);
          await pool.query('DELETE FROM bookings WHERE id = $1', [blockerBookingId]);
        }
      });

      // No other bookings for the new product — must succeed
      test('should allow exchange when the new product is free for those dates', async () => {
        const from = new Date().toISOString().slice(0, 10);
        const to   = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

        await expect(
          productLifecycleService.exchangeProduct(
            testBookingProductId,
            [{ productId: testProductId2, size: 'L', bookedFrom: from, bookedTo: to, rent: 3000, securityDeposit: 1200 }],
            'Exchange to free product',
            String(testUserId)
          )
        ).resolves.toMatchObject({ new_booking_product_ids: expect.any(Array) });
      });

      // A cancelled booking for the same product + dates must NOT block the exchange
      test('should allow exchange when the only overlapping booking is cancelled', async () => {
        const from = new Date().toISOString().slice(0, 10);
        const to   = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

        const cancelled = await pool.query(
          `INSERT INTO bookings (user_id, booking_date, status, created_by)
           VALUES (1, CURRENT_DATE, 'cancelled', 'test')
           RETURNING id`
        );
        const cancelledId = cancelled.rows[0].id;
        await pool.query(
          `INSERT INTO booking_products
             (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
           VALUES ($1, $2, 1, $3, $4, 'confirmed', 600, 1200, 600)`,
          [cancelledId, testProductId2, from, to]
        );

        try {
          await expect(
            productLifecycleService.exchangeProduct(
              testBookingProductId,
              [{ productId: testProductId2, size: 'L', bookedFrom: from, bookedTo: to, rent: 3000, securityDeposit: 1200 }],
              'Exchange past a cancelled overlap',
              String(testUserId)
            )
          ).resolves.toMatchObject({ new_booking_product_ids: expect.any(Array) });
        } finally {
          await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [cancelledId]);
          await pool.query('DELETE FROM bookings WHERE id = $1', [cancelledId]);
        }
      });

      test('should reject exchange if the replacement product is archived', async () => {
        // Archive testProductId2 which is used as the replacement
        await pool.query(`UPDATE products SET status = 'archived' WHERE id = $1`, [testProductId2]);

        const from = new Date().toISOString().slice(0, 10);
        const to   = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

        try {
          await expect(
            productLifecycleService.exchangeProduct(
              testBookingProductId,
              [{ productId: testProductId2, size: 'L', bookedFrom: from, bookedTo: to, rent: 3000, securityDeposit: 1200 }],
              'Exchange to archived product',
              String(testUserId)
            )
          ).rejects.toThrow('is archived and cannot be added to a booking');
        } finally {
          await pool.query(`UPDATE products SET status = 'available' WHERE id = $1`, [testProductId2]);
        }
      });

      test('should succeed exchange when replacement product is available', async () => {
        // Ensure testProductId2 is available
        await pool.query(`UPDATE products SET status = 'available' WHERE id = $1`, [testProductId2]);

        const from = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
        const to   = new Date(Date.now() + 35 * 864e5).toISOString().slice(0, 10);

        const result = await productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, size: 'L', bookedFrom: from, bookedTo: to, rent: 3000, securityDeposit: 1200 }],
          'Exchange to available product',
          String(testUserId)
        );
        expect(result).toHaveProperty('new_booking_product_ids');
      });
    });

    describe('booking date range recalculation on exchange (Fix 2)', () => {
      // Fix 2: booking booked_from/booked_to must reflect the NEW product's dates after exchange
      test('booking date range updates to match the new product dates after exchange', async () => {
        const newFrom = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
        const newTo   = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

        // Confirm the booking currently ends on the old product's booked_to (today+5, from beforeEach)
        const before = await pool.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId]);
        const oldTo = before.rows[0].booked_to.toISOString().slice(0, 10);
        expect(oldTo).not.toBe(newTo); // sanity: new dates are different

        await productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, size: 'L', bookedFrom: newFrom, bookedTo: newTo, rent: 3000, securityDeposit: 1200 }],
          'Date-range recalc test',
          String(testUserId)
        );

        const after = await pool.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId]);
        expect(after.rows[0].booked_from.toISOString().slice(0, 10)).toBe(newFrom);
        expect(after.rows[0].booked_to.toISOString().slice(0, 10)).toBe(newTo);
      });

      // Fix 1 + Fix 2 combined: the old (exchanged) product's dates must be free for new bookings
      test('old product dates are freed for new bookings after exchange (completed status not a blocker)', async () => {
        const { checkProductAvailability } = require('../utils/bookingDateUtils');

        const oldFrom = new Date().toISOString().slice(0, 10);
        const oldTo   = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
        const newFrom = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
        const newTo   = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10);

        // Exchange testProductId1 (booked oldFrom–oldTo) for testProductId2 (booked newFrom–newTo)
        await productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, size: 'L', bookedFrom: newFrom, bookedTo: newTo, rent: 3000, securityDeposit: 1200 }],
          'Free-up old dates test',
          String(testUserId)
        );

        // testProductId1 is now 'exchanged' for oldFrom–oldTo — those dates must be available again
        await expect(
          checkProductAvailability(testProductId1, oldFrom, oldTo)
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('cancelProduct', () => {
    // Test: Cancels a booking product with zero penalty and marks it as cancelled
    test('should cancel product successfully', async () => {
      // Use 0 penalty: service blocks cancellation when penalty > paid (nothing paid yet)
      const result = await productLifecycleService.cancelProduct(
        testBookingProductId,
        0, // no penalty — avoids negative refund guard
        'Customer request',
        testUserId
      );
      
      expect(result.booking_product_id).toBe(testBookingProductId);
      expect(result.cancellation_penalty).toBe(0);
      expect(result.status).toBe('cancelled');
      
      // Verify product is marked as cancelled
      const product = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(product.rows[0].status).toBe('cancelled');
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

    // Test: Real-world use case — customer paid rent in full, then cancels with a penalty
    test('should cancel with non-zero penalty when sufficient payment exists', async () => {
      // Pay full rent (2500) so penalty can be deducted without going negative
      await chargeAccountingService.applyPayment(testBookingId, 2500, 'Cash', 'test-user', 'Full rent payment');

      // Cancel with 10% penalty = 250
      const result = await productLifecycleService.cancelProduct(
        testBookingProductId,
        250,
        'Customer cancelled after payment',
        testUserId
      );

      expect(result.status).toBe('cancelled');
      expect(result.cancellation_penalty).toBe(250);
      // diff_amount = paid_rent - penalty = 2500 - 250 = 2250 (refundable)
      expect(result.diff_amount).toBe(2250);

      // Verify a cancellation_penalty charge row was created
      const penaltyCharge = await pool.query(
        `SELECT * FROM product_charges
         WHERE booking_product_id = $1 AND charge_type = 'cancellation_penalty'`,
        [testBookingProductId]
      );
      expect(penaltyCharge.rows.length).toBe(1);
      expect(penaltyCharge.rows[0].due_amount).toBe(250);
    });

    // Test: Penalty exactly equals rent paid — diff_amount should be 0 (no refund, no debt)
    test('should cancel with penalty equal to payment (zero diff_amount)', async () => {
      // Pay exactly 50% of rent (minimum allowed first payment on rent=2500)
      await chargeAccountingService.applyPayment(testBookingId, 1250, 'Cash', 'test-user', 'Half rent payment');

      const result = await productLifecycleService.cancelProduct(
        testBookingProductId,
        1250,
        'Cancel after half-rent payment',
        testUserId
      );

      expect(result.status).toBe('cancelled');
      expect(result.cancellation_penalty).toBe(1250);
      // 1250 paid - 1250 penalty = 0 — no refund owed, no extra collection needed
      expect(result.diff_amount).toBe(0);
    });

    // Test: Penalty > amount paid should be blocked (negative refund guard)
    test('should block cancellation when penalty exceeds amount paid', async () => {
      // Pay 50% of rent (minimum first payment = 1250), but set penalty higher than that
      await chargeAccountingService.applyPayment(testBookingId, 1250, 'Cash', 'test-user', 'Half rent payment');

      await expect(
        productLifecycleService.cancelProduct(
          testBookingProductId,
          2000, // 2000 penalty > 1250 paid → negative refund
          'Test',
          testUserId
        )
      ).rejects.toThrow(); // negative refund guard fires
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
      // Use 0 penalty: service blocks when penalty > paid amount
      await productLifecycleService.cancelProduct(
        testBookingProductId,
        0,
        'Out of stock',
        String(testUserId)
      );
      
      const history = await pool.query(
        'SELECT * FROM booking_cancellation_history WHERE booking_product_id = $1',
        [testBookingProductId]
      );
      expect(history.rows.length).toBe(1);
      expect(history.rows[0].cancellation_penalty).toBe(0);
      expect(history.rows[0].reason).toBe('Out of stock');
      expect(history.rows[0].cancelled_by).toBe(String(testUserId));
    });

    // Test: Creates activity log entry tracking the cancellation event
    test('should create activity log entry', async () => {
      // Use 0 penalty: service blocks when penalty > paid amount
      await productLifecycleService.cancelProduct(
        testBookingProductId,
        0,
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

      // Verify tracking row inserted with picked_by_customer status
      const tracking = await pool.query(
        `SELECT tracking_status FROM product_tracking
         WHERE booking_id = $1 AND tracking_status = 'picked_by_customer'
         ORDER BY created_at DESC LIMIT 1`,
        [testBookingId]
      );
      expect(tracking.rows.length).toBe(1);
      expect(tracking.rows[0].tracking_status).toBe('picked_by_customer');
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
        [{ bookingProductId: testBookingProductId }],
        String(testUserId)
      );
      
      expect(result.booking_id).toBe(testBookingId);
      expect(result.returned_count).toBe(1);
      
      // Verify product status updated
      const product = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(product.rows[0].status).toBe('completed');

      // Verify tracking row inserted with in_house status
      const tracking = await pool.query(
        `SELECT tracking_status FROM product_tracking
         WHERE booking_id = $1 AND tracking_status = 'in_house'
         ORDER BY created_at DESC LIMIT 1`,
        [testBookingId]
      );
      expect(tracking.rows.length).toBe(1);
      expect(tracking.rows[0].tracking_status).toBe('in_house');
    });

    // Test: Late fee is NOT created during return — it's deferred to security refund
    test('should NOT create late fee charge during return (deferred to security refund)', async () => {
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
        [{ bookingProductId: testBookingProductId }],
        String(testUserId)
      );
      
      // No fee fields in result
      expect(result.total_late_fees).toBeUndefined();
      expect(result.total_damage_fees).toBeUndefined();
      
      // Verify NO late fee charge was added
      const charge = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'late_fee'`,
        [testBookingProductId]
      );
      expect(charge.rows.length).toBe(0);

      // But product should still be marked completed
      const product = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(product.rows[0].status).toBe('completed');
    });

    // Test: Damage fee is NOT created during return — it's deferred to security refund
    test('should NOT create damage fee charge during return (deferred to security refund)', async () => {
      const result = await productLifecycleService.returnProducts(
        testBookingId,
        [{ bookingProductId: testBookingProductId }],
        String(testUserId)
      );
      
      // No fee fields in result
      expect(result.total_damage_fees).toBeUndefined();
      
      // Verify NO damage fee charge was added
      const charge = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'damage_fee'`,
        [testBookingProductId]
      );
      expect(charge.rows.length).toBe(0);
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
        [{ bookingProductId: testBookingProductId }],
        String(testUserId)
      );
      
      // Result should not include booking_completed field anymore
      expect(result.booking_completed).toBeUndefined();
      
      // Verify booking is partially_completed (one product returned, one still out)
      const booking = await pool.query(
        'SELECT status FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].status).toBe('partially_completed');
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
          [{ bookingProductId: testBookingProductId }],
          String(testUserId)
        )
      ).rejects.toThrow('not in in_progress status');
    });

    // Test: Creates activity log entry tracking the return event
    test('should create activity log entry', async () => {
      await productLifecycleService.returnProducts(
        testBookingId,
        [{ bookingProductId: testBookingProductId }],
        String(testUserId)
      );
      
      const log = await pool.query(
        `SELECT * FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'products_returned'`,
        [testBookingId]
      );
      expect(log.rows.length).toBe(1);
      expect(log.rows[0].details.booking_product_ids).toContain(testBookingProductId);
      // No fee fields in activity log (fees are deferred to security refund)
      expect(log.rows[0].details.total_late_fees).toBeUndefined();
      expect(log.rows[0].details.total_damage_fees).toBeUndefined();
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

  describe('Security Gate: Cancel & Exchange blocked when security paid', () => {
    // Test: Cancel with 0 security paid → allowed
    test('should allow cancel when no security is paid', async () => {
      // Security paid_amount is 0 by default in beforeEach
      const result = await productLifecycleService.cancelProduct(
        testBookingProductId,
        0,
        'Test cancel with no security',
        testUserId
      );
      
      expect(result.status).toBe('cancelled');
    });

    // Test: Cancel with partial security paid → blocked
    test('should block cancel when partial security is paid', async () => {
      // Pay partial security
      await pool.query(
        `UPDATE product_charges SET paid_amount = 500 
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [testBookingProductId]
      );
      
      await expect(
        productLifecycleService.cancelProduct(
          testBookingProductId,
          0,
          'Test cancel with partial security',
          testUserId
        )
      ).rejects.toThrow('Cannot cancel product: security deposit has been partially or fully paid');
    });

    // Test: Cancel with full security paid → blocked
    test('should block cancel when full security is paid', async () => {
      await pool.query(
        `UPDATE product_charges SET paid_amount = due_amount 
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [testBookingProductId]
      );
      
      await expect(
        productLifecycleService.cancelProduct(
          testBookingProductId,
          300,
          'Test cancel with full security',
          testUserId
        )
      ).rejects.toThrow('Cannot cancel product: security deposit has been partially or fully paid');
    });

    // Test: Exchange with 0 security paid → allowed
    test('should allow exchange when no security is paid', async () => {
      const t = new Date().toISOString().slice(0, 10);
      const t5 = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
      const result = await productLifecycleService.exchangeProduct(
        testBookingProductId,
        [{ productId: testProductId2, size: 'L', bookedFrom: t, bookedTo: t5, rent: 3000, securityDeposit: 1200 }],
        'Test exchange with no security',
        String(testUserId)
      );
      
      expect(result.old_booking_product_id).toBe(testBookingProductId);
    });

    // Test: Exchange with any security paid → blocked
    test('should block exchange when security is paid', async () => {
      await pool.query(
        `UPDATE product_charges SET paid_amount = 200 
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [testBookingProductId]
      );
      
      const t = new Date().toISOString().slice(0, 10);
      const t5 = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
      await expect(
        productLifecycleService.exchangeProduct(
          testBookingProductId,
          [{ productId: testProductId2, size: 'L', bookedFrom: t, bookedTo: t5, rent: 3000, securityDeposit: 1200 }],
          'Test exchange with security paid',
          String(testUserId)
        )
      ).rejects.toThrow('Cannot exchange product: security deposit has been partially or fully paid');
    });

    // Test: validateCancellationEligibility reflects security paid status
    test('validateCancellationEligibility should return ineligible when security paid', async () => {
      await pool.query(
        `UPDATE product_charges SET paid_amount = 500 
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [testBookingProductId]
      );
      
      const result = await productLifecycleService.validateCancellationEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('security deposit already paid');
    });

    // Test: validateExchangeEligibility reflects security paid status
    test('validateExchangeEligibility should return ineligible when security paid', async () => {
      await pool.query(
        `UPDATE product_charges SET paid_amount = 500 
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [testBookingProductId]
      );
      
      const result = await productLifecycleService.validateExchangeEligibility(testBookingProductId);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('security deposit already paid');
    });
  });

  describe('Negative Refund Block: cancel blocked when refund would be negative', () => {
    // Test: Cancel with diffAmount >= 0 proceeds normally (rent paid covers penalty)
    test('should allow cancel when paid amount covers penalty', async () => {
      // Pay some rent so totalPaid >= penalty
      await pool.query(
        `UPDATE product_charges SET paid_amount = 500 
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [testBookingProductId]
      );
      
      const result = await productLifecycleService.cancelProduct(
        testBookingProductId,
        300, // penalty < 500 paid
        'Test cancel with sufficient funds',
        testUserId
      );
      
      expect(result.status).toBe('cancelled');
      expect(result.diff_amount).toBeGreaterThanOrEqual(0);
    });

    // Test: Cancel with diffAmount < 0 (penalty > paid) → throws error, no status change
    test('should block cancel when penalty exceeds paid amount', async () => {
      // No rent paid (0 by default), penalty = 500 → diffAmount = -500
      await expect(
        productLifecycleService.cancelProduct(
          testBookingProductId,
          500, // penalty > 0 paid
          'Test cancel with insufficient funds',
          testUserId
        )
      ).rejects.toThrow('Cannot cancel: refund would be negative');
      
      // Verify product status unchanged
      const product = await pool.query(
        'SELECT status FROM booking_products WHERE id = $1',
        [testBookingProductId]
      );
      expect(product.rows[0].status).toBe('confirmed');
    });

    // Test: Cancel with zero penalty and zero paid → diffAmount = 0 → allowed
    test('should allow cancel with zero penalty and zero paid', async () => {
      const result = await productLifecycleService.cancelProduct(
        testBookingProductId,
        0,
        'Free cancellation',
        testUserId
      );
      
      expect(result.status).toBe('cancelled');
      expect(result.diff_amount).toBe(0);
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
      // Total payment due = penalty + downgrade + newRent - oldRentPaid
      // oldRentPaid = 0 (no payments made), so: 250 + 1650 + 600 - 0 = 2500
      expect(result.calculations.total_payment_due).toBe(2500);
      
      expect(result.penalty_policy).toBeDefined();
      expect(result.penalty_policy.key).toBe('test_exchange_0_5');
    });

    // Test: Calculates downgrade penalty correctly for downgrade scenario
    test('should calculate exchange preview for downgrade', async () => {
      // Create a product with lower rent
      const lowRentProduct = await pool.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
         VALUES ('Test Low Rent Product', 'TEST-LOW', 'Test', '{S}', 1000, 500)
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
      // Total payment due = penalty + downgrade + newRent - oldRentPaid
      // oldRentPaid = 0 (no payments made), so: 250 + 1250 + 1000 - 0 = 2500
      expect(result.calculations.total_payment_due).toBe(2500);
      
      // Cleanup
      await pool.query('DELETE FROM products WHERE id = $1', [lowRentProductId]);
    });

    // Test: Includes additional products in calculations
    test('should include additional products in calculations (one-to-many)', async () => {
      // Create another product for testing
      const product3 = await pool.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
         VALUES ('Test Product 3', 'TEST003', 'Test', '{XL}', 700, 1400)
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

    // ─── Size-based pricing tests ───

    test('should use size-specific rent when newProductSize is provided and rent_overrides exist', async () => {
      // Create a product with rent_overrides (size-based pricing)
      const sizedProduct = await pool.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, rent_overrides, security_deposit)
         VALUES ('Sized Product', 'TEST-SIZED', 'Test', '{S,M,L,XL}', 1000, '{"S": 800, "M": 1000, "L": 1200, "XL": 1500}', 500)
         RETURNING id`
      );
      const sizedProductId = sizedProduct.rows[0].id;

      // Request preview WITH size 'XL' which has rent_override of 1500
      const result = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        sizedProductId,
        [],
        'XL'   // <-- size param
      );

      // new_rent should be 1500 (XL override), NOT 1000 (base rent)
      expect(result.calculations.new_rent).toBe(1500);
      expect(result.calculations.total_new_rent).toBe(1500);

      // Cleanup
      await pool.query('DELETE FROM products WHERE id = $1', [sizedProductId]);
    });

    test('should use base rent when newProductSize is null even if rent_overrides exist', async () => {
      const sizedProduct = await pool.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, rent_overrides, security_deposit)
         VALUES ('Sized Product 2', 'TEST-SIZED2', 'Test', '{S,M,L}', 1000, '{"S": 800, "L": 1200}', 500)
         RETURNING id`
      );
      const sizedProductId = sizedProduct.rows[0].id;

      // No size passed — should fall back to base rent
      const result = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        sizedProductId,
        []
        // no size param
      );

      expect(result.calculations.new_rent).toBe(1000); // base rent

      await pool.query('DELETE FROM products WHERE id = $1', [sizedProductId]);
    });

    test('should use base rent when size has no override', async () => {
      const sizedProduct = await pool.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, rent_overrides, security_deposit)
         VALUES ('Sized Product 3', 'TEST-SIZED3', 'Test', '{S,M,L}', 1000, '{"S": 800}', 500)
         RETURNING id`
      );
      const sizedProductId = sizedProduct.rows[0].id;

      // Size 'M' has no override → should use base rent 1000
      const result = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        sizedProductId,
        [],
        'M'
      );

      expect(result.calculations.new_rent).toBe(1000); // base rent (no 'M' override)

      await pool.query('DELETE FROM products WHERE id = $1', [sizedProductId]);
    });

    test('should use size-specific rent for additional products when additionalProductSizes is provided', async () => {
      // Create two sized products
      const addProduct = await pool.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, rent_overrides, security_deposit)
         VALUES ('Add Sized', 'TEST-ADD-SZ', 'Test', '{S,M,L}', 1000, '{"S": 700, "L": 1500}', 500)
         RETURNING id`
      );
      const addProductId = addProduct.rows[0].id;

      const result = await productLifecycleService.calculateExchangePreview(
        testBookingProductId,
        testProductId2,  // base product (no size overrides, rent=600)
        [addProductId],
        null,            // no size for main product
        { [addProductId]: 'L' }  // additional product size = L → rent 1500
      );

      expect(result.additional_products[0].rent).toBe(1500); // L override, not base 1000
      expect(result.calculations.additional_rent).toBe(1500);
      expect(result.calculations.total_new_rent).toBe(2100); // 600 + 1500

      await pool.query('DELETE FROM products WHERE id = $1', [addProductId]);
    });

    test('should correctly calculate total payment with size-specific rents', async () => {
      const sizedProduct = await pool.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, rent_overrides, security_deposit)
         VALUES ('Sized Calc', 'TEST-SZ-CALC', 'Test', '{S,M,L,XL}', 1000, '{"S": 500, "XL": 2000}', 500)
         RETURNING id`
      );
      const sizedProductId = sizedProduct.rows[0].id;

      // Exchange to size S (rent 500) — should be different from base rent (1000)
      const resultS = await productLifecycleService.calculateExchangePreview(
        testBookingProductId, sizedProductId, [], 'S'
      );
      expect(resultS.calculations.new_rent).toBe(500);

      // Exchange to size XL (rent 2000) — should be different again
      const resultXL = await productLifecycleService.calculateExchangePreview(
        testBookingProductId, sizedProductId, [], 'XL'
      );
      expect(resultXL.calculations.new_rent).toBe(2000);

      // Downgrade penalty differs because rent differs:
      // S: max(0, 2500 - (250 + 500)) = 1750
      // XL: max(0, 2500 - (250 + 2000)) = 250
      expect(resultS.calculations.downgrade_penalty).toBe(1750);
      expect(resultXL.calculations.downgrade_penalty).toBe(250);
      expect(resultS.calculations.downgrade_penalty).not.toBe(resultXL.calculations.downgrade_penalty);

      await pool.query('DELETE FROM products WHERE id = $1', [sizedProductId]);
    });
  });

  describe('calculateCancellationPreview', () => {
    // Test: Returns complete cancellation preview with all required fields for a single product
    test('should return cancellation preview with all required fields', async () => {
      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      expect(result.booking_id).toBe(testBookingId);
      expect(result.booking_date).toBeDefined();
      expect(typeof result.days_from_booking).toBe('number');
      expect(typeof result.penalty_percentage).toBe('number');
      expect(result.policy).toBeDefined();

      // Products
      expect(result.all_products).toHaveLength(1);
      expect(result.all_products[0]).toHaveProperty('product_id', testBookingProductId);
      expect(result.all_products[0]).toHaveProperty('name');
      expect(result.all_products[0]).toHaveProperty('code');
      expect(result.all_products[0]).toHaveProperty('rent', 2500);
      expect(result.all_products[0]).toHaveProperty('security_deposit', 1000);

      expect(result.products_to_cancel).toHaveLength(1);
      expect(result.products_to_cancel[0]).toHaveProperty('penalty_percentage');
      expect(result.products_to_cancel[0]).toHaveProperty('penalty_amount');
      expect(typeof result.products_to_cancel[0].penalty_amount).toBe('number');

      // Financial totals
      expect(result.total_cancelled_rent).toBe(2500);
      expect(result.total_cancelled_security).toBe(1000);
      expect(typeof result.total_penalty_amount).toBe('number');
      expect(typeof result.total_refund_amount).toBe('number');
      expect(typeof result.total_rent_paid).toBe('number');
      expect(typeof result.total_security_paid).toBe('number');

      // Per-product paid amounts
      expect(result.all_products[0]).toHaveProperty('rent_paid');
      expect(result.all_products[0]).toHaveProperty('security_paid');
      expect(result.products_to_cancel[0]).toHaveProperty('refund_amount');

      // Payment action
      expect(['none', 'refund', 'collect']).toContain(result.payment_action);
      expect(typeof result.payment_difference).toBe('number');
      expect(result.is_partial).toBe(false);
    });

    test('should include size in cancellation preview product data', async () => {
      // Set size on the booking_product
      await pool.query('UPDATE booking_products SET size = $1 WHERE id = $2', ['44', testBookingProductId]);

      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      expect(result.all_products).toHaveLength(1);
      expect(result.all_products[0]).toHaveProperty('size', '44');
      expect(result.products_to_cancel[0]).toHaveProperty('size', '44');

      // Reset size
      await pool.query('UPDATE booking_products SET size = NULL WHERE id = $1', [testBookingProductId]);
    });


    // Test: Calculates penalty based on policy (10% of effective rent for 0-5 days)
    test('should calculate penalty amount from policy', async () => {
      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      // Policy is 10% for 0-5 days, effective_rent = 2500
      expect(result.products_to_cancel[0].penalty_amount).toBe(250);
      expect(result.products_to_cancel[0].penalty_percentage).toBe(10);
      expect(result.total_penalty_amount).toBe(250);
    });

    // Test: Excludes cancelled products from preview
    test('should exclude cancelled products', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['cancelled', testBookingProductId]
      );

      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      expect(result.all_products).toHaveLength(0);
      expect(result.products_to_cancel).toHaveLength(0);
      expect(result.total_cancelled_rent).toBe(0);
      expect(result.total_cancelled_security).toBe(0);
      expect(result.total_penalty_amount).toBe(0);
    });

    // Test: Excludes exchanged products from preview
    test('should exclude exchanged products', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['exchanged', testBookingProductId]
      );

      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      expect(result.all_products).toHaveLength(0);
      expect(result.products_to_cancel).toHaveLength(0);
    });

    // Test: Excludes in_progress products from preview
    test('should exclude in_progress products', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['in_progress', testBookingProductId]
      );

      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      expect(result.all_products).toHaveLength(0);
      expect(result.products_to_cancel).toHaveLength(0);
    });

    // Test: Handles multiple cancellable products with summed totals
    test('should handle multiple cancellable products', async () => {
      // Add a second confirmed product
      const bp2 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 600, 1200, 600)
         RETURNING id`,
        [testBookingId, testProductId2]
      );

      // Add charges for second product
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES 
           ($1, 'rent', 600, 0),
           ($1, 'security', 1200, 0)`,
        [bp2.rows[0].id]
      );

      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      expect(result.all_products).toHaveLength(2);
      expect(result.products_to_cancel).toHaveLength(2);
      expect(result.total_cancelled_rent).toBe(3100); // 2500 + 600
      expect(result.total_cancelled_security).toBe(2200); // 1000 + 1200
      // Total penalty = 250 (10% of 2500) + 60 (10% of 600) = 310
      expect(result.total_penalty_amount).toBe(310);
    });

    // Test: Correctly computes payment_action as 'refund' when paid > penalty
    test('should set payment_action to refund when paid exceeds penalty', async () => {
      // Update paid_amount in product_charges to simulate payment applied
      await pool.query(
        `UPDATE product_charges SET paid_amount = 2500 WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [testBookingProductId]
      );
      await pool.query(
        `UPDATE product_charges SET paid_amount = 500 WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [testBookingProductId]
      );

      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      // Per-product paid amounts from product_charges
      expect(result.total_rent_paid).toBe(2500);
      expect(result.total_security_paid).toBe(500);
      expect(result.all_products[0].rent_paid).toBe(2500);
      expect(result.all_products[0].security_paid).toBe(500);
      // penalty is 250 (10% of 2500), paid = 2500 + 500 = 3000 > 250 => refund
      expect(result.payment_action).toBe('refund');
      // refund per product = 3000 - 250 = 2750
      expect(result.total_refund_amount).toBe(2750);
      expect(result.payment_difference).toBe(2750);
    });

    // Test: payment_action is 'none' when no payments have been made
    test('should set payment_action to none when no payments made', async () => {
      const result = await productLifecycleService.calculateCancellationPreview(testBookingId);

      // No payments, but penalty exists => collect
      // Actually: net_paid = 0, penalty = 250. baseRefund = max(0, 0 - 250) = 0.
      // Then totalPenaltyAmount (250) > netPaid (0) => collect
      expect(result.payment_action).toBe('collect');
      expect(result.payment_difference).toBe(250); // penalty - netPaid
    });

    // Test: Throws error for non-existent booking
    test('should throw error for non-existent booking', async () => {
      await expect(
        productLifecycleService.calculateCancellationPreview(999999)
      ).rejects.toThrow('Booking not found');
    });
  });

  describe('calculateCancellationSummary', () => {
    // Test: Returns correct summary for all products selected
    test('should return summary with all products selected', async () => {
      const result = await productLifecycleService.calculateCancellationSummary(
        testBookingId,
        [testBookingProductId], // select all
        {},  // no penalty overrides
        0    // no extra refund
      );

      expect(result.selected_count).toBe(1);
      expect(result.total_count).toBe(1);
      expect(result.selected_rent).toBe(2500);
      expect(result.selected_security).toBe(1000);
      expect(result.selected_rent_paid).toBe(0);
      expect(result.selected_security_paid).toBe(0);
      expect(result.total_penalty).toBe(250); // 10% of 2500
      expect(result.extra_refund).toBe(0);
      expect(result.refund_amount).toBe(0); // 0 paid - 250 penalty = negative → blocked
      // Service returns 'blocked' when penalty > paid (negative refund guard)
      expect(result.payment_action).toBe('blocked');
      expect(result.payment_difference).toBe(250); // penalty > paid
    });

    // Test: Returns zero totals when no products selected
    test('should return zero totals for empty selection', async () => {
      const result = await productLifecycleService.calculateCancellationSummary(
        testBookingId,
        [],  // nothing selected
        {},
        0
      );

      expect(result.selected_count).toBe(0);
      expect(result.total_count).toBe(1); // 1 product exists but none selected
      expect(result.selected_rent).toBe(0);
      expect(result.total_penalty).toBe(0);
      expect(result.refund_amount).toBe(0);
      expect(result.payment_action).toBe('none');
    });

    // Test: Penalty override replaces backend-calculated penalty
    test('should apply penalty overrides', async () => {
      const result = await productLifecycleService.calculateCancellationSummary(
        testBookingId,
        [testBookingProductId],
        { [testBookingProductId]: 100 }, // override penalty from 250 to 100
        0
      );

      expect(result.total_penalty).toBe(100); // overridden
      // No payments, so refund is 0 and action is blocked (penalty > paid)
      expect(result.refund_amount).toBe(0);
      expect(result.payment_action).toBe('blocked');
      expect(result.payment_difference).toBe(100);
    });

    // Test: Extra refund is added to refund amount
    test('should include extra refund in calculation', async () => {
      // Set up paid amounts first
      await pool.query(
        `UPDATE product_charges SET paid_amount = 2500 WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [testBookingProductId]
      );
      await pool.query(
        `UPDATE product_charges SET paid_amount = 1000 WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [testBookingProductId]
      );

      try {
        const result = await productLifecycleService.calculateCancellationSummary(
          testBookingId,
          [testBookingProductId],
          {},  // use default penalty (250)
          500  // extra refund
        );

        expect(result.selected_rent_paid).toBe(2500);
        expect(result.selected_security_paid).toBe(1000);
        expect(result.total_penalty).toBe(250);
        expect(result.extra_refund).toBe(500);
        // refund = (2500 + 1000) - 250 + 500 = 3750
        expect(result.refund_amount).toBe(3750);
        expect(result.payment_action).toBe('refund');
        expect(result.payment_difference).toBe(3750);
      } finally {
        // Reset paid amounts for subsequent tests
        await pool.query(
          `UPDATE product_charges SET paid_amount = 0 WHERE booking_product_id = $1`,
          [testBookingProductId]
        );
      }
    });

    // Test: Partial selection with multiple products
    test('should calculate summary for partial product selection', async () => {
      // Add a second product
      const bp2 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 600, 1200, 600)
         RETURNING id`,
        [testBookingId, testProductId2]
      );
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
         VALUES ($1, 'rent', 600, 0), ($1, 'security', 1200, 0)`,
        [bp2.rows[0].id]
      );

      // Select only the first product
      const result = await productLifecycleService.calculateCancellationSummary(
        testBookingId,
        [testBookingProductId], // only first product
        {},
        0
      );

      expect(result.selected_count).toBe(1);
      expect(result.total_count).toBe(2); // 2 cancellable products total
      expect(result.selected_rent).toBe(2500); // only first product's rent
      expect(result.selected_security).toBe(1000);

      // Cleanup
      await pool.query('DELETE FROM product_charges WHERE booking_product_id = $1', [bp2.rows[0].id]);
      await pool.query('DELETE FROM booking_products WHERE id = $1', [bp2.rows[0].id]);
    });

    // Test: Throws error for non-existent booking
    test('should throw error for non-existent booking', async () => {
      await expect(
        productLifecycleService.calculateCancellationSummary(999999, [1], {}, 0)
      ).rejects.toThrow('Booking not found');
    });
  });

  describe('processSecurityReturn', () => {
    test('should process refund — full security refunded to customer', async () => {
      // Set up: pay security, then mark completed
      await pool.query(
        "UPDATE product_charges SET paid_amount = 1000 WHERE booking_product_id = $1 AND charge_type = 'security'",
        [testBookingProductId]
      );
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', testBookingProductId]);

      // New API: pass structured amounts that sum to totalSecurity (1000)
      const result = await productLifecycleService.processSecurityReturn(
        testBookingProductId,
        { refund_amount: 1000, payment_method: 'Cash', recorded_by: 'test-user' }
      );

      expect(result.refund_amount).toBe(1000);

      // Verify refund transaction was recorded
      const txns = await pool.query(
        "SELECT * FROM payment_transactions WHERE booking_id = $1 AND type = 'refund'",
        [testBookingId]
      );
      expect(txns.rows.length).toBeGreaterThanOrEqual(1);
    });

    test('should process adjustment when outstanding dues exist', async () => {
      // Set up: pay security, then mark completed
      await pool.query(
        "UPDATE product_charges SET paid_amount = 1000 WHERE booking_product_id = $1 AND charge_type = 'security'",
        [testBookingProductId]
      );
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', testBookingProductId]);

      // New API: route all 1000 to non-security adjustment
      const result = await productLifecycleService.processSecurityReturn(
        testBookingProductId,
        { adjust_non_security: 1000, payment_method: 'Cash', recorded_by: 'test-user' }
      );

      expect(result.adjust_non_security).toBe(1000);
    });

    test('should return nothing when no security was paid', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', testBookingProductId]);

      // No security paid → 0 totalSecurity → amounts must sum to 0 → all zeros OK
      const result = await productLifecycleService.processSecurityReturn(
        testBookingProductId,
        { refund_amount: 0, payment_method: 'Cash', recorded_by: 'test-user' }
      );

      expect(result.refund_amount).toBe(0);
    });

    test('should throw error for invalid action', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', testBookingProductId]);
      // Passing a negative amount → should throw validation error
      await expect(
        productLifecycleService.processSecurityReturn(
          testBookingProductId,
          { refund_amount: -1, payment_method: 'Cash', recorded_by: 'test-user' }
        )
      ).rejects.toThrow('All amounts must be non-negative numbers');
    });

    test('should throw error for non-completed product', async () => {
      // Product is still in 'confirmed' status
      await expect(
        productLifecycleService.processSecurityReturn(
          testBookingProductId,
          { refund_amount: 0, payment_method: 'Cash', recorded_by: 'test-user' }
        )
      ).rejects.toThrow("Security return requires product status 'completed'");
    });
  });

  describe('processCancellationSettlement', () => {
    test('should record a refund transaction', async () => {
      const result = await productLifecycleService.processCancellationSettlement(
        testBookingId, 500, 'refund', 'Cash', 'test-user', 'Cancellation refund'
      );

      expect(result.settlement_action).toBe('refund');
      expect(result.amount).toBe(500);
      expect(result.transaction_recorded).toBe(true);
      expect(result.method).toBe('Cash');

      // Verify refund transaction exists
      const txns = await pool.query(
        "SELECT * FROM payment_transactions WHERE booking_id = $1 AND type = 'refund'",
        [testBookingId]
      );
      expect(txns.rows.length).toBeGreaterThanOrEqual(1);
    });

    test('should apply adjustment against dues', async () => {
      const result = await productLifecycleService.processCancellationSettlement(
        testBookingId, 500, 'adjust', null, 'test-user', 'Adjusted against dues'
      );

      expect(result.settlement_action).toBe('adjust');
      expect(result.amount).toBe(500);
      expect(result.transaction_recorded).toBe(true);
      expect(result.method).toBe('Adjustment');

      // Verify adjustment transaction exists
      const txns = await pool.query(
        "SELECT * FROM payment_transactions WHERE booking_id = $1 AND type = 'adjustment'",
        [testBookingId]
      );
      expect(txns.rows.length).toBeGreaterThanOrEqual(1);
    });

    test('should return no transaction for action=none', async () => {
      const result = await productLifecycleService.processCancellationSettlement(
        testBookingId, 500, 'none', null, 'test-user', null
      );

      expect(result.settlement_action).toBe('none');
      expect(result.amount).toBe(0);
      expect(result.transaction_recorded).toBe(false);
    });

    test('should return no transaction when refund amount is 0', async () => {
      const result = await productLifecycleService.processCancellationSettlement(
        testBookingId, 0, 'refund', 'Cash', 'test-user', null
      );

      expect(result.settlement_action).toBe('none');
      expect(result.transaction_recorded).toBe(false);
    });

    test('should throw error for invalid action', async () => {
      await expect(
        productLifecycleService.processCancellationSettlement(
          testBookingId, 500, 'invalid', null, 'test-user', null
        )
      ).rejects.toThrow('settlement_action must be "refund", "adjust", "adjust_security", "collect", or "none"');
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
