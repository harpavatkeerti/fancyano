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
    await pool.query('DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = $1)', ['TEST-AVAIL-SERVICE']);
    await pool.query('DELETE FROM bookings WHERE customer_phone = $1', ['TEST-AVAIL-SERVICE']);
    await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
    await pool.end();
  });

  afterEach(async () => {
    // Cleanup after each test
    await pool.query('DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE customer_phone = $1)', ['TEST-AVAIL-SERVICE']);
    await pool.query('DELETE FROM bookings WHERE customer_phone = $1', ['TEST-AVAIL-SERVICE']);
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
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, booked_from, booked_to, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        ['Test Customer', 'TEST-AVAIL-SERVICE', '2024-01-01', '2024-03-01', '2024-03-10', 'confirmed']
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
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, booked_from, booked_to, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        ['Test Customer', 'TEST-AVAIL-SERVICE', '2024-01-01', '2024-03-01', '2024-03-10', 'confirmed']
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
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, booked_from, booked_to, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        ['Test Customer', 'TEST-AVAIL-SERVICE', '2024-01-01', '2024-03-01', '2024-03-10', 'confirmed']
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
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, booked_from, booked_to, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        ['Test Customer', 'TEST-AVAIL-SERVICE', '2024-01-01', '2024-04-01', '2024-04-10', 'confirmed']
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
});
