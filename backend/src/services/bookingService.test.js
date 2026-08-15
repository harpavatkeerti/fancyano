const pool = require('../database/connection');
const bookingService = require('./bookingService');
const chargeAccountingService = require('./chargeAccountingService');

describe('BookingService', () => {
  let testCustomerId, testProductId1, testProductId2;

  beforeAll(async () => {
    // Create test products
    const product1 = await pool.query(
      `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
       VALUES ('Test Product 1', 'BOOK001', 'Test', '{M}', 500, 1000)
       RETURNING id`
    );
    testProductId1 = product1.rows[0].id;

    const product2 = await pool.query(
      `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
       VALUES ('Test Product 2', 'BOOK002', 'Test', '{L}', 800, 1500)
       RETURNING id`
    );
    testProductId2 = product2.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test products (pool.end() handled by global teardown)
    await pool.query('DELETE FROM products WHERE code LIKE \'BOOK%\'');
  });

  beforeEach(async () => {
    // ONLY clean up test-created data — never wipe entire tables!
    // Find bookings linked to our test products
    const testBookingIds = await pool.query(
      `SELECT DISTINCT booking_id FROM booking_products WHERE product_id IN ($1, $2)`,
      [testProductId1, testProductId2]
    );
    const ids = testBookingIds.rows.map(r => r.booking_id);

    if (ids.length > 0) {
      await pool.query('DELETE FROM booking_cancellation_history WHERE booking_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM booking_exchange_history WHERE booking_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM payment_transactions WHERE booking_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM booking_activity_log WHERE booking_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = ANY($1))', [ids]);
      await pool.query('DELETE FROM booking_products WHERE booking_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM bookings WHERE id = ANY($1)', [ids]);
    }

    // Also clean orphaned test bookings (from rollback/failed tests)
    await pool.query(`
      DELETE FROM bookings 
      WHERE user_id = 1
        AND id NOT IN (SELECT DISTINCT booking_id FROM booking_products)
    `);
  });

  describe('createBooking', () => {
    // Test: Creates a new booking with products and initializes all charges
    test('should create booking with products successfully', async () => {
      const bookingData = {
      userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 2500,
            securityDeposit: 1000,
            quantity: 1
          },
          {
            productId: testProductId2,
            size: 'L',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 4000,
            securityDeposit: 1500,
            quantity: 1
          }
        ],
        transportCharge: 100,
        createdBy: 'admin_user'
      };

      const result = await bookingService.createBooking(bookingData);

      expect(result.booking_id).toBeDefined();
      expect(result.booking_product_ids).toHaveLength(2);
      expect(result.status).toBe('pending');

      // Verify booking was created
      const booking = await pool.query(
        'SELECT * FROM bookings WHERE id = $1',
        [result.booking_id]
      );
      expect(booking.rows[0].user_id).toBe(1);
      expect(booking.rows[0].status).toBe('pending');
      expect(booking.rows[0].transport_charge).toBe(100);

      // Verify booking products were created
      const products = await pool.query(
        'SELECT * FROM booking_products WHERE booking_id = $1 ORDER BY id',
        [result.booking_id]
      );
      expect(products.rows).toHaveLength(2);
      expect(products.rows[0].product_id).toBe(testProductId1);
      expect(products.rows[0].rent).toBe(2500);
      expect(products.rows[0].status).toBe('pending');

      // Verify charges were initialized for each product
      const charges = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = ANY($1)
         ORDER BY booking_product_id, charge_type`,
        [result.booking_product_ids]
      );
      expect(charges.rows).toHaveLength(4); // 2 products * 2 charges (rent + security)

      // Verify activity log
      const log = await pool.query(
        'SELECT * FROM booking_activity_log WHERE booking_id = $1',
        [result.booking_id]
      );
      expect(log.rows).toHaveLength(1);
      expect(log.rows[0].event_type).toBe('booking_created');
      expect(log.rows[0].performed_by).toBe('admin_user');
    });

    // Test: Handles single product booking correctly
    test('should create booking with single product', async () => {
      const bookingData = {
        userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 2500,
            securityDeposit: 1000,
            quantity: 1
          }
        ],
        transportCharge: 0,
        createdBy: 'salesman'
      };

      const result = await bookingService.createBooking(bookingData);

      expect(result.booking_product_ids).toHaveLength(1);
      expect(result.status).toBe('pending');
    });

    // Test: Creates booking with percentage discount on products
    test('should create booking with percentage discount', async () => {
      const bookingData = {
        userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 5000,
            securityDeposit: 2000,
            discountType: 'percentage',
            discountValue: 10,  // 10% discount
            quantity: 1
          }
        ],
        transportCharge: 0,
        createdBy: 'admin'
      };

      const result = await bookingService.createBooking(bookingData);

      // Verify booking product has discount applied
      const product = await pool.query(
        'SELECT * FROM booking_products WHERE id = $1',
        [result.booking_product_ids[0]]
      );

      expect(product.rows[0].rent).toBe(5000);  // Original rent
      // Service uses tax-inclusive formula: floor(5000 / 1.1) = 4545, discount = 455
      expect(product.rows[0].discount_amount).toBe(455);
      expect(product.rows[0].discount_type).toBe('percentage');
      expect(product.rows[0].effective_rent).toBe(4545);  // 5000 - 455

      // Verify rent charge uses effective_rent
      const charges = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [result.booking_product_ids[0]]
      );

      expect(charges.rows[0].due_amount).toBe(4545);  // Uses effective_rent
    });

    // Test: Creates booking with fixed discount on products
    test('should create booking with fixed discount', async () => {
      const bookingData = {
        userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId2,
            size: 'L',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 6000,
            securityDeposit: 2500,
            discountType: 'fixed',
            discountValue: 1000,  // Fixed ₹1000 discount
            quantity: 1
          }
        ],
        transportCharge: 0,
        createdBy: 'admin'
      };

      const result = await bookingService.createBooking(bookingData);

      // Verify booking product has discount applied
      const product = await pool.query(
        'SELECT * FROM booking_products WHERE id = $1',
        [result.booking_product_ids[0]]
      );

      expect(product.rows[0].rent).toBe(6000);  // Original rent
      expect(product.rows[0].discount_amount).toBe(1000);  // Fixed discount
      expect(product.rows[0].discount_type).toBe('fixed');
      expect(product.rows[0].effective_rent).toBe(5000);  // 6000 - 1000

      // Verify rent charge uses effective_rent
      const charges = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [result.booking_product_ids[0]]
      );

      expect(charges.rows[0].due_amount).toBe(5000);  // Uses effective_rent
    });

    // Test: Creates booking without discount (backward compatibility)
    test('should create booking without discount (backward compatibility)', async () => {
      const bookingData = {
        userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 3000,
            securityDeposit: 1500,
            // No discount fields
            quantity: 1
          }
        ],
        transportCharge: 0,
        createdBy: 'admin'
      };

      const result = await bookingService.createBooking(bookingData);

      // Verify booking product has no discount
      const product = await pool.query(
        'SELECT * FROM booking_products WHERE id = $1',
        [result.booking_product_ids[0]]
      );

      expect(product.rows[0].rent).toBe(3000);
      expect(product.rows[0].discount_amount).toBe(0);
      expect(product.rows[0].discount_type).toBeNull();
      expect(product.rows[0].effective_rent).toBe(3000);  // Same as rent

      // Verify rent charge uses full rent
      const charges = await pool.query(
        `SELECT * FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [result.booking_product_ids[0]]
      );

      expect(charges.rows[0].due_amount).toBe(3000);
    });

    // Test: Rejects invalid discount type
    test('should reject invalid discount type', async () => {
      const bookingData = {
        userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 5000,
            securityDeposit: 2000,
            discountType: 'invalid',
            discountValue: 10,
            quantity: 1
          }
        ],
        transportCharge: 0,
        createdBy: 'admin'
      };

      await expect(bookingService.createBooking(bookingData)).rejects.toThrow();
    });

    // Test: Rejects fixed discount > rent
    test('should reject fixed discount exceeding rent', async () => {
      const bookingData = {
        userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 3000,
            securityDeposit: 1000,
            discountType: 'fixed',
            discountValue: 5000,  // Exceeds rent!
            quantity: 1
          }
        ],
        transportCharge: 0,
        createdBy: 'admin'
      };

      await expect(bookingService.createBooking(bookingData)).rejects.toThrow('cannot exceed rent');
    });

    // Test: Stores discount details in activity log
    test('should include discount details in activity log', async () => {
      const bookingData = {
        userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 4000,
            securityDeposit: 1500,
            discountType: 'percentage',
            discountValue: 15,
            quantity: 1
          }
        ],
        transportCharge: 0,
        createdBy: 'admin'
      };

      const result = await bookingService.createBooking(bookingData);

      // Verify activity log includes discount info
      const log = await pool.query(
        'SELECT details FROM booking_activity_log WHERE booking_id = $1',
        [result.booking_id]
      );

      const details = log.rows[0].details;
      // Service uses tax-inclusive formula: floor(4000 / 1.15) = 3478, discount = 522
      expect(details.products[0].effective_rent).toBe(3478);
      expect(details.products[0].discount_amount).toBe(522);
      expect(details.products[0].discount_type).toBe('percentage');
    });

    // Test: Handles optional fields like measurements and special requirements
    test('should handle optional product fields', async () => {
      const bookingData = {
        userId: 1,
        bookingDate: new Date('2024-01-15'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 2500,
            securityDeposit: 1000,
            quantity: 2,
            measurements: { chest: 40, waist: 32, height: 180 },
            specialRequirements: 'Needs alteration'
          }
        ],
        transportCharge: 50,
        createdBy: 'admin'
      };

      const result = await bookingService.createBooking(bookingData);

      const product = await pool.query(
        'SELECT * FROM booking_products WHERE id = $1',
        [result.booking_product_ids[0]]
      );

      expect(product.rows[0].quantity).toBe(2);
      expect(product.rows[0].measurements).toEqual({ chest: 40, waist: 32, height: 180 });
      expect(product.rows[0].special_requirements).toBe('Needs alteration');
    });

    // Test: Validates that required fields are present before creating booking
    test('should throw error for missing required fields', async () => {
      const invalidData = {
        // Missing userId
        bookingDate: new Date(),
        products: [],
        createdBy: 'admin'
      };

      await expect(bookingService.createBooking(invalidData))
        .rejects
        .toThrow('Missing required fields');
    });

    // Test: Validates that each product has all required fields
    test('should throw error for invalid product data', async () => {
      const invalidData = {
        userId: 1,
        bookingDate: new Date(),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            // Missing bookedFrom, bookedTo, rent, securityDeposit
          }
        ],
        createdBy: 'admin'
      };

      await expect(bookingService.createBooking(invalidData))
        .rejects
        .toThrow('Each product must have productId, bookedFrom, bookedTo, rent, and securityDeposit');
    });

    // Test: Rolls back transaction if any step fails
    test('should rollback on error', async () => {
      const countBefore = await pool.query('SELECT COUNT(*)::int AS cnt FROM bookings');

      const bookingData = {
        userId: 1,
        bookingDate: new Date(),
        products: [
          {
            productId: 999999, // Non-existent product
            bookedFrom: new Date('2024-01-20'),
            bookedTo: new Date('2024-01-25'),
            rent: 1000,
            securityDeposit: 500,
            quantity: 1
          }
        ],
        createdBy: 'admin'
      };

      await expect(bookingService.createBooking(bookingData))
        .rejects
        .toThrow();

      // Verify no new booking was created (count unchanged)
      const countAfter = await pool.query('SELECT COUNT(*)::int AS cnt FROM bookings');
      expect(countAfter.rows[0].cnt).toBe(countBefore.rows[0].cnt);
    });

    test('should reject booking if product is archived', async () => {
      // Archive the test product
      await pool.query(`UPDATE products SET status = 'archived' WHERE id = $1`, [testProductId1]);

      const bookingData = {
        userId: 1,
        bookingDate: new Date(),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2026-09-01'),
            bookedTo: new Date('2026-09-05'),
            rent: 500,
            securityDeposit: 1000,
            quantity: 1
          }
        ],
        createdBy: 'admin'
      };

      try {
        await expect(bookingService.createBooking(bookingData))
          .rejects
          .toThrow('is archived and cannot be booked');
      } finally {
        // Always restore status so subsequent tests are unaffected
        await pool.query(`UPDATE products SET status = 'available' WHERE id = $1`, [testProductId1]);
      }
    });

    test('should succeed when product status is available', async () => {
      // Ensure it is available (explicit guard)
      await pool.query(`UPDATE products SET status = 'available' WHERE id = $1`, [testProductId1]);

      const bookingData = {
        userId: 1,
        bookingDate: new Date(),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2026-10-01'),
            bookedTo: new Date('2026-10-05'),
            rent: 500,
            securityDeposit: 1000,
            quantity: 1
          }
        ],
        createdBy: 'admin'
      };

      const result = await bookingService.createBooking(bookingData);
      expect(result).toHaveProperty('booking_id');
    });
  });

  describe('updateBookingStatus', () => {
    let testBookingId, testBP1, testBP2;

    beforeEach(async () => {
      // Create test booking with products
      const booking = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, created_by)
         VALUES (1, CURRENT_DATE, 'in_progress', 'admin')
         RETURNING id`
      );
      testBookingId = booking.rows[0].id;

      const bp1 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'in_progress', 2500, 1000, 2500)
         RETURNING id`,
        [testBookingId, testProductId1]
      );
      testBP1 = bp1.rows[0].id;

      const bp2 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'in_progress', 3000, 1200, 3000)
         RETURNING id`,
        [testBookingId, testProductId2]
      );
      testBP2 = bp2.rows[0].id;
    });

    // Test: Updates booking to completed when all products are in terminal states
    test('should update booking to completed when all products terminal', async () => {
      // Mark all products as completed
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE booking_id = $2',
        ['completed', testBookingId]
      );

      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('completed');
      expect(result.updated).toBe(true);
      expect(result.all_terminal).toBe(true);

      // Verify booking status was updated
      const booking = await pool.query(
        'SELECT status FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].status).toBe('completed');

      // Verify activity log
      const log = await pool.query(
        `SELECT * FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'booking_completed'`,
        [testBookingId]
      );
      expect(log.rows).toHaveLength(1);
    });

    // Test: Handles mix of terminal states (completed, cancelled, exchanged)
    test('should complete booking with mixed terminal states', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['completed', testBP1]
      );
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['cancelled', testBP2]
      );

      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('completed');
      expect(result.updated).toBe(true);
      expect(result.status_counts).toEqual({
        completed: 1,
        cancelled: 1
      });
    });

    // Test: Advances to partially_completed when some products completed but others still active
    test('should advance to partially_completed when some products done and others in_progress', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['completed', testBP1]
      );
      // testBP2 remains in_progress

      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('partially_completed');
      expect(result.updated).toBe(true);
      expect(result.all_terminal).toBe(false);

      const booking = await pool.query(
        'SELECT status FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].status).toBe('partially_completed');
    });

    // Test: Sets booking to in_progress when products are picked up (no completed yet)
    test('should set booking to in_progress when products are in_progress', async () => {
      // Both products remain in_progress (default in beforeEach)
      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('in_progress');
      // Booking was already in_progress, so no update needed
      expect(result.updated).toBe(false);
    });

    // Test: Does NOT auto-promote pending→confirmed (that's an explicit user action)
    test('should not auto-promote pending booking to confirmed based on product states', async () => {
      // Reset booking to pending and products to confirmed
      await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['pending', testBookingId]);
      await pool.query('UPDATE booking_products SET status = $1 WHERE booking_id = $2', ['confirmed', testBookingId]);

      const result = await bookingService.updateBookingStatus(testBookingId);

      // Should stay pending — pending→confirmed only happens via explicit action
      expect(result.status).toBe('pending');
      expect(result.updated).toBe(false);
    });

    // Test: Sets partially_completed when one product completed and one confirmed (not yet picked up)
    test('should set partially_completed when one completed and one still confirmed', async () => {
      await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['in_progress', testBookingId]);
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', testBP1]);
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['confirmed', testBP2]);

      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('partially_completed');
      expect(result.updated).toBe(true);
    });

    // Test: Does not downgrade a completed booking
    test('should not update if booking is already cancelled', async () => {
      await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['cancelled', testBookingId]);

      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('cancelled');
      expect(result.updated).toBe(false);
    });


    // Test: Does not update if booking is already completed
    test('should not update if already completed', async () => {
      await pool.query(
        'UPDATE bookings SET status = $1 WHERE id = $2',
        ['completed', testBookingId]
      );
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE booking_id = $2',
        ['completed', testBookingId]
      );

      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('completed');
      expect(result.updated).toBe(false);
    });

    // Test: Marks booking as cancelled if all products are cancelled (no completed products)
    test('should mark booking as cancelled if all products cancelled', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE booking_id = $2',
        ['cancelled', testBookingId]
      );

      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('cancelled');
      expect(result.updated).toBe(true);
      expect(result.all_terminal).toBe(true);

      // Verify booking status was updated to cancelled
      const booking = await pool.query(
        'SELECT status FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].status).toBe('cancelled');

      // Verify activity log shows cancellation
      const log = await pool.query(
        `SELECT * FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'booking_cancelled'`,
        [testBookingId]
      );
      expect(log.rows).toHaveLength(1);
    });

    // Test: Marks booking as cancelled if all products are cancelled or exchanged (no completed)
    test('should mark booking as cancelled if mix of cancelled/exchanged but no completed', async () => {
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['cancelled', testBP1]
      );
      await pool.query(
        'UPDATE booking_products SET status = $1 WHERE id = $2',
        ['exchanged', testBP2]
      );

      const result = await bookingService.updateBookingStatus(testBookingId);

      expect(result.status).toBe('cancelled');
      expect(result.updated).toBe(true);
    });

    // Test: Throws error for non-existent booking
    test('should throw error for non-existent booking', async () => {
      await expect(bookingService.updateBookingStatus(999999))
        .rejects
        .toThrow('Booking not found');
    });
  });

  describe('confirmBooking', () => {
    let testBookingId, testBP1;

    beforeEach(async () => {
      // Create pending booking
      const booking = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, created_by)
         VALUES (1, CURRENT_DATE, 'pending', 'admin')
         RETURNING id`
      );
      testBookingId = booking.rows[0].id;

      const bp1 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'pending', 2500, 1000, 2500)
         RETURNING id`,
        [testBookingId, testProductId1]
      );
      testBP1 = bp1.rows[0].id;
    });

    // Test: Confirms a pending booking and updates all product statuses
    test('should confirm pending booking successfully', async () => {
      const result = await bookingService.confirmBooking(testBookingId, 'admin_user');

      expect(result.booking_id).toBe(testBookingId);
      expect(result.status).toBe('confirmed');
      expect(result.confirmed_products).toBe(1);

      // Verify booking status updated
      const booking = await pool.query(
        'SELECT status FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].status).toBe('confirmed');

      // Verify products updated
      const products = await pool.query(
        'SELECT status FROM booking_products WHERE booking_id = $1',
        [testBookingId]
      );
      expect(products.rows[0].status).toBe('confirmed');

      // Verify activity log
      const log = await pool.query(
        `SELECT * FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'booking_confirmed'`,
        [testBookingId]
      );
      expect(log.rows).toHaveLength(1);
      expect(log.rows[0].performed_by).toBe('admin_user');
    });

    // Test: Rejects confirmation if booking is not in pending status
    test('should throw error for non-pending booking', async () => {
      await pool.query(
        'UPDATE bookings SET status = $1 WHERE id = $2',
        ['confirmed', testBookingId]
      );

      await expect(bookingService.confirmBooking(testBookingId, 'admin'))
        .rejects
        .toThrow('Cannot confirm booking with status: confirmed');
    });

    // Test: Throws error for non-existent booking
    test('should throw error for non-existent booking', async () => {
      await expect(bookingService.confirmBooking(999999, 'admin'))
        .rejects
        .toThrow('Booking not found');
    });
  });

  describe('getBookingById', () => {
    let testBookingId;

    beforeEach(async () => {
      // Create test booking
      const booking = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, transport_charge, created_by)
         VALUES (1, CURRENT_DATE, 'confirmed', 100, 'admin')
         RETURNING id`
      );
      testBookingId = booking.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 2500, 1000, 2500)`,
        [testBookingId, testProductId1]
      );
    });

    // Test: Retrieves complete booking details including products
    test('should get booking by ID with products', async () => {
      const booking = await bookingService.getBookingById(testBookingId);

      expect(booking.id).toBe(testBookingId);
      expect(booking.user).toHaveProperty('id', 1);
      expect(booking.status).toBe('confirmed');
      expect(booking.transport_charge).toBe(100);
      expect(booking.products).toHaveLength(1);
      expect(booking.products[0].name).toBe('Test Product 1');
      expect(booking.products[0].rent).toBe(2500);
    });

    // Test: Throws error for non-existent booking
    test('should throw error for non-existent booking', async () => {
      await expect(bookingService.getBookingById(999999))
        .rejects
        .toThrow('Booking not found');
    });
  });

  describe('getBookingsList', () => {
    beforeEach(async () => {
      // Create multiple test bookings
      for (let i = 1; i <= 3; i++) {
        const booking = await pool.query(
          `INSERT INTO bookings (user_id, booking_date, status, created_by)
           VALUES (1, CURRENT_DATE, $1, 'admin')
           RETURNING id`,
          [i === 1 ? 'pending' : 'confirmed']
        );

        await pool.query(
          `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
           VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 5, $3, ${1000 * i}, ${500 * i}, ${1000 * i})`,
          [booking.rows[0].id, testProductId1, i === 1 ? 'pending' : 'confirmed']
        );
      }
    });

    // Test: Retrieves all bookings without filters
    test('should get all bookings', async () => {
      const bookings = await bookingService.getBookingsList();

      expect(bookings.length).toBeGreaterThanOrEqual(3);
      expect(bookings[0]).toHaveProperty('user');
      expect(bookings[0]).toHaveProperty('product_count');
      expect(bookings[0]).toHaveProperty('total_rent');
    });

    // Test: Filters bookings by status
    test('should filter by status', async () => {
      const bookings = await bookingService.getBookingsList({ status: 'pending' });

      expect(bookings.length).toBeGreaterThanOrEqual(1);
      bookings.forEach(booking => {
        expect(booking.status).toBe('pending');
      });
    });

    // Test: Searches bookings by customer name or phone
    test('should search by customer name', async () => {
      const bookings = await bookingService.getBookingsList({ search: 'Test Admin' });

      expect(bookings.length).toBeGreaterThanOrEqual(1);
      expect(bookings[0].user).toHaveProperty('id', 1);
    });

    // Test: Applies pagination with limit and offset
    test('should support pagination', async () => {
      const page1 = await bookingService.getBookingsList({ limit: 2, offset: 0 });
      const page2 = await bookingService.getBookingsList({ limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);
    });
  });

  describe('updateBooking', () => {
    let testBookingId, testBP1;

    beforeEach(async () => {
      const booking = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, created_by)
         VALUES (1, CURRENT_DATE, 'confirmed', 'admin')
         RETURNING id`
      );
      testBookingId = booking.rows[0].id;

      const bp1 = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, '2024-06-01', '2024-06-10', 'confirmed', 3000, 1500, 3000)
         RETURNING id`,
        [testBookingId, testProductId1]
      );
      testBP1 = bp1.rows[0].id;
    });

    test('should update measurements for a booking product', async () => {
      const measurementsKey = `${testBP1}_2024-06-01_2024-06-10`;
      const result = await bookingService.updateBooking(testBookingId, {
        measurements: {
          [measurementsKey]: { chest: 40, waist: 32 }
        }
      });

      expect(result.id).toBe(testBookingId);

      const bp = await pool.query(
        'SELECT measurements FROM booking_products WHERE id = $1',
        [testBP1]
      );
      expect(bp.rows[0].measurements).toEqual({ chest: 40, waist: 32 });
    });

    test('should update special requirements for a booking product', async () => {
      const key = `${testBP1}_2024-06-01_2024-06-10`;
      const result = await bookingService.updateBooking(testBookingId, {
        special_requirements: JSON.stringify({
          [key]: 'Needs alteration at waist'
        })
      });

      expect(result.id).toBe(testBookingId);

      const bp = await pool.query(
        'SELECT special_requirements FROM booking_products WHERE id = $1',
        [testBP1]
      );
      expect(bp.rows[0].special_requirements).toBe('Needs alteration at waist');
    });

    test('should throw error for non-existent booking', async () => {
      await expect(bookingService.updateBooking(999999, { measurements: {} }))
        .rejects
        .toThrow('Booking not found');
    });
  });

  describe('getBookingsByProductId', () => {
    let testBookingId;

    beforeEach(async () => {
      const booking = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, created_by)
         VALUES (1, CURRENT_DATE, 'confirmed', 'admin')
         RETURNING id`
      );
      testBookingId = booking.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, '2024-07-01', '2024-07-10', 'confirmed', 2000, 1000, 2000)`,
        [testBookingId, testProductId1]
      );

      // Also add a cancelled product (should NOT appear in results)
      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, '2024-08-01', '2024-08-10', 'cancelled', 1500, 800, 1500)`,
        [testBookingId, testProductId1]
      );
    });

    test('should return active bookings for a product', async () => {
      const bookings = await bookingService.getBookingsByProductId(testProductId1);

      expect(bookings.length).toBeGreaterThanOrEqual(1);
      // Should have booked_from/booked_to from booking_products
      const activeBooking = bookings.find(b => b.booking_product_id);
      expect(activeBooking).toBeDefined();
      expect(activeBooking.booked_from).toBeDefined();
      expect(activeBooking.booked_to).toBeDefined();
    });

    test('should exclude cancelled products', async () => {
      const bookings = await bookingService.getBookingsByProductId(testProductId1);

      // None should have status 'cancelled'
      bookings.forEach(b => {
        expect(b.product_status).not.toBe('cancelled');
      });
    });

    test('should return empty array for product with no bookings', async () => {
      const bookings = await bookingService.getBookingsByProductId(999999);
      expect(bookings).toEqual([]);
    });
  });

  describe('updateBooking — product date changes', () => {
    let testBookingId, testBP1, testBP2;

    beforeEach(async () => {
      // Clean up test-created bookings for this suite (linked to our test products)
      const staleIds = await pool.query(
        `SELECT DISTINCT booking_id FROM booking_products WHERE product_id IN ($1, $2)`,
        [testProductId1, testProductId2]
      );
      const ids = staleIds.rows.map(r => r.booking_id);
      if (ids.length > 0) {
        await pool.query('DELETE FROM booking_activity_log WHERE booking_id = ANY($1)', [ids]);
        await pool.query(
          `DELETE FROM product_charges
           WHERE booking_product_id IN (
             SELECT id FROM booking_products WHERE booking_id = ANY($1)
           )`,
          [ids]
        );
        await pool.query('DELETE FROM booking_products WHERE booking_id = ANY($1)', [ids]);
        await pool.query('DELETE FROM bookings WHERE id = ANY($1)', [ids]);
      }

      // Create a fresh booking with two products on known date ranges
      const booking = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, created_by,
                               booked_from, booked_to)
         VALUES (1, CURRENT_DATE, 'confirmed', 'test',
                 '2024-09-01', '2024-09-10')
         RETURNING id`
      );
      testBookingId = booking.rows[0].id;

      const bp1 = await pool.query(
        `INSERT INTO booking_products
           (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, '2024-09-01', '2024-09-05', 'confirmed', 2000, 1000, 2000)
         RETURNING id`,
        [testBookingId, testProductId1]
      );
      testBP1 = bp1.rows[0].id;

      const bp2 = await pool.query(
        `INSERT INTO booking_products
           (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, '2024-09-06', '2024-09-10', 'confirmed', 3000, 1200, 3000)
         RETURNING id`,
        [testBookingId, testProductId2]
      );
      testBP2 = bp2.rows[0].id;
    });

    // New dates are persisted in booking_products
    test('should persist new booked_from / booked_to on the booking_product', async () => {
      await bookingService.updateBooking(testBookingId, {
        products: [{ id: testBP1, booked_from: '2024-09-03', booked_to: '2024-09-07' }],
      });

      const bp = await pool.query(
        'SELECT booked_from, booked_to FROM booking_products WHERE id = $1',
        [testBP1]
      );
      expect(bp.rows[0].booked_from.toISOString().slice(0, 10)).toBe('2024-09-03');
      expect(bp.rows[0].booked_to.toISOString().slice(0, 10)).toBe('2024-09-07');
    });

    // booking.booked_from/to must be recalculated from all active products
    test('should recalculate booking-level booked_from and booked_to', async () => {
      // Move BP1 to an earlier start — booking.booked_from must shift accordingly
      await bookingService.updateBooking(testBookingId, {
        products: [{ id: testBP1, booked_from: '2024-08-28', booked_to: '2024-09-05' }],
      });

      const booking = await pool.query(
        'SELECT booked_from, booked_to FROM bookings WHERE id = $1',
        [testBookingId]
      );
      // New MIN across both products: 2024-08-28 (BP1 updated) vs 2024-09-06 (BP2 untouched)
      expect(booking.rows[0].booked_from.toISOString().slice(0, 10)).toBe('2024-08-28');
      // MAX remains the BP2 end date
      expect(booking.rows[0].booked_to.toISOString().slice(0, 10)).toBe('2024-09-10');
    });

    // Multiple products updated in one atomic call
    test('should update multiple products and recalculate booking range atomically', async () => {
      await bookingService.updateBooking(testBookingId, {
        products: [
          { id: testBP1, booked_from: '2024-09-02', booked_to: '2024-09-06' },
          { id: testBP2, booked_from: '2024-09-07', booked_to: '2024-09-12' },
        ],
      });

      const bps = await pool.query(
        'SELECT id, booked_from, booked_to FROM booking_products WHERE id = ANY($1) ORDER BY id',
        [[testBP1, testBP2]]
      );
      expect(bps.rows[0].booked_from.toISOString().slice(0, 10)).toBe('2024-09-02');
      expect(bps.rows[1].booked_to.toISOString().slice(0, 10)).toBe('2024-09-12');

      const booking = await pool.query(
        'SELECT booked_from, booked_to FROM bookings WHERE id = $1',
        [testBookingId]
      );
      expect(booking.rows[0].booked_from.toISOString().slice(0, 10)).toBe('2024-09-02');
      expect(booking.rows[0].booked_to.toISOString().slice(0, 10)).toBe('2024-09-12');
    });

    // Activity log must record the date_changed event with full detail
    test('should write a date_changed activity log entry', async () => {
      await bookingService.updateBooking(testBookingId, {
        products: [{ id: testBP1, booked_from: '2024-09-03', booked_to: '2024-09-07' }],
        performed_by: 'salesman_test',
      });

      const log = await pool.query(
        `SELECT event_type, details, performed_by
         FROM booking_activity_log
         WHERE booking_id = $1 AND event_type = 'date_changed'`,
        [testBookingId]
      );
      expect(log.rows).toHaveLength(1);
      expect(log.rows[0].performed_by).toBe('salesman_test');
      expect(log.rows[0].details.products).toHaveLength(1);
      expect(log.rows[0].details.products[0].booking_product_id).toBe(testBP1);
      expect(log.rows[0].details.products[0].booked_from).toBe('2024-09-03');
      expect(log.rows[0].details.products[0].booked_to).toBe('2024-09-07');
    });

    // Entries missing required fields are silently skipped — no crash, no side-effect
    test('should skip entries with missing id, booked_from, or booked_to', async () => {
      const originalFrom = (await pool.query(
        'SELECT booked_from FROM booking_products WHERE id = $1', [testBP1]
      )).rows[0].booked_from;

      await bookingService.updateBooking(testBookingId, {
        products: [
          { id: testBP1 },                                      // missing dates
          { booked_from: '2024-09-03', booked_to: '2024-09-07' }, // missing id
        ],
      });

      const bp = await pool.query(
        'SELECT booked_from FROM booking_products WHERE id = $1', [testBP1]
      );
      expect(bp.rows[0].booked_from).toEqual(originalFrom);
    });

    // A booking_product_id from another booking must not be updated (security guard)
    test('should not update a booking_product that belongs to a different booking', async () => {
      const other = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, created_by)
         VALUES (1, CURRENT_DATE, 'confirmed', 'test')
         RETURNING id`
      );
      const otherBookingId = other.rows[0].id;

      const otherBP = await pool.query(
        `INSERT INTO booking_products
           (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, '2024-10-01', '2024-10-05', 'confirmed', 1000, 500, 1000)
         RETURNING id`,
        [otherBookingId, testProductId1]
      );
      const otherBPId = otherBP.rows[0].id;

      // Attempt to update the other booking's product via testBookingId — must be a no-op
      await bookingService.updateBooking(testBookingId, {
        products: [{ id: otherBPId, booked_from: '2024-10-10', booked_to: '2024-10-15' }],
      });

      const bp = await pool.query(
        'SELECT booked_from FROM booking_products WHERE id = $1', [otherBPId]
      );
      expect(bp.rows[0].booked_from.toISOString().slice(0, 10)).toBe('2024-10-01');

      // Cleanup other booking
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [otherBookingId]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [otherBookingId]);
    });

    // Empty products array — must be a pure no-op
    test('should be a no-op when products array is empty', async () => {
      const before = (await pool.query(
        'SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId]
      )).rows[0];

      await bookingService.updateBooking(testBookingId, { products: [] });

      const after = (await pool.query(
        'SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId]
      )).rows[0];
      expect(after.booked_from).toEqual(before.booked_from);
      expect(after.booked_to).toEqual(before.booked_to);
    });
  });

  describe('getDelayedBookings', () => {
    let delayedBookingId, delayedBPId;

    afterEach(async () => {
      // Cleanup any bookings created during delay tests
      if (delayedBookingId) {
        await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [delayedBookingId]);
        await pool.query('DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)', [delayedBookingId]);
        await pool.query('DELETE FROM payment_transactions WHERE booking_id = $1', [delayedBookingId]);
        await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [delayedBookingId]);
        await pool.query('DELETE FROM bookings WHERE id = $1', [delayedBookingId]);
        delayedBookingId = null;
        delayedBPId = null;
      }
    });

    async function createDelayedTestBooking(overrides = {}) {
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: new Date('2024-01-01'),
        products: [{
          productId: testProductId1,
          size: 'M',
          bookedFrom: new Date('2024-01-10'),
          bookedTo: new Date('2024-01-15'),  // In the past
          rent: 500,
          securityDeposit: 1000,
          quantity: 1,
        }],
        transportCharge: 0,
        createdBy: 'test',
      });
      delayedBookingId = result.booking_id;
      delayedBPId = result.booking_product_ids[0];

      // Confirm the booking
      await bookingService.confirmBooking(delayedBookingId, 'test');

      // Apply overrides to the booking_product
      if (overrides.picked_up_at !== undefined) {
        await pool.query(
          'UPDATE booking_products SET picked_up_at = $1 WHERE id = $2',
          [overrides.picked_up_at, delayedBPId]
        );
      }
      if (overrides.returned_at !== undefined) {
        await pool.query(
          'UPDATE booking_products SET returned_at = $1 WHERE id = $2',
          [overrides.returned_at, delayedBPId]
        );
      }
      if (overrides.bp_status) {
        await pool.query(
          'UPDATE booking_products SET status = $1 WHERE id = $2',
          [overrides.bp_status, delayedBPId]
        );
      }
      if (overrides.booking_status) {
        await pool.query(
          'UPDATE bookings SET status = $1 WHERE id = $2',
          [overrides.booking_status, delayedBookingId]
        );
      }

      return { bookingId: delayedBookingId, bpId: delayedBPId };
    }

    test('should return booking with picked-up but unreturned product past due date', async () => {
      await createDelayedTestBooking({
        picked_up_at: new Date('2024-01-10'),
        // returned_at is NULL by default
      });

      const result = await bookingService.getDelayedBookings();
      const match = result.find(r => r.booking_id === delayedBookingId);

      expect(match).toBeDefined();
      expect(match.delayed_products).toHaveLength(1);
      expect(match.delayed_products[0].code).toBe('BOOK001');
      expect(match.delayed_products[0].days_delayed).toBeGreaterThan(0);
    });

    test('should include size in delayed product data', async () => {
      await createDelayedTestBooking({
        picked_up_at: new Date('2024-01-10'),
      });

      const result = await bookingService.getDelayedBookings();
      const match = result.find(r => r.booking_id === delayedBookingId);

      expect(match).toBeDefined();
      expect(match.delayed_products).toHaveLength(1);
      expect(match.delayed_products[0]).toHaveProperty('size');
      expect(match.delayed_products[0].size).toBe('M');
    });


    test('should NOT return booking when product was never picked up', async () => {
      await createDelayedTestBooking({
        // picked_up_at is NULL — never picked up
      });

      const result = await bookingService.getDelayedBookings();
      const match = result.find(r => r.booking_id === delayedBookingId);

      expect(match).toBeUndefined();
    });

    test('should NOT return booking when product has been returned', async () => {
      await createDelayedTestBooking({
        picked_up_at: new Date('2024-01-10'),
        returned_at: new Date('2024-01-16'),  // Returned (late, but returned)
      });

      const result = await bookingService.getDelayedBookings();
      const match = result.find(r => r.booking_id === delayedBookingId);

      expect(match).toBeUndefined();
    });

    test('should NOT return booking with completed status', async () => {
      await createDelayedTestBooking({
        picked_up_at: new Date('2024-01-10'),
        booking_status: 'completed',
      });

      const result = await bookingService.getDelayedBookings();
      const match = result.find(r => r.booking_id === delayedBookingId);

      expect(match).toBeUndefined();
    });

    test('should NOT return cancelled/exchanged/discarded products', async () => {
      await createDelayedTestBooking({
        picked_up_at: new Date('2024-01-10'),
        bp_status: 'cancelled',
      });

      const result = await bookingService.getDelayedBookings();
      const match = result.find(r => r.booking_id === delayedBookingId);

      expect(match).toBeUndefined();
    });

    test('should return multiple delayed products for same booking', async () => {
      // Create booking with 2 products
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: new Date('2024-01-01'),
        products: [
          {
            productId: testProductId1,
            size: 'M',
            bookedFrom: new Date('2024-01-10'),
            bookedTo: new Date('2024-01-15'),
            rent: 500,
            securityDeposit: 1000,
            quantity: 1,
          },
          {
            productId: testProductId2,
            size: 'L',
            bookedFrom: new Date('2024-01-10'),
            bookedTo: new Date('2024-01-15'),
            rent: 800,
            securityDeposit: 1500,
            quantity: 1,
          },
        ],
        transportCharge: 0,
        createdBy: 'test',
      });
      delayedBookingId = result.booking_id;

      // Confirm and mark both as picked up
      await bookingService.confirmBooking(delayedBookingId, 'test');
      await pool.query(
        'UPDATE booking_products SET picked_up_at = $1 WHERE booking_id = $2',
        [new Date('2024-01-10'), delayedBookingId]
      );

      const delayed = await bookingService.getDelayedBookings();
      const match = delayed.find(r => r.booking_id === delayedBookingId);

      expect(match).toBeDefined();
      expect(match.delayed_products).toHaveLength(2);
      const codes = match.delayed_products.map(p => p.code).sort();
      expect(codes).toEqual(['BOOK001', 'BOOK002']);
    });
  });
});
