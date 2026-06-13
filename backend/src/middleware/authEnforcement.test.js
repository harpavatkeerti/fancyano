/**
 * Auth Enforcement Tests
 * 
 * Tests that auth middleware is properly applied at the server level:
 * - Unauthenticated requests → 401
 * - Wrong role on restricted routes → 403
 * - Correct role → 200
 * - Public routes → accessible without auth
 * 
 * These tests wire up middleware the same way server.js does,
 * using the centralized routePermissions config.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const routePermissions = require('../middleware/routePermissions');

// Helper: generate JWT for a given role
function makeToken(role, overrides = {}) {
  return jwt.sign(
    { userId: 1, role, name: `Test ${role}`, ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Build a test app that mirrors server.js middleware structure
function createAuthTestApp() {
  const app = express();
  app.use(express.json());

  // Public routes (no auth)
  app.use('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', (req, res) => res.json({ public: true }));

  // JWT auth on all other /api/* routes
  app.use('/api', verifyToken);

  // Role-restricted routes from config
  for (const [path, roles] of Object.entries(routePermissions.routes)) {
    app.use(path, requireRole(...roles), (req, res) => {
      res.json({ access: 'granted', path, role: req.user.role });
    });
  }

  // Shared routes (any authenticated user)
  app.get('/api/bookings', (req, res) => {
    res.json({ access: 'granted', path: '/api/bookings', role: req.user.role });
  });
  app.get('/api/products', (req, res) => {
    res.json({ access: 'granted', path: '/api/products', role: req.user.role });
  });

  return app;
}

describe('Auth Enforcement (server-level middleware)', () => {
  const app = createAuthTestApp();

  // ── Public routes ──
  describe('Public routes (no auth required)', () => {
    it('GET /api/health should be accessible without token', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    });

    it('GET /api/auth should be accessible without token', async () => {
      const res = await request(app).get('/api/auth');
      expect(res.status).toBe(200);
    });
  });

  // ── Unauthenticated access ──
  describe('Unauthenticated access → 401', () => {
    it('GET /api/bookings without token → 401', async () => {
      const res = await request(app).get('/api/bookings');
      expect(res.status).toBe(401);
    });

    it('GET /api/products without token → 401', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(401);
    });

    it('GET /api/users without token → 401', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('GET /api/settings without token → 401', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(401);
    });
  });

  // ── Role-restricted routes (from routePermissions config) ──
  describe('Role-restricted routes', () => {
    const adminOnlyPaths = Object.entries(routePermissions.routes)
      .filter(([, roles]) => roles.includes('admin') && roles.length === 1)
      .map(([path]) => path);

    for (const path of adminOnlyPaths) {
      describe(`${path} (admin-only)`, () => {
        it(`salesman token → 403`, async () => {
          const token = makeToken('salesman');
          const res = await request(app)
            .get(path)
            .set('Authorization', `Bearer ${token}`);
          expect(res.status).toBe(403);
        });

        it(`customer token → 403`, async () => {
          const token = makeToken('customer');
          const res = await request(app)
            .get(path)
            .set('Authorization', `Bearer ${token}`);
          expect(res.status).toBe(403);
        });

        it(`admin token → 200`, async () => {
          const token = makeToken('admin');
          const res = await request(app)
            .get(path)
            .set('Authorization', `Bearer ${token}`);
          expect(res.status).toBe(200);
          expect(res.body.access).toBe('granted');
        });
      });
    }
  });

  // ── Shared routes (any authenticated user) ──
  describe('Shared routes (any authenticated role)', () => {
    const sharedPaths = ['/api/bookings', '/api/products'];

    for (const path of sharedPaths) {
      describe(`${path}`, () => {
        it(`admin token → 200`, async () => {
          const token = makeToken('admin');
          const res = await request(app)
            .get(path)
            .set('Authorization', `Bearer ${token}`);
          expect(res.status).toBe(200);
        });

        it(`salesman token → 200`, async () => {
          const token = makeToken('salesman');
          const res = await request(app)
            .get(path)
            .set('Authorization', `Bearer ${token}`);
          expect(res.status).toBe(200);
        });

        it(`customer token → 200`, async () => {
          const token = makeToken('customer');
          const res = await request(app)
            .get(path)
            .set('Authorization', `Bearer ${token}`);
          expect(res.status).toBe(200);
        });
      });
    }
  });

  // ── Token edge cases ──
  describe('Token edge cases', () => {
    it('expired token on any route → 401', async () => {
      const expired = jwt.sign(
        { userId: 1, role: 'admin', name: 'Test' },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );
      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });

    it('tampered token → 401', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', 'Bearer totally.invalid.token');
      expect(res.status).toBe(401);
    });
  });
});

// ── Inline route protection (bookings DELETE) ──
describe('Inline route protection — DELETE /bookings/:id', () => {
  let testApp;

  beforeAll(() => {
    testApp = express();
    testApp.use(express.json());
    // Simulate auth middleware + the bookings router
    testApp.use('/bookings', (req, res, next) => {
      // Mock verifyToken: attach user from token
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'No token' });
      const token = authHeader.split(' ')[1];
      try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
      } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }, require('../routes/bookings'));
  });

  it('salesman trying to DELETE → 403', async () => {
    const token = makeToken('salesman');
    const res = await request(testApp)
      .delete('/bookings/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin trying to DELETE non-existent → 404 (auth passes, business logic handles it)', async () => {
    const token = makeToken('admin');
    const res = await request(testApp)
      .delete('/bookings/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
