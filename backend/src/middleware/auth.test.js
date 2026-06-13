const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyToken, generateToken, JWT_SECRET } = require('./auth');
const requireRole = require('./requireRole');

// --- Test app setup ---
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Public route (no auth)
  app.get('/public', (req, res) => res.json({ message: 'public' }));

  // Authenticated route (any role)
  app.get('/protected', verifyToken, (req, res) => res.json({ user: req.user }));

  // Admin-only route
  app.get('/admin-only', verifyToken, requireRole('admin'), (req, res) => {
    res.json({ message: 'admin access granted', user: req.user });
  });

  // Multi-role route
  app.get('/admin-or-salesman', verifyToken, requireRole('admin', 'salesman'), (req, res) => {
    res.json({ message: 'access granted', user: req.user });
  });

  return app;
}

describe('Auth Middleware', () => {
  const app = createTestApp();

  // Helper: generate a valid token for testing
  function makeToken(overrides = {}, options = {}) {
    const payload = {
      userId: 1,
      role: 'admin',
      name: 'Test Admin',
      ...overrides
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', ...options });
  }

  describe('verifyToken', () => {
    it('should return 401 when no Authorization header is provided', async () => {
      const response = await request(app).get('/protected');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('No token provided');
    });

    it('should return 401 when Authorization header has wrong format', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'InvalidFormat');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid token format');
    });

    it('should return 401 when Authorization header has wrong scheme', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Basic sometoken');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid token format');
    });

    it('should return 401 when token is invalid/tampered', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid token');
    });

    it('should return 401 when token is expired', async () => {
      // Create a token that expired 1 hour ago
      const expiredToken = jwt.sign(
        { userId: 1, role: 'admin', name: 'Test' },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('expired');
    });

    it('should return 401 when token is signed with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        { userId: 1, role: 'admin', name: 'Test' },
        'wrong-secret',
        { expiresIn: '1h' }
      );
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${wrongSecretToken}`);
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid token');
    });

    it('should pass and attach req.user when token is valid', async () => {
      const token = makeToken({ userId: 42, role: 'salesman', name: 'John' });
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.user).toEqual({
        userId: 42,
        role: 'salesman',
        name: 'John'
      });
    });

    it('should not require auth on public routes', async () => {
      const response = await request(app).get('/public');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('public');
    });
  });

  describe('requireRole', () => {
    it('should return 401 when no user is attached (middleware used without verifyToken)', async () => {
      // Create a separate app where requireRole is used without verifyToken
      const badApp = express();
      badApp.get('/test', requireRole('admin'), (req, res) => res.json({ ok: true }));
      const response = await request(badApp).get('/test');
      expect(response.status).toBe(401);
    });

    it('should return 403 when user role does not match required role', async () => {
      const salesmanToken = makeToken({ role: 'salesman' });
      const response = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${salesmanToken}`);
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Insufficient permissions');
      expect(response.body.required).toEqual(['admin']);
      expect(response.body.current).toBe('salesman');
    });

    it('should return 403 when customer tries admin route', async () => {
      const customerToken = makeToken({ role: 'customer' });
      const response = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(response.status).toBe(403);
    });

    it('should pass when user has the required role', async () => {
      const adminToken = makeToken({ role: 'admin' });
      const response = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('admin access granted');
    });

    it('should pass when user has one of multiple allowed roles (admin)', async () => {
      const adminToken = makeToken({ role: 'admin' });
      const response = await request(app)
        .get('/admin-or-salesman')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
    });

    it('should pass when user has one of multiple allowed roles (salesman)', async () => {
      const salesmanToken = makeToken({ role: 'salesman' });
      const response = await request(app)
        .get('/admin-or-salesman')
        .set('Authorization', `Bearer ${salesmanToken}`);
      expect(response.status).toBe(200);
    });

    it('should return 403 when user has none of multiple allowed roles', async () => {
      const customerToken = makeToken({ role: 'customer' });
      const response = await request(app)
        .get('/admin-or-salesman')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(response.status).toBe(403);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const user = { id: 1, role: 'admin', name: 'Test Admin' };
      const { token, expiresAt } = generateToken(user);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(expiresAt).toBeGreaterThan(Date.now());

      // Verify the token can be decoded
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.userId).toBe(1);
      expect(decoded.role).toBe('admin');
      expect(decoded.name).toBe('Test Admin');
    });

    it('should set expiry to ~24 hours from now', () => {
      const user = { id: 1, role: 'admin', name: 'Test' };
      const { expiresAt } = generateToken(user);

      const expectedExpiry = Date.now() + (24 * 60 * 60 * 1000);
      // Allow 5 seconds tolerance
      expect(expiresAt).toBeGreaterThan(expectedExpiry - 5000);
      expect(expiresAt).toBeLessThan(expectedExpiry + 5000);
    });
  });
});
