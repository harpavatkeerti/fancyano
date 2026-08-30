/**
 * inAppNotificationService.js
 *
 * All database logic for in-app notifications (bell icon alerts).
 * Separate from notificationService.js which handles email/WhatsApp.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

class InAppNotificationService {
  /**
   * Create a new in-app notification.
   * @param {Object} data - { recipient_role, title, message, type, reference_type, reference_id }
   * @returns {Promise<Object>} - Created notification row
   */
  async create({ recipient_role = 'admin', title, message, type = 'info', reference_type, reference_id }) {
    if (!title || !message) {
      const err = new Error('Title and message are required');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `INSERT INTO notifications (recipient_role, title, message, type, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [recipient_role, title.trim(), message.trim(), type, reference_type || null, reference_id || null]
    );
    return result.rows[0];
  }

  /**
   * List notifications for a given role with pagination.
   * @param {Object} filters - { recipient_role, unread_only, limit, offset }
   * @returns {Promise<Array>} - Notification rows
   */
  async list({ recipient_role = 'admin', unread_only = false, limit = 20, offset = 0 } = {}) {
    let query = 'SELECT * FROM notifications WHERE recipient_role = $1';
    const params = [recipient_role];

    if (unread_only) {
      query += ' AND is_read = FALSE';
    }

    query += ' ORDER BY created_at DESC';
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get count of unread notifications for a role.
   * @param {string} recipient_role
   * @returns {Promise<number>} - Unread count
   */
  async getUnreadCount(recipient_role = 'admin') {
    const result = await pool.query(
      'SELECT COUNT(*)::int as count FROM notifications WHERE recipient_role = $1 AND is_read = FALSE',
      [recipient_role]
    );
    return result.rows[0].count;
  }

  /**
   * Mark a single notification as read.
   * @param {number} id
   * @returns {Promise<Object>} - Updated notification row
   */
  async markAsRead(id) {
    const result = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      const err = new Error('Notification not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Mark all notifications as read for a role.
   * @param {string} recipient_role
   * @returns {Promise<number>} - Number of updated rows
   */
  async markAllAsRead(recipient_role = 'admin') {
    const result = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE recipient_role = $1 AND is_read = FALSE',
      [recipient_role]
    );
    return result.rowCount;
  }

  /**
   * Delete a notification.
   * @param {number} id
   * @returns {Promise<Object>} - Deleted notification row
   */
  async delete(id) {
    const result = await pool.query('DELETE FROM notifications WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      const err = new Error('Notification not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }
}

module.exports = new InAppNotificationService();
