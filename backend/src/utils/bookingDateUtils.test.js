const pool = require('../database/connection');
const { recalcBookingDateRange, checkProductAvailability } = require('./bookingDateUtils');

// Shared cleanup helper — deletes all bookings linked to a given product
async function cleanupBookingsForProduct(productId) {
  const result = await pool.query(
    `SELECT DISTINCT booking_id FROM booking_products WHERE product_id = $1`,
    [productId]
  );
  const ids = result.rows.map(r => r.booking_id);
  if (ids.length > 0) {
    await pool.query('DELETE FROM booking_activity_log WHERE booking_id = ANY($1)', [ids]);
    await pool.query(
      `DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = ANY($1))`,
      [ids]
    );
    await pool.query('DELETE FROM booking_products WHERE booking_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM bookings WHERE id = ANY($1)', [ids]);
  }
}

describe('recalcBookingDateRange', () => {
  let testProductId;
  let testBookingId;

  beforeAll(async () => {
    const product = await pool.query(
      `INSERT INTO products (name, code, category, size, rent, security_deposit)
       VALUES ('Date Util Test Product', 'DUTIL001', 'Test', 'M', 1000, 500)
       RETURNING id`
    );
    testProductId = product.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM products WHERE code LIKE 'DUTIL%'`);
  });

  beforeEach(async () => {
    await cleanupBookingsForProduct(testProductId);

    const booking = await pool.query(
      `INSERT INTO bookings (customer_name, customer_phone, booking_date, status, created_by,
                             booked_from, booked_to)
       VALUES ('Util Test', '0000000001', CURRENT_DATE, 'confirmed', 'test',
               '2024-01-01', '2024-01-31')
       RETURNING id`
    );
    testBookingId = booking.rows[0].id;
  });

  test('sets booking booked_from/booked_to to MIN/MAX of active products', async () => {
    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES
         ($1, $2, 1, '2024-09-05', '2024-09-10', 'confirmed', 1000, 500, 1000),
         ($1, $2, 1, '2024-09-12', '2024-09-20', 'confirmed', 1000, 500, 1000)`,
      [testBookingId, testProductId]
    );

    await recalcBookingDateRange(testBookingId);

    const row = (await pool.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId])).rows[0];
    expect(row.booked_from.toISOString().slice(0, 10)).toBe('2024-09-05');
    expect(row.booked_to.toISOString().slice(0, 10)).toBe('2024-09-20');
  });

  test('excludes cancelled products from the date calculation', async () => {
    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES
         ($1, $2, 1, '2024-09-10', '2024-09-15', 'confirmed', 1000, 500, 1000),
         ($1, $2, 1, '2024-09-01', '2024-09-30', 'cancelled',  1000, 500, 1000)`,
      [testBookingId, testProductId]
    );

    await recalcBookingDateRange(testBookingId);

    const row = (await pool.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId])).rows[0];
    expect(row.booked_from.toISOString().slice(0, 10)).toBe('2024-09-10');
    expect(row.booked_to.toISOString().slice(0, 10)).toBe('2024-09-15');
  });

  test('excludes exchanged products from the date calculation', async () => {
    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES
         ($1, $2, 1, '2024-09-10', '2024-09-15', 'confirmed', 1000, 500, 1000),
         ($1, $2, 1, '2024-09-01', '2024-09-30', 'exchanged',  1000, 500, 1000)`,
      [testBookingId, testProductId]
    );

    await recalcBookingDateRange(testBookingId);

    const row = (await pool.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId])).rows[0];
    expect(row.booked_from.toISOString().slice(0, 10)).toBe('2024-09-10');
    expect(row.booked_to.toISOString().slice(0, 10)).toBe('2024-09-15');
  });

  test('leaves booking dates unchanged when all products are cancelled/exchanged', async () => {
    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES ($1, $2, 1, '2024-09-01', '2024-09-10', 'cancelled', 1000, 500, 1000)`,
      [testBookingId, testProductId]
    );
    await pool.query(
      `UPDATE bookings SET booked_from = '2024-08-01', booked_to = '2024-08-31' WHERE id = $1`,
      [testBookingId]
    );

    await recalcBookingDateRange(testBookingId);

    const row = (await pool.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId])).rows[0];
    expect(row.booked_from.toISOString().slice(0, 10)).toBe('2024-08-01');
    expect(row.booked_to.toISOString().slice(0, 10)).toBe('2024-08-31');
  });

  test('commits correctly when called inside a transaction', async () => {
    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES ($1, $2, 1, '2024-10-01', '2024-10-07', 'confirmed', 1000, 500, 1000)`,
      [testBookingId, testProductId]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recalcBookingDateRange(testBookingId, client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const row = (await pool.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId])).rows[0];
    expect(row.booked_from.toISOString().slice(0, 10)).toBe('2024-10-01');
    expect(row.booked_to.toISOString().slice(0, 10)).toBe('2024-10-07');
  });

  test('rolls back when the wrapping transaction is rolled back', async () => {
    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES ($1, $2, 1, '2024-11-01', '2024-11-10', 'confirmed', 1000, 500, 1000)`,
      [testBookingId, testProductId]
    );
    await pool.query(
      `UPDATE bookings SET booked_from = '2024-08-01', booked_to = '2024-08-31' WHERE id = $1`,
      [testBookingId]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recalcBookingDateRange(testBookingId, client);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const row = (await pool.query('SELECT booked_from, booked_to FROM bookings WHERE id = $1', [testBookingId])).rows[0];
    expect(row.booked_from.toISOString().slice(0, 10)).toBe('2024-08-01');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('checkProductAvailability', () => {
  let testProductId;
  let existingBookingId;

  beforeAll(async () => {
    const product = await pool.query(
      `INSERT INTO products (name, code, category, size, rent, security_deposit)
       VALUES ('Availability Test Product', 'DUTIL002', 'Test', 'M', 1000, 500)
       RETURNING id`
    );
    testProductId = product.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM products WHERE code LIKE 'DUTIL%'`);
  });

  beforeEach(async () => {
    await cleanupBookingsForProduct(testProductId);

    // Seed one confirmed booking that blocks 2024-09-10 → 2024-09-20
    const booking = await pool.query(
      `INSERT INTO bookings (customer_name, customer_phone, booking_date, status, created_by)
       VALUES ('Blocking Customer', '0000000002', CURRENT_DATE, 'confirmed', 'test')
       RETURNING id`
    );
    existingBookingId = booking.rows[0].id;

    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES ($1, $2, 1, '2024-09-10', '2024-09-20', 'confirmed', 1000, 500, 1000)`,
      [existingBookingId, testProductId]
    );
  });

  // A completely free range — must not throw
  test('resolves silently when the date range is fully free', async () => {
    await expect(
      checkProductAvailability(testProductId, '2024-09-21', '2024-09-25')
    ).resolves.toBeUndefined();
  });

  // Full overlap
  test('throws when the requested range is fully inside an existing booking', async () => {
    await expect(
      checkProductAvailability(testProductId, '2024-09-12', '2024-09-15')
    ).rejects.toThrow(/not available/);
  });

  // Starts before existing, ends inside
  test('throws when the new range starts before and ends inside an existing booking', async () => {
    await expect(
      checkProductAvailability(testProductId, '2024-09-05', '2024-09-12')
    ).rejects.toThrow(/not available/);
  });

  // Starts inside, ends after existing
  test('throws when the new range starts inside and ends after an existing booking', async () => {
    await expect(
      checkProductAvailability(testProductId, '2024-09-18', '2024-09-25')
    ).rejects.toThrow(/not available/);
  });

  // Single-day touch on the start boundary is a conflict (inclusive)
  test('throws when the new range ends exactly on the start day of an existing booking', async () => {
    await expect(
      checkProductAvailability(testProductId, '2024-09-08', '2024-09-10')
    ).rejects.toThrow(/not available/);
  });

  // excludeBookingId: the booking being edited must not block itself
  test('resolves when the only conflict is the excluded booking (self-edit)', async () => {
    await expect(
      checkProductAvailability(testProductId, '2024-09-10', '2024-09-20', {
        excludeBookingId: existingBookingId,
      })
    ).resolves.toBeUndefined();
  });

  // excludeBookingId does NOT suppress conflicts from OTHER bookings
  test('still throws when a different booking conflicts even with excludeBookingId set', async () => {
    const other = await pool.query(
      `INSERT INTO bookings (customer_name, customer_phone, booking_date, status, created_by)
       VALUES ('Other Blocker', '0000000003', CURRENT_DATE, 'confirmed', 'test')
       RETURNING id`
    );
    await pool.query(
      `INSERT INTO booking_products
         (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES ($1, $2, 1, '2024-09-15', '2024-09-25', 'confirmed', 1000, 500, 1000)`,
      [other.rows[0].id, testProductId]
    );

    await expect(
      checkProductAvailability(testProductId, '2024-09-15', '2024-09-25', {
        excludeBookingId: existingBookingId,
      })
    ).rejects.toThrow(/not available/);
  });

  // A cancelled product must not block
  test('resolves when the only conflicting product is cancelled', async () => {
    await pool.query(
      `UPDATE booking_products SET status = 'cancelled'
       WHERE booking_id = $1 AND product_id = $2`,
      [existingBookingId, testProductId]
    );

    await expect(
      checkProductAvailability(testProductId, '2024-09-10', '2024-09-20')
    ).resolves.toBeUndefined();
  });

  // A cancelled booking must not block
  test('resolves when the conflicting booking itself is cancelled', async () => {
    await pool.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
      [existingBookingId]
    );

    await expect(
      checkProductAvailability(testProductId, '2024-09-10', '2024-09-20')
    ).resolves.toBeUndefined();
  });
});
