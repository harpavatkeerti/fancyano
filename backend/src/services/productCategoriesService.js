const pool = require('../database/connection');

/**
 * ProductCategoriesService — manages product categories and product types (sub-categories).
 *
 * Follows the same pattern as availabilityService, invoiceService, bookingService, etc.
 * Route file should only handle HTTP request/response and delegate to this service.
 */
class ProductCategoriesService {
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all active categories with their product types (including neutral types).
   * @returns {{ categories: Array, neutralTypes: Array }}
   */
  async getAll() {
    // 1. Fetch active categories
    const catResult = await pool.query(
      `SELECT id, name, display_order, is_active, created_at, updated_at
       FROM product_categories
       WHERE is_active = true
       ORDER BY display_order, name`
    );

    // 2. Fetch all active product types (including neutral ones)
    const typeResult = await pool.query(
      `SELECT id, name, category_id, size_type, display_order, is_active, created_at, updated_at
       FROM product_types
       WHERE is_active = true
       ORDER BY display_order, name`
    );

    const neutralTypes = typeResult.rows.filter(t => t.category_id === null);
    const categories = catResult.rows.map(cat => ({
      ...cat,
      types: typeResult.rows.filter(t => t.category_id === cat.id),
    }));

    // Add neutral types as a virtual category so they appear separately
    if (neutralTypes.length > 0) {
      categories.push({
        id: null, // Virtual — not a real DB row
        name: 'Accessories & Others',
        display_order: 999,
        is_active: true,
        created_at: null,
        updated_at: null,
        types: neutralTypes,
      });
    }

    return { categories, neutralTypes };
  }

  /**
   * Create a new category.
   * @param {string} name
   * @param {number|null} displayOrder
   * @returns {Object} - Created category row
   */
  async create(name, displayOrder) {
    if (!name || !name.trim()) {
      const err = new Error('Category name is required');
      err.status = 400;
      throw err;
    }

    // Check for duplicate name
    const existing = await pool.query(
      'SELECT id FROM product_categories WHERE LOWER(name) = LOWER($1) AND is_active = true',
      [name.trim()]
    );
    if (existing.rows.length > 0) {
      const err = new Error('A category with this name already exists');
      err.status = 409;
      throw err;
    }

    // Determine display_order if not provided
    let order = displayOrder;
    if (order === undefined || order === null) {
      const maxResult = await pool.query('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM product_categories');
      order = maxResult.rows[0].next_order;
    }

    const result = await pool.query(
      `INSERT INTO product_categories (name, display_order)
       VALUES ($1, $2)
       RETURNING *`,
      [name.trim(), order]
    );

    return result.rows[0];
  }

