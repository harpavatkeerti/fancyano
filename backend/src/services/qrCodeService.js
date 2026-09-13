/**
 * qrCodeService.js
 *
 * All database logic for QR code management.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

class QrCodeService {
  /**
   * Create a new QR code.
   * @param {Object} data - { qr_type, name, bank_account_id, qr_image }
   * @returns {Promise<Object>} - Created QR code row
   */
  async create({ qr_type, name, bank_account_id, qr_image }) {
    if (!qr_type || !['rent', 'security'].includes(qr_type)) {
      const err = new Error('QR type must be "rent" or "security"');
      err.status = 400;
      throw err;
    }
    if (!name || !name.trim()) {
      const err = new Error('Name is required');
      err.status = 400;
      throw err;
    }
    if (!bank_account_id) {
      const err = new Error('Bank account is required');
      err.status = 400;
      throw err;
    }
    if (!qr_image) {
      const err = new Error('QR image is required');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `INSERT INTO qr_codes (qr_type, name, bank_account_id, qr_image)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [qr_type, name.trim(), bank_account_id, qr_image]
    );
    return result.rows[0];
  }

  /**
   * List all QR codes with bank account info.
   * @param {Object} filters - { qr_type, active_only }
   * @returns {Promise<Array>} - QR code rows with bank account name
   */
  async list({ qr_type, active_only = false } = {}) {
    let query = `
      SELECT 
        qr.*,
        ba.account_name as bank_account_name
      FROM qr_codes qr
      JOIN bank_accounts ba ON qr.bank_account_id = ba.id
      WHERE 1=1
    `;
    const params = [];

    if (qr_type) {
      params.push(qr_type);
      query += ` AND qr.qr_type = $${params.length}`;
    }

    if (active_only) {
      query += ' AND qr.is_active = TRUE';
    }

    query += ' ORDER BY qr.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a single QR code by ID.
   * @param {number} id
   * @returns {Promise<Object>} - QR code row
   */
  async getById(id) {
    const result = await pool.query(
      `SELECT qr.*, ba.account_name as bank_account_name
       FROM qr_codes qr
       JOIN bank_accounts ba ON qr.bank_account_id = ba.id
       WHERE qr.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      const err = new Error('QR code not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Activate a QR code (deactivates others of the same type).
   * Only one QR can be active per type at a time.
   * @param {number} id
   * @returns {Promise<Object>} - Activated QR code row
   */
  async activate(id) {
    const qr = await this.getById(id);

    // Deactivate all other QR codes of the same type
    await pool.query(
      `UPDATE qr_codes 
       SET is_active = FALSE, deactivated_at = CURRENT_TIMESTAMP 
       WHERE qr_type = $1 AND is_active = TRUE AND id != $2`,
      [qr.qr_type, id]
    );

    // Activate this one
    const result = await pool.query(
      `UPDATE qr_codes 
       SET is_active = TRUE, activated_at = CURRENT_TIMESTAMP, deactivated_at = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  /**
   * Deactivate a QR code.
   * @param {number} id
   * @returns {Promise<Object>} - Deactivated QR code row
   */
  async deactivate(id) {
    await this.getById(id);

    const result = await pool.query(
      `UPDATE qr_codes 
       SET is_active = FALSE, deactivated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  /**
   * Delete a QR code (only if no transactions reference it).
   * @param {number} id
   * @returns {Promise<Object>} - Deleted QR code row
   */
  async delete(id) {
    // Check for linked transactions
    const txCheck = await pool.query(
      'SELECT COUNT(*)::int as count FROM payment_transactions WHERE qr_code_id = $1',
      [id]
    );
    if (txCheck.rows[0].count > 0) {
      const err = new Error('Cannot delete QR code with linked transactions. Deactivate it instead.');
      err.status = 400;
      throw err;
    }

    const result = await pool.query('DELETE FROM qr_codes WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      const err = new Error('QR code not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Get the currently active QR code for a type.
   * @param {string} qr_type - 'rent' or 'security'
   * @returns {Promise<Object|null>} - Active QR code or null
   */
  async getActive(qr_type) {
    const result = await pool.query(
      `SELECT qr.*, ba.account_name as bank_account_name
       FROM qr_codes qr
       JOIN bank_accounts ba ON qr.bank_account_id = ba.id
       WHERE qr.qr_type = $1 AND qr.is_active = TRUE`,
      [qr_type]
    );
    return result.rows[0] || null;
  }
}

module.exports = new QrCodeService();
