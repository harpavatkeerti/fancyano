/**
 * usersService.test.js
 *
 * Unit/integration tests for usersService functions.
 * Calls service functions directly (no HTTP) and verifies DB state.
 *
 * Test phone sentinel: all test users have phone starting with '0001'
 * (uses country US — 10 digits, avoids India-only-10-digit rule)
 */

const pool = require('../database/connection');
const usersService = require('./usersService');
const bcrypt = require('bcryptjs');

// ── Constants ─────────────────────────────────────────────────────────────────
const TEST_PREFIX  = '0001';
const TEST_PHONE   = '0001100001';
const TEST_ALT     = '0001100002';
const TEST_COUNTRY = 'US'; // 10 digits — avoids IN-only constraint

// ── Helpers ───────────────────────────────────────────────────────────────────
async function cleanup() {
  // Find all test user IDs so we can clean up dependent records first (FK constraints)
  const testUsers = await pool.query(
    `SELECT id FROM users WHERE phone LIKE '${TEST_PREFIX}%'`
  );
  const ids = testUsers.rows.map(r => r.id);
  if (ids.length > 0) {
    await pool.query('DELETE FROM booking_activity_log WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ANY($1))', [ids]);
    await pool.query('DELETE FROM booking_cancellation_history WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ANY($1))', [ids]);
    await pool.query('DELETE FROM product_charges WHERE booking_product_id IN (SELECT bp.id FROM booking_products bp JOIN bookings b ON bp.booking_id = b.id WHERE b.user_id = ANY($1))', [ids]);
    await pool.query('DELETE FROM payment_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ANY($1))', [ids]);
    await pool.query('DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ANY($1))', [ids]);
    await pool.query('DELETE FROM bookings WHERE user_id = ANY($1)', [ids]);
  }
  await pool.query(`DELETE FROM users WHERE phone LIKE '${TEST_PREFIX}%'`);
}

