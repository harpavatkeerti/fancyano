/**
 * expenses.js — Route handlers for expense tracking.
 *
 * All business logic lives in expenseService.js.
 */

const express = require('express');
const router = express.Router();
const expenseService = require('../services/expenseService');
const requireRole = require('../middleware/requireRole');

// GET /expenses — List all expenses (admin sees all, salesman sees own)
router.get('/', async (req, res) => {
  try {
    const { category, start_date, end_date } = req.query;
    const expenses = await expenseService.list({
      category, start_date, end_date,
      recorded_by: req.user.role === 'salesman' ? req.user.name : undefined
    });
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// GET /expenses/pending-count — Count of pending expenses (admin notification badge)
router.get('/pending-count', requireRole('admin'), async (req, res) => {
  try {
    const count = await expenseService.getPendingCount();
    res.json({ count });
  } catch (error) {
    console.error('Error fetching pending count:', error);
    res.status(500).json({ error: 'Failed to fetch pending count' });
  }
});

// GET /expenses/summary — Category-wise summary
router.get('/summary', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const summary = await expenseService.getSummaryByCategory({ start_date, end_date });
    res.json(summary);
  } catch (error) {
    console.error('Error fetching expense summary:', error);
    res.status(500).json({ error: 'Failed to fetch expense summary' });
  }
});

// GET /expenses/daily — Daily totals
router.get('/daily', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const daily = await expenseService.getDailyTotals({ start_date, end_date });
    res.json(daily);
  } catch (error) {
    console.error('Error fetching daily totals:', error);
    res.status(500).json({ error: 'Failed to fetch daily totals' });
  }
});

// ── Recurring Expenses (MUST be before /:id to avoid route conflict) ──

// GET /expenses/recurring — List recurring expenses
router.get('/recurring', async (req, res) => {
  try {
    const data = await expenseService.listRecurring();
    res.json(data);
  } catch (error) {
    console.error('Error fetching recurring expenses:', error);
    res.status(500).json({ error: 'Failed to fetch recurring expenses' });
  }
});

// POST /expenses/recurring — Create a recurring expense
router.post('/recurring', async (req, res) => {
  try {
    const data = await expenseService.createRecurring({
      ...req.body,
      created_by: req.user.name,
      user_role: req.user.role
    });
    res.status(201).json(data);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error creating recurring expense:', error);
    res.status(500).json({ error: 'Failed to create recurring expense' });
  }
});

// POST /expenses/recurring/process — Process all due recurring expenses
router.post('/recurring/process', async (req, res) => {
  try {
    const created = await expenseService.processDueRecurring();
    res.json({ processed: created.length, expenses: created });
  } catch (error) {
    console.error('Error processing recurring expenses:', error);
    res.status(500).json({ error: 'Failed to process recurring expenses' });
  }
});

// PUT /expenses/recurring/:id/activate — Reactivate
router.put('/recurring/:id/activate', async (req, res) => {
  try {
    const data = await expenseService.activateRecurring(parseInt(req.params.id));
    res.json(data);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error activating recurring expense:', error);
    res.status(500).json({ error: 'Failed to activate recurring expense' });
  }
});

// PUT /expenses/recurring/:id/deactivate — Pause
router.put('/recurring/:id/deactivate', async (req, res) => {
  try {
    const data = await expenseService.deactivateRecurring(parseInt(req.params.id));
    res.json(data);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error deactivating recurring expense:', error);
    res.status(500).json({ error: 'Failed to deactivate recurring expense' });
  }
});

// PUT /expenses/recurring/:id/approve — Approve a pending recurring expense (admin only)
router.put('/recurring/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    const data = await expenseService.approveRecurring(
      parseInt(req.params.id),
      req.user.name
    );
    res.json(data);
  } catch (error) {
    if (error.status === 400 || error.status === 404) return res.status(error.status).json({ error: error.message });
    console.error('Error approving recurring expense:', error);
    res.status(500).json({ error: 'Failed to approve recurring expense' });
  }
});

// PUT /expenses/recurring/:id/reject — Reject a pending recurring expense (admin only)
router.put('/recurring/:id/reject', requireRole('admin'), async (req, res) => {
  try {
    const data = await expenseService.rejectRecurring(
      parseInt(req.params.id),
      req.user.name
    );
    res.json(data);
  } catch (error) {
    if (error.status === 400 || error.status === 404) return res.status(error.status).json({ error: error.message });
    console.error('Error rejecting recurring expense:', error);
    res.status(500).json({ error: 'Failed to reject recurring expense' });
  }
});

// DELETE /expenses/recurring/:id — Delete
router.delete('/recurring/:id', async (req, res) => {
  try {
    const data = await expenseService.deleteRecurring(parseInt(req.params.id));
    res.json(data);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error deleting recurring expense:', error);
    res.status(500).json({ error: 'Failed to delete recurring expense' });
  }
});

// ── Single expense CRUD (/:id routes MUST come after /recurring) ──────

// GET /expenses/:id — Get single expense
router.get('/:id', async (req, res) => {
  try {
    const expense = await expenseService.getById(parseInt(req.params.id));
    res.json(expense);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error fetching expense:', error);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

// POST /expenses — Create a new expense
router.post('/', async (req, res) => {
  try {
    const { category, amount, description, expense_date, payment_source } = req.body;
    const expense = await expenseService.create({
      category, amount, description, expense_date, payment_source,
      recorded_by: req.user.name,
      user_role: req.user.role
    });
    res.status(201).json(expense);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// PUT /expenses/:id/approve — Approve a pending expense (admin only)
router.put('/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    const expense = await expenseService.approve(
      parseInt(req.params.id),
      req.user.name
    );
    res.json(expense);
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error approving expense:', error);
    res.status(500).json({ error: 'Failed to approve expense' });
  }
});

// PUT /expenses/:id/reject — Reject a pending expense (admin only)
router.put('/:id/reject', requireRole('admin'), async (req, res) => {
  try {
    const expense = await expenseService.reject(
      parseInt(req.params.id),
      req.user.name
    );
    res.json(expense);
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error rejecting expense:', error);
    res.status(500).json({ error: 'Failed to reject expense' });
  }
});

// PUT /expenses/:id — Update an expense
router.put('/:id', async (req, res) => {
  try {
    const expense = await expenseService.update(parseInt(req.params.id), req.body);
    res.json(expense);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// DELETE /expenses/:id — Delete an expense
router.delete('/:id', async (req, res) => {
  try {
    const expense = await expenseService.delete(parseInt(req.params.id));
    res.json(expense);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

module.exports = router;
