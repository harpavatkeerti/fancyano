/**
 * bankAccountService.js
 *
 * All database logic for bank accounts (powers QR code dropdown).
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

class BankAccountService {
  /**
   * Create a new bank account.
   * @param {Object} data - { account_name }
   * @returns {Promise<Object>} - Created bank account row
   */
  async create({ account_name }) {
    if (!account_name || !account_name.trim()) {
      const err = new Error('Account name is required');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `INSERT INTO bank_accounts (account_name) VALUES ($1) RETURNING *`,
      [account_name.trim()]
    );
    return result.rows[0];
  }

  /**
   * List all bank accounts.
   * @param {Object} filters - { active_only }
   * @returns {Promise<Array>} - Bank account rows with linked QR count
   */
  async list({ active_only = false } = {}) {
    let query = `
      SELECT 
        ba.*,
        COUNT(qr.id)::int as qr_code_count
      FROM bank_accounts ba
      LEFT JOIN qr_codes qr ON qr.bank_account_id = ba.id
    `;

    if (active_only) {
      query += ' WHERE ba.is_active = TRUE';
    }

    query += ' GROUP BY ba.id ORDER BY ba.account_name';

    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Get a single bank account by ID.
   * @param {number} id
   * @returns {Promise<Object>} - Bank account row
   */
  async getById(id) {
    const result = await pool.query('SELECT * FROM bank_accounts WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      const err = new Error('Bank account not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Update a bank account.
   * @param {number} id
   * @param {Object} data - { account_name, is_active }
   * @returns {Promise<Object>} - Updated bank account row
   */
  async update(id, { account_name, is_active }) {
    await this.getById(id);

    const result = await pool.query(
      `UPDATE bank_accounts 
       SET account_name = COALESCE($1, account_name),
           is_active = COALESCE($2, is_active)
       WHERE id = $3
       RETURNING *`,
      [account_name, is_active, id]
    );
    return result.rows[0];
  }

  /**
   * Delete a bank account (only if no QR codes are linked).
   * @param {number} id
   * @returns {Promise<Object>} - Deleted bank account row
   */
  async delete(id) {
    // Check for linked QR codes
    const qrCheck = await pool.query(
      'SELECT COUNT(*)::int as count FROM qr_codes WHERE bank_account_id = $1',
      [id]
    );
    if (qrCheck.rows[0].count > 0) {
      const err = new Error('Cannot delete bank account with linked QR codes. Deactivate it instead.');
      err.status = 400;
      throw err;
    }

    const result = await pool.query('DELETE FROM bank_accounts WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      const err = new Error('Bank account not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }
}

module.exports = new BankAccountService();
