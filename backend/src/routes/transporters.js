const express = require('express');
const router = express.Router();
const transporterService = require('../services/transporterService');

// ---------------------------------------------------------------------------
// All transporter endpoints are accessible to any authenticated user.
// Salesmen need to search/create transporters during the booking flow.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /transporters  — list all non-deleted transporters (optional search)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const transporters = await transporterService.listTransporters({ search });
    res.json(transporters);
  } catch (error) {
    console.error('Error fetching transporters:', error);
    res.status(500).json({ error: 'Failed to fetch transporters' });
  }
});

// ---------------------------------------------------------------------------
// GET /transporters/search?q=<name>  — autocomplete for booking form
// IMPORTANT: must be defined BEFORE /:id
// ---------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const transporters = await transporterService.searchTransporters(q);
    res.json(transporters);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error searching transporters:', error);
    res.status(500).json({ error: 'Failed to search transporters' });
  }
});

// ---------------------------------------------------------------------------
// GET /transporters/:id  — get transporter details
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const transporter = await transporterService.getTransporterById(req.params.id);
    res.json(transporter);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error fetching transporter:', error);
    res.status(500).json({ error: 'Failed to fetch transporter' });
  }
});

// ---------------------------------------------------------------------------
// POST /transporters  — create a new transporter
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const transporter = await transporterService.createTransporter(req.body);
    res.status(201).json(transporter);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error creating transporter:', error);
    res.status(500).json({ error: 'Failed to create transporter' });
  }
});

// ---------------------------------------------------------------------------
// PUT /transporters/:id  — update a transporter
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const transporter = await transporterService.updateTransporter(req.params.id, req.body);
    res.json(transporter);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error updating transporter:', error);
    res.status(500).json({ error: 'Failed to update transporter' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /transporters/:id  — soft-delete a transporter
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    await transporterService.deleteTransporter(req.params.id);
    res.json({ message: 'Transporter deleted successfully' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error deleting transporter:', error);
    res.status(500).json({ error: 'Failed to delete transporter' });
  }
});

module.exports = router;
