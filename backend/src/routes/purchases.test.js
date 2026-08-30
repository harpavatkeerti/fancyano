const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { role: 'admin', id: 'test-admin', name: 'jest_purch_route_admin' };
  next();
});
app.use('/purchases', require('./purchases'));

// Salesman app — should get 403 since all routes are admin-only
const salesmanApp = express();
salesmanApp.use(express.json());
salesmanApp.use((req, res, next) => {
  req.user = { role: 'salesman', id: 'test-salesman', name: 'jest_purch_route_salesman' };
  next();
});
salesmanApp.use('/purchases', require('./purchases'));

describe('Purchases Routes', () => {
  const prefix = 'jest_purch_route';

  afterAll(async () => {
    await pool.query("DELETE FROM purchases WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM purchases WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  describe('POST /purchases', () => {
    test('should create a purchase as admin', async () => {
      const response = await request(app)
        .post('/purchases')
        .send({ vendor_name: 'Test Vendor', item_description: 'Fabric batch', amount: 15000 });

      expect(response.status).toBe(201);
      expect(response.body.vendor_name).toBe('Test Vendor');
      expect(response.body.amount).toBe(15000);
      expect(response.body.recorded_by).toBe(`${prefix}_admin`);
    });

    test('should return 400 for missing vendor_name', async () => {
      const response = await request(app)
        .post('/purchases')
        .send({ item_description: 'Something', amount: 1000 });

      expect(response.status).toBe(400);
    });

    test('should return 403 for salesman', async () => {
      const response = await request(salesmanApp)
        .post('/purchases')
        .send({ vendor_name: 'Test', item_description: 'Item', amount: 1000 });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /purchases', () => {
    test('should list all purchases', async () => {
      await request(app).post('/purchases').send({ vendor_name: 'V1', item_description: 'Item1', amount: 1000 });
      await request(app).post('/purchases').send({ vendor_name: 'V2', item_description: 'Item2', amount: 2000 });

      const response = await request(app).get('/purchases');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const ours = response.body.filter(p => p.recorded_by.startsWith(prefix));
      expect(ours.length).toBe(2);
    });
  });

  describe('GET /purchases/:id', () => {
    test('should return purchase by id', async () => {
      const createRes = await request(app)
        .post('/purchases')
        .send({ vendor_name: 'GetTest', item_description: 'Get item', amount: 5000 });

      const response = await request(app).get(`/purchases/${createRes.body.id}`);
      expect(response.status).toBe(200);
      expect(response.body.amount).toBe(5000);
    });

    test('should return 404 for non-existent id', async () => {
      const response = await request(app).get('/purchases/999999');
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /purchases/:id', () => {
    test('should delete purchase', async () => {
      const createRes = await request(app)
        .post('/purchases')
        .send({ vendor_name: 'DelTest', item_description: 'Del item', amount: 1000 });

      const response = await request(app).delete(`/purchases/${createRes.body.id}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(createRes.body.id);
    });
  });
});
