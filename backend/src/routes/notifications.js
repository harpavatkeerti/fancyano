/**
 * notifications.js — Route handlers for in-app notifications (bell icon).
 *
 * All business logic lives in inAppNotificationService.js.
 */

const express = require('express');
const router = express.Router();
const inAppNotificationService = require('../services/inAppNotificationService');

// GET /notifications — List notifications for the current user's role
router.get('/', async (req, res) => {
  try {
    const { unread_only, limit, offset } = req.query;
    const notifications = await inAppNotificationService.list({
      recipient_role: req.user.role,
      unread_only: unread_only === 'true',
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0
    });
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /notifications/unread-count — Get unread notification count
router.get('/unread-count', async (req, res) => {
  try {
    const count = await inAppNotificationService.getUnreadCount(req.user.role);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// PUT /notifications/:id/read — Mark a notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const notification = await inAppNotificationService.markAsRead(parseInt(req.params.id));
    res.json(notification);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// PUT /notifications/read-all — Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    const count = await inAppNotificationService.markAllAsRead(req.user.role);
    res.json({ updated: count });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

module.exports = router;
