const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { role: 'admin', id: 'test-admin', name: 'jest_qr_route_admin' };
  next();
});
app.use('/qr-codes', require('./qrCodes'));

const salesmanApp = express();
salesmanApp.use(express.json());
salesmanApp.use((req, res, next) => {
  req.user = { role: 'salesman', id: 'test-salesman', name: 'jest_qr_route_salesman' };
  next();
});
salesmanApp.use('/qr-codes', require('./qrCodes'));

describe('QR Codes Routes', () => {
  const prefix = 'jest_qr_route';
  let bankAccountId;

  beforeAll(async () => {
    // Create a bank account for QR codes to link to
    const result = await pool.query(
      "INSERT INTO bank_accounts (account_name) VALUES ($1) RETURNING id",
      [`${prefix}_bank`]
    );
    bankAccountId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM qr_codes WHERE name LIKE $1", [`${prefix}%`]);
    await pool.query("DELETE FROM bank_accounts WHERE account_name LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM qr_codes WHERE name LIKE $1", [`${prefix}%`]);
  });

  describe('POST /qr-codes', () => {
    test('should create a QR code as admin', async () => {
      const response = await request(app)
        .post('/qr-codes')
        .send({
          name: `${prefix}_upi1`,
          qr_image: 'data:image/png;base64,test',
          qr_type: 'rent',
          bank_account_id: bankAccountId
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(`${prefix}_upi1`);
      expect(response.body.qr_type).toBe('rent');
    });

    test('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/qr-codes')
        .send({ qr_image: 'data:image/png;base64,test', qr_type: 'rent', bank_account_id: bankAccountId });

      expect(response.status).toBe(400);
    });

    test('should return 403 for salesman', async () => {
      const response = await request(salesmanApp)
        .post('/qr-codes')
        .send({ name: `${prefix}_denied`, qr_image: 'data:image/png;base64,test', qr_type: 'rent', bank_account_id: bankAccountId });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /qr-codes', () => {
    test('should list all QR codes for admin', async () => {
      await request(app).post('/qr-codes').send({
        name: `${prefix}_list1`, qr_image: 'data:image/png;base64,test', qr_type: 'rent', bank_account_id: bankAccountId
      });

      const response = await request(app).get('/qr-codes');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return 403 for salesman listing', async () => {
      const response = await request(salesmanApp).get('/qr-codes');
      expect(response.status).toBe(403);
    });
  });

  describe('GET /qr-codes/active/:type', () => {
    test('should be accessible by any authenticated user', async () => {
      const response = await request(salesmanApp).get('/qr-codes/active/rent');
      // Should return 200 even if no active QR found (returns null)
      expect(response.status).toBe(200);
    });
  });

  describe('PUT /qr-codes/:id/deactivate', () => {
    test('should deactivate a QR code', async () => {
      const createRes = await request(app).post('/qr-codes').send({
        name: `${prefix}_deact`, qr_image: 'data:image/png;base64,test', qr_type: 'rent', bank_account_id: bankAccountId
      });

      const response = await request(app)
        .put(`/qr-codes/${createRes.body.id}/deactivate`);
      expect(response.status).toBe(200);
      expect(response.body.is_active).toBe(false);
    });
  });

  describe('DELETE /qr-codes/:id', () => {
    test('should delete QR code', async () => {
      const createRes = await request(app).post('/qr-codes').send({
        name: `${prefix}_del`, qr_image: 'data:image/png;base64,test', qr_type: 'rent', bank_account_id: bankAccountId
      });

      const response = await request(app).delete(`/qr-codes/${createRes.body.id}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(createRes.body.id);
    });
  });
});