  /**
   * Update a category.
   * @param {number} id
   * @param {{ name?: string, display_order?: number }} fields
   * @returns {Object} - Updated category row
   */
  async update(id, fields) {
    const { name, display_order } = fields;

    const setClauses = [];
    const params = [];
    let paramIdx = 0;

    if (name !== undefined) {
      paramIdx++;
      setClauses.push(`name = $${paramIdx}`);
      params.push(name.trim());
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

    setClauses.push(`updated_at = NOW()`);
    paramIdx++;
    params.push(id);

    const result = await pool.query(
      `UPDATE product_categories SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      const err = new Error('Category not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Soft-delete a category. Blocked if products are still assigned.
   * @param {number} id
   * @returns {{ message: string, category: Object }}
   */
  async delete(id) {
    // Check if products are using this category
    const productCheck = await pool.query(
      'SELECT COUNT(*) AS cnt FROM products WHERE category_id = $1',
      [id]
    );
    if (parseInt(productCheck.rows[0].cnt) > 0) {
      const err = new Error(
        `Cannot delete this category — ${productCheck.rows[0].cnt} product(s) are assigned to it. Reassign them first.`
      );
      err.status = 409;
      throw err;
    }

    // Also deactivate product types under this category
    await pool.query(
      'UPDATE product_types SET is_active = false, updated_at = NOW() WHERE category_id = $1',
      [id]
    );

    const result = await pool.query(
      `UPDATE product_categories SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      const err = new Error('Category not found');
      err.status = 404;
      throw err;
    }
    return { message: 'Category deleted', category: result.rows[0] };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCT TYPES (sub-categories)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add a product type under a specific category.
   * @param {number} categoryId
   * @param {{ name: string, size_type: string, display_order?: number }} fields
   * @returns {Object} - Created product type row
   */
  async addType(categoryId, fields) {
    const { name, size_type, display_order } = fields;

    if (!name || !name.trim()) {
      const err = new Error('Product type name is required');
      err.status = 400;
      throw err;
    }
    const validSizeTypes = ['numeric', 'standard', 'fancy', 'none'];
    if (!validSizeTypes.includes(size_type)) {
      const err = new Error(`size_type must be one of: ${validSizeTypes.join(', ')}`);
      err.status = 400;
      throw err;
    }

    // Verify category exists
    const catCheck = await pool.query('SELECT id FROM product_categories WHERE id = $1 AND is_active = true', [categoryId]);
    if (catCheck.rows.length === 0) {
      const err = new Error('Category not found');
      err.status = 404;
      throw err;
    }

    // Determine display_order if not provided
    let order = display_order;
    if (order === undefined || order === null) {
      const maxResult = await pool.query(
        'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM product_types WHERE category_id = $1',
        [categoryId]
      );
      order = maxResult.rows[0].next_order;
    }

    const result = await pool.query(
      `INSERT INTO product_types (name, category_id, size_type, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), categoryId, size_type, order]
    );

    return result.rows[0];
  }

  /**
   * Add a neutral product type (shown for all categories).
   * @param {{ name: string, size_type: string, display_order?: number }} fields
   * @returns {Object} - Created product type row
   */
  async addNeutralType(fields) {
    const { name, size_type, display_order } = fields;

    if (!name || !name.trim()) {
      const err = new Error('Product type name is required');
      err.status = 400;
      throw err;
    }
    const validSizeTypes = ['numeric', 'standard', 'fancy', 'none'];
    if (!validSizeTypes.includes(size_type)) {
      const err = new Error(`size_type must be one of: ${validSizeTypes.join(', ')}`);
      err.status = 400;
      throw err;
    }

    const order = display_order ?? 90;

    const result = await pool.query(
      `INSERT INTO product_types (name, category_id, size_type, display_order)
       VALUES ($1, NULL, $2, $3)
       RETURNING *`,
      [name.trim(), size_type, order]
    );

    return result.rows[0];
  }

  /**
   * Update a product type.
   * @param {number} typeId
   * @param {{ name?: string, size_type?: string, display_order?: number }} fields
   * @returns {Object} - Updated product type row
   */
  async updateType(typeId, fields) {
    const { name, size_type, display_order } = fields;

    const setClauses = [];
    const params = [];
    let paramIdx = 0;

    if (name !== undefined) {
      paramIdx++;
      setClauses.push(`name = $${paramIdx}`);
      params.push(name.trim());
    }
    if (size_type !== undefined) {
      const validSizeTypes = ['numeric', 'standard', 'fancy', 'none'];
      if (!validSizeTypes.includes(size_type)) {
        const err = new Error(`size_type must be one of: ${validSizeTypes.join(', ')}`);
        err.status = 400;
        throw err;
      }
      paramIdx++;
      setClauses.push(`size_type = $${paramIdx}`);
      params.push(size_type);
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
    params.push(typeId);

    const result = await pool.query(
      `UPDATE product_types SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      const err = new Error('Product type not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Soft-delete a product type. Blocked if products are using it.
   * @param {number} typeId
   * @returns {{ message: string, productType: Object }}
   */
  async deleteType(typeId) {
    // Get the type name to check products
    const typeRow = await pool.query('SELECT name FROM product_types WHERE id = $1', [typeId]);
    if (typeRow.rows.length === 0) {
      const err = new Error('Product type not found');
      err.status = 404;
      throw err;
    }

    // Check if products are using this type (products.name matches product_types.name)
    const productCheck = await pool.query(
      'SELECT COUNT(*) AS cnt FROM products WHERE name = $1',
      [typeRow.rows[0].name]
    );
    if (parseInt(productCheck.rows[0].cnt) > 0) {
      const err = new Error(
        `Cannot delete this product type — ${productCheck.rows[0].cnt} product(s) are using it.`
      );
      err.status = 409;
      throw err;
    }

    const result = await pool.query(
      `UPDATE product_types SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [typeId]
    );
    return { message: 'Product type deleted', productType: result.rows[0] };
  }
}

module.exports = new ProductCategoriesService();
