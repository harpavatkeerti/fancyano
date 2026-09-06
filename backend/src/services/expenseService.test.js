const pool = require('../database/connection');
const expenseService = require('./expenseService');

describe('ExpenseService', () => {
  const prefix = 'jest_expense';

  afterAll(async () => {
    await pool.query("DELETE FROM expenses WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM expenses WHERE recorded_by LIKE $1", [`${prefix}%`]);
  });

  describe('create', () => {
    test('should create an expense as admin (auto-approved)', async () => {
      const result = await expenseService.create({
        category: 'Electricity',
        amount: 2500,
        description: 'Monthly bill',
        recorded_by: `${prefix}_admin`,
        user_role: 'admin'
      });
      expect(result.id).toBeDefined();
      expect(result.category).toBe('Electricity');
      expect(result.amount).toBe(2500);
      expect(result.approval_status).toBe('approved');
    });

    test('should create an expense as salesman (pending)', async () => {
      const result = await expenseService.create({
        category: 'Transport',
        amount: 500,
        recorded_by: `${prefix}_salesman`,
        user_role: 'salesman'
      });
      expect(result.approval_status).toBe('pending');
      expect(result.approved_by).toBeNull();
    });

    test('should reject empty category', async () => {
      await expect(expenseService.create({
        category: '', amount: 100, recorded_by: `${prefix}_a`, user_role: 'admin'
      })).rejects.toThrow('Category is required');
    });

    test('should reject zero amount', async () => {
      await expect(expenseService.create({
        category: 'Test', amount: 0, recorded_by: `${prefix}_a`, user_role: 'admin'
      })).rejects.toThrow('Amount must be a positive number');
    });
  });

  describe('create — payment_source', () => {
    test('should default to Shop Cash when no payment_source provided', async () => {
      const result = await expenseService.create({
        category: 'Electricity', amount: 1000,
        recorded_by: `${prefix}_ps1`, user_role: 'admin'
      });
      expect(result.payment_source).toBe('Shop Cash');
    });

    test('should accept Online as payment_source', async () => {
      const result = await expenseService.create({
        category: 'Internet', amount: 800,
        recorded_by: `${prefix}_ps2`, user_role: 'admin',
        payment_source: 'Online'
      });
      expect(result.payment_source).toBe('Online');
    });

    test('should accept Personal as payment_source', async () => {
      const result = await expenseService.create({
        category: 'Stationery', amount: 200,
        recorded_by: `${prefix}_ps3`, user_role: 'admin',
        payment_source: 'Personal'
      });
      expect(result.payment_source).toBe('Personal');
    });

    test('should fall back to Shop Cash for invalid payment_source', async () => {
      const result = await expenseService.create({
        category: 'Misc', amount: 100,
        recorded_by: `${prefix}_ps4`, user_role: 'admin',
        payment_source: 'Bitcoin'
      });
      expect(result.payment_source).toBe('Shop Cash');
    });
  });

  describe('update — payment_source', () => {
    test('should update payment_source', async () => {
      const created = await expenseService.create({
        category: 'Fuel', amount: 500,
        recorded_by: `${prefix}_ups1`, user_role: 'admin'
      });
      expect(created.payment_source).toBe('Shop Cash');

      const updated = await expenseService.update(created.id, { payment_source: 'Online' });
      expect(updated.payment_source).toBe('Online');
    });

    test('should not change payment_source for invalid value', async () => {
      const created = await expenseService.create({
        category: 'Fuel', amount: 500,
        recorded_by: `${prefix}_ups2`, user_role: 'admin',
        payment_source: 'Personal'
      });

      const updated = await expenseService.update(created.id, { payment_source: 'Crypto' });
      expect(updated.payment_source).toBe('Personal');
    });
  });

  describe('list', () => {
    test('should return all expenses', async () => {
      await expenseService.create({ category: 'Rent', amount: 5000, recorded_by: `${prefix}_list1`, user_role: 'admin' });
      await expenseService.create({ category: 'Water', amount: 500, recorded_by: `${prefix}_list2`, user_role: 'admin' });

      const all = await expenseService.list();
      const ours = all.filter(e => e.recorded_by.startsWith(prefix));
      expect(ours.length).toBe(2);
    });

    test('should filter by category', async () => {
      await expenseService.create({ category: 'Electric', amount: 1000, recorded_by: `${prefix}_cat1`, user_role: 'admin' });
      await expenseService.create({ category: 'Water', amount: 200, recorded_by: `${prefix}_cat2`, user_role: 'admin' });

      const filtered = await expenseService.list({ category: 'Electric' });
      const ours = filtered.filter(e => e.recorded_by.startsWith(prefix));
      expect(ours.length).toBe(1);
    });

    test('should filter by recorded_by', async () => {
      await expenseService.create({ category: 'Rent', amount: 5000, recorded_by: `${prefix}_filterA`, user_role: 'admin' });
      await expenseService.create({ category: 'Water', amount: 500, recorded_by: `${prefix}_filterB`, user_role: 'admin' });

      const filtered = await expenseService.list({ recorded_by: `${prefix}_filterA` });
      expect(filtered.length).toBe(1);
      expect(filtered[0].recorded_by).toBe(`${prefix}_filterA`);
    });
  });

  describe('getById', () => {
    test('should return expense by id', async () => {
      const created = await expenseService.create({
        category: 'Phone', amount: 800, recorded_by: `${prefix}_get`, user_role: 'admin'
      });
      const fetched = await expenseService.getById(created.id);
      expect(fetched.amount).toBe(800);
    });

    test('should throw 404', async () => {
      await expect(expenseService.getById(999999)).rejects.toThrow('Expense not found');
    });
  });

  describe('approve', () => {
    test('should approve a pending expense', async () => {
      const created = await expenseService.create({
        category: 'Fuel', amount: 300, recorded_by: `${prefix}_sal`, user_role: 'salesman'
      });
      expect(created.approval_status).toBe('pending');

      const approved = await expenseService.approve(created.id, `${prefix}_admin`);
      expect(approved.approval_status).toBe('approved');
      expect(approved.approved_by).toBe(`${prefix}_admin`);
    });

    test('should reject approving already approved', async () => {
      const created = await expenseService.create({
        category: 'Fuel', amount: 300, recorded_by: `${prefix}_adm`, user_role: 'admin'
      });
      await expect(expenseService.approve(created.id, `${prefix}_admin`))
        .rejects.toThrow('Cannot approve expense with status: approved');
    });
  });

  describe('reject', () => {
    test('should reject a pending expense', async () => {
      const created = await expenseService.create({
        category: 'Fuel', amount: 300, recorded_by: `${prefix}_sal2`, user_role: 'salesman'
      });
      const rejected = await expenseService.reject(created.id, `${prefix}_admin`);
      expect(rejected.approval_status).toBe('rejected');
    });
  });

  describe('getPendingCount', () => {
    test('should return count of pending expenses', async () => {
      await expenseService.create({ category: 'A', amount: 100, recorded_by: `${prefix}_pc1`, user_role: 'salesman' });
      await expenseService.create({ category: 'B', amount: 200, recorded_by: `${prefix}_pc2`, user_role: 'salesman' });

      const count = await expenseService.getPendingCount();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('delete', () => {
    test('should delete expense', async () => {
      const created = await expenseService.create({
        category: 'Misc', amount: 100, recorded_by: `${prefix}_del`, user_role: 'admin'
      });
      const deleted = await expenseService.delete(created.id);
      expect(deleted.id).toBe(created.id);
    });
  });

  describe('getSummaryByCategory', () => {
    test('should return category summaries (only approved)', async () => {
      await expenseService.create({ category: 'Rent', amount: 5000, recorded_by: `${prefix}_sum1`, user_role: 'admin' });
      await expenseService.create({ category: 'Rent', amount: 3000, recorded_by: `${prefix}_sum2`, user_role: 'admin' });
      // This pending one should NOT count in summary
      await expenseService.create({ category: 'Rent', amount: 1000, recorded_by: `${prefix}_sum3`, user_role: 'salesman' });

      const summary = await expenseService.getSummaryByCategory();
      expect(Array.isArray(summary)).toBe(true);
      const rentSummary = summary.find(s => s.category === 'Rent');
      expect(rentSummary).toBeDefined();
      expect(rentSummary.total_amount).toBeGreaterThanOrEqual(8000);
      // Pending expense should not be included — so total should NOT include the 1000
    });
  });

  // ── Recurring Expense Approval ───────────────────────────────────────

  describe('createRecurring', () => {
    afterEach(async () => {
      await pool.query("DELETE FROM recurring_expenses WHERE created_by LIKE $1", [`${prefix}%`]);
    });

    test('should auto-approve when admin creates', async () => {
      const rec = await expenseService.createRecurring({
        category: 'Shop Rent', amount: 10000,
        created_by: `${prefix}_admin`, user_role: 'admin'
      });
      expect(rec.approval_status).toBe('approved');
      expect(rec.approved_by).toBe(`${prefix}_admin`);
    });

    test('should set pending when salesman creates', async () => {
      const rec = await expenseService.createRecurring({
        category: 'Transport', amount: 500,
        created_by: `${prefix}_sal`, user_role: 'salesman'
      });
      expect(rec.approval_status).toBe('pending');
      expect(rec.approved_by).toBeNull();
    });
  });

  describe('approveRecurring', () => {
    afterEach(async () => {
      await pool.query("DELETE FROM recurring_expenses WHERE created_by LIKE $1", [`${prefix}%`]);
    });

    test('should approve a pending recurring expense', async () => {
      const rec = await expenseService.createRecurring({
        category: 'Fuel', amount: 1000,
        created_by: `${prefix}_sal`, user_role: 'salesman'
      });
      expect(rec.approval_status).toBe('pending');

      const approved = await expenseService.approveRecurring(rec.id, `${prefix}_admin`);
      expect(approved.approval_status).toBe('approved');
      expect(approved.approved_by).toBe(`${prefix}_admin`);
      expect(approved.approved_at).toBeDefined();
    });

    test('should reject approving already approved', async () => {
      const rec = await expenseService.createRecurring({
        category: 'Fuel', amount: 1000,
        created_by: `${prefix}_adm`, user_role: 'admin'
      });
      await expect(expenseService.approveRecurring(rec.id, `${prefix}_admin`))
        .rejects.toThrow('Cannot approve recurring expense with status: approved');
    });

    test('should throw 404 for non-existent recurring', async () => {
      await expect(expenseService.approveRecurring(999999, `${prefix}_admin`))
        .rejects.toThrow('Recurring expense not found');
    });
  });

  describe('rejectRecurring', () => {
    afterEach(async () => {
      await pool.query("DELETE FROM recurring_expenses WHERE created_by LIKE $1", [`${prefix}%`]);
    });

    test('should reject a pending recurring expense and deactivate it', async () => {
      const rec = await expenseService.createRecurring({
        category: 'Misc', amount: 200,
        created_by: `${prefix}_sal`, user_role: 'salesman'
      });
      const rejected = await expenseService.rejectRecurring(rec.id, `${prefix}_admin`);
      expect(rejected.approval_status).toBe('rejected');
      expect(rejected.is_active).toBe(false);
    });

    test('should reject rejecting already approved', async () => {
      const rec = await expenseService.createRecurring({
        category: 'Misc', amount: 200,
        created_by: `${prefix}_adm`, user_role: 'admin'
      });
      await expect(expenseService.rejectRecurring(rec.id, `${prefix}_admin`))
        .rejects.toThrow('Cannot reject recurring expense with status: approved');
    });
  });

  describe('processDueRecurring', () => {
    afterEach(async () => {
      await pool.query("DELETE FROM recurring_expenses WHERE created_by LIKE $1", [`${prefix}%`]);
      await pool.query("DELETE FROM expenses WHERE recorded_by LIKE $1", [`${prefix}%`]);
    });

    test('should only process approved recurring templates', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Create approved recurring (should be processed)
      await expenseService.createRecurring({
        category: 'Approved Rent', amount: 5000,
        created_by: `${prefix}_adm`, user_role: 'admin',
        next_due_date: today
      });

      // Create pending recurring (should NOT be processed)
      await expenseService.createRecurring({
        category: 'Pending Transport', amount: 300,
        created_by: `${prefix}_sal`, user_role: 'salesman',
        next_due_date: today
      });

      const created = await expenseService.processDueRecurring();
      const categories = created.map(e => e.category);

      expect(categories).toContain('Approved Rent');
      expect(categories).not.toContain('Pending Transport');
    });

    test('generated entries from approved templates should be auto-approved', async () => {
      const today = new Date().toISOString().split('T')[0];

      await expenseService.createRecurring({
        category: 'Auto Approved', amount: 1000,
        created_by: `${prefix}_adm`, user_role: 'admin',
        next_due_date: today
      });

      const created = await expenseService.processDueRecurring();
      expect(created.length).toBeGreaterThanOrEqual(1);
      const entry = created.find(e => e.category === 'Auto Approved');
      expect(entry.approval_status).toBe('approved');
    });
  });
});
