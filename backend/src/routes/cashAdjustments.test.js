const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
// Mock auth middleware — default admin user
app.use((req, res, next) => {
  req.user = { role: 'admin', id: 'test-user', name: 'jest_cadj_route_admin' };
  next();
});
app.use('/cash-adjustments', require('./cashAdjustments'));

// Second app instance for salesman tests
const salesmanApp = express();
salesmanApp.use(express.json());
salesmanApp.use((req, res, next) => {
  req.user = { role: 'salesman', id: 'test-salesman', name: 'jest_cadj_route_salesman' };
  next();
});
salesmanApp.use('/cash-adjustments', require('./cashAdjustments'));

describe('Cash Adjustments Routes', () => {
  const prefix = 'jest_cadj_route';

  afterAll(async () => {
    await pool.query("DELETE FROM cash_adjustments WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM cash_adjustments WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  describe('POST /cash-adjustments', () => {
    test('should create adjustment as admin (auto-approved)', async () => {
      const response = await request(app)
        .post('/cash-adjustments')
        .send({ amount: 500, reason: 'Cash surplus' });

      expect(response.status).toBe(201);
      expect(response.body.amount).toBe(500);
      expect(response.body.approval_status).toBe('approved');
      expect(response.body.recorded_by).toBe(`${prefix}_admin`);
    });

    test('should create adjustment as salesman (pending)', async () => {
      const response = await request(salesmanApp)
        .post('/cash-adjustments')
        .send({ amount: -200, reason: 'Cash shortage' });

      expect(response.status).toBe(201);
      expect(response.body.approval_status).toBe('pending');
      expect(response.body.recorded_by).toBe(`${prefix}_salesman`);
    });

    test('should return 400 for missing amount', async () => {
      const response = await request(app)
        .post('/cash-adjustments')
        .send({ reason: 'No amount' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /cash-adjustments', () => {
    test('should list all adjustments for admin', async () => {
      await request(app)
        .post('/cash-adjustments')
        .send({ amount: 100, reason: 'Test 1' });
      await request(app)
        .post('/cash-adjustments')
        .send({ amount: -50, reason: 'Test 2' });

      const response = await request(app).get('/cash-adjustments');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const ours = response.body.filter(a => a.recorded_by.startsWith(prefix));
      expect(ours.length).toBe(2);
    });

    test('salesman should only see own adjustments', async () => {
      // Admin creates one
      await request(app)
        .post('/cash-adjustments')
        .send({ amount: 100, reason: 'Admin adj' });
      // Salesman creates one
      await request(salesmanApp)
        .post('/cash-adjustments')
        .send({ amount: -50, reason: 'Salesman adj' });

      const response = await request(salesmanApp).get('/cash-adjustments');
      expect(response.status).toBe(200);
      const ours = response.body.filter(a => a.recorded_by.startsWith(prefix));
      expect(ours.length).toBe(1);
      expect(ours[0].recorded_by).toBe(`${prefix}_salesman`);
    });
  });

  describe('GET /cash-adjustments/pending-count', () => {
    test('should return pending count for admin', async () => {
      await request(salesmanApp)
        .post('/cash-adjustments')
        .send({ amount: -50, reason: 'Pending one' });

      const response = await request(app).get('/cash-adjustments/pending-count');
      expect(response.status).toBe(200);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });

    test('should return 403 for salesman', async () => {
      const response = await request(salesmanApp).get('/cash-adjustments/pending-count');
      expect(response.status).toBe(403);
    });
  });

  describe('GET /cash-adjustments/summary', () => {
    test('should return summary for admin', async () => {
      await request(app)
        .post('/cash-adjustments')
        .send({ amount: 500, reason: 'Surplus' });
      await request(app)
        .post('/cash-adjustments')
        .send({ amount: -200, reason: 'Shortage' });

      const response = await request(app).get('/cash-adjustments/summary');
      expect(response.status).toBe(200);
      expect(response.body.total_surplus).toBeGreaterThanOrEqual(500);
      expect(response.body.total_shortage).toBeGreaterThanOrEqual(200);
    });

    test('should return 403 for salesman', async () => {
      const response = await request(salesmanApp).get('/cash-adjustments/summary');
      expect(response.status).toBe(403);
    });
  });

  describe('PUT /cash-adjustments/:id/approve', () => {
    test('should approve a pending adjustment', async () => {
      const createRes = await request(salesmanApp)
        .post('/cash-adjustments')
        .send({ amount: -100, reason: 'Needs approval' });

      const response = await request(app)
        .put(`/cash-adjustments/${createRes.body.id}/approve`);

      expect(response.status).toBe(200);
      expect(response.body.approval_status).toBe('approved');
      expect(response.body.approved_by).toBe(`${prefix}_admin`);
    });

    test('should return 400 for already approved', async () => {
      const createRes = await request(app)
        .post('/cash-adjustments')
        .send({ amount: 100, reason: 'Already approved' });

      const response = await request(app)
        .put(`/cash-adjustments/${createRes.body.id}/approve`);

      expect(response.status).toBe(400);
    });

    test('should return 403 for salesman', async () => {
      const createRes = await request(salesmanApp)
        .post('/cash-adjustments')
        .send({ amount: -50, reason: 'Pending' });

      const response = await request(salesmanApp)
        .put(`/cash-adjustments/${createRes.body.id}/approve`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /cash-adjustments/:id/reject', () => {
    test('should reject a pending adjustment', async () => {
      const createRes = await request(salesmanApp)
        .post('/cash-adjustments')
        .send({ amount: -100, reason: 'Needs rejection' });

      const response = await request(app)
        .put(`/cash-adjustments/${createRes.body.id}/reject`);

      expect(response.status).toBe(200);
      expect(response.body.approval_status).toBe('rejected');
    });
  });
});
