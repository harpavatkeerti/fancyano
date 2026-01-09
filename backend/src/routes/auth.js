const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, name, password, role } = req.body;
    
    // Build query - search by username or name first
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    // Add role filter if provided
    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(role);
    }
    
    // Add username or name filter
    if (username) {
      paramCount++;
      query += ` AND username = $${paramCount}`;
      params.push(username);
    } else if (name) {
      paramCount++;
      query += ` AND name = $${paramCount}`;
      params.push(name);
    } else {
      return res.status(400).json({ error: 'Username or name is required' });
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Check if user has a password set
    const hasPassword = user.password && user.password.trim() !== '';
    
    // If user has password, verify it
    if (hasPassword) {
      if (!password) {
        return res.status(400).json({ error: 'Password is required for this account' });
      }
      if (user.password !== password) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }
    // If user doesn't have password, allow login without password (backward compatibility)
    
    // Don't send password back
    delete user.password;
    
    res.json({
      success: true,
      user: user
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;

