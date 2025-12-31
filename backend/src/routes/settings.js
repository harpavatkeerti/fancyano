const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// Get all settings
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM settings ORDER BY category, setting_key'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get setting by key
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const result = await pool.query(
      'SELECT * FROM settings WHERE setting_key = $1',
      [key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Get settings by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const result = await pool.query(
      'SELECT * FROM settings WHERE category = $1 ORDER BY setting_key',
      [category]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching settings by category:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update setting
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { setting_value, description } = req.body;
    
    const result = await pool.query(
      `UPDATE settings 
       SET setting_value = $1, 
           description = COALESCE($2, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE setting_key = $3
       RETURNING *`,
      [setting_value, description, key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Create new setting
router.post('/', async (req, res) => {
  try {
    const { setting_key, setting_value, setting_type, description, category } = req.body;
    
    const result = await pool.query(
      `INSERT INTO settings (setting_key, setting_value, setting_type, description, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [setting_key, setting_value, setting_type || 'string', description, category || 'general']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Setting key already exists' });
    }
    console.error('Error creating setting:', error);
    res.status(500).json({ error: 'Failed to create setting' });
  }
});

// Delete setting
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const result = await pool.query(
      'DELETE FROM settings WHERE setting_key = $1 RETURNING *',
      [key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ message: 'Setting deleted successfully', setting: result.rows[0] });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

module.exports = router;

