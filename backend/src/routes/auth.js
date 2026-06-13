const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../database/connection');
const { generateToken, verifyToken, JWT_SECRET } = require('../middleware/auth');

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, name, password } = req.body;

    // Username (or name) and password are both required
    if (!username && !name) {
      return res.status(400).json({ error: 'Username or name is required' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Build query — search by username or name
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (username) {
      paramCount++;
      query += ` AND username = $${paramCount}`;
      params.push(username);
    } else if (name) {
      paramCount++;
      query += ` AND name = $${paramCount}`;
      params.push(name);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password with bcrypt
    if (!user.password) {
      return res.status(401).json({ error: 'Account has no password set. Contact admin.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const { token, expiresAt } = generateToken(user);

    // Build user response (no password)
    const userResponse = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      phone: user.phone,
      email: user.email
    };

    res.json({
      success: true,
      token,
      user: userResponse,
      expiresAt
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token endpoint — frontend calls this to check if stored token is still valid
router.post('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ valid: false, error: 'Invalid token format' });
    }

    const token = parts[1];
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, JWT_SECRET);

    // Optionally verify user still exists in DB
    const result = await pool.query('SELECT id, name, username, role, phone, email FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ valid: false, error: 'User not found' });
    }

    res.json({
      valid: true,
      user: result.rows[0]
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ valid: false, error: 'Token expired' });
    }
    return res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

module.exports = router;
