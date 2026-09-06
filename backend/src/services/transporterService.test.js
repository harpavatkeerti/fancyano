/**
 * transporterService.test.js
 *
 * Unit tests for transporterService — direct DB assertions.
 * Uses name prefix 'TEST-TRANS-SVC-' to avoid collisions.
 *
 * Pattern: mirrors vendorService.test.js
 */

const pool = require('../database/connection');
const transporterService = require('./transporterService');

describe('TransporterService', () => {
  // Cleanup after each test
  afterEach(async () => {
    await pool.query(`DELETE FROM transporters WHERE name LIKE 'TEST-TRANS-SVC-%'`);
  });

  // ──────────────────────────────────────────────────────────────
  // createTransporter
  // ──────────────────────────────────────────────────────────────
  describe('createTransporter', () => {
    it('should create a transporter with all fields', async () => {
      const result = await transporterService.createTransporter({
        name: 'TEST-TRANS-SVC-FULL',
        phone: '9876543210',
        phone_country: 'IN',
        bus_no: 'GJ05AB1234',
        notes: 'Regular transporter',
      });

      expect(result).toHaveProperty('id');
      expect(result.name).toBe('TEST-TRANS-SVC-FULL');
      expect(result.phone).toBe('9876543210');
      expect(result.phone_country).toBe('IN');
      expect(result.bus_no).toBe('GJ05AB1234');
      expect(result.notes).toBe('Regular transporter');
      expect(result.is_deleted).toBe(false);
    });

    it('should create a transporter with minimal fields', async () => {
      const result = await transporterService.createTransporter({
        name: 'TEST-TRANS-SVC-MINIMAL',
        phone: '9876543211',
      });

      expect(result).toHaveProperty('id');
      expect(result.phone_country).toBe('IN');
      expect(result.bus_no).toBeNull();
      expect(result.notes).toBeNull();
    });

    it('should throw 400 if name is missing', async () => {
      await expect(
        transporterService.createTransporter({ phone: '9876543212' })
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/name/i) });
    });

    it('should throw 400 if phone is missing', async () => {
      await expect(
        transporterService.createTransporter({ name: 'TEST-TRANS-SVC-NOPHONE' })
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/phone/i) });
    });

    it('should throw 400 for invalid phone length', async () => {
      await expect(
        transporterService.createTransporter({ name: 'TEST-TRANS-SVC-BADLEN', phone: '12345', phone_country: 'IN' })
      ).rejects.toMatchObject({ status: 400 });
    });

    it('should throw 400 if notes exceed 255 characters', async () => {
      await expect(
        transporterService.createTransporter({
          name: 'TEST-TRANS-SVC-LONGNOTES',
          phone: '9876543213',
          notes: 'x'.repeat(256),
        })
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/255/) });
    });

    it('should trim name and phone whitespace', async () => {
      const result = await transporterService.createTransporter({
        name: '  TEST-TRANS-SVC-TRIM  ',
        phone: ' 9876543214 ',
      });

      expect(result.name).toBe('TEST-TRANS-SVC-TRIM');
      expect(result.phone).toBe('9876543214');
    });

    it('should throw 400 for invalid bus_no format', async () => {
      await expect(
        transporterService.createTransporter({ name: 'TEST-TRANS-BAD-BUS', phone: '9876543215', bus_no: 'INVALID' })
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Invalid vehicle number/) });
    });

    it('should accept valid bus_no formats (with/without dashes)', async () => {
      const result = await transporterService.createTransporter({
        name: 'TEST-TRANS-VALID-BUS',
        phone: '9876543216',
        bus_no: 'RJ27CD6709',
      });
      expect(result.bus_no).toBe('RJ27CD6709');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // listTransporters
  // ──────────────────────────────────────────────────────────────
  describe('listTransporters', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO transporters (name, phone) VALUES ($1, $2), ($3, $4)`,
        ['TEST-TRANS-SVC-LIST-A', '9876543220', 'TEST-TRANS-SVC-LIST-B', '9876543221']
      );
    });

    it('should return all non-deleted transporters', async () => {
      const result = await transporterService.listTransporters();
      expect(result.some(t => t.name === 'TEST-TRANS-SVC-LIST-A')).toBe(true);
      expect(result.some(t => t.name === 'TEST-TRANS-SVC-LIST-B')).toBe(true);
    });

    it('should filter by search', async () => {
      const result = await transporterService.listTransporters({ search: 'LIST-A' });
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].name).toBe('TEST-TRANS-SVC-LIST-A');
    });

    it('should exclude soft-deleted', async () => {
      await pool.query(`UPDATE transporters SET is_deleted = TRUE WHERE name = 'TEST-TRANS-SVC-LIST-A'`);
      const result = await transporterService.listTransporters();
      expect(result.find(t => t.name === 'TEST-TRANS-SVC-LIST-A')).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // searchTransporters
  // ──────────────────────────────────────────────────────────────
  describe('searchTransporters', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO transporters (name, phone) VALUES ($1, $2)`,
        ['TEST-TRANS-SVC-SEARCH', '9876543222']
      );
    });

    it('should return matching transporters by name', async () => {
      const result = await transporterService.searchTransporters('SVC-SEARCH');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].name).toBe('TEST-TRANS-SVC-SEARCH');
    });

    it('should return matching transporters by phone', async () => {
      const result = await transporterService.searchTransporters('9876543222');
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw 400 for query shorter than 2 chars', async () => {
      await expect(
        transporterService.searchTransporters('A')
      ).rejects.toMatchObject({ status: 400 });
    });

    it('should throw 400 for empty query', async () => {
      await expect(
        transporterService.searchTransporters('')
      ).rejects.toMatchObject({ status: 400 });
    });

    it('should return empty array for no matches', async () => {
      const result = await transporterService.searchTransporters('ZZZNOMATCH999');
      expect(result).toEqual([]);
    });

    it('should exclude soft-deleted from search', async () => {
      await pool.query(`UPDATE transporters SET is_deleted = TRUE WHERE name = 'TEST-TRANS-SVC-SEARCH'`);
      const result = await transporterService.searchTransporters('SVC-SEARCH');
      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // getTransporterById
  // ──────────────────────────────────────────────────────────────
  describe('getTransporterById', () => {
    let transporterId;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO transporters (name, phone, bus_no) VALUES ($1, $2, $3) RETURNING id`,
        ['TEST-TRANS-SVC-GETID', '9876543223', 'RJ14CD9999']
      );
      transporterId = result.rows[0].id;
    });

    it('should return transporter by ID', async () => {
      const result = await transporterService.getTransporterById(transporterId);
      expect(result.id).toBe(transporterId);
      expect(result.name).toBe('TEST-TRANS-SVC-GETID');
      expect(result.bus_no).toBe('RJ14CD9999');
    });

    it('should throw 404 for non-existent ID', async () => {
      await expect(
        transporterService.getTransporterById(9999999)
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────
  // updateTransporter
  // ──────────────────────────────────────────────────────────────
  describe('updateTransporter', () => {
    let transporterId;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO transporters (name, phone, bus_no) VALUES ($1, $2, $3) RETURNING id`,
        ['TEST-TRANS-SVC-UPDATE', '9876543224', 'OLD-BUS']
      );
      transporterId = result.rows[0].id;
    });

    it('should update name', async () => {
      const result = await transporterService.updateTransporter(transporterId, {
        name: 'TEST-TRANS-SVC-UPDATED',
      });
      expect(result.name).toBe('TEST-TRANS-SVC-UPDATED');
    });

    it('should update bus_no', async () => {
      const result = await transporterService.updateTransporter(transporterId, {
        bus_no: 'MH12EF4567',
      });
      expect(result.bus_no).toBe('MH12EF4567');
    });

    it('should update phone with validation', async () => {
      const result = await transporterService.updateTransporter(transporterId, {
        phone: '9999999999',
        phone_country: 'IN',
      });
      expect(result.phone).toBe('9999999999');
    });

    it('should throw 400 for invalid phone length', async () => {
      await expect(
        transporterService.updateTransporter(transporterId, { phone: '123', phone_country: 'IN' })
      ).rejects.toMatchObject({ status: 400 });
    });

    it('should throw 400 if no updatable fields', async () => {
      await expect(
        transporterService.updateTransporter(transporterId, {})
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no updatable fields/i) });
    });

    it('should throw 404 for non-existent transporter', async () => {
      await expect(
        transporterService.updateTransporter(9999999, { name: 'Nobody' })
      ).rejects.toMatchObject({ status: 404 });
    });

    it('should throw 404 for soft-deleted transporter', async () => {
      await pool.query(`UPDATE transporters SET is_deleted = TRUE WHERE id = $1`, [transporterId]);
      await expect(
        transporterService.updateTransporter(transporterId, { name: 'Ghost' })
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────
  // deleteTransporter
  // ──────────────────────────────────────────────────────────────
  describe('deleteTransporter', () => {
    let transporterId;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO transporters (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-TRANS-SVC-DELETE', '9876543225']
      );
      transporterId = result.rows[0].id;
    });

    it('should soft-delete a transporter', async () => {
      const result = await transporterService.deleteTransporter(transporterId);
      expect(result).toHaveProperty('id');

      // Verify in DB
      const dbRes = await pool.query('SELECT is_deleted FROM transporters WHERE id = $1', [transporterId]);
      expect(dbRes.rows[0].is_deleted).toBe(true);
    });

    it('should throw 404 for non-existent transporter', async () => {
      await expect(
        transporterService.deleteTransporter(9999999)
      ).rejects.toMatchObject({ status: 404 });
    });

    it('should throw 404 if already soft-deleted', async () => {
      await transporterService.deleteTransporter(transporterId);
      await expect(
        transporterService.deleteTransporter(transporterId)
      ).rejects.toMatchObject({ status: 404 });
    });

    // ── FK guard: block delete when linked to active bookings ──
    describe('FK guard — active booking references', () => {
      let testProductId;
      let testBookingId;
      let testBpId;

      beforeEach(async () => {
        // Create a test product
        const pRes = await pool.query(
          `INSERT INTO products (code, name, rent, security_deposit, category)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          ['TEST-TRANS-SVC-FK-PROD', 'FK Guard Product', 10000, 5000, 'test']
        );
        testProductId = pRes.rows[0].id;

        // Create a test user if needed, use ID 1 (admin) which should exist
        // Create a test booking
        const bRes = await pool.query(
          `INSERT INTO bookings (user_id, booking_date, status, created_by)
           VALUES ((SELECT id FROM users LIMIT 1), CURRENT_DATE, 'confirmed', 'test')
           RETURNING id`
        );
        testBookingId = bRes.rows[0].id;

        // Create a booking_product linked to our transporter
        const bpRes = await pool.query(
          `INSERT INTO booking_products (booking_id, product_id, quantity, rent, security_deposit, status, booked_from, booked_to, transporter_id)
           VALUES ($1, $2, 1, 10000, 5000, 'confirmed', CURRENT_DATE, CURRENT_DATE + 3, $3)
           RETURNING id`,
          [testBookingId, testProductId, transporterId]
        );
        testBpId = bpRes.rows[0].id;
      });

      afterEach(async () => {
        // Clean up in correct FK order
        if (testBpId) {
          await pool.query('DELETE FROM product_charges WHERE booking_product_id = $1', [testBpId]);
          await pool.query('DELETE FROM booking_products WHERE id = $1', [testBpId]);
        }
        if (testBookingId) {
          await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [testBookingId]);
          await pool.query('DELETE FROM payment_transactions WHERE booking_id = $1', [testBookingId]);
          await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
        }
        if (testProductId) {
          await pool.query(`DELETE FROM products WHERE id = $1`, [testProductId]);
        }
      });

      it('should block deletion when transporter is linked to a confirmed booking product', async () => {
        await expect(
          transporterService.deleteTransporter(transporterId)
        ).rejects.toMatchObject({
          status: 400,
          message: expect.stringMatching(/Cannot delete transporter/),
        });
      });

      it('should block deletion for pending booking products', async () => {
        await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['pending', testBpId]);
        await expect(
          transporterService.deleteTransporter(transporterId)
        ).rejects.toMatchObject({ status: 400 });
      });

      it('should block deletion for in_progress booking products', async () => {
        await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['in_progress', testBpId]);
        await expect(
          transporterService.deleteTransporter(transporterId)
        ).rejects.toMatchObject({ status: 400 });
      });

      it('should allow deletion when all linked products are cancelled', async () => {
        await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['cancelled', testBpId]);
        const result = await transporterService.deleteTransporter(transporterId);
        expect(result).toHaveProperty('id');
      });

      it('should allow deletion when all linked products are completed', async () => {
        await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', testBpId]);
        const result = await transporterService.deleteTransporter(transporterId);
        expect(result).toHaveProperty('id');
      });

      it('should allow deletion when all linked products are exchanged', async () => {
        await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['exchanged', testBpId]);
        const result = await transporterService.deleteTransporter(transporterId);
        expect(result).toHaveProperty('id');
      });

      it('should include booking IDs in the error message', async () => {
        await expect(
          transporterService.deleteTransporter(transporterId)
        ).rejects.toMatchObject({
          message: expect.stringContaining(String(testBookingId)),
        });
      });
    });
  });
});
