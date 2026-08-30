/**
 * bankAccounts.js — Route handlers for bank account management (Settings).
 *
 * All business logic lives in bankAccountService.js.
 */

const express = require('express');
const router = express.Router();
const bankAccountService = require('../services/bankAccountService');
const requireRole = require('../middleware/requireRole');

// All bank account routes are admin-only
router.use(requireRole('admin'));

// GET /bank-accounts — List all bank accounts
router.get('/', async (req, res) => {
  try {
    const { active_only } = req.query;
    const accounts = await bankAccountService.list({ active_only: active_only === 'true' });
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

// GET /bank-accounts/:id — Get single bank account
router.get('/:id', async (req, res) => {
  try {
    const account = await bankAccountService.getById(parseInt(req.params.id));
    res.json(account);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error fetching bank account:', error);
    res.status(500).json({ error: 'Failed to fetch bank account' });
  }
});

// POST /bank-accounts — Create a new bank account
router.post('/', async (req, res) => {
  try {
    const account = await bankAccountService.create(req.body);
    res.status(201).json(account);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error creating bank account:', error);
    res.status(500).json({ error: 'Failed to create bank account' });
  }
});

// PUT /bank-accounts/:id — Update a bank account
router.put('/:id', async (req, res) => {
  try {
    const account = await bankAccountService.update(parseInt(req.params.id), req.body);
    res.json(account);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('Error updating bank account:', error);
    res.status(500).json({ error: 'Failed to update bank account' });
  }
});

// DELETE /bank-accounts/:id — Delete a bank account
router.delete('/:id', async (req, res) => {
  try {
    const account = await bankAccountService.delete(parseInt(req.params.id));
    res.json(account);
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error deleting bank account:', error);
    res.status(500).json({ error: 'Failed to delete bank account' });
  }
});

module.exports = router;
