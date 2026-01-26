const pool = require('../database/connection');
const imageStorage = require('./imageStorage');

/**
 * ProductService - Manages product CRUD operations
 */
class ProductService {
  /**
   * Get all products with optional filters
   * @param {Object} filters - {search, category, availability}
   * @returns {Promise<Array>} - List of products
   */
  async getProducts(filters = {}) {
    const { search, category, availability } = filters;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }

    if (availability !== undefined) {
      paramCount++;
      query += ` AND availability = $${paramCount}`;
      params.push(availability === 'true' || availability === true);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    
    // Parse image data if it's JSON array
    return result.rows.map(product => this._parseProductImages(product));
  }

  /**
   * Get product by ID
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
   * Create a new product
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
      availability,
      image,
      images
    } = productData;

    // Process images
    const imageData = await this._processImages(images, image, code);

    const result = await pool.query(
      `INSERT INTO products 
        (name, code, purchase_price, rent, security_deposit, 
         category, gender, size, description, availability, image) 
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
        availability !== undefined ? availability : true,
        imageData
      ]
    );

    return this._parseProductImages(result.rows[0]);
  }

  /**
   * Update a product
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
      availability,
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
           size = $8, description = $9, availability = $10, image = $11, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $12 
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
        availability,
        imageData,
        productId
      ]
    );

    return this._parseProductImages(result.rows[0]);
  }

  /**
   * Delete a product
   * @param {number} productId - Product ID
   * @returns {Promise<Object>} - Deletion confirmation
   */
  async deleteProduct(productId) {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [productId]);

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    // Delete associated images
    const deletedProduct = result.rows[0];
    if (deletedProduct.image) {
      await this._deleteOldImages(deletedProduct.image);
    }

    return { message: 'Product deleted successfully' };
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
