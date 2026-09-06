const pool = require('../database/connection');

/**
 * MeasurementTemplatesService — CRUD for measurement templates.
 *
 * A measurement template defines the structured fields (key, label, group)
 * that appear in the measurement form for a given product type.
 * Follows the same service pattern as productCategoriesService.
 */
class MeasurementTemplatesService {
  /**
   * Get all active measurement templates.
   * @returns {Promise<Array>} List of active templates
   */
  async getAll() {
    const result = await pool.query(
      `SELECT id, name, fields, display_order, is_active, created_at, updated_at
       FROM measurement_templates
       WHERE is_active = true
       ORDER BY display_order, name`
    );
    return result.rows;
  }

  /**
   * Get a single measurement template by ID.
   * @param {number} id
   * @returns {Promise<Object>} Template row
   */
  async getById(id) {
    const result = await pool.query(
      `SELECT id, name, fields, display_order, is_active, created_at, updated_at
       FROM measurement_templates
       WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      const err = new Error('Measurement template not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Create a new measurement template.
   * @param {string} name - Template name (e.g. "Sherwani Measurements")
   * @param {Array} fields - Array of { key, label, group? } objects
   * @param {number|null} displayOrder
   * @returns {Promise<Object>} Created template row
   */
  async create(name, fields, displayOrder) {
    if (!name || !name.trim()) {
      const err = new Error('Template name is required');
      err.status = 400;
      throw err;
    }

    if (!Array.isArray(fields)) {
      const err = new Error('Fields must be an array');
      err.status = 400;
      throw err;
    }

    // Validate each field has key and label
    for (const field of fields) {
      if (!field.key || !field.label) {
        const err = new Error('Each field must have a "key" and "label"');
        err.status = 400;
        throw err;
      }
    }

    // Check for duplicate name
    const existing = await pool.query(
      'SELECT id FROM measurement_templates WHERE LOWER(name) = LOWER($1) AND is_active = true',
      [name.trim()]
    );
    if (existing.rows.length > 0) {
      const err = new Error('A measurement template with this name already exists');
      err.status = 409;
      throw err;
    }

    // Determine display_order if not provided
    let order = displayOrder;
    if (order === undefined || order === null) {
      const maxResult = await pool.query(
        'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM measurement_templates'
      );
      order = maxResult.rows[0].next_order;
    }

    const result = await pool.query(
      `INSERT INTO measurement_templates (name, fields, display_order)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), JSON.stringify(fields), order]
    );

    return result.rows[0];
  }

  /**
   * Update a measurement template.
   * @param {number} id
   * @param {{ name?: string, fields?: Array, display_order?: number }} data
   * @returns {Promise<Object>} Updated template row
   */
  async update(id, data) {
    const { name, fields, display_order } = data;

    const setClauses = [];
    const params = [];
    let paramIdx = 0;

    if (name !== undefined) {
      paramIdx++;
      setClauses.push(`name = $${paramIdx}`);
      params.push(name.trim());
    }
    if (fields !== undefined) {
      if (!Array.isArray(fields)) {
        const err = new Error('Fields must be an array');
        err.status = 400;
        throw err;
      }
      for (const field of fields) {
        if (!field.key || !field.label) {
          const err = new Error('Each field must have a "key" and "label"');
          err.status = 400;
          throw err;
        }
      }
      paramIdx++;
      setClauses.push(`fields = $${paramIdx}`);
      params.push(JSON.stringify(fields));
    }
    if (display_order !== undefined) {
      paramIdx++;
      setClauses.push(`display_order = $${paramIdx}`);
      params.push(display_order);
    }

    if (setClauses.length === 0) {
      const err = new Error('No fields to update');
      err.status = 400;
      throw err;
    }

    setClauses.push('updated_at = NOW()');
    paramIdx++;
    params.push(id);

    const result = await pool.query(
      `UPDATE measurement_templates SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND is_active = true RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      const err = new Error('Measurement template not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Soft-delete a measurement template. Blocked if product types reference it.
   * @param {number} id
   * @returns {Promise<{ message: string, template: Object }>}
   */
  async delete(id) {
    // Check if product types are using this template
    const typeCheck = await pool.query(
      'SELECT COUNT(*) AS cnt FROM product_types WHERE measurement_template_id = $1 AND is_active = true',
      [id]
    );
    if (parseInt(typeCheck.rows[0].cnt) > 0) {
      const err = new Error(
        `Cannot delete this template — ${typeCheck.rows[0].cnt} product type(s) are using it. Reassign them first.`
      );
      err.status = 409;
      throw err;
    }

    const result = await pool.query(
      'UPDATE measurement_templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      const err = new Error('Measurement template not found');
      err.status = 404;
      throw err;
    }
    return { message: 'Measurement template deleted', template: result.rows[0] };
  }
}

module.exports = new MeasurementTemplatesService();
