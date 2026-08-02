const express = require('express');
const router = express.Router();
const availabilityService = require('../services/availabilityService');

// POST check product availability for given dates
router.post('/check', async (req, res) => {
  try {
    const { product_id, date_from, date_to, size } = req.body;
    
    if (!product_id || !date_from || !date_to) {
      return res.status(400).json({ error: 'product_id, date_from, and date_to are required' });
    }

    console.log(`🔍 Checking availability for product ${product_id}${size ? ` size ${size}` : ''} from ${date_from} to ${date_to}`);

    const result = await availabilityService.checkProductAvailability(
      product_id,
      date_from,
      date_to,
      size || null
    );

    if (!result.available) {
      console.log(`❌ Product ${product_id} is NOT available. ${result.conflicts.length} conflict(s) found.`);
    } else {
      console.log(`✅ Product ${product_id} is available!`);
    }

    res.json(result);
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// POST bulk check availability for multiple products
router.post('/check-bulk', async (req, res) => {
  try {
    const { products } = req.body; // Array of { product_id, date_from, date_to }
    
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'products array is required' });
    }

    const result = await availabilityService.checkBulkAvailability(products);
    
    res.json(result);
  } catch (error) {
    console.error('Error checking bulk availability:', error);
    res.status(500).json({ error: 'Failed to check bulk availability' });
  }
});

module.exports = router;

