const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const bookingService = require('../services/bookingService');
const productLifecycleService = require('../services/productLifecycleService');

// Create express app for testing
const app = express();
app.use(express.json());
// Mock auth: tests run as admin
app.use((req, res, next) => { req.user = { role: 'admin', id: 'test-user' }; next(); });
app.use('/booking-discard', require('./bookingDiscard'));

describe('Booking Discard Routes', () => {
  let testProductId;
  let testProductId2;

  beforeAll(async () => {
    // Create test products
    const p1 = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['TEST-DISCARD-001', 'Test Discard Product 1', 10000, 5000, 'test']
    );
    testProductId = p1.rows[0].id;

    const p2 = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['TEST-DISCARD-002', 'Test Discard Product 2', 20000, 10000, 'test']
    );
    testProductId2 = p2.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM products WHERE code IN ('TEST-DISCARD-001', 'TEST-DISCARD-002')`);
  });

  describe('POST /booking-discard/:bookingId', () => {
    let bookingId;

    afterEach(async () => {
      if (bookingId) {
        await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [bookingId]);
        await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id = $1`, [bookingId]);
        await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [bookingId]);
        await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [bookingId]);
        await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [bookingId]);
        await pool.query(`DELETE FROM bookings WHERE id = $1`, [bookingId]);
        bookingId = null;
      }
    });

    it('should discard a confirmed booking with all products', async () => {
      // Create booking with 2 products
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: '2024-01-01',
        products: [
          { productId: testProductId, bookedFrom: '2024-02-01', bookedTo: '2024-02-05', rent: 10000, securityDeposit: 5000 },
          { productId: testProductId2, bookedFrom: '2024-02-01', bookedTo: '2024-02-05', rent: 20000, securityDeposit: 10000 },
        ],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      bookingId = result.booking_id;

      // Confirm booking
      await bookingService.confirmBooking(bookingId, 'test-user');

      const res = await request(app)
        .post(`/booking-discard/${bookingId}`)
        .send({ discarded_by: 'test-admin' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('discarded successfully');
      expect(res.body.new_status).toBe('discarded');
      expect(res.body.discarded_product_count).toBe(2);

      // Verify booking status in DB
      const bookingCheck = await pool.query('SELECT status FROM bookings WHERE id = $1', [bookingId]);
      expect(bookingCheck.rows[0].status).toBe('discarded');

      // Verify all products are discarded
      const productsCheck = await pool.query(
        'SELECT status FROM booking_products WHERE booking_id = $1',
        [bookingId]
      );
      productsCheck.rows.forEach(row => {
        expect(row.status).toBe('discarded');
      });
    });

    it('should discard a pending booking', async () => {
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: '2024-01-01',
        products: [
          { productId: testProductId, bookedFrom: '2024-03-01', bookedTo: '2024-03-05', rent: 10000, securityDeposit: 5000 },
        ],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      bookingId = result.booking_id;

      const res = await request(app)
        .post(`/booking-discard/${bookingId}`)
        .send({ discarded_by: 'test-admin' });

      expect(res.status).toBe(200);
      expect(res.body.new_status).toBe('discarded');
      expect(res.body.discarded_product_count).toBe(1);
    });

    it('should return 400 when discarding an already-cancelled booking', async () => {
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: '2024-01-01',
        products: [
          { productId: testProductId, bookedFrom: '2024-04-01', bookedTo: '2024-04-05', rent: 10000, securityDeposit: 5000 },
        ],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      bookingId = result.booking_id;

      // Set to cancelled directly
      await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['cancelled', bookingId]);

      const res = await request(app)
        .post(`/booking-discard/${bookingId}`)
        .send({ discarded_by: 'test-admin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot discard');
    });

    it('should return 400 when discarding an already-discarded booking', async () => {
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: '2024-01-01',
        products: [
          { productId: testProductId, bookedFrom: '2024-05-01', bookedTo: '2024-05-05', rent: 10000, securityDeposit: 5000 },
        ],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      bookingId = result.booking_id;

      // Discard once
      await request(app)
        .post(`/booking-discard/${bookingId}`)
        .send({ discarded_by: 'test-admin' });

      // Try to discard again
      const res = await request(app)
        .post(`/booking-discard/${bookingId}`)
        .send({ discarded_by: 'test-admin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot discard');
    });

    it('should return 400 when discarded_by is missing', async () => {
      const res = await request(app)
        .post('/booking-discard/999')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('discarded_by is required');
    });

    it('should return 404 for non-existent booking', async () => {
      const res = await request(app)
        .post('/booking-discard/999999')
        .send({ discarded_by: 'test-admin' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Booking not found');
    });

    it('should log activity when discarding', async () => {
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: '2024-01-01',
        products: [
          { productId: testProductId, bookedFrom: '2024-06-01', bookedTo: '2024-06-05', rent: 10000, securityDeposit: 5000 },
        ],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      bookingId = result.booking_id;

      await request(app)
        .post(`/booking-discard/${bookingId}`)
        .send({ discarded_by: 'test-admin' });

      // Verify activity log
      const activityCheck = await pool.query(
        `SELECT event_type, performed_by, details FROM booking_activity_log 
         WHERE booking_id = $1 AND event_type = 'booking_discarded'`,
        [bookingId]
      );
      expect(activityCheck.rows.length).toBe(1);
      expect(activityCheck.rows[0].performed_by).toBe('test-admin');
      const details = activityCheck.rows[0].details;
      expect(details.discarded_product_count).toBe(1);
    });

    it('should release dates after discard (product not in availability conflicts)', async () => {
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: '2024-01-01',
        products: [
          { productId: testProductId, bookedFrom: '2024-07-01', bookedTo: '2024-07-05', rent: 10000, securityDeposit: 5000 },
        ],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      bookingId = result.booking_id;
      await bookingService.confirmBooking(bookingId, 'test-user');

      // Check availability before discard — should be booked
      const availabilityService = require('../services/availabilityService');
      const beforeDiscard = await availabilityService.checkProductAvailability(
        testProductId, '2024-07-01', '2024-07-05'
      );
      expect(beforeDiscard.available).toBe(false);

      // Discard
      await request(app)
        .post(`/booking-discard/${bookingId}`)
        .send({ discarded_by: 'test-admin' });

      // Check availability after discard — should be available
      const afterDiscard = await availabilityService.checkProductAvailability(
        testProductId, '2024-07-01', '2024-07-05'
      );
      expect(afterDiscard.available).toBe(true);
    });
  });
});

describe('ProductLifecycleService - discardBooking', () => {
  let testProductId;

  beforeAll(async () => {
    const p = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['TEST-DISCARD-SVC-001', 'Test Discard Service Product', 10000, 5000, 'test']
    );
    testProductId = p.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM products WHERE code = 'TEST-DISCARD-SVC-001'`);
  });

  let bookingId;

  afterEach(async () => {
    if (bookingId) {
      await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [bookingId]);
      await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM bookings WHERE id = $1`, [bookingId]);
      bookingId = null;
    }
  });

  it('should return correct result shape from discardBooking', async () => {
    const result = await bookingService.createBooking({
      userId: 1,
      bookingDate: '2024-01-01',
      products: [
        { productId: testProductId, bookedFrom: '2024-08-01', bookedTo: '2024-08-05', rent: 10000, securityDeposit: 5000 },
      ],
      transportCharge: 0,
      createdBy: 'test-user'
    });
    bookingId = result.booking_id;

    const discardResult = await productLifecycleService.discardBooking(bookingId, 'admin-user');

    expect(discardResult.booking_id).toBe(bookingId);
    expect(discardResult.previous_status).toBe('pending');
    expect(discardResult.new_status).toBe('discarded');
    expect(discardResult.discarded_product_count).toBe(1);
    expect(discardResult.discarded_product_ids).toHaveLength(1);
  });

  it('should throw for completed booking', async () => {
    const result = await bookingService.createBooking({
      userId: 1,
      bookingDate: '2024-01-01',
      products: [
        { productId: testProductId, bookedFrom: '2024-09-01', bookedTo: '2024-09-05', rent: 10000, securityDeposit: 5000 },
      ],
      transportCharge: 0,
      createdBy: 'test-user'
    });
    bookingId = result.booking_id;
    await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['completed', bookingId]);

    await expect(productLifecycleService.discardBooking(bookingId, 'admin'))
      .rejects.toThrow('Cannot discard booking with status: completed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Integration tests: verify discarded status is properly excluded from all
// downstream services. These tests exist specifically to catch missing
// 'discarded' in NOT IN / .includes() filters across the codebase.
// ─────────────────────────────────────────────────────────────────────────────

describe('Discarded booking — integration with downstream services', () => {
  const chargeAccountingService = require('../services/chargeAccountingService');
  const availabilityService = require('../services/availabilityService');

  let testProductId;
  let bookingId;

  beforeAll(async () => {
    const p = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['TEST-DISCARD-INTEG-001', 'Integration Test Discard Product', 10000, 5000, 'test']
    );
    testProductId = p.rows[0].id;
  });

  afterAll(async () => {
    // Restore product if archived by a test
    await pool.query(
      `UPDATE products SET status = 'available' WHERE code = 'TEST-DISCARD-INTEG-001'`
    );
    await pool.query(`DELETE FROM products WHERE code = 'TEST-DISCARD-INTEG-001'`);
  });

  beforeEach(async () => {
    // Ensure product is available before each test
    await pool.query(
      `UPDATE products SET status = 'available' WHERE id = $1`,
      [testProductId]
    );

    // Create a booking, confirm it, then discard it
    const result = await bookingService.createBooking({
      userId: 1,
      bookingDate: '2024-01-01',
      products: [
        { productId: testProductId, bookedFrom: '2025-03-01', bookedTo: '2025-03-10', rent: 10000, securityDeposit: 5000 },
      ],
      transportCharge: 1000,
      createdBy: 'test-user'
    });
    bookingId = result.booking_id;
    await bookingService.confirmBooking(bookingId, 'test-user');
    await productLifecycleService.discardBooking(bookingId, 'test-admin');
  });

  afterEach(async () => {
    if (bookingId) {
      await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM booking_cancellation_history WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [bookingId]);
      await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM bookings WHERE id = $1`, [bookingId]);
      bookingId = null;
    }
  });

  // ── chargeAccountingService ────────────────────────────────────────────────

  it('getPaymentSummary should exclude discarded products from active rent/security totals', async () => {
    const summary = await chargeAccountingService.getPaymentSummary(bookingId);

    // Discarded products should not contribute to active rent or security dues
    expect(summary.charges.rent.due).toBe(0);
    expect(summary.charges.security.due).toBe(0);
  });

  it('applyPayment should reject payments for discarded bookings', async () => {
    // The service-level guard should throw before any allocation happens
    await expect(
      chargeAccountingService.applyPayment(bookingId, 1000, 'cash', 'test-admin', 'test payment')
    ).rejects.toThrow('discarded booking');
  });

  it('recordRefund should reject refunds for discarded bookings', async () => {
    await expect(
      chargeAccountingService.recordRefund(bookingId, 500, 'cash', 'test-admin', 'test refund')
    ).rejects.toThrow('discarded booking');
  });

  // ── paymentTransactions route guards ───────────────────────────────────────

  it('POST /payment-transactions should reject payment for discarded booking', async () => {
    const paymentApp = express();
    paymentApp.use(express.json());
    paymentApp.use((req, res, next) => { req.user = { role: 'admin', id: 'test' }; next(); });
    paymentApp.use('/payment-transactions', require('./paymentTransactions'));

    const res = await request(paymentApp)
      .post('/payment-transactions')
      .send({
        booking_id: bookingId,
        amount: 1000,
        payment_method: 'cash',
        recorded_by: 'test-admin',
        type: 'payment'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('discarded');
  });

  it('POST /payment-transactions should reject refund for discarded booking', async () => {
    const paymentApp = express();
    paymentApp.use(express.json());
    paymentApp.use((req, res, next) => { req.user = { role: 'admin', id: 'test' }; next(); });
    paymentApp.use('/payment-transactions', require('./paymentTransactions'));

    const res = await request(paymentApp)
      .post('/payment-transactions')
      .send({
        booking_id: bookingId,
        amount: 500,
        payment_method: 'cash',
        recorded_by: 'test-admin',
        type: 'refund'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('discarded');
  });

  it('POST /payment-transactions/adjustment should reject adjustment for discarded booking', async () => {
    const paymentApp = express();
    paymentApp.use(express.json());
    paymentApp.use((req, res, next) => { req.user = { role: 'admin', id: 'test' }; next(); });
    paymentApp.use('/payment-transactions', require('./paymentTransactions'));

    const res = await request(paymentApp)
      .post('/payment-transactions/adjustment')
      .send({
        booking_id: bookingId,
        adjustment_amount: 500,
        payment_method: 'Adjustment',
        adjusted_by: 'test-admin',
        reason: 'Test adjustment'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('discarded');
  });

  // ── availabilityService ────────────────────────────────────────────────────

  it('discarded product should not block calendar availability', async () => {
    const result = await availabilityService.checkProductAvailability(
      testProductId, '2025-03-01', '2025-03-10'
    );
    expect(result.available).toBe(true);
  });

  // ── bookingDateUtils — checkProductAvailability (booking creation) ─────────

  it('should allow creating a new booking for same product+dates after discard', async () => {
    // This is the exact scenario the user reported as a bug
    const newBooking = await bookingService.createBooking({
      userId: 1,
      bookingDate: '2024-01-01',
      products: [
        { productId: testProductId, bookedFrom: '2025-03-01', bookedTo: '2025-03-10', rent: 10000, securityDeposit: 5000 },
      ],
      transportCharge: 0,
      createdBy: 'test-user'
    });

    expect(newBooking.booking_id).toBeDefined();

    // Clean up the new booking
    const newId = newBooking.booking_id;
    await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [newId]);
    await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [newId]);
    await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [newId]);
    await pool.query(`DELETE FROM bookings WHERE id = $1`, [newId]);
  });

  // ── productLifecycleService — exchange/cancel guards ───────────────────────

  it('should not allow exchanging a discarded product', async () => {
    const bpResult = await pool.query(
      'SELECT id FROM booking_products WHERE booking_id = $1 LIMIT 1',
      [bookingId]
    );
    const bpId = bpResult.rows[0].id;

    const eligibility = await productLifecycleService.validateExchangeEligibility(bpId);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('discarded');
  });

  it('should not allow cancelling a discarded product', async () => {
    const bpResult = await pool.query(
      'SELECT id FROM booking_products WHERE booking_id = $1 LIMIT 1',
      [bookingId]
    );
    const bpId = bpResult.rows[0].id;

    const eligibility = await productLifecycleService.validateCancellationEligibility(bpId);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('discarded');
  });

  it('cancellation preview should have zero cancellable products for a discarded booking', async () => {
    const preview = await productLifecycleService.calculateCancellationPreview(bookingId);
    expect(preview.products_to_cancel.length).toBe(0);
  });

  // ── productService — archive guard ─────────────────────────────────────────

  it('should allow archiving a product that only has discarded bookings', async () => {
    const productService = require('../services/productService');

    // If discarded was missing from the archive guard, this would throw:
    // "Cannot archive this product because it has active bookings."
    await expect(
      productService.archiveProduct(testProductId)
    ).resolves.not.toThrow();

    // Restore for subsequent tests (beforeEach also restores, but be safe)
    await pool.query(
      `UPDATE products SET status = 'available' WHERE id = $1`,
      [testProductId]
    );
  });

  // ── bookingService — getAllBookings ─────────────────────────────────────────

  it('getBookingsList should return discarded booking with correct status', async () => {
    const bookings = await bookingService.getBookingsList();
    const discardedBooking = bookings.find(b => b.id === bookingId);

    expect(discardedBooking).toBeDefined();
    expect(discardedBooking.status).toBe('discarded');
  });

  // ── bookingService — finalize guard ────────────────────────────────────────

  it('finalization should not fail due to discarded products being "still active"', async () => {
    // If discarded was missing from the finalizeBooking NOT IN filter,
    // it would throw: "Some products are still active (not completed or cancelled)"
    // We set the booking status back to something finalizable first
    await pool.query(
      `UPDATE bookings SET status = 'confirmed' WHERE id = $1`,
      [bookingId]
    );

    // finalizeBooking should see all discarded products as terminal
    // and allow finalization
    const result = await bookingService.finalizeBooking(bookingId, 0, 'test-admin');
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// usersService — verify discarded bookings don't block user deletion
// ─────────────────────────────────────────────────────────────────────────────

describe('Discarded booking — usersService integration', () => {
  const usersService = require('../services/usersService');

  let testUserId;
  let testProductId;
  let bookingId;

  beforeAll(async () => {
    // Create a test user (users table has: name, phone — no created_by)
    testUserId = (await pool.query(
      `INSERT INTO users (name, phone) VALUES ('Discard Test User', '9876500001') RETURNING id`
    )).rows[0].id;

    testProductId = (await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ('TEST-DISCARD-USR-001', 'User Delete Test Product', 10000, 5000, 'test') RETURNING id`
    )).rows[0].id;
  });

  afterAll(async () => {
    if (bookingId) {
      await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [bookingId]);
      await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [bookingId]);
      await pool.query(`DELETE FROM bookings WHERE id = $1`, [bookingId]);
    }
    await pool.query(`DELETE FROM products WHERE code = 'TEST-DISCARD-USR-001'`);
    await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  });

  it('should allow deleting a user whose only booking is discarded', async () => {
    const result = await bookingService.createBooking({
      userId: testUserId,
      bookingDate: '2024-01-01',
      products: [
        { productId: testProductId, bookedFrom: '2025-06-01', bookedTo: '2025-06-05', rent: 10000, securityDeposit: 5000 },
      ],
      transportCharge: 0,
      createdBy: 'test-user'
    });
    bookingId = result.booking_id;
    await productLifecycleService.discardBooking(bookingId, 'test-admin');

    // If discarded was missing from the user deletion guard,
    // this would throw: "Cannot deactivate customer with active bookings"
    await expect(usersService.deleteUser(testUserId)).resolves.not.toThrow();
  });
});
