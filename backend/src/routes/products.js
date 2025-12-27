const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

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
    const { name, code, rent_per_day, category, description, availability } = req.body;
    
    if (!name || !code || !rent_per_day) {
      return res.status(400).json({ error: 'Name, code, and rent_per_day are required' });
    }

    const result = await pool.query(
      'INSERT INTO products (name, code, rent_per_day, category, description, availability) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, code, rent_per_day, category || null, description || null, availability !== undefined ? availability : true]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Product code already exists' });
    }
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, rent_per_day, category, description, availability } = req.body;

    const result = await pool.query(
      'UPDATE products SET name = $1, code = $2, rent_per_day = $3, category = $4, description = $5, availability = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [name, code, rent_per_day, category, description, availability, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

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

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;

