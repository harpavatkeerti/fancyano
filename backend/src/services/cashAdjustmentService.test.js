const pool = require('../database/connection');
const cashAdjustmentService = require('./cashAdjustmentService');

describe('CashAdjustmentService', () => {
  const testPrefix = 'jest_cash_adj';

  afterAll(async () => {
    await pool.query("DELETE FROM cash_adjustments WHERE recorded_by LIKE $1", [`${testPrefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM cash_adjustments WHERE recorded_by LIKE $1", [`${testPrefix}%`]);
  });

  describe('create', () => {
    test('should create an approved adjustment for admin', async () => {
      const result = await cashAdjustmentService.create({
        amount: 500,
        reason: 'Cash surplus found',
        recorded_by: `${testPrefix}_admin`,
        user_role: 'admin'
      });

      expect(result.id).toBeDefined();
      expect(result.amount).toBe(500);
      expect(result.reason).toBe('Cash surplus found');
      expect(result.approval_status).toBe('approved');
      expect(result.approved_by).toBe(`${testPrefix}_admin`);
    });

    test('should create a pending adjustment for salesman', async () => {
      const result = await cashAdjustmentService.create({
        amount: -200,
        reason: 'Cash shortage at closing',
        recorded_by: `${testPrefix}_salesman`,
        user_role: 'salesman'
      });

      expect(result.approval_status).toBe('pending');
      expect(result.approved_by).toBeNull();
    });

    test('should reject zero amount', async () => {
      await expect(cashAdjustmentService.create({
        amount: 0,
        reason: 'test',
        recorded_by: `${testPrefix}_admin`,
        user_role: 'admin'
      })).rejects.toThrow('Amount is required and cannot be zero');
    });

    test('should reject empty reason', async () => {
      await expect(cashAdjustmentService.create({
        amount: 100,
        reason: '  ',
        recorded_by: `${testPrefix}_admin`,
        user_role: 'admin'
      })).rejects.toThrow('Reason is required');
    });

    test('should reject missing recorded_by', async () => {
      await expect(cashAdjustmentService.create({
        amount: 100,
        reason: 'test',
        user_role: 'admin'
      })).rejects.toThrow('Recorded by is required');
    });
  });

  describe('list', () => {
    test('should return all adjustments', async () => {
      await cashAdjustmentService.create({
        amount: 100,
        reason: 'Surplus',
        recorded_by: `${testPrefix}_user1`,
        user_role: 'admin'
      });
      await cashAdjustmentService.create({
        amount: -50,
        reason: 'Shortage',
        recorded_by: `${testPrefix}_user2`,
        user_role: 'salesman'
      });

      const all = await cashAdjustmentService.list();
      const ours = all.filter(a => a.recorded_by.startsWith(testPrefix));
      expect(ours.length).toBe(2);
    });

    test('should filter by approval status', async () => {
      await cashAdjustmentService.create({
        amount: 100,
        reason: 'Approved one',
        recorded_by: `${testPrefix}_admin1`,
        user_role: 'admin'
      });
      await cashAdjustmentService.create({
        amount: -50,
        reason: 'Pending one',
        recorded_by: `${testPrefix}_salesman1`,
        user_role: 'salesman'
      });

      const pending = await cashAdjustmentService.list({ status: 'pending' });
      const ourPending = pending.filter(a => a.recorded_by.startsWith(testPrefix));
      expect(ourPending.length).toBe(1);
      expect(ourPending[0].reason).toBe('Pending one');
    });
  });

  describe('getById', () => {
    test('should return adjustment by id', async () => {
      const created = await cashAdjustmentService.create({
        amount: 300,
        reason: 'Test get',
        recorded_by: `${testPrefix}_get`,
        user_role: 'admin'
      });

      const fetched = await cashAdjustmentService.getById(created.id);
      expect(fetched.amount).toBe(300);
    });

    test('should throw 404 for non-existent id', async () => {
      await expect(cashAdjustmentService.getById(999999)).rejects.toThrow('Cash adjustment not found');
    });
  });

  describe('approve', () => {
    test('should approve a pending adjustment', async () => {
      const created = await cashAdjustmentService.create({
        amount: -100,
        reason: 'Needs approval',
        recorded_by: `${testPrefix}_salesman_appr`,
        user_role: 'salesman'
      });

      expect(created.approval_status).toBe('pending');

      const approved = await cashAdjustmentService.approve(created.id, `${testPrefix}_admin_appr`);
      expect(approved.approval_status).toBe('approved');
      expect(approved.approved_by).toBe(`${testPrefix}_admin_appr`);
      expect(approved.approved_at).not.toBeNull();
    });

    test('should reject approving an already approved adjustment', async () => {
      const created = await cashAdjustmentService.create({
        amount: 100,
        reason: 'Already approved',
        recorded_by: `${testPrefix}_admin_already`,
        user_role: 'admin'
      });

      await expect(
        cashAdjustmentService.approve(created.id, `${testPrefix}_admin2`)
      ).rejects.toThrow('Cannot approve adjustment with status: approved');
    });
  });

  describe('reject', () => {
    test('should reject a pending adjustment', async () => {
      const created = await cashAdjustmentService.create({
        amount: -50,
        reason: 'Needs rejection',
        recorded_by: `${testPrefix}_salesman_rej`,
        user_role: 'salesman'
      });

      const rejected = await cashAdjustmentService.reject(created.id, `${testPrefix}_admin_rej`);
      expect(rejected.approval_status).toBe('rejected');
      expect(rejected.approved_by).toBe(`${testPrefix}_admin_rej`);
    });

    test('should reject rejecting an approved adjustment', async () => {
      const created = await cashAdjustmentService.create({
        amount: 100,
        reason: 'Cannot reject this',
        recorded_by: `${testPrefix}_admin_cantrej`,
        user_role: 'admin'
      });

      await expect(
        cashAdjustmentService.reject(created.id, `${testPrefix}_admin3`)
      ).rejects.toThrow('Cannot reject adjustment with status: approved');
    });
  });

  describe('getPendingCount', () => {
    test('should return count of pending adjustments', async () => {
      await cashAdjustmentService.create({
        amount: 100,
        reason: 'Approved',
        recorded_by: `${testPrefix}_count_admin`,
        user_role: 'admin'
      });
      await cashAdjustmentService.create({
        amount: -50,
        reason: 'Pending 1',
        recorded_by: `${testPrefix}_count_sales1`,
        user_role: 'salesman'
      });
      await cashAdjustmentService.create({
        amount: -30,
        reason: 'Pending 2',
        recorded_by: `${testPrefix}_count_sales2`,
        user_role: 'salesman'
      });

      const count = await cashAdjustmentService.getPendingCount();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getSummary', () => {
    test('should return summary of approved adjustments', async () => {
      await cashAdjustmentService.create({
        amount: 500,
        reason: 'Surplus',
        recorded_by: `${testPrefix}_sum_admin1`,
        user_role: 'admin'
      });
      await cashAdjustmentService.create({
        amount: -200,
        reason: 'Shortage - auto approved for admin',
        recorded_by: `${testPrefix}_sum_admin2`,
        user_role: 'admin'
      });
      // Pending — should NOT be included in summary
      await cashAdjustmentService.create({
        amount: 1000,
        reason: 'Pending surplus',
        recorded_by: `${testPrefix}_sum_sales`,
        user_role: 'salesman'
      });

      const summary = await cashAdjustmentService.getSummary();
      // At minimum: 500 surplus, 200 shortage from our test data
      expect(summary.total_surplus).toBeGreaterThanOrEqual(500);
      expect(summary.total_shortage).toBeGreaterThanOrEqual(200);
      expect(summary.net).toBeDefined();
    });
  });
});
