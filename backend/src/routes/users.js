const express = require('express');
const router = express.Router();
const usersService = require('../services/usersService');
const requireRole = require('../middleware/requireRole');

// ---------------------------------------------------------------------------
// GET /users  — list all non-deleted users (admin only)
// ---------------------------------------------------------------------------
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const { role, search } = req.query;
    const users = await usersService.listUsers({ role, search });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ---------------------------------------------------------------------------
// GET /users/search?phone=<substring>  — autocomplete for booking form
// Accessible to all authenticated users (salesman, customer, admin).
// IMPORTANT: must be defined BEFORE /:id
// ---------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  try {
    const { phone } = req.query;
    const users = await usersService.searchUsers(phone);
    res.json(users);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error searching users by phone:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// ---------------------------------------------------------------------------
// GET /users/:id  — fetch full user details (no password hash)
// Accessible to all authenticated users.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const user = await usersService.getUserById(req.params.id);
    res.json(user);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ---------------------------------------------------------------------------
// POST /users  — create customer
// Accessible to all authenticated users (salesman / customer can create
// new customers during the booking flow).
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const created = await usersService.createUser(req.body);
    res.status(201).json(created);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ---------------------------------------------------------------------------
// PUT /users/:id  — update user details
// Salesman and customer may update: name, alternate_phone,
// alternate_phone_country, email, address.
// Only admin may change: role, username, password.
// Phone and phone_country are never editable (set at creation).
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const callerRole = req.user.role;
    const body = { ...req.body };

    // Strip privilege-escalation fields for non-admin callers
    if (callerRole !== 'admin') {
      delete body.role;
      delete body.username;
      delete body.password;
    }

    const updated = await usersService.updateUser(req.params.id, body);
    res.json(updated);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /users/:id  — soft delete only (admin only)
// Blocked if user has any non-cancelled / non-completed bookings.
// ---------------------------------------------------------------------------
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await usersService.deleteUser(req.params.id);
    res.json({ message: 'Customer deactivated successfully.' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

module.exports = router;
