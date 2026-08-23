const express = require('express');
const router = express.Router();
const productCategoriesService = require('../services/productCategoriesService');

// ── GET /api/product-categories ─────────────────────────────────────────────
// Returns all active categories with their product types (+ neutral types).
router.get('/', async (req, res) => {
  try {
    const data = await productCategoriesService.getAll();
    res.json(data);
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ error: 'Failed to fetch product categories' });
  }
});

// ── POST /api/product-categories ────────────────────────────────────────────
// Create a new category
router.post('/', async (req, res) => {
  try {
    const { name, display_order } = req.body;
    const category = await productCategoriesService.create(name, display_order);
    res.status(201).json(category);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'A category with this name already exists' });
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ── PUT /api/product-categories/:id ─────────────────────────────────────────
// Update a category
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, display_order } = req.body;
    const category = await productCategoriesService.update(id, { name, display_order });
    res.json(category);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'A category with this name already exists' });
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// ── DELETE /api/product-categories/:id ──────────────────────────────────────
// Soft-delete a category. Block if products are still assigned.
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await productCategoriesService.delete(id);
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT TYPES (sub-categories)
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/product-categories/:id/types ──────────────────────────────────
// Add a product type under a specific category
router.post('/:id/types', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    const { name, size_type, display_order } = req.body;
    const productType = await productCategoriesService.addType(categoryId, { name, size_type, display_order });
    res.status(201).json(productType);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'A product type with this name already exists in this category' });
    console.error('Error creating product type:', error);
    res.status(500).json({ error: 'Failed to create product type' });
  }
});

// ── POST /api/product-categories/neutral-types ──────────────────────────────
// Add a neutral product type (shown for all categories)
router.post('/neutral-types', async (req, res) => {
  try {
    const { name, size_type, display_order } = req.body;
    const productType = await productCategoriesService.addNeutralType({ name, size_type, display_order });
    res.status(201).json(productType);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'A neutral product type with this name already exists' });
    console.error('Error creating neutral product type:', error);
    res.status(500).json({ error: 'Failed to create neutral product type' });
  }
});

// ── PUT /api/product-categories/types/:typeId ───────────────────────────────
// Update a product type
router.put('/types/:typeId', async (req, res) => {
  try {
    const { typeId } = req.params;
    const { name, size_type, display_order } = req.body;
    const productType = await productCategoriesService.updateType(typeId, { name, size_type, display_order });
    res.json(productType);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'A product type with this name already exists in this category' });
    console.error('Error updating product type:', error);
    res.status(500).json({ error: 'Failed to update product type' });
  }
});

// ── DELETE /api/product-categories/types/:typeId ────────────────────────────
// Soft-delete a product type. Block if products are using it.
router.delete('/types/:typeId', async (req, res) => {
  try {
    const { typeId } = req.params;
    const result = await productCategoriesService.deleteType(typeId);
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error deleting product type:', error);
    res.status(500).json({ error: 'Failed to delete product type' });
  }
});

module.exports = router;
