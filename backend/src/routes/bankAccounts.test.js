const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { role: 'admin', id: 'test-admin', name: 'jest_ba_route_admin' };
  next();
});
app.use('/bank-accounts', require('./bankAccounts'));

// Salesman app — should get 403 since all routes are admin-only
const salesmanApp = express();
salesmanApp.use(express.json());
salesmanApp.use((req, res, next) => {
  req.user = { role: 'salesman', id: 'test-salesman', name: 'jest_ba_route_salesman' };
  next();
});
salesmanApp.use('/bank-accounts', require('./bankAccounts'));

describe('Bank Accounts Routes', () => {
  const prefix = 'jest_ba_route';

  afterAll(async () => {
    await pool.query("DELETE FROM bank_accounts WHERE account_name LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM bank_accounts WHERE account_name LIKE $1", [`${prefix}%`]);
  });

  describe('POST /bank-accounts', () => {
    test('should create a bank account as admin', async () => {
      const response = await request(app)
        .post('/bank-accounts')
        .send({ account_name: `${prefix}_hdfc` });

      expect(response.status).toBe(201);
      expect(response.body.account_name).toBe(`${prefix}_hdfc`);
    });

    test('should return 400 for empty account name', async () => {
      const response = await request(app)
        .post('/bank-accounts')
        .send({ account_name: '' });

      expect(response.status).toBe(400);
    });

    test('should return 403 for salesman', async () => {
      const response = await request(salesmanApp)
        .post('/bank-accounts')
        .send({ account_name: `${prefix}_denied` });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /bank-accounts', () => {
    test('should list all bank accounts', async () => {
      await request(app).post('/bank-accounts').send({ account_name: `${prefix}_l1` });
      await request(app).post('/bank-accounts').send({ account_name: `${prefix}_l2` });

      const response = await request(app).get('/bank-accounts');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const ours = response.body.filter(a => a.account_name.startsWith(prefix));
      expect(ours.length).toBe(2);
    });
  });

  describe('GET /bank-accounts/:id', () => {
    test('should return bank account by id', async () => {
      const createRes = await request(app)
        .post('/bank-accounts')
        .send({ account_name: `${prefix}_get` });

      const response = await request(app).get(`/bank-accounts/${createRes.body.id}`);
      expect(response.status).toBe(200);
      expect(response.body.account_name).toBe(`${prefix}_get`);
    });

    test('should return 404 for non-existent id', async () => {
      const response = await request(app).get('/bank-accounts/999999');
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /bank-accounts/:id', () => {
    test('should update bank account', async () => {
      const createRes = await request(app)
        .post('/bank-accounts')
        .send({ account_name: `${prefix}_upd` });

      const response = await request(app)
        .put(`/bank-accounts/${createRes.body.id}`)
        .send({ account_name: `${prefix}_updated` });

      expect(response.status).toBe(200);
      expect(response.body.account_name).toBe(`${prefix}_updated`);
    });
  });

  describe('DELETE /bank-accounts/:id', () => {
    test('should delete bank account with no linked QR codes', async () => {
      const createRes = await request(app)
        .post('/bank-accounts')
        .send({ account_name: `${prefix}_del` });

      const response = await request(app)
        .delete(`/bank-accounts/${createRes.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(createRes.body.id);
    });
  });
});
