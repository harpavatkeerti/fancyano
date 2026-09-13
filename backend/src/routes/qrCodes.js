/**
 * qrCodes.js — Route handlers for QR code management.
 *
 * All business logic lives in qrCodeService.js.
 */

const express = require('express');
const router = express.Router();
const qrCodeService = require('../services/qrCodeService');
const requireRole = require('../middleware/requireRole');

// GET /qr-codes/active/:type — Get active QR code for a type (any authenticated user)
router.get('/active/:type', async (req, res) => {
  try {
    const code = await qrCodeService.getActive(req.params.type);
    res.json(code);
  } catch (error) {
    console.error('Error fetching active QR code:', error);
    res.status(500).json({ error: 'Failed to fetch active QR code' });
  }
});

// ── Admin-only routes below ──────────────────────────────────────────────

// GET /qr-codes — List all QR codes (admin only)
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const { qr_type, active_only } = req.query;
    const codes = await qrCodeService.list({ qr_type, active_only: active_only === 'true' });
    res.json(codes);
  } catch (error) {
    console.error('Error fetching QR codes:', error);
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

// POST /qr-codes — Create a new QR code (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const code = await qrCodeService.create(req.body);
    res.status(201).json(code);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error creating QR code:', error);
    res.status(500).json({ error: 'Failed to create QR code' });
  }
});

// PUT /qr-codes/:id/activate — Activate a QR code
router.put('/:id/activate', requireRole('admin'), async (req, res) => {
  try {
    const code = await qrCodeService.activate(parseInt(req.params.id));
    res.json(code);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error activating QR code:', error);
    res.status(500).json({ error: 'Failed to activate QR code' });
  }
});

// PUT /qr-codes/:id/deactivate — Deactivate a QR code
router.put('/:id/deactivate', requireRole('admin'), async (req, res) => {
  try {
    const code = await qrCodeService.deactivate(parseInt(req.params.id));
    res.json(code);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error deactivating QR code:', error);
    res.status(500).json({ error: 'Failed to deactivate QR code' });
  }
});

// DELETE /qr-codes/:id — Delete a QR code
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const code = await qrCodeService.delete(parseInt(req.params.id));
    res.json(code);
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error deleting QR code:', error);
    res.status(500).json({ error: 'Failed to delete QR code' });
  }
});

module.exports = router;
