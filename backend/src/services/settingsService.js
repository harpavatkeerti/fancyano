const pool = require('../database/connection');

class SettingsService {
  /**
   * Get all settings, ordered by category and key
   */
  async getAll() {
    const result = await pool.query(
      'SELECT * FROM settings ORDER BY category, setting_key'
    );
    return result.rows;
  }

  /**
   * Get a single setting by its key
   * @param {string} key - The setting_key
   * @returns {Object|null} - The setting row or null
   */
  async getByKey(key) {
    const result = await pool.query(
      'SELECT * FROM settings WHERE setting_key = $1',
      [key]
    );
    return result.rows[0] || null;
  }

  /**
   * Get settings filtered by category
   * @param {string} category
   */
  async getByCategory(category) {
    const result = await pool.query(
      'SELECT * FROM settings WHERE category = $1 ORDER BY setting_key',
      [category]
    );
    return result.rows;
  }

  /**
   * Update an existing setting by key
   * @param {string} key
   * @param {Object} data - { setting_value, description }
   * @returns {Object|null} - Updated row or null if not found
   */
  async update(key, { setting_value, description }) {
    const result = await pool.query(
      `UPDATE settings 
       SET setting_value = $1, 
           description = COALESCE($2, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE setting_key = $3
       RETURNING *`,
      [setting_value, description, key]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new setting
   * @param {Object} data
   * @returns {Object} - Created row
   */
  async create({ setting_key, setting_value, setting_type, description, category }) {
    const result = await pool.query(
      `INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [setting_key, setting_value, setting_type || 'string', description, category || 'general']
    );
    return result.rows[0];
  }

  /**
   * Delete a setting by key
   * @param {string} key
   * @returns {Object|null} - Deleted row or null if not found
   */
  async delete(key) {
    const result = await pool.query(
      'DELETE FROM settings WHERE setting_key = $1 RETURNING *',
      [key]
    );
    return result.rows[0] || null;
  }
}

module.exports = new SettingsService();
