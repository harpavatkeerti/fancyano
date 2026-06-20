const pool = require('../database/connection');
const imageStorage = require('./imageStorage');

// Valid product status values (mirrors the DB enum)
const PRODUCT_STATUS = {
  AVAILABLE: 'available',
  ARCHIVED: 'archived',
};

/**
 * ProductService - Manages product CRUD operations
 */
class ProductService {
  /**
   * Get products with optional filters.
   * By default only returns 'available' products.
   * Pass includeArchived=true to return all statuses (inventory page).
   * Embeds current tracking_status and tracking_booking_id from product_tracking.
   * @param {Object} filters - {search, category, includeArchived}
   * @returns {Promise<Array>} - List of products
   */
  async getProducts(filters = {}) {
    const { search, category, includeArchived } = filters;
    let query = `
      SELECT p.*,
             lt.tracking_status,
             lt.booking_id AS tracking_booking_id
      FROM products p
      LEFT JOIN LATERAL (
        SELECT tracking_status, booking_id
        FROM product_tracking
        WHERE product_id = p.id
        ORDER BY created_at DESC
        LIMIT 1
      ) lt ON true
      WHERE 1=1`;
    const params = [];
    let paramCount = 0;

    // Only filter by status when not requesting archived products
    if (!includeArchived) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(PRODUCT_STATUS.AVAILABLE);
    }

    if (search) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR p.code ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (category) {
      paramCount++;
      query += ` AND p.category = $${paramCount}`;
      params.push(category);
    }

    query += ' ORDER BY p.id DESC';

