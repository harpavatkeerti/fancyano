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
             lt.size_tracking_map,
             v.name AS vendor_name
      FROM products p
      LEFT JOIN LATERAL (
        SELECT json_object_agg(sub.size, sub.tracking_status) AS size_tracking_map
        FROM (
          SELECT DISTINCT ON (COALESCE(size, '_')) COALESCE(size, '_') AS size, tracking_status
          FROM product_tracking
          WHERE product_id = p.id
          ORDER BY COALESCE(size, '_'), created_at DESC
        ) sub
      ) lt ON true
      LEFT JOIN vendors v ON v.id = p.vendor_id
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
    return result.rows.map(product => this._formatProduct(product));
  }


  /**
   * Get product by ID (returns any status — used by admin and internal services)
   * @param {number} productId - Product ID
   * @returns {Promise<Object>} - Product details
   */
  async getProductById(productId) {
    const result = await pool.query(
      `SELECT p.*,
              lt.size_tracking_map,
              v.name AS vendor_name
       FROM products p
       LEFT JOIN LATERAL (
         SELECT json_object_agg(sub.size, sub.tracking_status) AS size_tracking_map
         FROM (
           SELECT DISTINCT ON (COALESCE(size, '_')) COALESCE(size, '_') AS size, tracking_status
           FROM product_tracking
           WHERE product_id = p.id
           ORDER BY COALESCE(size, '_'), created_at DESC
         ) sub
       ) lt ON true
       LEFT JOIN vendors v ON v.id = p.vendor_id
       WHERE p.id = $1`,
      [productId]
    );

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    return this._formatProduct(result.rows[0]);
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
      available_sizes,
      rent_overrides,
      description,
      image,
      images,
      vendor_id,
    } = productData;

    // ── Authoritative uniqueness check: code only ────────────────────────
    const dupCheck = await pool.query(
      `SELECT id FROM products
       WHERE LOWER(code) = LOWER($1)
       AND status != 'archived'`,
      [code]
    );
    if (dupCheck.rows.length > 0) {
      const err = new Error(`A product with code "${code}" already exists`);
      err.code = 'DUPLICATE_CODE';
      throw err;
    }

    // Process images
    const imageData = await this._processImages(images, image, code);

    const result = await pool.query(
      `INSERT INTO products 
        (name, code, purchase_price, rent, security_deposit, 
         category, gender, available_sizes, rent_overrides, description, status, image, vendor_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [
        name,
        code,
        purchase_price || null,
        rent,
        security_deposit || 0,
        category || null,
        gender || null,
        available_sizes || null,
        rent_overrides ? JSON.stringify(rent_overrides) : null,
        description || null,
        PRODUCT_STATUS.AVAILABLE,
        imageData,
        vendor_id || null
      ]
    );

    return this._formatProduct(result.rows[0]);
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
      available_sizes,
      rent_overrides,
      description,
      image,
      images,
      vendor_id,
    } = productData;

    if (security_deposit === undefined || security_deposit === null) {
      throw new Error('security_deposit is required');
    }

    // Get existing product
    const existingProduct = await pool.query('SELECT image FROM products WHERE id = $1', [productId]);

    if (existingProduct.rows.length === 0) {
      throw new Error('Product not found');
    }

    // Smart image deletion: only delete files that were removed from the images list.
    // Avoid deleting images the user is still keeping (they'll be passed as existing /uploads/ paths).
    if (images !== undefined || image !== undefined) {
      const oldRaw = existingProduct.rows[0].image;
      let oldImages = [];
      if (oldRaw) {
        try {
          const parsed = JSON.parse(oldRaw);
          oldImages = Array.isArray(parsed) ? parsed : [oldRaw];
        } catch (e) {
          oldImages = [oldRaw];
        }
      }

      // Build the set of server paths the user wants to KEEP.
      // Normalize absolute URLs → relative paths for comparison.
      const normalizeToPath = (url) => {
        if (!url) return null;
        // Strip any http://host:port prefix, keep from /uploads/ onwards
        const match = String(url).match(/(\/uploads\/.*)/);
        return match ? match[1] : url;
      };

      const incomingImages = Array.isArray(images) ? images : (image ? [image] : []);
      const keptPaths = new Set(
        incomingImages
          .filter(img => img && !String(img).startsWith('data:image'))
          .map(normalizeToPath)
          .filter(Boolean)
      );

      // Delete only images that are gone from the new list
      for (const oldImg of oldImages) {
        const oldPath = normalizeToPath(oldImg);
        if (oldPath && oldPath.startsWith('/uploads/') && !keptPaths.has(oldPath)) {
          await imageStorage.deleteImage(oldPath);
        }
      }
    }

    // ── Authoritative uniqueness check: code only — exclude self ────────
    const dupCheck = await pool.query(
      `SELECT id FROM products
       WHERE LOWER(code) = LOWER($1)
       AND id != $2
       AND status != 'archived'`,
      [code, productId]
    );
    if (dupCheck.rows.length > 0) {
      const err = new Error(`A product with code "${code}" already exists`);
      err.code = 'DUPLICATE_CODE';
      throw err;
    }

    // Process new images
    const imageData = await this._processImages(images, image, code);

    const result = await pool.query(
      `UPDATE products 
       SET name = $1, code = $2, purchase_price = $3, rent = $4, 
           security_deposit = $5, category = $6, gender = $7, 
           available_sizes = $8, rent_overrides = $9, description = $10, image = $11, 
           vendor_id = $12,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $13 
       RETURNING *`,
      [
        name,
        code,
        purchase_price,
        rent,
        security_deposit || 0,
        category,
        gender,
        available_sizes || null,
        rent_overrides ? JSON.stringify(rent_overrides) : null,
        description,
        imageData,
        vendor_id !== undefined ? (vendor_id || null) : null,
        productId
      ]
    );

    return this._formatProduct(result.rows[0]);
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
         AND bp.status NOT IN ('cancelled', 'completed', 'exchanged', 'discarded')
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
   * Get the effective rent for a product at a given size.
   * Single source of truth for rent resolution.
   * @param {Object} product - Product object with rent and rent_overrides
   * @param {string|null} size - Size string, or null/undefined for sizeless products
   * @returns {number} - The effective rent
   */
  static getProductRent(product, size) {
    if (size && product.rent_overrides && product.rent_overrides[size] !== undefined) {
      return product.rent_overrides[size];
    }
    return product.rent;
  }

  /**
   * Format product for API response:
   * - Parse images from JSON
   * - Compute rents_by_size from available_sizes + getProductRent
   * - Strip rent_overrides (backend-internal)
   * @private
   */
  _formatProduct(product) {
    // Parse images
    this._parseProductImages(product);

    // Compute rents_by_size
    let rents_by_size = null;
    if (product.available_sizes && Array.isArray(product.available_sizes) && product.available_sizes.length > 0) {
      rents_by_size = product.available_sizes.reduce((map, size) => {
        map[size] = ProductService.getProductRent(product, size);
        return map;
      }, {});
    }

    // Return a new object without rent_overrides (backend-internal)
    const { rent_overrides, ...rest } = product;
    return { ...rest, rents_by_size };
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

    // Helper: normalize any full http://host/uploads/... URL to a relative /uploads/... path
    const toServerPath = (url) => {
      if (!url || typeof url !== 'string') return url;
      const match = url.match(/(\/uploads\/.*)/);
      return match ? match[1] : url;
    };

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
          // Already a URL/path — normalize to a relative server path before storing
          imageUrls.push(toServerPath(img));
        }
      }
      imageData = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null;
    }
    // If single image is provided (backward compatibility)
    else if (image) {
      if (image.startsWith('data:image')) {
        imageData = await imageStorage.saveImage(image, code);
      } else if (typeof image === 'string') {
        // Already a URL/path — normalize before storing
        imageData = toServerPath(image);
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
module.exports.ProductService = ProductService;
