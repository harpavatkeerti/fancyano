const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const inAppNotificationService = require('../services/inAppNotificationService');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { role: 'admin', id: 'test-admin', name: 'jest_notif_route_admin' };
  next();
});
app.use('/notifications', require('./notifications'));

describe('Notifications Routes', () => {
  const prefix = 'jest_notif_route';

  afterAll(async () => {
    await pool.query("DELETE FROM notifications WHERE title LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM notifications WHERE title LIKE $1", [`${prefix}%`]);
  });

  describe('GET /notifications', () => {
    test('should list notifications for admin role', async () => {
      await inAppNotificationService.create({ title: `${prefix}_n1`, message: 'm1', recipient_role: 'admin' });
      await inAppNotificationService.create({ title: `${prefix}_n2`, message: 'm2', recipient_role: 'admin' });

      const response = await request(app).get('/notifications');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const ours = response.body.filter(n => n.title.startsWith(prefix));
      expect(ours.length).toBe(2);
    });

    test('should filter unread only', async () => {
      const created = await inAppNotificationService.create({ title: `${prefix}_ur1`, message: 'm', recipient_role: 'admin' });
      await inAppNotificationService.create({ title: `${prefix}_ur2`, message: 'm', recipient_role: 'admin' });
      await inAppNotificationService.markAsRead(created.id);

      const response = await request(app).get('/notifications?unread_only=true');
      expect(response.status).toBe(200);
      const ours = response.body.filter(n => n.title.startsWith(prefix));
      expect(ours.length).toBe(1);
    });
  });

  describe('GET /notifications/unread-count', () => {
    test('should return unread count', async () => {
      await inAppNotificationService.create({ title: `${prefix}_uc1`, message: 'm', recipient_role: 'admin' });

      const response = await request(app).get('/notifications/unread-count');
      expect(response.status).toBe(200);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PUT /notifications/:id/read', () => {
    test('should mark notification as read', async () => {
      const created = await inAppNotificationService.create({ title: `${prefix}_read`, message: 'm', recipient_role: 'admin' });

      const response = await request(app).put(`/notifications/${created.id}/read`);
      expect(response.status).toBe(200);
      expect(response.body.is_read).toBe(true);
    });

    test('should return 404 for non-existent id', async () => {
      const response = await request(app).put('/notifications/999999/read');
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /notifications/read-all', () => {
    test('should mark all admin notifications as read', async () => {
      await inAppNotificationService.create({ title: `${prefix}_ra1`, message: 'm', recipient_role: 'admin' });
      await inAppNotificationService.create({ title: `${prefix}_ra2`, message: 'm', recipient_role: 'admin' });

      const response = await request(app).put('/notifications/read-all');
      expect(response.status).toBe(200);
      expect(response.body.updated).toBeGreaterThanOrEqual(2);
    });
  });
});
