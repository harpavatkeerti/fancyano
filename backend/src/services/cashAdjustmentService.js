/**
 * cashAdjustmentService.js
 *
 * All database logic for cash tally adjustments.
 * These are store-level operational entries, separate from booking payment_transactions.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');
const inAppNotificationService = require('./inAppNotificationService');

class CashAdjustmentService {
  /**
   * Create a new cash adjustment entry.
   * Admin-created adjustments are immediately approved.
   * Salesman-created adjustments start as 'pending' (require admin approval).
   * @param {Object} data - { amount, reason, adjustment_date, recorded_by, user_role }
   * @returns {Promise<Object>} - Created adjustment row
   */
  async create({ amount, reason, adjustment_date, recorded_by, user_role }) {
    if (!amount || amount === 0) {
      const err = new Error('Amount is required and cannot be zero');
      err.status = 400;
      throw err;
    }
    if (!reason || !reason.trim()) {
      const err = new Error('Reason is required');
      err.status = 400;
      throw err;
    }
    if (!recorded_by) {
      const err = new Error('Recorded by is required');
      err.status = 400;
      throw err;
    }

    const approvalStatus = user_role === 'admin' ? 'approved' : 'pending';
    const approvedBy = user_role === 'admin' ? recorded_by : null;
    const approvedAt = user_role === 'admin' ? new Date() : null;

    const result = await pool.query(
      `INSERT INTO cash_adjustments 
         (amount, reason, adjustment_date, approval_status, recorded_by, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        amount,
        reason.trim(),
        adjustment_date || new Date(),
        approvalStatus,
        recorded_by,
        approvedBy,
        approvedAt
      ]
    );
    const row = result.rows[0];

    // Notify admin when a non-admin creates an adjustment
    if (user_role !== 'admin') {
      try {
        await inAppNotificationService.create({
          recipient_role: 'admin',
          title: 'Cash Adjustment Request',
          message: `${recorded_by} submitted a cash adjustment of ₹${Math.abs(amount)} — "${reason.trim()}"`,
          type: 'action_required',
          reference_type: 'cash_adjustment',
          reference_id: row.id
        });
      } catch (notifErr) {
        // Don't fail the adjustment if notification fails
        console.error('Failed to create notification:', notifErr);
      }
    }

    return row;
  }

  /**
   * List all cash adjustments with optional filters.
   * @param {Object} filters - { status, start_date, end_date }
   * @returns {Promise<Array>} - Adjustment rows
   */
  async list({ status, start_date, end_date, recorded_by } = {}) {
    let query = 'SELECT * FROM cash_adjustments WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND approval_status = $${params.length}`;
    }

    if (start_date) {
      params.push(start_date);
      query += ` AND adjustment_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND adjustment_date <= $${params.length}`;
    }

    if (recorded_by) {
      params.push(recorded_by);
      query += ` AND recorded_by = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a single cash adjustment by ID.
   * @param {number} id
   * @returns {Promise<Object>} - Adjustment row
   */
  async getById(id) {
    const result = await pool.query(
      'SELECT * FROM cash_adjustments WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      const err = new Error('Cash adjustment not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Approve a pending cash adjustment.
   * @param {number} id
   * @param {string} approved_by - Admin username
   * @returns {Promise<Object>} - Updated adjustment row
   */
  async approve(id, approved_by) {
    const adjustment = await this.getById(id);

    if (adjustment.approval_status !== 'pending') {
      const err = new Error(`Cannot approve adjustment with status: ${adjustment.approval_status}`);
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `UPDATE cash_adjustments 
       SET approval_status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [approved_by, id]
    );
    await inAppNotificationService.markResolvedByReference('cash_adjustment', id).catch(() => {});
    return result.rows[0];
  }

  /**
   * Reject a pending cash adjustment.
   * @param {number} id
   * @param {string} rejected_by - Admin username
   * @returns {Promise<Object>} - Updated adjustment row
   */
  async reject(id, rejected_by) {
    const adjustment = await this.getById(id);

    if (adjustment.approval_status !== 'pending') {
      const err = new Error(`Cannot reject adjustment with status: ${adjustment.approval_status}`);
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `UPDATE cash_adjustments 
       SET approval_status = 'rejected', approved_by = $1, approved_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [rejected_by, id]
    );
    await inAppNotificationService.markResolvedByReference('cash_adjustment', id).catch(() => {});
    return result.rows[0];
  }

  /**
   * Get count of pending adjustments (for admin notification badge).
   * @returns {Promise<number>} - Count of pending adjustments
   */
  async getPendingCount() {
    const result = await pool.query(
      "SELECT COUNT(*)::int as count FROM cash_adjustments WHERE approval_status = 'pending'"
    );
    return result.rows[0].count;
  }

  /**
   * Get summary for a date range (total surplus, total shortage, net).
   * Only includes approved adjustments.
   * @param {Object} filters - { start_date, end_date }
   * @returns {Promise<Object>} - { total_surplus, total_shortage, net, count }
   */
  async getSummary({ start_date, end_date } = {}) {
    let query = `
      SELECT 
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::int as total_surplus,
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)::int as total_shortage,
        COALESCE(SUM(amount), 0)::int as net,
        COUNT(*)::int as count
      FROM cash_adjustments
      WHERE approval_status = 'approved'
    `;
    const params = [];

    if (start_date) {
      params.push(start_date);
      query += ` AND adjustment_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND adjustment_date <= $${params.length}`;
    }

    const result = await pool.query(query, params);
    return result.rows[0];
  }
}

module.exports = new CashAdjustmentService();
