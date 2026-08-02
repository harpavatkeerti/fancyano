const vendorService = require('./vendorService');
const pool = require('../database/connection');

describe('VendorService', () => {
  // Cleanup after each test — scoped to test-specific vendor names
  afterEach(async () => {
    await pool.query(`DELETE FROM products WHERE code LIKE 'TEST-VEND-PROD-%'`);
    await pool.query(`DELETE FROM vendors WHERE name LIKE 'TEST-VENDOR-%'`);
  });

  // ──────────────────────────────────────────────────────────────
  // listVendors
  // ──────────────────────────────────────────────────────────────
  describe('listVendors', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2), ($3, $4)`,
        ['TEST-VENDOR-ALPHA', '1111111111', 'TEST-VENDOR-BETA', '2222222222']
      );
    });

    it('should return all vendors', async () => {
      const vendors = await vendorService.listVendors();
      expect(vendors.some(v => v.name === 'TEST-VENDOR-ALPHA')).toBe(true);
      expect(vendors.some(v => v.name === 'TEST-VENDOR-BETA')).toBe(true);
    });

    it('should filter vendors by search (name)', async () => {
      const vendors = await vendorService.listVendors({ search: 'ALPHA' });
      expect(vendors.length).toBeGreaterThanOrEqual(1);
      expect(vendors.every(v => v.name.includes('ALPHA'))).toBe(true);
    });

    it('should filter vendors by search (phone)', async () => {
      const vendors = await vendorService.listVendors({ search: '2222222222' });
      expect(vendors.length).toBeGreaterThanOrEqual(1);
      expect(vendors[0].name).toBe('TEST-VENDOR-BETA');
    });

    it('should return empty array when search matches nothing', async () => {
      const vendors = await vendorService.listVendors({ search: 'NONEXISTENT-XYZ' });
      expect(vendors).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // searchVendors (autocomplete)
  // ──────────────────────────────────────────────────────────────
  describe('searchVendors', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2), ($3, $4)`,
        ['TEST-VENDOR-SEARCH-ONE', '3333333333', 'TEST-VENDOR-SEARCH-TWO', '4444444444']
      );
    });

    it('should return vendors matching the query', async () => {
      const vendors = await vendorService.searchVendors('TEST-VENDOR-SEARCH');
      expect(vendors.length).toBe(2);
    });

    it('should be case-insensitive', async () => {
      const vendors = await vendorService.searchVendors('test-vendor-search');
      expect(vendors.length).toBe(2);
    });

    it('should limit results to 10', async () => {
      // Insert 12 vendors
      for (let i = 0; i < 12; i++) {
        await pool.query(
          `INSERT INTO vendors (name, phone) VALUES ($1, $2)`,
          [`TEST-VENDOR-LIMIT-${i}`, `5550000${i.toString().padStart(3, '0')}`]
        );
      }
      const vendors = await vendorService.searchVendors('TEST-VENDOR-LIMIT');
      expect(vendors.length).toBeLessThanOrEqual(10);
      // Cleanup
      await pool.query(`DELETE FROM vendors WHERE name LIKE 'TEST-VENDOR-LIMIT-%'`);
    });

    it('should throw 400 for query shorter than 2 characters', async () => {
      try {
        await vendorService.searchVendors('A');
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/at least 2 characters/i);
      }
    });

    it('should throw 400 for empty query', async () => {
      try {
        await vendorService.searchVendors('');
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(400);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────
  // getVendorById
  // ──────────────────────────────────────────────────────────────
  describe('getVendorById', () => {
    let vendorId;

    beforeEach(async () => {
      const res = await pool.query(
        `INSERT INTO vendors (name, phone, gst_number) VALUES ($1, $2, $3) RETURNING id`,
        ['TEST-VENDOR-GETBYID', '5555555555', 'GST123']
      );
      vendorId = res.rows[0].id;
    });

    it('should return vendor by id', async () => {
      const vendor = await vendorService.getVendorById(vendorId);
      expect(vendor.id).toBe(vendorId);
      expect(vendor.name).toBe('TEST-VENDOR-GETBYID');
      expect(vendor.phone).toBe('5555555555');
      expect(vendor.gst_number).toBe('GST123');
    });

    it('should throw 404 for non-existent vendor', async () => {
      try {
        await vendorService.getVendorById(999999);
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/not found/i);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────
  // createVendor
  // ──────────────────────────────────────────────────────────────
  describe('createVendor', () => {
    it('should create a vendor with required fields', async () => {
      const vendor = await vendorService.createVendor({
        name: 'TEST-VENDOR-CREATE',
        phone: '6666666666',
      });

      expect(vendor.name).toBe('TEST-VENDOR-CREATE');
      expect(vendor.phone).toBe('6666666666');
      expect(vendor.id).toBeDefined();
      expect(vendor.created_at).toBeDefined();
    });

    it('should create a vendor with all fields', async () => {
      const vendor = await vendorService.createVendor({
        name: 'TEST-VENDOR-FULL',
        phone: '7777777777',
        address: '123 Test St',
        gst_number: '22AAAAA0000A1Z5',
        pan_number: 'ABCDE1234F',
        notes: 'Test notes',
      });

      expect(vendor.address).toBe('123 Test St');
      expect(vendor.gst_number).toBe('22AAAAA0000A1Z5');
      expect(vendor.pan_number).toBe('ABCDE1234F');
      expect(vendor.notes).toBe('Test notes');
    });

    it('should trim whitespace from all fields', async () => {
      const vendor = await vendorService.createVendor({
        name: '  TEST-VENDOR-TRIM  ',
        phone: '  8888888888  ',
        address: '  trimmed address  ',
      });

      expect(vendor.name).toBe('TEST-VENDOR-TRIM');
      expect(vendor.phone).toBe('8888888888');
      expect(vendor.address).toBe('trimmed address');
    });

    it('should throw 400 when name is missing', async () => {
      try {
        await vendorService.createVendor({ phone: '9999999999' });
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/name/i);
      }
    });

    it('should throw 400 when phone is missing', async () => {
      try {
        await vendorService.createVendor({ name: 'TEST-VENDOR-NOPHONE' });
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/phone/i);
      }
    });

    it('should throw 400 when notes exceed 255 characters', async () => {
      try {
        await vendorService.createVendor({
          name: 'TEST-VENDOR-LONGNOTES',
          phone: '1010101010',
          notes: 'x'.repeat(256),
        });
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/255/);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────
  // updateVendor
  // ──────────────────────────────────────────────────────────────
  describe('updateVendor', () => {
    let vendorId;

    beforeEach(async () => {
      const res = await pool.query(
        `INSERT INTO vendors (name, phone, address) VALUES ($1, $2, $3) RETURNING id`,
        ['TEST-VENDOR-UPDATE', '1212121212', 'Old Address']
      );
      vendorId = res.rows[0].id;
    });

    it('should update vendor details', async () => {
      const vendor = await vendorService.updateVendor(vendorId, {
        name: 'TEST-VENDOR-UPDATED',
        phone: '3434343434',
        address: 'New Address',
      });

      expect(vendor.name).toBe('TEST-VENDOR-UPDATED');
      expect(vendor.phone).toBe('3434343434');
      expect(vendor.address).toBe('New Address');
    });

    it('should throw 404 for non-existent vendor', async () => {
      try {
        await vendorService.updateVendor(999999, { name: 'X' });
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });

    it('should throw 400 when name is set to empty', async () => {
      try {
        await vendorService.updateVendor(vendorId, { name: '' });
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/name/i);
      }
    });

    it('should throw 400 when phone is set to empty', async () => {
      try {
        await vendorService.updateVendor(vendorId, { phone: '  ' });
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/phone/i);
      }
    });

    it('should throw 400 when notes exceed 255 characters', async () => {
      try {
        await vendorService.updateVendor(vendorId, { notes: 'x'.repeat(256) });
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/255/);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────
  // deleteVendor
  // ──────────────────────────────────────────────────────────────
  describe('deleteVendor', () => {
    let vendorId;

    beforeEach(async () => {
      const res = await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-VENDOR-DELETE', '5656565656']
      );
      vendorId = res.rows[0].id;
    });

    it('should delete a vendor with no products', async () => {
      await vendorService.deleteVendor(vendorId);

      // Verify it's gone
      try {
        await vendorService.getVendorById(vendorId);
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });

    it('should throw 404 for non-existent vendor', async () => {
      try {
        await vendorService.deleteVendor(999999);
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });

    it('should throw 409 when vendor has active (non-archived) products', async () => {
      // Create an active product referencing this vendor
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, vendor_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-VEND-PROD-001', 'Linked Product', 10000, 5000, vendorId, 'available']
      );

      try {
        await vendorService.deleteVendor(vendorId);
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(409);
        expect(err.message).toMatch(/active product/i);
      }
    });

    it('should allow deletion when all referencing products are archived', async () => {
      // Create an archived product referencing this vendor
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, vendor_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-VEND-PROD-002', 'Archived Product', 10000, 5000, vendorId, 'archived']
      );

      await vendorService.deleteVendor(vendorId);

      // Verify it's gone
      try {
        await vendorService.getVendorById(vendorId);
        fail('Expected error');
      } catch (err) {
        expect(err.status).toBe(404);
      }
    });
  });
});
