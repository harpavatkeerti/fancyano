const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/connection');
const { JWT_SECRET } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/auth', require('./auth'));

describe('Auth Routes', () => {
  const testUsername = 'auth_test_user_jest';
  const testPassword = 'testpassword123';
  let testUserId;

  beforeAll(async () => {
    // Clean up any existing test user
    await pool.query('DELETE FROM users WHERE username = $1', [testUsername]);

    // Create a test user with hashed password
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    const result = await pool.query(
      'INSERT INTO users (name, username, password, role, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['Auth Test User', testUsername, hashedPassword, 'salesman', '9999999999']
    );
    testUserId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE username = $1', [testUsername]);
  });

  describe('POST /auth/login', () => {
    it('should return 400 when neither username nor name is provided', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ password: 'test' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Username or name is required');
    });

    it('should return 400 when password is not provided', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ username: testUsername });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Password is required');
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ username: 'nonexistent_user_xyz', password: 'test' });
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should return 401 for wrong password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ username: testUsername, password: 'wrongpassword' });
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should return JWT token on successful login', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ username: testUsername, password: testPassword });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeTruthy();
      expect(typeof response.body.token).toBe('string');
      expect(response.body.expiresAt).toBeGreaterThan(Date.now());
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(testUserId);
      expect(response.body.user.username).toBe(testUsername);
      expect(response.body.user.role).toBe('salesman');
      // Password should NOT be in response
      expect(response.body.user.password).toBeUndefined();
    });

    it('should return a valid JWT that can be decoded', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ username: testUsername, password: testPassword });

      const decoded = jwt.verify(response.body.token, JWT_SECRET);
      expect(decoded.userId).toBe(testUserId);
      expect(decoded.role).toBe('salesman');
      expect(decoded.name).toBe('Auth Test User');
    });

    it('should also work with name field instead of username', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ name: 'Auth Test User', password: testPassword });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeTruthy();
    });
  });

  describe('POST /auth/verify', () => {
    let validToken;

    beforeAll(async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ username: testUsername, password: testPassword });
      validToken = response.body.token;
    });

    it('should return 401 when no token provided', async () => {
      const response = await request(app).post('/auth/verify');
      expect(response.status).toBe(401);
      expect(response.body.valid).toBe(false);
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .post('/auth/verify')
        .set('Authorization', 'Bearer invalidtoken');
      expect(response.status).toBe(401);
      expect(response.body.valid).toBe(false);
    });

    it('should return 401 for expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: testUserId, role: 'salesman', name: 'Test' },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );
      const response = await request(app)
        .post('/auth/verify')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(response.status).toBe(401);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('expired');
    });

    it('should return valid=true for a valid token', async () => {
      const response = await request(app)
        .post('/auth/verify')
        .set('Authorization', `Bearer ${validToken}`);
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(testUserId);
      expect(response.body.user.role).toBe('salesman');
    });

    it('should return 401 if user was deleted after token was issued', async () => {
      // Create a temp user, get token, delete user, then verify
      const tempPassword = await bcrypt.hash('temp', 10);
      const tempResult = await pool.query(
        "INSERT INTO users (name, username, password, role, phone) VALUES ('Temp', 'temp_auth_jest', $1, 'customer', '8888888888') RETURNING id",
        [tempPassword]
      );
      const tempId = tempResult.rows[0].id;

      const loginRes = await request(app)
        .post('/auth/login')
        .send({ username: 'temp_auth_jest', password: 'temp' });
      const tempToken = loginRes.body.token;

      // Delete the user
      await pool.query('DELETE FROM users WHERE id = $1', [tempId]);

      // Verify should fail
      const verifyRes = await request(app)
        .post('/auth/verify')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(verifyRes.status).toBe(401);
      expect(verifyRes.body.valid).toBe(false);
      expect(verifyRes.body.error).toContain('User not found');
    });
  });
});
