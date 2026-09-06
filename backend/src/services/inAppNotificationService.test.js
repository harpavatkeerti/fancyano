const pool = require('../database/connection');
const inAppNotificationService = require('./inAppNotificationService');

describe('InAppNotificationService', () => {
  const prefix = 'jest_notif';

  afterAll(async () => {
    await pool.query("DELETE FROM notifications WHERE title LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM notifications WHERE title LIKE $1", [`${prefix}%`]);
  });

  describe('create', () => {
    test('should create a notification', async () => {
      const result = await inAppNotificationService.create({
        recipient_role: 'admin',
        title: `${prefix}_new`,
        message: 'Test notification message',
        type: 'info'
      });
      expect(result.id).toBeDefined();
      expect(result.title).toBe(`${prefix}_new`);
      expect(result.is_read).toBe(false);
    });

    test('should reject missing title', async () => {
      await expect(inAppNotificationService.create({
        title: '', message: 'msg'
      })).rejects.toThrow('Title and message are required');
    });

    test('should reject missing message', async () => {
      await expect(inAppNotificationService.create({
        title: 'title', message: ''
      })).rejects.toThrow('Title and message are required');
    });

    test('should store reference_type and reference_id', async () => {
      const result = await inAppNotificationService.create({
        title: `${prefix}_ref`,
        message: 'With reference',
        type: 'action_required',
        reference_type: 'cash_adjustment',
        reference_id: 123
      });
      expect(result.reference_type).toBe('cash_adjustment');
      expect(result.reference_id).toBe(123);
    });
  });

  describe('list', () => {
    test('should return notifications for a role', async () => {
      await inAppNotificationService.create({ title: `${prefix}_l1`, message: 'msg1', recipient_role: 'admin' });
      await inAppNotificationService.create({ title: `${prefix}_l2`, message: 'msg2', recipient_role: 'admin' });

      const all = await inAppNotificationService.list({ recipient_role: 'admin' });
      const ours = all.filter(n => n.title.startsWith(prefix));
      expect(ours.length).toBe(2);
    });

    test('should filter unread only', async () => {
      const created = await inAppNotificationService.create({ title: `${prefix}_ur1`, message: 'm', recipient_role: 'admin' });
      await inAppNotificationService.create({ title: `${prefix}_ur2`, message: 'm', recipient_role: 'admin' });
      await inAppNotificationService.markAsRead(created.id);

      const unread = await inAppNotificationService.list({ recipient_role: 'admin', unread_only: true });
      const ours = unread.filter(n => n.title.startsWith(prefix));
      expect(ours.length).toBe(1);
      expect(ours[0].title).toBe(`${prefix}_ur2`);
    });
  });

  describe('getUnreadCount', () => {
    test('should return unread count', async () => {
      await inAppNotificationService.create({ title: `${prefix}_uc1`, message: 'm', recipient_role: 'admin' });
      await inAppNotificationService.create({ title: `${prefix}_uc2`, message: 'm', recipient_role: 'admin' });

      const count = await inAppNotificationService.getUnreadCount('admin');
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('markAsRead', () => {
    test('should mark notification as read', async () => {
      const created = await inAppNotificationService.create({ title: `${prefix}_mr`, message: 'm' });
      expect(created.is_read).toBe(false);

      const updated = await inAppNotificationService.markAsRead(created.id);
      expect(updated.is_read).toBe(true);
    });

    test('should throw 404 for non-existent id', async () => {
      await expect(inAppNotificationService.markAsRead(999999))
        .rejects.toThrow('Notification not found');
    });
  });

  describe('markAllAsRead', () => {
    test('should mark all notifications as read for a role', async () => {
      await inAppNotificationService.create({ title: `${prefix}_mar1`, message: 'm', recipient_role: 'admin' });
      await inAppNotificationService.create({ title: `${prefix}_mar2`, message: 'm', recipient_role: 'admin' });

      const updatedCount = await inAppNotificationService.markAllAsRead('admin');
      expect(updatedCount).toBeGreaterThanOrEqual(2);

      const unread = await inAppNotificationService.getUnreadCount('admin');
      expect(unread).toBe(0);
    });
  });

  describe('delete', () => {
    test('should delete notification', async () => {
      const created = await inAppNotificationService.create({ title: `${prefix}_del`, message: 'm' });
      const deleted = await inAppNotificationService.delete(created.id);
      expect(deleted.id).toBe(created.id);
    });

    test('should throw 404 for non-existent id', async () => {
      await expect(inAppNotificationService.delete(999999))
        .rejects.toThrow('Notification not found');
    });
  });

  describe('markResolvedByReference', () => {
    test('should resolve action_required notifications matching reference', async () => {
      const notif = await inAppNotificationService.create({
        title: `${prefix}_resolve1`,
        message: 'Expense pending',
        type: 'action_required',
        recipient_role: 'admin',
        reference_type: 'expense',
        reference_id: 99901
      });
      expect(notif.type).toBe('action_required');
      expect(notif.is_read).toBe(false);

      const count = await inAppNotificationService.markResolvedByReference('expense', 99901);
      expect(count).toBeGreaterThanOrEqual(1);

      // Verify the notification is now resolved and read
      const all = await inAppNotificationService.list({ recipient_role: 'admin' });
      const resolved = all.find(n => n.id === notif.id);
      expect(resolved.type).toBe('resolved');
      expect(resolved.is_read).toBe(true);
    });

    test('should not touch notifications with different type', async () => {
      const notif = await inAppNotificationService.create({
        title: `${prefix}_resolve2`,
        message: 'Info notification',
        type: 'info',
        recipient_role: 'admin',
        reference_type: 'expense',
        reference_id: 99902
      });

      const count = await inAppNotificationService.markResolvedByReference('expense', 99902);
      expect(count).toBe(0);

      // Verify info notification unchanged
      const all = await inAppNotificationService.list({ recipient_role: 'admin' });
      const unchanged = all.find(n => n.id === notif.id);
      expect(unchanged.type).toBe('info');
    });

    test('should return 0 for non-existent reference', async () => {
      const count = await inAppNotificationService.markResolvedByReference('expense', 999999);
      expect(count).toBe(0);
    });

    test('should not affect notifications for different reference_type', async () => {
      await inAppNotificationService.create({
        title: `${prefix}_resolve3`,
        message: 'Cash adjustment pending',
        type: 'action_required',
        recipient_role: 'admin',
        reference_type: 'cash_adjustment',
        reference_id: 99903
      });

      // Resolve for 'expense' with same reference_id — should NOT match
      const count = await inAppNotificationService.markResolvedByReference('expense', 99903);
      expect(count).toBe(0);
    });

    test('expense approve should auto-resolve its notification (integration)', async () => {
      const expenseService = require('./expenseService');

      // Create a pending expense as salesman (triggers notification)
      const expense = await expenseService.create({
        category: 'Integration Test',
        amount: 100,
        recorded_by: `${prefix}_integration`,
        user_role: 'salesman'
      });

      // Verify notification was created
      const before = await inAppNotificationService.list({ recipient_role: 'admin' });
      const actionNotif = before.find(n =>
        n.reference_type === 'expense' && n.reference_id === expense.id && n.type === 'action_required'
      );
      expect(actionNotif).toBeDefined();

      // Admin approves the expense
      await expenseService.approve(expense.id, `${prefix}_admin`);

      // Verify notification is now resolved
      const after = await inAppNotificationService.list({ recipient_role: 'admin' });
      const resolvedNotif = after.find(n => n.id === actionNotif.id);
      expect(resolvedNotif.type).toBe('resolved');
      expect(resolvedNotif.is_read).toBe(true);

      // Cleanup
      await pool.query("DELETE FROM expenses WHERE recorded_by = $1", [`${prefix}_integration`]);
    });
  });
});
