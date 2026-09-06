const express = require('express');
const router = express.Router();
const measurementTemplatesService = require('../services/measurementTemplatesService');

// ── GET /api/measurement-templates ──────────────────────────────────────────
// Returns all active measurement templates.
router.get('/', async (req, res) => {
  try {
    const templates = await measurementTemplatesService.getAll();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching measurement templates:', error);
    res.status(500).json({ error: 'Failed to fetch measurement templates' });
  }
});

// ── GET /api/measurement-templates/:id ──────────────────────────────────────
// Returns a single measurement template by ID.
router.get('/:id', async (req, res) => {
  try {
    const template = await measurementTemplatesService.getById(parseInt(req.params.id));
    res.json(template);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error fetching measurement template:', error);
    res.status(500).json({ error: 'Failed to fetch measurement template' });
  }
});

// ── POST /api/measurement-templates ─────────────────────────────────────────
// Create a new measurement template.
router.post('/', async (req, res) => {
  try {
    const { name, fields, display_order } = req.body;
    const template = await measurementTemplatesService.create(name, fields, display_order);
    res.status(201).json(template);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'A template with this name already exists' });
    console.error('Error creating measurement template:', error);
    res.status(500).json({ error: 'Failed to create measurement template' });
  }
});

// ── PUT /api/measurement-templates/:id ──────────────────────────────────────
// Update a measurement template.
router.put('/:id', async (req, res) => {
  try {
    const { name, fields, display_order } = req.body;
    const template = await measurementTemplatesService.update(parseInt(req.params.id), { name, fields, display_order });
    res.json(template);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'A template with this name already exists' });
    console.error('Error updating measurement template:', error);
    res.status(500).json({ error: 'Failed to update measurement template' });
  }
});

// ── DELETE /api/measurement-templates/:id ───────────────────────────────────
// Soft-delete a measurement template. Blocked if product types reference it.
router.delete('/:id', async (req, res) => {
  try {
    const result = await measurementTemplatesService.delete(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error deleting measurement template:', error);
    res.status(500).json({ error: 'Failed to delete measurement template' });
  }
});

module.exports = router;
