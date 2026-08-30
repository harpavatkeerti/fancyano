const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
// Mock auth: tests run as admin
app.use((req, res, next) => {
  req.user = { role: 'admin', id: 'test-user', name: 'jest_reports_admin' };
  next();
});
app.use('/reports', require('./reports'));

// Salesman app for access control tests
const salesmanApp = express();
salesmanApp.use(express.json());
salesmanApp.use((req, res, next) => {
  req.user = { role: 'salesman', id: 'test-salesman', name: 'jest_reports_salesman' };
  next();
});
salesmanApp.use('/reports', require('./reports'));

describe('Reports Routes', () => {
  // ── Ledger ──
  describe('GET /reports/ledger', () => {
    test('should return ledger entries for admin', async () => {
      const response = await request(app).get('/reports/ledger');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should accept filter parameters', async () => {
      const response = await request(app)
        .get('/reports/ledger?method=Cash&type=credit&page=1&limit=10');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return 403 for salesman', async () => {
      const response = await request(salesmanApp).get('/reports/ledger');
      expect(response.status).toBe(403);
    });
  });

  describe('GET /reports/ledger/summary', () => {
    test('should return ledger summary for admin', async () => {
      const response = await request(app).get('/reports/ledger/summary');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_credits');
      expect(response.body).toHaveProperty('total_debits');
      expect(response.body).toHaveProperty('net_balance');
      expect(response.body).toHaveProperty('method_breakdown');
    });
  });

  // ── Rental Collection ──
  describe('GET /reports/rental-collection', () => {
    test('should return rental collection summary', async () => {
      const response = await request(app).get('/reports/rental-collection');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('rent_due');
      expect(response.body).toHaveProperty('rent_collected');
      expect(response.body).toHaveProperty('outstanding');
    });
  });

  describe('GET /reports/rental-collection/monthly', () => {
    test('should return monthly breakdown', async () => {
      const response = await request(app)
        .get('/reports/rental-collection/monthly?fy_start_year=2025');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return 400 without fy_start_year', async () => {
      const response = await request(app)
        .get('/reports/rental-collection/monthly');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /reports/rental-collection/bookings', () => {
    test('should return booking-level data', async () => {
      const now = new Date();
      const response = await request(app)
        .get(`/reports/rental-collection/bookings?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return 400 without required params', async () => {
      const response = await request(app)
        .get('/reports/rental-collection/bookings');
      expect(response.status).toBe(400);
    });
  });

  // ── Charges & Penalties ──
  describe('GET /reports/charges', () => {
    test('should return charges report', async () => {
      const response = await request(app).get('/reports/charges');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should filter by charge_type', async () => {
      const response = await request(app)
        .get('/reports/charges?charge_type=exchange_penalty');
      expect(response.status).toBe(200);
    });
  });

  describe('GET /reports/charges/summary', () => {
    test('should return charges summary', async () => {
      const response = await request(app).get('/reports/charges/summary');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // ── Dead Inventory ──
  describe('GET /reports/dead-inventory', () => {
    test('should return dead inventory report', async () => {
      const response = await request(app).get('/reports/dead-inventory?min_idle_days=0');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // ── Security Deposits ──
  describe('GET /reports/security-deposits', () => {
    test('should return security deposit summary', async () => {
      const response = await request(app).get('/reports/security-deposits');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // ── Customer Report ──
  describe('GET /reports/customers', () => {
    test('should return customer report', async () => {
      const response = await request(app).get('/reports/customers');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /reports/customers/outstanding', () => {
    test('should return outstanding dues', async () => {
      const response = await request(app).get('/reports/customers/outstanding');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // ── Salesman Performance ──
  describe('GET /reports/salesman-performance', () => {
    test('should return salesman performance for admin', async () => {
      const response = await request(app).get('/reports/salesman-performance');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return 403 for salesman when setting is disabled', async () => {
      // Ensure setting is not present (disabled by default)
      await pool.query("DELETE FROM settings WHERE setting_key = 'salesman_reports_enabled'");
      const response = await request(salesmanApp).get('/reports/salesman-performance');
      expect(response.status).toBe(403);
    });

    test('should allow salesman when setting is enabled', async () => {
      // Insert the setting
      await pool.query(
        "INSERT INTO settings (setting_key, setting_value, setting_type, category) VALUES ('salesman_reports_enabled', 'true', 'boolean', 'reports') ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'true'"
      );

      const response = await request(salesmanApp).get('/reports/salesman-performance');
      expect(response.status).toBe(200);

      // Cleanup
      await pool.query("DELETE FROM settings WHERE setting_key = 'salesman_reports_enabled'");
    });
  });

  // ── Product Performance ──
  describe('GET /reports/product-performance', () => {
    test('should return product performance', async () => {
      const response = await request(app).get('/reports/product-performance');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