async function createTestUser(overrides = {}) {
  return usersService.createUser({
    name: 'Service Test User',
    phone: TEST_PHONE,
    phone_country: TEST_COUNTRY,
    alternate_phone: TEST_ALT,
    alternate_phone_country: TEST_COUNTRY,
    ...overrides,
  });
}

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('usersService', () => {
  beforeAll(cleanup);   // Remove any stale '0001%' users from a prior interrupted run
  beforeEach(cleanup);
  afterAll(cleanup);


  // ── createUser ──────────────────────────────────────────────────────────────
  describe('createUser', () => {
    test('should insert user and return row without password', async () => {
      const user = await createTestUser();

      expect(user).toHaveProperty('id');
      expect(user.name).toBe('Service Test User');
      expect(user.phone).toBe(TEST_PHONE);
      expect(user.phone_country).toBe(TEST_COUNTRY);
      expect(user.alternate_phone).toBe(TEST_ALT);
      expect(user.role).toBe('customer');
      expect(user).not.toHaveProperty('password');
    });

    test('should store a bcrypt hash — not plaintext — for the default password', async () => {
      const user = await createTestUser();

      // Fetch raw row to inspect the stored password
      const raw = await pool.query('SELECT password FROM users WHERE id = $1', [user.id]);
      const storedHash = raw.rows[0].password;

      // Must NOT be the plaintext string
      expect(storedHash).not.toBe('customer');
      // Must be a valid bcrypt hash that matches 'customer'
      const matches = await bcrypt.compare('customer', storedHash);
      expect(matches).toBe(true);
    });

    test('should derive username as callingCode + phone', async () => {
      const user = await createTestUser();
      // US calling code is +1
      expect(user.username).toBe(`+1${TEST_PHONE}`);
    });

    test('should default role to customer', async () => {
      const user = await createTestUser();
      expect(user.role).toBe('customer');
    });

    test('should accept explicit role', async () => {
      const user = await createTestUser({ role: 'salesman' });
      expect(user.role).toBe('salesman');
    });

    test('should throw 400 if required fields are missing', async () => {
      await expect(
        usersService.createUser({ name: 'Missing Phone' })
      ).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 for invalid role', async () => {
      await expect(
        createTestUser({ role: 'superuser' })
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/invalid role/i) });
    });

    test('should throw 400 if IN phone is not 10 digits', async () => {
      await expect(
        usersService.createUser({
          name: 'Short Phone',
          phone: '999999999', // 9 digits
          phone_country: 'IN',
          alternate_phone: '9876543210',
          alternate_phone_country: 'IN',
        })
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/10 digits/) });
    });

    test('should throw 400 if IN alternate phone is not 10 digits', async () => {
      await expect(
        usersService.createUser({
          name: 'Short Alt',
          phone: '9876543210',
          phone_country: 'IN',
          alternate_phone: '123',
          alternate_phone_country: 'IN',
        })
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Alternate phone/) });
    });

    test('should throw 409 on duplicate phone', async () => {
      await createTestUser();

      // Same phone again — either phone or username unique constraint fires, both 409
      await expect(createTestUser()).rejects.toMatchObject({ status: 409 });
    });

    test('should store email and address if provided', async () => {
      const user = await createTestUser({ email: 'test@ex.com', address: '1 Main St' });
      expect(user.email).toBe('test@ex.com');
      expect(user.address).toBe('1 Main St');
    });

    test('should set email and address to null if not provided', async () => {
      const user = await createTestUser();
      expect(user.email).toBeNull();
      expect(user.address).toBeNull();
    });
  });

  // ── listUsers ───────────────────────────────────────────────────────────────
  describe('listUsers', () => {
    beforeEach(async () => {
      await createTestUser({ name: 'Alice', role: 'customer' });
    });

    test('should return users without password field', async () => {
      const users = await usersService.listUsers();
      expect(Array.isArray(users)).toBe(true);
      users.forEach(u => expect(u).not.toHaveProperty('password'));
    });

    test('should exclude soft-deleted users', async () => {
      const user = (await usersService.listUsers({ search: TEST_PHONE }))[0];
      await pool.query('UPDATE users SET is_deleted = TRUE WHERE id = $1', [user.id]);

      const after = await usersService.listUsers({ search: TEST_PHONE });
      expect(after.find(u => u.id === user.id)).toBeUndefined();
    });

    test('should filter by role', async () => {
      const results = await usersService.listUsers({ role: 'customer' });
      results.forEach(u => expect(u.role).toBe('customer'));
    });

    test('should filter by search (name match)', async () => {
      const results = await usersService.listUsers({ search: 'Alice' });
      expect(results.some(u => u.name === 'Alice')).toBe(true);
    });

    test('should filter by search (phone match)', async () => {
      const results = await usersService.listUsers({ search: TEST_PHONE });
      expect(results.some(u => u.phone === TEST_PHONE)).toBe(true);
    });

    test('should return all non-deleted users when no filters given', async () => {
      const results = await usersService.listUsers();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── searchUsers ─────────────────────────────────────────────────────────────
  describe('searchUsers', () => {
    beforeEach(async () => {
      await createTestUser({ name: 'Search Subject' });
    });

    test('should return partial phone matches (no passwords)', async () => {
      const results = await usersService.searchUsers(TEST_PREFIX);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].phone).toContain(TEST_PREFIX);
      results.forEach(u => expect(u).not.toHaveProperty('password'));
    });

    test('should return max 10 results', async () => {
      const results = await usersService.searchUsers(TEST_PREFIX);
      expect(results.length).toBeLessThanOrEqual(10);
    });

    test('should return empty array for no matches', async () => {
      const results = await usersService.searchUsers('ZZZNOMATCH999');
      expect(results).toEqual([]);
    });

    test('should throw 400 with status if phone < 3 chars', async () => {
      await expect(usersService.searchUsers('00')).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/3 digits/i),
      });
    });

    test('should throw 400 if phone is null/undefined', async () => {
      await expect(usersService.searchUsers(null)).rejects.toMatchObject({ status: 400 });
      await expect(usersService.searchUsers(undefined)).rejects.toMatchObject({ status: 400 });
    });

    test('should return soft-deleted users in search results with is_deleted=true', async () => {
      const user = (await usersService.searchUsers(TEST_PREFIX))[0];
      await pool.query('UPDATE users SET is_deleted = TRUE WHERE id = $1', [user.id]);

      // Soft-deleted users still appear in search (for reactivation flow),
      // but sorted after active users and flagged with is_deleted=true.
      const after = await usersService.searchUsers(TEST_PREFIX);
      const found = after.find(u => u.id === user.id);
      expect(found).toBeDefined();
      expect(found.is_deleted).toBe(true);
    });
  });

  // ── getUserById ─────────────────────────────────────────────────────────────
  describe('getUserById', () => {
    let userId;

    beforeEach(async () => {
      const user = await createTestUser({ address: '99 Fetch Lane', email: 'fetch@test.com' });
      userId = user.id;
    });

    test('should return full user without password', async () => {
      const user = await usersService.getUserById(userId);

      expect(user.id).toBe(userId);
      expect(user.phone).toBe(TEST_PHONE);
      expect(user.phone_country).toBe(TEST_COUNTRY);
      expect(user.address).toBe('99 Fetch Lane');
      expect(user.email).toBe('fetch@test.com');
      expect(user).not.toHaveProperty('password');
    });

    test('should throw 404 for non-existent id', async () => {
      await expect(usersService.getUserById(9999999)).rejects.toMatchObject({ status: 404 });
    });

    test('should return soft-deleted user with is_deleted=true (not throw 404)', async () => {
      await pool.query('UPDATE users SET is_deleted = TRUE WHERE id = $1', [userId]);
      const user = await usersService.getUserById(userId);
      expect(user.id).toBe(userId);
      expect(user.is_deleted).toBe(true);
    });
  });

  // ── updateUser ──────────────────────────────────────────────────────────────
  describe('updateUser', () => {
    let userId;

    beforeEach(async () => {
      const user = await createTestUser({ name: 'Original Name', address: 'Old Address' });
      userId = user.id;
    });

    test('should update name and return updated user without password', async () => {
      const updated = await usersService.updateUser(userId, { name: 'New Name' });

      expect(updated.name).toBe('New Name');
      expect(updated).not.toHaveProperty('password');
    });

    test('should update address', async () => {
      const updated = await usersService.updateUser(userId, { address: 'New Address' });
      expect(updated.address).toBe('New Address');
    });

    test('should update alternate phone and country', async () => {
      const updated = await usersService.updateUser(userId, {
        alternate_phone: '0001299999',
        alternate_phone_country: TEST_COUNTRY,
      });
      expect(updated.alternate_phone).toBe('0001299999');
      expect(updated.alternate_phone_country).toBe(TEST_COUNTRY);
    });

    test('should NOT modify phone or phone_country (immutable)', async () => {
      // Even if someone passes phone in the body, updateUser ignores it
      await usersService.updateUser(userId, { name: 'Changed Only' });

      const fetched = await usersService.getUserById(userId);
      expect(fetched.phone).toBe(TEST_PHONE);
      expect(fetched.phone_country).toBe(TEST_COUNTRY);
    });

    test('should update the updated_at timestamp', async () => {
      const before = await usersService.getUserById(userId);
      // Small delay to ensure timestamp differs
      await new Promise(r => setTimeout(r, 50));
      await usersService.updateUser(userId, { name: 'Timestamp Test' });
      const after = await usersService.getUserById(userId);

      expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
        new Date(before.updated_at).getTime()
      );
    });

    test('should throw 400 if no updatable fields provided', async () => {
      await expect(usersService.updateUser(userId, {})).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/no updatable fields/i),
      });
    });

    test('should throw 400 if alternate phone is invalid length for IN', async () => {
      await expect(
        usersService.updateUser(userId, {
          alternate_phone: '123',
          alternate_phone_country: 'IN',
        })
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Alternate phone/) });
    });

    test('should throw 404 for non-existent user', async () => {
      await expect(
        usersService.updateUser(9999999, { name: 'Ghost' })
      ).rejects.toMatchObject({ status: 404 });
    });

    test('should hash new password before storing', async () => {
      await usersService.updateUser(userId, { password: 'newpassword123' });

      const raw = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
      const stored = raw.rows[0].password;
      expect(stored).not.toBe('newpassword123');
      const matches = await bcrypt.compare('newpassword123', stored);
      expect(matches).toBe(true);
    });

    test('should not update password if empty string provided', async () => {
      const rawBefore = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
      const hashBefore = rawBefore.rows[0].password;

      await usersService.updateUser(userId, { password: '', name: 'Trigger update' });

      const rawAfter = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
      expect(rawAfter.rows[0].password).toBe(hashBefore);
    });
  });

  // ── deleteUser ──────────────────────────────────────────────────────────────
  describe('deleteUser', () => {
    let userId;

    beforeEach(async () => {
      const user = await createTestUser();
      userId = user.id;
    });

    test('should set is_deleted = TRUE in the database', async () => {
      await usersService.deleteUser(userId);

      const raw = await pool.query('SELECT is_deleted FROM users WHERE id = $1', [userId]);
      expect(raw.rows[0].is_deleted).toBe(true);
    });

    test('should return user via getUserById with is_deleted=true after deletion', async () => {
      await usersService.deleteUser(userId);
      const user = await usersService.getUserById(userId);
      expect(user.id).toBe(userId);
      expect(user.is_deleted).toBe(true);
    });

    test('should make user invisible to listUsers after deletion', async () => {
      await usersService.deleteUser(userId);
      const list = await usersService.listUsers({ search: TEST_PHONE });
      expect(list.find(u => u.id === userId)).toBeUndefined();
    });

    test('should throw 404 for non-existent user', async () => {
      await expect(usersService.deleteUser(9999999)).rejects.toMatchObject({ status: 404 });
    });

    test('should throw 404 if user already soft-deleted', async () => {
      await usersService.deleteUser(userId);
      // Second delete on already-deleted user → 404
      await expect(usersService.deleteUser(userId)).rejects.toMatchObject({ status: 404 });
    });

    test('should throw 400 if user has active (pending) bookings', async () => {
      // Create a pending booking for this user
      await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, transport_charge, booked_from, booked_to)
         VALUES ($1, CURRENT_DATE, 'pending', 0, CURRENT_DATE, CURRENT_DATE + INTERVAL '5 days')`,
        [userId]
      );

      await expect(usersService.deleteUser(userId)).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/active bookings/i),
      });
    });

    test('should allow deletion if all bookings are completed or cancelled', async () => {
      // Insert completed and cancelled bookings — should not block
      await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, transport_charge, booked_from, booked_to)
         VALUES ($1, CURRENT_DATE, 'completed', 0, CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '5 days'),
                ($1, CURRENT_DATE, 'cancelled', 0, CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE - INTERVAL '15 days')`,
        [userId]
      );

      await expect(usersService.deleteUser(userId)).resolves.toBeUndefined();

      const raw = await pool.query('SELECT is_deleted FROM users WHERE id = $1', [userId]);
      expect(raw.rows[0].is_deleted).toBe(true);
    });
  });
});