    const result = await pool.query(query, params);
    return result.rows.map(product => this._parseProductImages(product));
  }


  /**
   * Get product by ID (returns any status — used by admin and internal services)
   * @param {number} productId - Product ID
   * @returns {Promise<Object>} - Product details
   */
  async getProductById(productId) {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    return this._parseProductImages(result.rows[0]);
  }

  /**
   * Create a new product (always starts as 'available')
   * @param {Object} productData - Product details
   * @returns {Promise<Object>} - Created product
   */
  async createProduct(productData) {
    const {
      name,
      code,
      purchase_price,
      rent,
      security_deposit,
      category,
      gender,
      size,
      description,
      image,
      images
    } = productData;

    // Process images
    const imageData = await this._processImages(images, image, code);

    const result = await pool.query(
      `INSERT INTO products 
        (name, code, purchase_price, rent, security_deposit, 
         category, gender, size, description, status, image) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING *`,
      [
        name,
        code,
        purchase_price || null,
        rent,
        security_deposit || 0,
        category || null,
        gender || null,
        size || null,
        description || null,
        PRODUCT_STATUS.AVAILABLE,
        imageData
      ]
    );

    return this._parseProductImages(result.rows[0]);
  }

  /**
   * Update a product's details (does not change status)
   * @param {number} productId - Product ID
   * @param {Object} productData - Updated product details
   * @returns {Promise<Object>} - Updated product
   */
  async updateProduct(productId, productData) {
    const {
      name,
      code,
      purchase_price,
      rent,
      security_deposit,
      category,
      gender,
      size,
      description,
      image,
      images
    } = productData;

    if (security_deposit === undefined || security_deposit === null) {
      throw new Error('security_deposit is required');
    }

    // Get existing product
    const existingProduct = await pool.query('SELECT image FROM products WHERE id = $1', [productId]);

    if (existingProduct.rows.length === 0) {
      throw new Error('Product not found');
    }

    // Delete old images if new images are provided
    if (images || image) {
      await this._deleteOldImages(existingProduct.rows[0].image);
    }

    // Process new images
    const imageData = await this._processImages(images, image, code);

    const result = await pool.query(
      `UPDATE products 
       SET name = $1, code = $2, purchase_price = $3, rent = $4, 
           security_deposit = $5, category = $6, gender = $7, 
           size = $8, description = $9, image = $10, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $11 
       RETURNING *`,
      [
        name,
        code,
        purchase_price,
        rent,
        security_deposit || 0,
        category,
        gender,
        size,
        description,
        imageData,
        productId
      ]
    );

    return this._parseProductImages(result.rows[0]);
  }

  /**
   * Archive a product (soft-delete).
   * Blocked if the product has any active (non-cancelled, non-completed, non-exchanged) bookings.
   * @param {number} productId - Product ID
   * @returns {Promise<Object>} - Updated product
   */
  async archiveProduct(productId) {
    const existing = await pool.query(
      'SELECT id, status FROM products WHERE id = $1',
      [productId]
    );
    if (existing.rows.length === 0) {
      throw new Error('Product not found');
    }
    if (existing.rows[0].status === PRODUCT_STATUS.ARCHIVED) {
      throw new Error('Product is already archived');
    }

    // Block if there are active bookings for this product
    const activeCheck = await pool.query(
      `SELECT 1 FROM booking_products bp
       WHERE bp.product_id = $1
         AND bp.status NOT IN ('cancelled', 'completed', 'exchanged')
       LIMIT 1`,
      [productId]
    );
    if (activeCheck.rows.length > 0) {
      throw new Error(
        'Cannot archive this product because it has active bookings. ' +
        'Please complete or cancel those bookings first.'
      );
    }

    const result = await pool.query(
      `UPDATE products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [PRODUCT_STATUS.ARCHIVED, productId]
    );
    return this._parseProductImages(result.rows[0]);
  }

  /**
   * Restore an archived product back to 'available'.
   * @param {number} productId - Product ID
   * @returns {Promise<Object>} - Updated product
   */
  async restoreProduct(productId) {
    const existing = await pool.query(
      'SELECT id, status FROM products WHERE id = $1',
      [productId]
    );
    if (existing.rows.length === 0) {
      throw new Error('Product not found');
    }
    if (existing.rows[0].status === PRODUCT_STATUS.AVAILABLE) {
      throw new Error('Product is already available');
    }

    const result = await pool.query(
      `UPDATE products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [PRODUCT_STATUS.AVAILABLE, productId]
    );
    return this._parseProductImages(result.rows[0]);
  }

  /**
   * Parse product images from JSON if needed
   * @private
   */
  _parseProductImages(product) {
    if (product.image && typeof product.image === 'string' && product.image.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(product.image);
        if (Array.isArray(parsed)) {
          product.image = parsed;
        }
      } catch (e) {
        // Keep as is if parsing fails
      }
    }
    return product;
  }

  /**
   * Process images (multiple or single)
   * @private
   */
  async _processImages(images, image, code) {
    let imageData = null;

    // If images array is provided, process multiple images
    if (images && Array.isArray(images) && images.length > 0) {
      const imageUrls = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img && img.startsWith('data:image')) {
          // Add small delay to ensure unique timestamps
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          const imageUrl = await imageStorage.saveImage(img, code);
          imageUrls.push(imageUrl);
        } else if (img && typeof img === 'string') {
          // Already a URL/path, keep it
          imageUrls.push(img);
        }
      }
      imageData = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null;
    }
    // If single image is provided (backward compatibility)
    else if (image) {
      if (image.startsWith('data:image')) {
        imageData = await imageStorage.saveImage(image, code);
      } else if (typeof image === 'string') {
        // Already a URL/path
        imageData = image;
      }
    }

    return imageData;
  }

  /**
   * Delete old product images
   * @private
   */
  async _deleteOldImages(oldImage) {
    if (!oldImage) return;

    try {
      // Try to parse as JSON array
      const oldImages = JSON.parse(oldImage);
      if (Array.isArray(oldImages)) {
        for (const oldImg of oldImages) {
          if (oldImg && oldImg.startsWith('/uploads/')) {
            await imageStorage.deleteImage(oldImg);
          }
        }
      } else if (typeof oldImage === 'string' && oldImage.startsWith('/uploads/')) {
        await imageStorage.deleteImage(oldImage);
      }
    } catch (e) {
      // If not JSON, treat as single image
      if (oldImage && oldImage.startsWith('/uploads/')) {
        await imageStorage.deleteImage(oldImage);
      }
    }
  }
}

module.exports = new ProductService();
module.exports.PRODUCT_STATUS = PRODUCT_STATUS;
