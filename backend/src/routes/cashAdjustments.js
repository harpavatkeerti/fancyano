/**
 * cashAdjustments.js — Route handlers for cash tally adjustments.
 *
 * All business logic lives in cashAdjustmentService.js.
 * This file only handles HTTP request/response and delegates to the service.
 */

const express = require('express');
const router = express.Router();
const cashAdjustmentService = require('../services/cashAdjustmentService');
const requireRole = require('../middleware/requireRole');

// GET /cash-adjustments — List all adjustments (admin sees all, salesman sees own)
router.get('/', async (req, res) => {
  try {
    const { status, start_date, end_date } = req.query;
    const adjustments = await cashAdjustmentService.list({
      status, start_date, end_date,
      recorded_by: req.user.role === 'salesman' ? req.user.name : undefined
    });
    res.json(adjustments);
  } catch (error) {
    console.error('Error fetching cash adjustments:', error);
    res.status(500).json({ error: 'Failed to fetch cash adjustments' });
  }
});

// GET /cash-adjustments/pending-count — Count of pending adjustments (admin notification badge)
router.get('/pending-count', requireRole('admin'), async (req, res) => {
  try {
    const count = await cashAdjustmentService.getPendingCount();
    res.json({ count });
  } catch (error) {
    console.error('Error fetching pending count:', error);
    res.status(500).json({ error: 'Failed to fetch pending count' });
  }
});

// GET /cash-adjustments/summary — Summary for a date range (admin only)
router.get('/summary', requireRole('admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const summary = await cashAdjustmentService.getSummary({ start_date, end_date });
    res.json(summary);
  } catch (error) {
    console.error('Error fetching adjustment summary:', error);
    res.status(500).json({ error: 'Failed to fetch adjustment summary' });
  }
});

// GET /cash-adjustments/:id — Get single adjustment
router.get('/:id', async (req, res) => {
  try {
    const adjustment = await cashAdjustmentService.getById(parseInt(req.params.id));
    res.json(adjustment);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Error fetching cash adjustment:', error);
    res.status(500).json({ error: 'Failed to fetch cash adjustment' });
  }
});

// POST /cash-adjustments — Create a new adjustment
router.post('/', async (req, res) => {
  try {
    const { amount, reason, adjustment_date } = req.body;
    const adjustment = await cashAdjustmentService.create({
      amount,
      reason,
      adjustment_date,
      recorded_by: req.user.name,
      user_role: req.user.role
    });
    res.status(201).json(adjustment);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating cash adjustment:', error);
    res.status(500).json({ error: 'Failed to create cash adjustment' });
  }
});

// PUT /cash-adjustments/:id/approve — Approve a pending adjustment (admin only)
router.put('/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    const adjustment = await cashAdjustmentService.approve(
      parseInt(req.params.id),
      req.user.name
    );
    res.json(adjustment);
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error approving cash adjustment:', error);
    res.status(500).json({ error: 'Failed to approve cash adjustment' });
  }
});

// PUT /cash-adjustments/:id/reject — Reject a pending adjustment (admin only)
router.put('/:id/reject', requireRole('admin'), async (req, res) => {
  try {
    const adjustment = await cashAdjustmentService.reject(
      parseInt(req.params.id),
      req.user.name
    );
    res.json(adjustment);
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error rejecting cash adjustment:', error);
    res.status(500).json({ error: 'Failed to reject cash adjustment' });
  }
});

module.exports = router;
