const express = require('express');
const router = express.Router();
const productTrackingService = require('../services/productTrackingService');

// GET /product-tracking
router.get('/', async (req, res) => {
  try {
    const records = await productTrackingService.listTrackingRecords();
    res.json({ data: records });
  } catch (error) {
    console.error('Error fetching product tracking:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch product tracking records' });
  }
});

// GET /product-tracking/current/:productId?size=XXL
router.get('/current/:productId', async (req, res) => {
  try {
    const size = req.query.size || null;
    const record = await productTrackingService.getCurrentTrackingForProduct(req.params.productId, size);
    res.json({ data: record });
  } catch (error) {
    console.error('Error fetching current tracking:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch current tracking record' });
  }
});

// GET /product-tracking/product/:productId?size=XXL
router.get('/product/:productId', async (req, res) => {
  try {
    const size = req.query.size || null;
    const records = await productTrackingService.getTrackingHistoryByProductId(req.params.productId, size);
    res.json({ data: records });
  } catch (error) {
    console.error('Error fetching product tracking:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch product tracking records' });
  }
});

// GET /product-tracking/code/:code
router.get('/code/:code', async (req, res) => {
  try {
    const records = await productTrackingService.getTrackingHistoryByProductCode(req.params.code);
    res.json({ data: records });
  } catch (error) {
    console.error('Error fetching product tracking:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch product tracking records' });
  }
});

// GET /product-tracking/active
// NOTE: must be defined BEFORE /:id to avoid Express treating 'active' as an id
router.get('/active', async (req, res) => {
  try {
    const records = await productTrackingService.listActiveTrackingRecords();
    res.json({ data: records });
  } catch (error) {
    console.error('Error fetching active tracking records:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch active tracking records' });
  }
});

// POST /product-tracking
router.post('/', async (req, res) => {
  try {
    const record = await productTrackingService.createTrackingRecord(req.body);
    res.status(201).json({ data: record });
  } catch (error) {
    console.error('Error creating tracking record:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to create tracking record' });
  }
});

// PATCH /product-tracking/:id/return
router.patch('/:id/return', async (req, res) => {
  try {
    const record = await productTrackingService.returnTrackingRecord(req.params.id, req.body.notes);
    res.json({ data: record });
  } catch (error) {
    console.error('Error marking tracking record as returned:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to mark as returned' });
  }
});

// DELETE /product-tracking/:id
router.delete('/:id', async (req, res) => {
  try {
    const record = await productTrackingService.deleteTrackingRecord(req.params.id);
    res.json({ data: record });
  } catch (error) {
    console.error('Error deleting tracking record:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to delete tracking record' });
  }
});

module.exports = router;
