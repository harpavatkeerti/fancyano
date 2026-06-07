const express = require('express');
const router = express.Router();
const productService = require('../services/productService');

// GET all products
// Query params: search, category, includeArchived (inventory page only)
router.get('/', async (req, res) => {
  try {
    const { search, category, includeArchived } = req.query;
    const products = await productService.getProducts({
      search,
      category,
      includeArchived: includeArchived === 'true',
    });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await productService.getProductById(id);
    res.json(product);
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST create product
router.post('/', async (req, res) => {
  try {
    const productData = req.body;
    const { name, code, rent, security_deposit } = productData;

    console.log('📥 Received product creation request:');
    console.log('   Name:', name);
    console.log('   Code:', code);
    console.log('   Rent:', rent);
    console.log('   Security Deposit:', security_deposit);

    if (!name || !code || !rent || security_deposit === undefined || security_deposit === null) {
      return res.status(400).json({ error: 'Name, code, rent, and security_deposit are required' });
    }

    const product = await productService.createProduct(productData);
    res.status(201).json(product);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Product code already exists' });
    }
    console.error('❌ Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product', details: error.message });
  }
});

// PUT update product details
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const productData = req.body;

    const product = await productService.updateProduct(id, productData);
    res.json(product);
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (error.message === 'security_deposit is required') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Product code already exists' });
    }
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// PATCH archive product (soft-delete — blocks if active bookings exist)
router.patch('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await productService.archiveProduct(id);
    res.json(product);
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (error.message === 'Product is already archived') {
      return res.status(409).json({ error: error.message });
    }
    if (error.message && error.message.startsWith('Cannot archive this product')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('Error archiving product:', error);
    res.status(500).json({ error: 'Failed to archive product' });
  }
});

// PATCH restore archived product back to 'available'
router.patch('/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await productService.restoreProduct(id);
    res.json(product);
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (error.message === 'Product is already available') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Error restoring product:', error);
    res.status(500).json({ error: 'Failed to restore product' });
  }
});

module.exports = router;
