const availabilityService = require('./availabilityService');
const pool = require('../database/connection');

describe('AvailabilityService', () => {
  let testProductId;
  let testBookingId;
  let testBookingProductId;

  beforeAll(async () => {
    // Create test product
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['TEST-AVAIL-001', 'Test Availability Product', 50000, 20000, 'test']
    );
    testProductId = productResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
  });

  afterEach(async () => {
    // Cleanup after each test
    await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
  });

  describe('checkProductAvailability', () => {
    it('should return available when product has no bookings', async () => {
      const result = await availabilityService.checkProductAvailability(
        testProductId,
        '2024-03-01',
        '2024-03-05'
      );

      expect(result.available).toBe(true);
      expect(result.conflicts).toHaveLength(0);
      expect(result.message).toBe('Product is available for the selected dates');
    });

    it('should return unavailable when product has conflicting booking', async () => {
      // Create a confirmed booking
      const bookingResult = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, $1, $2, $3, $4)
         RETURNING id`,
        ['2024-01-01', '2024-03-01', '2024-03-10', 'confirmed']
      );
      testBookingId = bookingResult.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testBookingId, testProductId, '2024-03-01', '2024-03-10', 'confirmed', 50000, 20000]
      );

      const result = await availabilityService.checkProductAvailability(
        testProductId,
        '2024-03-03',
        '2024-03-08'
      );

      expect(result.available).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toHaveProperty('booking_id', testBookingId);
      expect(result.message).toContain('already booked');
    });

    it('should return available when conflicting booking product is cancelled', async () => {
      // Create a booking with cancelled product
      const bookingResult = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, $1, $2, $3, $4)
         RETURNING id`,
        ['2024-01-01', '2024-03-01', '2024-03-10', 'confirmed']
      );
      testBookingId = bookingResult.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testBookingId, testProductId, '2024-03-01', '2024-03-10', 'cancelled', 50000, 20000]
      );

      const result = await availabilityService.checkProductAvailability(
        testProductId,
        '2024-03-03',
        '2024-03-08'
      );

      expect(result.available).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should return available when conflicting booking product is exchanged', async () => {
      // Create a booking with exchanged product
      const bookingResult = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, $1, $2, $3, $4)
         RETURNING id`,
        ['2024-01-01', '2024-03-01', '2024-03-10', 'confirmed']
      );
      testBookingId = bookingResult.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testBookingId, testProductId, '2024-03-01', '2024-03-10', 'exchanged', 50000, 20000]
      );

      const result = await availabilityService.checkProductAvailability(
        testProductId,
        '2024-03-03',
        '2024-03-08'
      );

      expect(result.available).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('checkBulkAvailability', () => {
    it('should check availability for multiple products', async () => {
      const result = await availabilityService.checkBulkAvailability([
        {
          product_id: testProductId,
          date_from: '2024-04-01',
          date_to: '2024-04-05'
        }
      ]);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].available).toBe(true);
      expect(result.all_available).toBe(true);
    });

    it('should handle missing required fields', async () => {
      const result = await availabilityService.checkBulkAvailability([
        {
          product_id: testProductId
          // Missing date_from and date_to
        }
      ]);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].available).toBe(false);
      expect(result.results[0].error).toBe('Missing required fields');
      expect(result.all_available).toBe(false);
    });

    it('should return all_available false when any product is unavailable', async () => {
      // Create a booking
      const bookingResult = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, $1, $2, $3, $4)
         RETURNING id`,
        ['2024-01-01', '2024-04-01', '2024-04-10', 'confirmed']
      );
      testBookingId = bookingResult.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testBookingId, testProductId, '2024-04-01', '2024-04-10', 'confirmed', 50000, 20000]
      );

      const result = await availabilityService.checkBulkAvailability([
        {
          product_id: testProductId,
          date_from: '2024-04-03',
          date_to: '2024-04-08'
        }
      ]);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].available).toBe(false);
      expect(result.all_available).toBe(false);
    });
  });

  describe('Tight Schedule / Urgency', () => {
    let tightProductId;
    const createdBookingIds = [];

    beforeAll(async () => {
      // Create a product for tight schedule tests
      const res = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['TEST-TIGHT-001', 'Tight Schedule Product', 50000, 20000, 'test']
      );
      tightProductId = res.rows[0].id;
    });

    afterAll(async () => {
      // Cleanup all created bookings (cascade deletes booking_products)
      for (const id of createdBookingIds) {
        await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [id]);
        await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
      }
      await pool.query('DELETE FROM products WHERE id = $1', [tightProductId]);
    });

    // Helper to create a booking + booking_product
    async function createBooking(productId, bookedFrom, bookedTo, bpStatus = 'confirmed', bStatus = 'confirmed', size = null) {
      const bRes = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
         VALUES (1, '2024-01-01', $1, $2, $3) RETURNING id`,
        [bookedFrom, bookedTo, bStatus]
      );
      const bookingId = bRes.rows[0].id;
      createdBookingIds.push(bookingId);

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit, size)
         VALUES ($1, $2, $3, $4, $5, 50000, 20000, $6)`,
        [bookingId, productId, bookedFrom, bookedTo, bpStatus, size]
      );
      return bookingId;
    }

    it('should detect tight schedule — 1 day gap after return', async () => {
      // Existing booking: Aug 12-15
      await createBooking(tightProductId, '2025-08-12', '2025-08-15');

      // New product: Aug 9-11 → 1 day gap before the existing booking picks up on Aug 12
      const result = await availabilityService.checkTightScheduleForProducts([
        { product_id: tightProductId, booked_from: '2025-08-09', booked_to: '2025-08-11' }
      ]);

      expect(result.has_tight_schedule).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('1 day after');
    });

    it('should detect tight schedule — 2 day gap before pickup', async () => {
      // Existing booking: Aug 1-5
      await createBooking(tightProductId, '2025-08-01', '2025-08-05');

      // New product: Aug 7-10 → 2 day gap (Aug 5 to Aug 7)
      const result = await availabilityService.checkTightScheduleForProducts([
        { product_id: tightProductId, booked_from: '2025-08-07', booked_to: '2025-08-10' }
      ]);

      expect(result.has_tight_schedule).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('2 day before');
    });

    it('should NOT flag tight schedule — 3 day gap', async () => {
      // Existing booking: Sept 1-5
      await createBooking(tightProductId, '2025-09-01', '2025-09-05');

      // New product: Sept 8-12 → 3 day gap (safe)
      const result = await availabilityService.checkTightScheduleForProducts([
        { product_id: tightProductId, booked_from: '2025-09-08', booked_to: '2025-09-12' }
      ]);

      expect(result.has_tight_schedule).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should NOT flag tight schedule for different sizes', async () => {
      // Existing booking: Oct 10-15, size "42"
      await createBooking(tightProductId, '2025-10-10', '2025-10-15', 'confirmed', 'confirmed', '42');

      // New product: Oct 16-20, size "44" → different size, should not flag
      const result = await availabilityService.checkTightScheduleForProducts([
        { product_id: tightProductId, size: '44', booked_from: '2025-10-16', booked_to: '2025-10-20' }
      ]);

      expect(result.has_tight_schedule).toBe(false);
    });

    it('should NOT flag tight schedule for cancelled product status', async () => {
      // Existing booking with cancelled product: Nov 10-15
      await createBooking(tightProductId, '2025-11-10', '2025-11-15', 'cancelled', 'confirmed');

      // New product: Nov 16-20 → 1 day gap, but the existing product is cancelled
      const result = await availabilityService.checkTightScheduleForProducts([
        { product_id: tightProductId, booked_from: '2025-11-16', booked_to: '2025-11-20' }
      ]);

      expect(result.has_tight_schedule).toBe(false);
    });

    it('should NOT flag tight schedule for completed booking status', async () => {
      // Existing booking with completed status: Dec 10-15
      await createBooking(tightProductId, '2025-12-10', '2025-12-15', 'confirmed', 'completed');

      // New product: Dec 16-20 → 1 day gap, but the existing booking is completed
      const result = await availabilityService.checkTightScheduleForProducts([
        { product_id: tightProductId, booked_from: '2025-12-16', booked_to: '2025-12-20' }
      ]);

      expect(result.has_tight_schedule).toBe(false);
    });

    it('checkTightScheduleForBooking should detect urgency for existing booking', async () => {
      // Booking A: Jan 1-5
      const bookingA = await createBooking(tightProductId, '2026-01-01', '2026-01-05');
      // Booking B: Jan 7-10 → 2 day gap from booking A
      const bookingB = await createBooking(tightProductId, '2026-01-07', '2026-01-10');

      const resultA = await availabilityService.checkTightScheduleForBooking(bookingA);
      expect(resultA.is_urgent).toBe(true);
      expect(resultA.reasons.length).toBeGreaterThan(0);

      const resultB = await availabilityService.checkTightScheduleForBooking(bookingB);
      expect(resultB.is_urgent).toBe(true);
    });

    it('checkTightScheduleForBooking should return not urgent for cancelled booking', async () => {
      const bookingC = await createBooking(tightProductId, '2026-02-01', '2026-02-05', 'confirmed', 'cancelled');

      const result = await availabilityService.checkTightScheduleForBooking(bookingC);
      expect(result.is_urgent).toBe(false);
    });

    it('checkTightScheduleBulk should return a map of results', async () => {
      // Booking D: Mar 1-5
      const bookingD = await createBooking(tightProductId, '2026-03-01', '2026-03-05');
      // Booking E: Mar 7-10 → 2 day gap
      const bookingE = await createBooking(tightProductId, '2026-03-07', '2026-03-10');

      const result = await availabilityService.checkTightScheduleBulk([bookingD, bookingE]);

      expect(result[bookingD]).toBeDefined();
      expect(result[bookingD].is_urgent).toBe(true);
      expect(result[bookingE]).toBeDefined();
      expect(result[bookingE].is_urgent).toBe(true);
    });
  });
});
