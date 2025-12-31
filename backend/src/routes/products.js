const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const imageStorage = require('../services/imageStorage');

// GET all products
router.get('/', async (req, res) => {
  try {
    const { search, category, availability } = req.query;
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
      params.push(availability === 'true');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST create product
router.post('/', async (req, res) => {
  try {
    const { name, code, purchase_price, rent_per_day, category, gender, size, description, availability, image } = req.body;
    
    console.log('📥 Received product creation request:');
    console.log('   Name:', name);
    console.log('   Code:', code);
    console.log('   Purchase Price:', purchase_price);
    console.log('   Rent per Day:', rent_per_day);
    console.log('   Category:', category);
    console.log('   Gender:', gender);
    console.log('   Size:', size);
    console.log('   Has Image:', image ? 'Yes' : 'No');
    
    if (!name || !code || !rent_per_day) {
      return res.status(400).json({ error: 'Name, code, and rent_per_day are required' });
    }

    // Determine rental policy based on product type
    // Fancy Costumes: 24 hours rental
    // All other categories: 3 days rental (default)
    const rental_policy = name === 'Fancy Costumes' ? '24_hours' : '3_days';

    // Process image if provided
    let imageUrl = null;
    if (image && image.startsWith('data:image')) {
      imageUrl = await imageStorage.saveImage(image, code);
    }

    const result = await pool.query(
      'INSERT INTO products (name, code, purchase_price, rent_per_day, rental_policy, category, gender, size, description, availability, image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [name, code, purchase_price || null, rent_per_day, rental_policy, category || null, gender || null, size || null, description || null, availability !== undefined ? availability : true, imageUrl]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Product code already exists' });
    }
    console.error('❌ Error creating product:', error);
    console.error('   Error code:', error.code);
    console.error('   Error message:', error.message);
    console.error('   Error detail:', error.detail);
    res.status(500).json({ error: 'Failed to create product', details: error.message });
  }
});

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, purchase_price, rent_per_day, category, gender, size, description, availability, image } = req.body;

    // Determine rental policy based on product type
    const rental_policy = name === 'Fancy Costumes' ? '24_hours' : '3_days';

    // Get existing product to check for old image
    const existingProduct = await pool.query('SELECT image FROM products WHERE id = $1', [id]);
    
    if (existingProduct.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let imageUrl = image;

    // If new image is provided (base64), process it
    if (image && image.startsWith('data:image')) {
      // Delete old image if exists
      const oldImage = existingProduct.rows[0].image;
      if (oldImage && oldImage.startsWith('/uploads/')) {
        await imageStorage.deleteImage(oldImage);
      }
      
      // Save new image
      imageUrl = await imageStorage.saveImage(image, code);
    }

    const result = await pool.query(
      'UPDATE products SET name = $1, code = $2, purchase_price = $3, rent_per_day = $4, rental_policy = $5, category = $6, gender = $7, size = $8, description = $9, availability = $10, image = $11, updated_at = CURRENT_TIMESTAMP WHERE id = $12 RETURNING *',
      [name, code, purchase_price, rent_per_day, rental_policy, category, gender, size, description, availability, imageUrl, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Product code already exists' });
    }
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete associated image if exists
    const deletedProduct = result.rows[0];
    if (deletedProduct.image && deletedProduct.image.startsWith('/uploads/')) {
      await imageStorage.deleteImage(deletedProduct.image);
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;

