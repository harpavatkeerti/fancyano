const pool = require('../database/connection');
const { validatePhoneLength } = require('../utils/phoneUtils');

/**
 * VendorService — manages vendor CRUD operations.
 *
 * All business logic (validation, guards, queries) lives here.
 * Route handlers are thin HTTP adapters.
 */
class VendorService {
  /**
   * List all vendors with optional search filter.
   * @param {Object} filters - { search }
   * @returns {Promise<Array>} - List of vendors
   */
  async listVendors(filters = {}) {
    const { search } = filters;
    let query = 'SELECT * FROM vendors WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY id DESC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Search vendors by name (autocomplete for product form).
   * Requires at least 2 characters.
   * @param {string} query - Search query
   * @returns {Promise<Array>} - Top 10 matching vendors
   */
  async searchVendors(query) {
    if (!query || query.trim().length < 2) {
      const err = new Error('Search query must be at least 2 characters');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `SELECT * FROM vendors
       WHERE name ILIKE $1
       ORDER BY name ASC
       LIMIT 10`,
      [`%${query.trim()}%`]
    );

    return result.rows;
  }

  /**
   * Get a single vendor by ID.
   * @param {number} vendorId
   * @returns {Promise<Object>} - Vendor details
   */
  async getVendorById(vendorId) {
    const result = await pool.query('SELECT * FROM vendors WHERE id = $1', [vendorId]);

    if (result.rows.length === 0) {
      const err = new Error('Vendor not found');
      err.status = 404;
      throw err;
    }

    return result.rows[0];
  }

  /**
   * Create a new vendor.
   * Validates: name and phone are required.
   * @param {Object} data - { name, phone, address?, gst_number?, pan_number?, notes? }
   * @returns {Promise<Object>} - Created vendor
   */
  async createVendor(data) {
    const { name, phone, phone_country, address, gst_number, pan_number, notes } = data;

    // Validation — service layer is authoritative
    if (!name || !name.trim()) {
      const err = new Error('Vendor name is required');
      err.status = 400;
      throw err;
    }
    if (!phone || !phone.trim()) {
      const err = new Error('Vendor phone is required');
      err.status = 400;
      throw err;
    }

    // Validate phone number length against country rules
    const phoneErr = validatePhoneLength(phone, phone_country || 'IN');
    if (phoneErr) {
      const err = new Error(phoneErr);
      err.status = 400;
      throw err;
    }
    if (gst_number && gst_number.trim().length > 20) {
      const err = new Error('GST number must be 20 characters or fewer');
      err.status = 400;
      throw err;
    }
    if (pan_number && pan_number.trim().length > 10) {
      const err = new Error('PAN number must be 10 characters or fewer');
      err.status = 400;
      throw err;
    }

    // Validate notes length
    if (notes && notes.length > 255) {
      const err = new Error('Notes must be 255 characters or fewer');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `INSERT INTO vendors (name, phone, phone_country, address, gst_number, pan_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name.trim(),
        phone.trim(),
        (phone_country || 'IN').toUpperCase(),
        address?.trim() || null,
        gst_number?.trim() || null,
        pan_number?.trim() || null,
        notes?.trim() || null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Update an existing vendor.
   * All fields are editable.
   * @param {number} vendorId
   * @param {Object} data - Partial vendor fields
   * @returns {Promise<Object>} - Updated vendor
   */
  async updateVendor(vendorId, data) {
    // Verify vendor exists
    const existing = await pool.query('SELECT id, phone_country FROM vendors WHERE id = $1', [vendorId]);
    if (existing.rows.length === 0) {
      const err = new Error('Vendor not found');
      err.status = 404;
      throw err;
    }

    const { name, phone, phone_country, address, gst_number, pan_number, notes } = data;

    // Validate required fields if provided
    if (name !== undefined && (!name || !name.trim())) {
      const err = new Error('Vendor name cannot be empty');
      err.status = 400;
      throw err;
    }
    if (phone !== undefined && (!phone || !phone.trim())) {
      const err = new Error('Vendor phone cannot be empty');
      err.status = 400;
      throw err;
    }
    if (notes && notes.length > 255) {
      const err = new Error('Notes must be 255 characters or fewer');
      err.status = 400;
      throw err;
    }
    // Validate phone number length against country rules (if being updated)
    if (phone !== undefined && phone) {
      const phoneErr = validatePhoneLength(phone, phone_country || existing.rows[0].phone_country || 'IN');
      if (phoneErr) {
        const err = new Error(phoneErr);
        err.status = 400;
        throw err;
      }
    }
    if (gst_number !== undefined && gst_number && gst_number.trim().length > 20) {
      const err = new Error('GST number must be 20 characters or fewer');
      err.status = 400;
      throw err;
    }
    if (pan_number !== undefined && pan_number && pan_number.trim().length > 10) {
      const err = new Error('PAN number must be 10 characters or fewer');
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `UPDATE vendors
       SET name = COALESCE($2, name),
           phone = COALESCE($3, phone),
           phone_country = COALESCE($4, phone_country),
           address = COALESCE($5, address),
           gst_number = COALESCE($6, gst_number),
           pan_number = COALESCE($7, pan_number),
           notes = COALESCE($8, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        vendorId,
        name?.trim() || null,
        phone?.trim() || null,
        phone_country ? phone_country.toUpperCase() : null,
        address?.trim() || null,
        gst_number?.trim() || null,
        pan_number?.trim() || null,
        notes?.trim() || null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Delete a vendor.
   * Guard: cannot delete if any non-archived product references this vendor.
   * @param {number} vendorId
   * @returns {Promise<void>}
   */
  async deleteVendor(vendorId) {
    // Verify vendor exists
    const existing = await pool.query('SELECT id, name FROM vendors WHERE id = $1', [vendorId]);
    if (existing.rows.length === 0) {
      const err = new Error('Vendor not found');
      err.status = 404;
      throw err;
    }

    // Guard: check for non-archived products referencing this vendor
    const activeProducts = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM products
       WHERE vendor_id = $1 AND status != 'archived'`,
      [vendorId]
    );

    if (activeProducts.rows[0].count > 0) {
      const count = activeProducts.rows[0].count;
      const err = new Error(
        `Cannot delete vendor "${existing.rows[0].name}" — ${count} active product${count > 1 ? 's' : ''} reference${count === 1 ? 's' : ''} it. Archive or reassign the product${count > 1 ? 's' : ''} first.`
      );
      err.status = 409;
      throw err;
    }

    await pool.query('DELETE FROM vendors WHERE id = $1', [vendorId]);
  }
}

module.exports = new VendorService();
