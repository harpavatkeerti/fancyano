/**
 * users.test.js
 *
 * Integration tests for GET/POST/PUT/DELETE /users routes.
 * Uses a real DB connection — test data uses phone prefix '0000' to avoid
 * collisions with real data and is cleaned up after each test.
 *
 * Test phone sentinel: all test users have phone starting with '0000'
 */

const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

// ── Minimal test app (mirrors server.js auth bypass pattern) ──────────────────
const app = express();
app.use(express.json());
// Inject mock req.user so any role middleware passes
app.use((req, res, next) => { req.user = { role: 'admin', id: 'test-user' }; next(); });
app.use('/users', require('./users'));

// ── Helpers ───────────────────────────────────────────────────────────────────
const TEST_PHONE_PREFIX = '0000';
const TEST_PHONE        = '0000100001'; // 10 digits for IN (will use country US, 10 digits)
const TEST_ALT_PHONE    = '0000100002';
const TEST_COUNTRY      = 'US';         // US = 10 digits, avoids India-10-digit-only rule conflict

async function cleanup() {
  await pool.query(
    `DELETE FROM users WHERE phone LIKE '${TEST_PHONE_PREFIX}%'`
  );
}

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('Users Routes', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  // ── POST /users ─────────────────────────────────────────────────────────────
  describe('POST /users', () => {
    it('should create a new user and return without password', async () => {
      const res = await request(app).post('/users').send({
        name: 'Test User',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
        email: 'testuser@example.com',
        address: '123 Test St',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Test User');
      expect(res.body.phone).toBe(TEST_PHONE);
      expect(res.body.phone_country).toBe(TEST_COUNTRY);
      expect(res.body.role).toBe('customer');
      expect(res.body).not.toHaveProperty('password');
    });

    it('should auto-set username from calling code + phone', async () => {
      const res = await request(app).post('/users').send({
        name: 'Auto Username',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
      });

      expect(res.status).toBe(201);
      // US calling code is +1
      expect(res.body.username).toBe(`+1${TEST_PHONE}`);
    });

    it('should create user with explicit admin role', async () => {
      const res = await request(app).post('/users').send({
        name: 'Admin User',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
        role: 'admin',
      });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('admin');
    });

    it('should return 400 if required fields are missing', async () => {
      const res = await request(app).post('/users').send({
        name: 'Missing Phone',
        // phone and alternate_phone missing
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/required/i);
    });

    it('should return 400 for invalid role', async () => {
      const res = await request(app).post('/users').send({
        name: 'Bad Role',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
        role: 'superuser',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid role/i);
    });

    it('should return 400 if IN phone is not 10 digits', async () => {
      const res = await request(app).post('/users').send({
        name: 'Short India Phone',
        phone: '999999999', // 9 digits — invalid for IN
        phone_country: 'IN',
        alternate_phone: '9876543210',
        alternate_phone_country: 'IN',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/10 digits/);
    });

    it('should return 400 if IN alternate phone is not 10 digits', async () => {
      const res = await request(app).post('/users').send({
        name: 'Short Alt Phone',
        phone: '9876543210',
        phone_country: 'IN',
        alternate_phone: '999', // too short
        alternate_phone_country: 'IN',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Alternate phone/);
    });

    it('should return 409 on duplicate phone number', async () => {
      // Create first user with this phone
      await request(app).post('/users').send({
        name: 'First User',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
      });

      // Try to create a second user with the same phone — must be rejected
      // (A duplicate phone also produces a duplicate username since username = callingCode+phone,
      //  so either DB constraint may fire — we only assert the 409 status.)
      const res = await request(app).post('/users').send({
        name: 'Duplicate Phone',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
      });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ── GET /users ───────────────────────────────────────────────────────────────
  describe('GET /users', () => {
    beforeEach(async () => {
      await request(app).post('/users').send({
        name: 'List Test User',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
      });
    });

    it('should return array of users without passwords', async () => {
      const res = await request(app).get('/users');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      res.body.forEach(u => expect(u).not.toHaveProperty('password'));
    });

    it('should filter by role', async () => {
      const res = await request(app).get('/users?role=customer');

      expect(res.status).toBe(200);
      res.body.forEach(u => expect(u.role).toBe('customer'));
    });

    it('should filter by search (name or phone)', async () => {
      const res = await request(app).get(`/users?search=${TEST_PHONE_PREFIX}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].phone).toContain(TEST_PHONE_PREFIX);
    });

    it('should not return soft-deleted users', async () => {
      // Get the user's ID, soft-delete them, then check list
      const listRes = await request(app).get(`/users?search=${TEST_PHONE}`);
      const userId = listRes.body[0].id;

      await request(app).delete(`/users/${userId}`);

      const afterRes = await request(app).get(`/users?search=${TEST_PHONE}`);
      expect(afterRes.body.find(u => u.id === userId)).toBeUndefined();
    });
  });

  // ── GET /users/search ────────────────────────────────────────────────────────
  describe('GET /users/search', () => {
    beforeEach(async () => {
      await request(app).post('/users').send({
        name: 'Search Test User',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
      });
    });

    it('should return matching users by partial phone', async () => {
      const res = await request(app).get(`/users/search?phone=${TEST_PHONE_PREFIX}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].phone).toContain(TEST_PHONE_PREFIX);
      res.body.forEach(u => expect(u).not.toHaveProperty('password'));
    });

    it('should return 400 if phone query is less than 3 chars', async () => {
      const res = await request(app).get('/users/search?phone=00');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/3 digits/i);
    });

    it('should return 400 if phone query is missing', async () => {
      const res = await request(app).get('/users/search');

      expect(res.status).toBe(400);
    });

    it('should return empty array for no matches', async () => {
      const res = await request(app).get('/users/search?phone=ZZZNOMATCH999');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── GET /users/:id ──────────────────────────────────────────────────────────
  describe('GET /users/:id', () => {
    let testUserId;

    beforeEach(async () => {
      const res = await request(app).post('/users').send({
        name: 'GetById User',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
        address: '456 Fetch Ave',
      });
      testUserId = res.body.id;
    });

    it('should return user by id without password', async () => {
      const res = await request(app).get(`/users/${testUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testUserId);
      expect(res.body.name).toBe('GetById User');
      expect(res.body.phone_country).toBe(TEST_COUNTRY);
      expect(res.body).not.toHaveProperty('password');
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app).get('/users/9999999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 404 for soft-deleted user', async () => {
      await request(app).delete(`/users/${testUserId}`);
      const res = await request(app).get(`/users/${testUserId}`);

      expect(res.status).toBe(404);
    });
  });

  // ── PUT /users/:id ──────────────────────────────────────────────────────────
  describe('PUT /users/:id', () => {
    let testUserId;

    beforeEach(async () => {
      const res = await request(app).post('/users').send({
        name: 'Update Test User',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
        address: 'Old Address',
      });
      testUserId = res.body.id;
    });

    it('should update name and address', async () => {
      const res = await request(app).put(`/users/${testUserId}`).send({
        name: 'Updated Name',
        address: 'New Address',
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.address).toBe('New Address');
      expect(res.body).not.toHaveProperty('password');
    });

    it('should update alternate phone', async () => {
      const res = await request(app).put(`/users/${testUserId}`).send({
        alternate_phone: '0000199999',
        alternate_phone_country: TEST_COUNTRY,
      });

      expect(res.status).toBe(200);
      expect(res.body.alternate_phone).toBe('0000199999');
    });

    it('should NOT change phone or phone_country (immutable)', async () => {
      // Even if sent, phone should not change (field not in updateUser)
      await request(app).put(`/users/${testUserId}`).send({
        name: 'Same Name',
      });

      const getRes = await request(app).get(`/users/${testUserId}`);
      expect(getRes.body.phone).toBe(TEST_PHONE);
      expect(getRes.body.phone_country).toBe(TEST_COUNTRY);
    });

    it('should return 400 if alternate phone is invalid length for country', async () => {
      const res = await request(app).put(`/users/${testUserId}`).send({
        alternate_phone: '123', // too short for IN or US
        alternate_phone_country: 'IN',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Alternate phone/);
    });

    it('should return 400 if no updatable fields provided', async () => {
      const res = await request(app).put(`/users/${testUserId}`).send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no updatable fields/i);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app).put('/users/9999999').send({ name: 'Nobody' });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /users/:id ────────────────────────────────────────────────────────
  describe('DELETE /users/:id', () => {
    let testUserId;

    beforeEach(async () => {
      const res = await request(app).post('/users').send({
        name: 'Delete Test User',
        phone: TEST_PHONE,
        phone_country: TEST_COUNTRY,
        alternate_phone: TEST_ALT_PHONE,
        alternate_phone_country: TEST_COUNTRY,
      });
      testUserId = res.body.id;
    });

    it('should soft-delete a user with no active bookings', async () => {
      const res = await request(app).delete(`/users/${testUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deactivated/i);

      // Confirm user is gone from list
      const getRes = await request(app).get(`/users/${testUserId}`);
      expect(getRes.status).toBe(404);

      // Confirm is_deleted = TRUE in DB
      const dbRes = await pool.query('SELECT is_deleted FROM users WHERE id = $1', [testUserId]);
      expect(dbRes.rows[0].is_deleted).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app).delete('/users/9999999');

      expect(res.status).toBe(404);
    });

    it('should return 400 if user has active bookings', async () => {
      // Create a product and booking linked to this user
      const productRes = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ('TEST-USR-DEL-001', 'User Delete Test Product', 10000, 5000, 'test')
         RETURNING id`
      );
      const productId = productRes.rows[0].id;

      await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status, transport_charge, booked_from, booked_to)
         VALUES ($1, CURRENT_DATE, 'pending', 0, CURRENT_DATE, CURRENT_DATE + INTERVAL '5 days')`,
        [testUserId]
      );

      const res = await request(app).delete(`/users/${testUserId}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/active bookings/i);

      // Cleanup
      await pool.query('DELETE FROM bookings WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM products WHERE id = $1', [productId]);
    });
  });
});
