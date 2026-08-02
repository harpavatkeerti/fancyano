const express = require('express');
const router = express.Router();
const vendorService = require('../services/vendorService');

// ---------------------------------------------------------------------------
// All vendor endpoints are admin-only (enforced by routePermissions.js).
// Inventory/product creation is admin-only, so no other role needs vendor access.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /vendors  — list all vendors (optional search)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const vendors = await vendorService.listVendors({ search });
    res.json(vendors);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// ---------------------------------------------------------------------------
// GET /vendors/search?q=<name>  — autocomplete for product form
// IMPORTANT: must be defined BEFORE /:id
// ---------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const vendors = await vendorService.searchVendors(q);
    res.json(vendors);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error searching vendors:', error);
    res.status(500).json({ error: 'Failed to search vendors' });
  }
});

// ---------------------------------------------------------------------------
// GET /vendors/:id  — get vendor details
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const vendor = await vendorService.getVendorById(req.params.id);
    res.json(vendor);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error fetching vendor:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

// ---------------------------------------------------------------------------
// POST /vendors  — create a new vendor
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const vendor = await vendorService.createVendor(req.body);
    res.status(201).json(vendor);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error creating vendor:', error);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// ---------------------------------------------------------------------------
// PUT /vendors/:id  — update a vendor
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const vendor = await vendorService.updateVendor(req.params.id, req.body);
    res.json(vendor);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error updating vendor:', error);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /vendors/:id  — delete a vendor (guarded)
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    await vendorService.deleteVendor(req.params.id);
    res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error deleting vendor:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

module.exports = router;
