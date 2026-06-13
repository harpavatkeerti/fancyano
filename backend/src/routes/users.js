const express = require('express');
const router = express.Router();
const { hashPassword } = require('../middleware/auth');
const pool = require('../database/connection');

// GET all users
router.get('/', async (req, res) => {
  try {
    const { role, search } = req.query;
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(role);
    }

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    // Remove passwords from response for security
    const usersWithoutPasswords = result.rows.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Do NOT return password hash
    const { password, ...userWithoutPassword } = result.rows[0];
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST create user
router.post('/', async (req, res) => {
  try {
    const { name, phone, role, username, password, email, address } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }
    
    // Auto-generate username if not provided
    const finalUsername = username || name.toLowerCase().replace(/\s+/g, '');

    // Hash password with bcrypt (password is mandatory)
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    const hashedPassword = await hashPassword(password);

    const result = await pool.query(
      'INSERT INTO users (name, phone, role, username, password, email, address) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, phone, role || 'customer', finalUsername, hashedPassword, email || null, address || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      if (error.constraint === 'users_phone_key') {
        return res.status(409).json({ error: 'Phone number already exists' });
      } else if (error.constraint === 'users_username_key') {
        return res.status(409).json({ error: 'Username already exists' });
      }
      return res.status(409).json({ error: 'Duplicate entry' });
    }
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT update user
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, role, username, password, email, address } = req.body;

    // Build dynamic query based on provided fields
    let query = 'UPDATE users SET ';
    const values = [];
    const updates = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      values.push(name);
    }
    if (phone !== undefined) {
      paramCount++;
      updates.push(`phone = $${paramCount}`);
      values.push(phone);
    }
    if (role !== undefined) {
      paramCount++;
      updates.push(`role = $${paramCount}`);
      values.push(role);
    }
    if (username !== undefined) {
      paramCount++;
      updates.push(`username = $${paramCount}`);
      values.push(username);
    }
    if (password !== undefined && password !== null && password.trim() !== '') {
      // Hash password with bcrypt before storing
      const hashedPassword = await hashPassword(password);
      paramCount++;
      updates.push(`password = $${paramCount}`);
      values.push(hashedPassword);
    }
    if (email !== undefined) {
      paramCount++;
      updates.push(`email = $${paramCount}`);
      values.push(email);
    }
    if (address !== undefined) {
      paramCount++;
      updates.push(`address = $${paramCount}`);
      values.push(address);
    }
    
    // Always update the timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    query += updates.join(', ');
    paramCount++;
    query += ` WHERE id = $${paramCount} RETURNING *`;
    values.push(id);

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      if (error.constraint === 'users_phone_key') {
        return res.status(409).json({ error: 'Phone number already exists' });
      } else if (error.constraint === 'users_username_key') {
        return res.status(409).json({ error: 'Username already exists' });
      }
      return res.status(409).json({ error: 'Duplicate entry' });
    }
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;

