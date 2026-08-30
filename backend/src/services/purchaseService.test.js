const pool = require('../database/connection');
const purchaseService = require('./purchaseService');

describe('PurchaseService', () => {
  const prefix = 'jest_purchase';

  afterAll(async () => {
    await pool.query("DELETE FROM purchases WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM purchases WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  describe('create', () => {
    test('should create a purchase', async () => {
      const result = await purchaseService.create({
        vendor_name: 'Test Vendor',
        item_description: 'Test items',
        amount: 10000,
        recorded_by: `${prefix}_admin`
      });
      expect(result.id).toBeDefined();
      expect(result.vendor_name).toBe('Test Vendor');
      expect(result.amount).toBe(10000);
    });

    test('should reject empty vendor name', async () => {
      await expect(purchaseService.create({
        vendor_name: '', item_description: 'test', amount: 100, recorded_by: `${prefix}_a`
      })).rejects.toThrow('Vendor name is required');
    });

    test('should reject zero amount', async () => {
      await expect(purchaseService.create({
        vendor_name: 'V', item_description: 'test', amount: 0, recorded_by: `${prefix}_a`
      })).rejects.toThrow('Amount must be a positive number');
    });
  });

  describe('list', () => {
    test('should return purchases with vendor filter', async () => {
      await purchaseService.create({
        vendor_name: 'Acme Corp', item_description: 'Widgets', amount: 5000, recorded_by: `${prefix}_l1`
      });
      await purchaseService.create({
        vendor_name: 'Beta Inc', item_description: 'Gizmos', amount: 3000, recorded_by: `${prefix}_l2`
      });

      const filtered = await purchaseService.list({ vendor_name: 'Acme' });
      const ours = filtered.filter(p => p.recorded_by.startsWith(prefix));
      expect(ours.length).toBe(1);
      expect(ours[0].vendor_name).toBe('Acme Corp');
    });
  });

  describe('getById', () => {
    test('should return purchase by id', async () => {
      const created = await purchaseService.create({
        vendor_name: 'TestV', item_description: 'Test', amount: 1000, recorded_by: `${prefix}_get`
      });
      const fetched = await purchaseService.getById(created.id);
      expect(fetched.amount).toBe(1000);
    });

    test('should throw 404', async () => {
      await expect(purchaseService.getById(999999)).rejects.toThrow('Purchase not found');
    });
  });

  describe('delete', () => {
    test('should delete purchase', async () => {
      const created = await purchaseService.create({
        vendor_name: 'DelV', item_description: 'Del', amount: 100, recorded_by: `${prefix}_del`
      });
      const deleted = await purchaseService.delete(created.id);
      expect(deleted.id).toBe(created.id);
    });
  });

  describe('getSummaryByVendor', () => {
    test('should return vendor summaries', async () => {
      await purchaseService.create({
        vendor_name: 'VendorA', item_description: 'Item 1', amount: 5000, recorded_by: `${prefix}_sv1`
      });
      await purchaseService.create({
        vendor_name: 'VendorA', item_description: 'Item 2', amount: 3000, recorded_by: `${prefix}_sv2`
      });

      const summary = await purchaseService.getSummaryByVendor();
      const vendorA = summary.find(s => s.vendor_name === 'VendorA');
      expect(vendorA).toBeDefined();
      expect(vendorA.total_amount).toBeGreaterThanOrEqual(8000);
      expect(vendorA.count).toBeGreaterThanOrEqual(2);
    });
  });
});
