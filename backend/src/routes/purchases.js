/**
 * purchases.js — Route handlers for purchase tracking.
 *
 * All business logic lives in purchaseService.js.
 */

const express = require('express');
const router = express.Router();
const purchaseService = require('../services/purchaseService');
const requireRole = require('../middleware/requireRole');

// All purchase routes are admin-only
router.use(requireRole('admin'));

// GET /purchases — List all purchases
router.get('/', async (req, res) => {
  try {
    const { vendor_name, start_date, end_date } = req.query;
    const purchases = await purchaseService.list({ vendor_name, start_date, end_date });
    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// GET /purchases/summary — Vendor-wise summary
router.get('/summary', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const summary = await purchaseService.getSummaryByVendor({ start_date, end_date });
    res.json(summary);
  } catch (error) {
    console.error('Error fetching purchase summary:', error);
    res.status(500).json({ error: 'Failed to fetch purchase summary' });
  }
});

// GET /purchases/:id — Get single purchase
router.get('/:id', async (req, res) => {
  try {
    const purchase = await purchaseService.getById(parseInt(req.params.id));
    res.json(purchase);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Failed to fetch purchase' });
  }
});

// POST /purchases — Create a new purchase
router.post('/', async (req, res) => {
  try {
    const purchase = await purchaseService.create({
      ...req.body,
      recorded_by: req.user.name
    });
    res.status(201).json(purchase);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error creating purchase:', error);
    res.status(500).json({ error: 'Failed to create purchase' });
  }
});

// PUT /purchases/:id — Update a purchase
router.put('/:id', async (req, res) => {
  try {
    const purchase = await purchaseService.update(parseInt(req.params.id), req.body);
    res.json(purchase);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error updating purchase:', error);
    res.status(500).json({ error: 'Failed to update purchase' });
  }
});

// DELETE /purchases/:id — Delete a purchase
router.delete('/:id', async (req, res) => {
  try {
    const purchase = await purchaseService.delete(parseInt(req.params.id));
    res.json(purchase);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error deleting purchase:', error);
    res.status(500).json({ error: 'Failed to delete purchase' });
  }
});

module.exports = router;
