const chargeAccountingService = require('./chargeAccountingService');
const pool = require('../database/connection');

/**
 * Integration tests for the optional productIds parameter in _applyToSecurity.
 * These tests exercise the user-controlled security allocation feature:
 *   - When security_product_ids is provided, only the specified products receive the credit
 *   - Partial-paid products are filled before zero-paid products (ascending remaining amount)
 *   - Capacity validation throws a descriptive error when selected products cannot absorb the amount
 *   - Null / empty productIds falls back to the existing pickup-date waterfall (no regression)
 *
 * Test data: two products with rent=0 so 100% of payment flows to security.
 *   Product A — booked_from = today     — security due = 9,000
 *   Product B — booked_from = today + 1 — security due = 3,000
 */
describe('Security Allocation — productIds routing', () => {
  let testBookingId;
  let testProductIds = []; // [0] = product A (earlier pickup), [1] = product B (later pickup)
  let sharedProductId;

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Shared catalog product (rent/security values on booking_products are what matter)
      const productResult = await client.query(
        `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
         VALUES ('Sec Alloc Test', 'SECALLOC001', 'Test', '{M}', 100, 3000)
         RETURNING id`
      );
      sharedProductId = productResult.rows[0].id;

      // Booking with no transport charge so balance = security only
      const bookingResult = await client.query(
        `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status, transport_charge, transport_paid)
         VALUES (1, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 7, 'confirmed', 0, 0)
         RETURNING id`
      );
      testBookingId = bookingResult.rows[0].id;

      // Product A — earlier pickup, larger security
      const bpA = await client.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE + 7, 'confirmed', 0, 9000, 0)
         RETURNING id`,
        [testBookingId, sharedProductId]
      );
      testProductIds.push(bpA.rows[0].id); // index 0

      // Product B — later pickup, smaller security
      const bpB = await client.query(
        `INSERT INTO booking_products (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, 1, CURRENT_DATE + 1, CURRENT_DATE + 7, 'confirmed', 0, 3000, 0)
         RETURNING id`,
        [testBookingId, sharedProductId]
      );
      testProductIds.push(bpB.rows[0].id); // index 1

      // Initialize product_charges (rent=0 so all payment goes to security)
      await chargeAccountingService.initializeProductCharges(testProductIds[0], 0, 9000, client);
      await chargeAccountingService.initializeProductCharges(testProductIds[1], 0, 3000, client);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM payment_transactions WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM product_charges WHERE booking_product_id = ANY($1)', [testProductIds]);
    await pool.query('DELETE FROM booking_products WHERE id = ANY($1)', [testProductIds]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM products WHERE code = $1', ['SECALLOC001']);
    testProductIds = [];
  });

  afterAll(async () => {
    // pool teardown is handled globally
  });

  async function getSecurityPaid(bpId) {
    const result = await pool.query(
      `SELECT paid_amount FROM product_charges
       WHERE booking_product_id = $1 AND charge_type = 'security'`,
      [bpId]
    );
    return result.rows[0]?.paid_amount ?? 0;
  }

  // --- Test 1 ---
  // When productIds restricts to a single product, only that product receives the credit.
  test('allocates only to the specified product when productIds contains one ID', async () => {
    await chargeAccountingService.applyPayment(
      testBookingId, 1200, 'Cash', 'test-user', 'test',
      undefined, [testProductIds[0]] // product A only
    );

    expect(await getSecurityPaid(testProductIds[0])).toBe(1200); // product A credited
    expect(await getSecurityPaid(testProductIds[1])).toBe(0);    // product B untouched
  });

  // --- Test 2 ---
  // When both products are selected and product B has a partial payment,
  // product B (partial-paid, ascending remaining) is filled first.
  test('fills partially-paid product first when both products are selected', async () => {
    // Pre-pay 500 on product B directly so paid_amount > 0 → remaining = 2500
    await pool.query(
      `UPDATE product_charges SET paid_amount = 500
       WHERE booking_product_id = $1 AND charge_type = 'security'`,
      [testProductIds[1]]
    );

    // Total balance now: product A 9000 + product B 2500 = 11500
    // Pay 1200 across both → product B (partial) absorbs first
    await chargeAccountingService.applyPayment(
      testBookingId, 1200, 'Cash', 'test-user', 'test',
      undefined, [testProductIds[0], testProductIds[1]]
    );

    expect(await getSecurityPaid(testProductIds[1])).toBe(1700); // 500 pre-paid + 1200 new
    expect(await getSecurityPaid(testProductIds[0])).toBe(0);    // product A untouched
  });

  // --- Test 3 ---
  // When selected products' combined capacity is less than the security amount, an error is thrown.
  test('throws a descriptive error when selected products cannot absorb the security amount', async () => {
    // Product B capacity = 3000, attempting to credit 5000 → should fail
    await expect(
      chargeAccountingService.applyPayment(
        testBookingId, 5000, 'Cash', 'test-user', 'test',
        undefined, [testProductIds[1]] // product B only, capacity 3000 < 5000
      )
    ).rejects.toThrow('Security allocation insufficient');
  });

  // --- Test 4 ---
  // When productIds is null (not provided), the existing pickup-date waterfall runs unchanged.
  test('uses existing pickup-date order when productIds is null', async () => {
    // Product A has earlier booked_from (CURRENT_DATE) → filled first in the waterfall
    await chargeAccountingService.applyPayment(
      testBookingId, 1000, 'Cash', 'test-user', 'test'
      // no securityProductIds arg → defaults to null
    );

    expect(await getSecurityPaid(testProductIds[0])).toBe(1000); // product A (earlier pickup) first
    expect(await getSecurityPaid(testProductIds[1])).toBe(0);
  });

  // --- Test 5 ---
  // An empty array is treated the same as null — existing pickup-date waterfall runs.
  test('treats empty productIds array the same as null (pickup-date waterfall)', async () => {
    await chargeAccountingService.applyPayment(
      testBookingId, 1000, 'Cash', 'test-user', 'test',
      undefined, [] // empty array → should behave like null
    );

    expect(await getSecurityPaid(testProductIds[0])).toBe(1000); // product A first
    expect(await getSecurityPaid(testProductIds[1])).toBe(0);
  });

  // --- Test 6 ---
  // When the amount exactly equals the selected products' total remaining capacity,
  // allocation succeeds with no error and no remainder.
  test('succeeds without error when amount exactly equals selected products capacity', async () => {
    // Product B capacity = 3000, pay exactly 3000
    await chargeAccountingService.applyPayment(
      testBookingId, 3000, 'Cash', 'test-user', 'test',
      undefined, [testProductIds[1]]
    );

    expect(await getSecurityPaid(testProductIds[1])).toBe(3000); // fully absorbed
    expect(await getSecurityPaid(testProductIds[0])).toBe(0);    // product A untouched
  });
});
