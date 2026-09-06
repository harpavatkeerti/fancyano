const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { role: 'admin', id: 'test-admin', name: 'jest_exp_route_admin' };
  next();
});
app.use('/expenses', require('./expenses'));

// Salesman app
const salesmanApp = express();
salesmanApp.use(express.json());
salesmanApp.use((req, res, next) => {
  req.user = { role: 'salesman', id: 'test-salesman', name: 'jest_exp_route_salesman' };
  next();
});
salesmanApp.use('/expenses', require('./expenses'));

describe('Expenses Routes', () => {
  const prefix = 'jest_exp_route';

  afterAll(async () => {
    await pool.query("DELETE FROM expenses WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM expenses WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  describe('POST /expenses', () => {
    test('should create an expense as admin (auto-approved)', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({ category: 'Electricity', amount: 3000, description: 'Monthly bill' });

      expect(response.status).toBe(201);
      expect(response.body.category).toBe('Electricity');
      expect(response.body.amount).toBe(3000);
      expect(response.body.approval_status).toBe('approved');
      expect(response.body.recorded_by).toBe(`${prefix}_admin`);
    });

    test('should create an expense as salesman (pending)', async () => {
      const response = await request(salesmanApp)
        .post('/expenses')
        .send({ category: 'Transport', amount: 500 });

      expect(response.status).toBe(201);
      expect(response.body.approval_status).toBe('pending');
      expect(response.body.recorded_by).toBe(`${prefix}_salesman`);
    });

    test('should return 400 for missing category', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({ amount: 100 });

      expect(response.status).toBe(400);
    });

    test('should return 400 for zero amount', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({ category: 'Test', amount: 0 });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /expenses — payment_source', () => {
    test('should accept payment_source in create', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({ category: 'Internet', amount: 1200, payment_source: 'Online' });

      expect(response.status).toBe(201);
      expect(response.body.payment_source).toBe('Online');
    });

    test('should default to Shop Cash when payment_source omitted', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({ category: 'Rent', amount: 5000 });

      expect(response.status).toBe(201);
      expect(response.body.payment_source).toBe('Shop Cash');
    });

    test('should fall back to Shop Cash for invalid payment_source', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({ category: 'Misc', amount: 100, payment_source: 'Bitcoin' });

      expect(response.status).toBe(201);
      expect(response.body.payment_source).toBe('Shop Cash');
    });
  });

  describe('PUT /expenses/:id — payment_source', () => {
    test('should update payment_source', async () => {
      const createRes = await request(app)
        .post('/expenses')
        .send({ category: 'Fuel', amount: 500 });

      const response = await request(app)
        .put(`/expenses/${createRes.body.id}`)
        .send({ payment_source: 'Personal' });

      expect(response.status).toBe(200);
      expect(response.body.payment_source).toBe('Personal');
    });
  });

  describe('GET /expenses', () => {
    test('should list all expenses for admin', async () => {
      await request(app).post('/expenses').send({ category: 'Rent', amount: 5000 });
      await request(app).post('/expenses').send({ category: 'Water', amount: 500 });

      const response = await request(app).get('/expenses');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const ours = response.body.filter(e => e.recorded_by.startsWith(prefix));
      expect(ours.length).toBe(2);
    });

    test('salesman should only see own expenses', async () => {
      await request(app).post('/expenses').send({ category: 'Rent', amount: 5000 });
      await request(salesmanApp).post('/expenses').send({ category: 'Transport', amount: 300 });

      const response = await request(salesmanApp).get('/expenses');
      expect(response.status).toBe(200);
      const ours = response.body.filter(e => e.recorded_by.startsWith(prefix));
      expect(ours.length).toBe(1);
      expect(ours[0].recorded_by).toBe(`${prefix}_salesman`);
    });
  });

  describe('GET /expenses/pending-count', () => {
    test('should return pending count for admin', async () => {
      await request(salesmanApp).post('/expenses').send({ category: 'Fuel', amount: 200 });

      const response = await request(app).get('/expenses/pending-count');
      expect(response.status).toBe(200);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });

    test('should return 403 for salesman', async () => {
      const response = await request(salesmanApp).get('/expenses/pending-count');
      expect(response.status).toBe(403);
    });
  });

  describe('GET /expenses/summary', () => {
    test('should return category summary', async () => {
      await request(app).post('/expenses').send({ category: 'Rent', amount: 5000 });

      const response = await request(app).get('/expenses/summary');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /expenses/:id', () => {
    test('should return expense by id', async () => {
      const createRes = await request(app)
        .post('/expenses')
        .send({ category: 'Phone', amount: 800 });

      const response = await request(app).get(`/expenses/${createRes.body.id}`);
      expect(response.status).toBe(200);
      expect(response.body.amount).toBe(800);
    });

    test('should return 404 for non-existent id', async () => {
      const response = await request(app).get('/expenses/999999');
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /expenses/:id/approve', () => {
    test('should approve a pending expense', async () => {
      const createRes = await request(salesmanApp)
        .post('/expenses')
        .send({ category: 'Fuel', amount: 300 });

      const response = await request(app)
        .put(`/expenses/${createRes.body.id}/approve`);

      expect(response.status).toBe(200);
      expect(response.body.approval_status).toBe('approved');
      expect(response.body.approved_by).toBe(`${prefix}_admin`);
    });

    test('should return 400 for already approved', async () => {
      const createRes = await request(app)
        .post('/expenses')
        .send({ category: 'Rent', amount: 5000 });

      const response = await request(app)
        .put(`/expenses/${createRes.body.id}/approve`);

      expect(response.status).toBe(400);
    });

    test('should return 403 for salesman', async () => {
      const createRes = await request(salesmanApp)
        .post('/expenses')
        .send({ category: 'Fuel', amount: 200 });

      const response = await request(salesmanApp)
        .put(`/expenses/${createRes.body.id}/approve`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /expenses/:id/reject', () => {
    test('should reject a pending expense', async () => {
      const createRes = await request(salesmanApp)
        .post('/expenses')
        .send({ category: 'Fuel', amount: 300 });

      const response = await request(app)
        .put(`/expenses/${createRes.body.id}/reject`);

      expect(response.status).toBe(200);
      expect(response.body.approval_status).toBe('rejected');
    });
  });

  describe('DELETE /expenses/:id', () => {
    test('should delete expense', async () => {
      const createRes = await request(app)
        .post('/expenses')
        .send({ category: 'Misc', amount: 100 });

      const response = await request(app).delete(`/expenses/${createRes.body.id}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(createRes.body.id);
    });
  });
});
