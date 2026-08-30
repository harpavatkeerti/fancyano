/**
 * purchaseService.js
 *
 * All database logic for purchase/procurement tracking.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

class PurchaseService {
  /**
   * Create a new purchase entry.
   * @param {Object} data - { vendor_name, item_description, amount, purchase_date, receipt_image, notes, recorded_by }
   * @returns {Promise<Object>} - Created purchase row
   */
  async create({ vendor_name, item_description, amount, purchase_date, receipt_image, notes, recorded_by }) {
    if (!vendor_name || !vendor_name.trim()) {
      const err = new Error('Vendor name is required');
      err.status = 400;
      throw err;
    }
    if (!item_description || !item_description.trim()) {
      const err = new Error('Item description is required');
      err.status = 400;
      throw err;
    }
    if (!amount || amount <= 0) {
      const err = new Error('Amount must be a positive number');
      err.status = 400;
      throw err;
    }
    if (!recorded_by) {
      const err = new Error('Recorded by is required');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `INSERT INTO purchases 
         (vendor_name, item_description, amount, purchase_date, receipt_image, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        vendor_name.trim(),
        item_description.trim(),
        amount,
        purchase_date || new Date(),
        receipt_image || null,
        notes?.trim() || null,
        recorded_by
      ]
    );
    return result.rows[0];
  }

  /**
   * List purchases with optional filters.
   * @param {Object} filters - { vendor_name, start_date, end_date }
   * @returns {Promise<Array>} - Purchase rows
   */
  async list({ vendor_name, start_date, end_date } = {}) {
    let query = 'SELECT * FROM purchases WHERE 1=1';
    const params = [];

    if (vendor_name) {
      params.push(`%${vendor_name}%`);
      query += ` AND vendor_name ILIKE $${params.length}`;
    }

    if (start_date) {
      params.push(start_date);
      query += ` AND purchase_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND purchase_date <= $${params.length}`;
    }

    query += ' ORDER BY purchase_date DESC, created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a single purchase by ID.
   * @param {number} id
   * @returns {Promise<Object>} - Purchase row
   */
  async getById(id) {
    const result = await pool.query('SELECT * FROM purchases WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      const err = new Error('Purchase not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Update a purchase.
   * @param {number} id
   * @param {Object} data
   * @returns {Promise<Object>} - Updated purchase row
   */
  async update(id, { vendor_name, item_description, amount, purchase_date, receipt_image, notes }) {
    await this.getById(id);

    const result = await pool.query(
      `UPDATE purchases 
       SET vendor_name = COALESCE($1, vendor_name),
           item_description = COALESCE($2, item_description),
           amount = COALESCE($3, amount),
           purchase_date = COALESCE($4, purchase_date),
           receipt_image = COALESCE($5, receipt_image),
           notes = COALESCE($6, notes)
       WHERE id = $7
       RETURNING *`,
      [vendor_name, item_description, amount, purchase_date, receipt_image, notes, id]
    );
    return result.rows[0];
  }

  /**
   * Delete a purchase.
   * @param {number} id
   * @returns {Promise<Object>} - Deleted purchase row
   */
  async delete(id) {
    const result = await pool.query('DELETE FROM purchases WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      const err = new Error('Purchase not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Get purchase summary grouped by vendor.
   * @param {Object} filters - { start_date, end_date }
   * @returns {Promise<Array>} - { vendor_name, total_amount, count }
   */
  async getSummaryByVendor({ start_date, end_date } = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (start_date) {
      params.push(start_date);
      whereClause += ` AND purchase_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      whereClause += ` AND purchase_date <= $${params.length}`;
    }

    const query = `
      SELECT 
        vendor_name,
        COALESCE(SUM(amount), 0)::int as total_amount,
        COUNT(*)::int as count
      FROM purchases
      ${whereClause}
      GROUP BY vendor_name
      ORDER BY total_amount DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }
}

module.exports = new PurchaseService();
