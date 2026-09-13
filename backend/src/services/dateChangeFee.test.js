const pool = require('../database/connection');
const bookingService = require('./bookingService');
const chargeAccountingService = require('./chargeAccountingService');

describe('date_change_fee via updateBooking', () => {
  let testProductId, testBookingId, testBPId;

  beforeAll(async () => {
    const product = await pool.query(
      `INSERT INTO products (name, code, category, available_sizes, rent, security_deposit)
       VALUES ('DateChangeFeeTestProd', 'DCFEE001', 'Test', '{M}', 2000, 1000)
       RETURNING id`
    );
    testProductId = product.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM products WHERE code = 'DCFEE001'`);
  });

  beforeEach(async () => {
    // Cleanup any prior test bookings
    const staleIds = await pool.query(
      `SELECT DISTINCT booking_id FROM booking_products WHERE product_id = $1`,
      [testProductId]
    );
    const ids = staleIds.rows.map(r => r.booking_id);
    if (ids.length > 0) {
      await pool.query('DELETE FROM booking_activity_log WHERE booking_id = ANY($1)', [ids]);
      await pool.query(
        `DELETE FROM product_charges
         WHERE booking_product_id IN (
           SELECT id FROM booking_products WHERE booking_id = ANY($1)
         )`, [ids]
      );
      await pool.query('DELETE FROM payment_transactions WHERE booking_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM booking_products WHERE booking_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM bookings WHERE id = ANY($1)', [ids]);
    }

    // Create fresh booking with one product
    const booking = await pool.query(
      `INSERT INTO bookings (user_id, booking_date, status, created_by, booked_from, booked_to)
       VALUES (1, CURRENT_DATE, 'confirmed', 'test', '2024-09-01', '2024-09-10')
       RETURNING id`
    );
    testBookingId = booking.rows[0].id;

    const bp = await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES ($1, $2, 1, '2024-09-01', '2024-09-05', 'confirmed', 2000, 1000, 2000)
       RETURNING id`,
      [testBookingId, testProductId]
    );
    testBPId = bp.rows[0].id;
  });

  test('should create a date_change_fee charge in product_charges when fee is provided', async () => {
    await bookingService.updateBooking(testBookingId, {
      products: [{
        id: testBPId,
        booked_from: '2024-09-03',
        booked_to: '2024-09-07',
        date_change_fee: 200,
        date_change_reason: 'Test fee reason',
      }],
    });

    const charge = await pool.query(
      `SELECT charge_type, due_amount, paid_amount, notes
       FROM product_charges
       WHERE booking_product_id = $1 AND charge_type = 'date_change_fee'`,
      [testBPId]
    );
    expect(charge.rows).toHaveLength(1);
    expect(charge.rows[0].due_amount).toBe(200);
    expect(charge.rows[0].paid_amount).toBe(0);
    expect(charge.rows[0].notes).toBe('Test fee reason');
  });

  test('should NOT create a charge when date_change_fee is 0', async () => {
    await bookingService.updateBooking(testBookingId, {
      products: [{ id: testBPId, booked_from: '2024-09-03', booked_to: '2024-09-07', date_change_fee: 0 }],
    });

    const charge = await pool.query(
      `SELECT id FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'date_change_fee'`,
      [testBPId]
    );
    expect(charge.rows).toHaveLength(0);
  });

  test('should NOT create a charge when date_change_fee is absent', async () => {
    await bookingService.updateBooking(testBookingId, {
      products: [{ id: testBPId, booked_from: '2024-09-03', booked_to: '2024-09-07' }],
    });

    const charge = await pool.query(
      `SELECT id FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'date_change_fee'`,
      [testBPId]
    );
    expect(charge.rows).toHaveLength(0);
  });

  test('date_change_fee should appear in outstanding balance via charge accounting (fees category)', async () => {
    // Create rent charge first so summary works
    await pool.query(
      `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
       VALUES ($1, 'rent', 2000, 0)`,
      [testBPId]
    );

    await bookingService.updateBooking(testBookingId, {
      products: [{
        id: testBPId,
        booked_from: '2024-09-03',
        booked_to: '2024-09-07',
        date_change_fee: 150,
      }],
    });

    const summary = await chargeAccountingService.getPaymentSummary(testBookingId);
    // date_change_fee is in the 'fees' category
    expect(summary.charges.fees.due).toBe(150);
    expect(summary.charges.fees.paid).toBe(0);
  });

  test('activity log should include date_change_fee amount', async () => {
    await bookingService.updateBooking(testBookingId, {
      products: [{
        id: testBPId,
        booked_from: '2024-09-03',
        booked_to: '2024-09-07',
        date_change_fee: 300,
      }],
      performed_by: 'admin_test',
    });

    const log = await pool.query(
      `SELECT details FROM booking_activity_log
       WHERE booking_id = $1 AND event_type = 'date_changed'
       ORDER BY id DESC LIMIT 1`,
      [testBookingId]
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].details.products[0].date_change_fee).toBe(300);
  });

  test('should not create charge for a booking_product not owned by this booking', async () => {
    const fakeBPId = 999999;

    await bookingService.updateBooking(testBookingId, {
      products: [{
        id: fakeBPId,
        booked_from: '2024-09-03',
        booked_to: '2024-09-07',
        date_change_fee: 500,
      }],
    });

    // Fake BP is skipped — no charge created
    const charge = await pool.query(
      `SELECT id FROM product_charges WHERE booking_product_id = $1 AND charge_type = 'date_change_fee'`,
      [fakeBPId]
    );
    expect(charge.rows).toHaveLength(0);
  });

  // ── Size-aware availability check ────────────────────────────────────

  test('date change should not conflict with a different size of the same product', async () => {
    // Setup: create a second booking with the SAME product but size L, overlapping dates
    const otherBooking = await pool.query(
      `INSERT INTO bookings (user_id, booking_date, status, created_by, booked_from, booked_to)
       VALUES (1, CURRENT_DATE, 'confirmed', 'test', '2024-09-03', '2024-09-07')
       RETURNING id`
    );
    const otherBookingId = otherBooking.rows[0].id;

    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, size, rent, security_deposit, effective_rent)
       VALUES ($1, $2, 1, '2024-09-03', '2024-09-07', 'confirmed', 'L', 2000, 1000, 2000)`,
      [otherBookingId, testProductId]
    );

    // Update our booking_product to have size M explicitly
    await pool.query('UPDATE booking_products SET size = $1 WHERE id = $2', ['M', testBPId]);

    // This should succeed — size M should NOT conflict with size L
    await expect(
      bookingService.updateBooking(testBookingId, {
        products: [{
          id: testBPId,
          booked_from: '2024-09-03',
          booked_to: '2024-09-07',
        }],
      })
    ).resolves.not.toThrow();

    // Verify dates were actually updated
    const updated = await pool.query(
      'SELECT booked_from, booked_to FROM booking_products WHERE id = $1',
      [testBPId]
    );
    expect(updated.rows[0].booked_from.toISOString().slice(0, 10)).toBe('2024-09-03');
    expect(updated.rows[0].booked_to.toISOString().slice(0, 10)).toBe('2024-09-07');
  });

  test('date change SHOULD conflict with the SAME size of the same product', async () => {
    // Setup: create a second booking with the SAME product AND same size M, overlapping dates
    const otherBooking = await pool.query(
      `INSERT INTO bookings (user_id, booking_date, status, created_by, booked_from, booked_to)
       VALUES (1, CURRENT_DATE, 'confirmed', 'test', '2024-09-03', '2024-09-07')
       RETURNING id`
    );
    const otherBookingId = otherBooking.rows[0].id;

    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, size, rent, security_deposit, effective_rent)
       VALUES ($1, $2, 1, '2024-09-03', '2024-09-07', 'confirmed', 'M', 2000, 1000, 2000)`,
      [otherBookingId, testProductId]
    );

    // Update our booking_product to have size M
    await pool.query('UPDATE booking_products SET size = $1 WHERE id = $2', ['M', testBPId]);

    // This should FAIL — same product, same size, overlapping dates
    await expect(
      bookingService.updateBooking(testBookingId, {
        products: [{
          id: testBPId,
          booked_from: '2024-09-03',
          booked_to: '2024-09-07',
        }],
      })
    ).rejects.toThrow(/not available/);
  });
});
