const express = require('express');
const router = express.Router();
const settingsService = require('../services/settingsService');
const requireRole = require('../middleware/requireRole');

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await settingsService.getAll();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get setting by key
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await settingsService.getByKey(key);
    
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json(setting);
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Get settings by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await settingsService.getByCategory(category);
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings by category:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update setting — admin only
router.put('/:key', requireRole('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const { setting_value, description } = req.body;
    
    const setting = await settingsService.update(key, { setting_value, description });
    
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json(setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Create new setting — admin only
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { setting_key, setting_value, setting_type, description, category } = req.body;
    
    const setting = await settingsService.create({
      setting_key, setting_value, setting_type, description, category
    });
    
    res.status(201).json(setting);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Setting key already exists' });
    }
    console.error('Error creating setting:', error);
    res.status(500).json({ error: 'Failed to create setting' });
  }
});

// Delete setting — admin only
router.delete('/:key', requireRole('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    
    const setting = await settingsService.delete(key);
    
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ message: 'Setting deleted successfully', setting });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

module.exports = router;
