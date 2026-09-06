/**
 * transporterService.js
 *
 * All database logic for the transporters resource.
 * Route handlers must NOT import pool directly — delegate here instead.
 *
 * Pattern: mirrors vendorService.js
 */

const pool = require('../database/connection');
const { validatePhoneLength, validateBusNumber } = require('../utils/phoneUtils');

class TransporterService {
  /**
   * List all non-deleted transporters with optional search filter.
   * @param {Object} filters - { search }
   * @returns {Promise<Array>} - List of transporters
   */
  async listTransporters(filters = {}) {
    const { search } = filters;
    let query = 'SELECT * FROM transporters WHERE is_deleted = FALSE';
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY name ASC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Search transporters by name (autocomplete for booking form).
   * Requires at least 2 characters.
   * @param {string} query - Search query
   * @returns {Promise<Array>} - Top 10 matching transporters
   */
  async searchTransporters(query) {
    if (!query || query.trim().length < 2) {
      const err = new Error('Search query must be at least 2 characters');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `SELECT * FROM transporters
       WHERE is_deleted = FALSE AND (name ILIKE $1 OR phone ILIKE $1)
       ORDER BY name ASC
       LIMIT 10`,
      [`%${query.trim()}%`]
    );

    return result.rows;
  }

  /**
   * Get a single transporter by ID.
   * @param {number} transporterId
   * @returns {Promise<Object>} - Transporter details
   */
  async getTransporterById(transporterId) {
    const result = await pool.query('SELECT * FROM transporters WHERE id = $1', [transporterId]);

    if (result.rows.length === 0) {
      const err = new Error('Transporter not found');
      err.status = 404;
      throw err;
    }

    return result.rows[0];
  }

  /**
   * Create a new transporter.
   * Validates: name and phone are required.
   * @param {Object} data - { name, phone, phone_country?, bus_no?, notes? }
   * @returns {Promise<Object>} - Created transporter
   */
  async createTransporter(data) {
    const { name, phone, phone_country = 'IN', bus_no, notes } = data;

    // Validation — service layer is authoritative
    if (!name || !name.trim()) {
      const err = new Error('Transporter name is required');
      err.status = 400;
      throw err;
    }
    if (!phone || !phone.trim()) {
      const err = new Error('Transporter phone is required');
      err.status = 400;
      throw err;
    }

    // Validate phone number length against country rules
    const phoneErr = validatePhoneLength(phone, phone_country);
    if (phoneErr) {
      const err = new Error(phoneErr);
      err.status = 400;
      throw err;
    }

    // Validate notes length
    if (notes && notes.length > 255) {
      const err = new Error('Notes must be 255 characters or less');
      err.status = 400;
      throw err;
    }

    // Validate bus number format
    if (bus_no) {
      const busErr = validateBusNumber(bus_no);
      if (busErr) {
        const err = new Error(busErr);
        err.status = 400;
        throw err;
      }
    }

    const result = await pool.query(
      `INSERT INTO transporters (name, phone, phone_country, bus_no, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), phone.trim(), phone_country, bus_no || null, notes || null]
    );

    return result.rows[0];
  }

  /**
   * Update an existing transporter.
   * @param {number} transporterId
   * @param {Object} data - Fields to update
   * @returns {Promise<Object>} - Updated transporter
   */
  async updateTransporter(transporterId, data) {
    const { name, phone, phone_country, bus_no, notes } = data;

    // Phone length validation (if being updated)
    if (phone !== undefined && phone !== null && phone !== '') {
      const resolvedCountry = phone_country || 'IN';
      const phoneErr = validatePhoneLength(phone, resolvedCountry);
      if (phoneErr) {
        const err = new Error(phoneErr);
        err.status = 400;
        throw err;
      }
    }

    // Validate notes length
    if (notes !== undefined && notes !== null && notes.length > 255) {
      const err = new Error('Notes must be 255 characters or less');
      err.status = 400;
      throw err;
    }

    // Validate bus number format (if being updated)
    if (bus_no !== undefined && bus_no !== null && bus_no !== '') {
      const busErr = validateBusNumber(bus_no);
      if (busErr) {
        const err = new Error(busErr);
        err.status = 400;
        throw err;
      }
    }

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (name !== undefined) { paramCount++; updates.push(`name = $${paramCount}`); values.push(name.trim()); }
    if (phone !== undefined) { paramCount++; updates.push(`phone = $${paramCount}`); values.push(phone.trim()); }
    if (phone_country !== undefined) { paramCount++; updates.push(`phone_country = $${paramCount}`); values.push(phone_country); }
    if (bus_no !== undefined) { paramCount++; updates.push(`bus_no = $${paramCount}`); values.push(bus_no || null); }
    if (notes !== undefined) { paramCount++; updates.push(`notes = $${paramCount}`); values.push(notes || null); }

    if (updates.length === 0) {
      const err = new Error('No updatable fields provided');
      err.status = 400;
      throw err;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    values.push(transporterId);

    const result = await pool.query(
      `UPDATE transporters SET ${updates.join(', ')} WHERE id = $${paramCount} AND is_deleted = FALSE RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      const err = new Error('Transporter not found');
      err.status = 404;
      throw err;
    }

    return result.rows[0];
  }

  /**
   * Soft-delete a transporter by ID.
   * Blocks deletion if the transporter is linked to any active booking products.
   * @param {number} transporterId
   */
  async deleteTransporter(transporterId) {
    // Check for active booking references
    const linkedBookings = await pool.query(
      `SELECT DISTINCT b.id
       FROM booking_products bp
       JOIN bookings b ON bp.booking_id = b.id
       WHERE bp.transporter_id = $1
         AND bp.status NOT IN ('cancelled', 'completed', 'exchanged')`,
      [transporterId]
    );

    if (linkedBookings.rows.length > 0) {
      const ids = linkedBookings.rows.map(r => r.id).join(', ');
      const err = new Error(`Cannot delete transporter — linked to active booking(s): ${ids}`);
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      'UPDATE transporters SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = FALSE RETURNING id',
      [transporterId]
    );

    if (result.rows.length === 0) {
      const err = new Error('Transporter not found');
      err.status = 404;
      throw err;
    }

    return result.rows[0];
  }
}

module.exports = new TransporterService();
