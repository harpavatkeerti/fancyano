const express = require('express');
const router = express.Router();
const productLifecycleService = require('../services/productLifecycleService');
const chargeAccountingService = require('../services/chargeAccountingService');
const bookingService = require('../services/bookingService');

// POST exchange product(s) in a booking
router.post('/', async (req, res) => {
  try {
    const {
      old_booking_product_id,
      new_product_ids, // Array of { product_id, booked_from, booked_to, rent, security_deposit }
      exchange_penalty,
      downgrade_penalty,
      exchange_reason,
      exchanged_by
    } = req.body;
    
    if (!old_booking_product_id || !new_product_ids || !Array.isArray(new_product_ids) || new_product_ids.length === 0) {
      return res.status(400).json({ 
        error: 'old_booking_product_id and new_product_ids array are required',
        example: { 
          old_booking_product_id: 1, 
          new_product_ids: [{ product_id: 2, booked_from: '2024-01-01', booked_to: '2024-01-05', rent: 500, security_deposit: 200 }],
          exchange_penalty: 100,
          downgrade_penalty: 50
        }
      });
    }
    
    // Perform exchange
    const result = await productLifecycleService.exchangeProduct(
      old_booking_product_id,
      new_product_ids,
      exchange_penalty || 0,
      downgrade_penalty || 0,
      exchange_reason || 'Product exchanged',
      exchanged_by || 'system'
    );
    
    res.json({
      message: 'Product exchange completed successfully',
      exchange_details: result
    });
  } catch (error) {
    if (error.message.includes('Cannot exchange')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error exchanging product:', error);
    res.status(500).json({ error: 'Failed to exchange product', details: error.message });
  }
});

// GET exchange penalty suggestion for a booking product
router.get('/penalty-suggestion/:booking_product_id', async (req, res) => {
  try {
    const { booking_product_id } = req.params;
    const { new_product_rent } = req.query;
    
    if (!new_product_rent) {
      return res.status(400).json({ error: 'new_product_rent query parameter is required' });
    }
    
    const suggestion = await productLifecycleService.getExchangePenaltySuggestion(
      parseInt(booking_product_id),
    );
    
    res.json(suggestion);
  } catch (error) {
    if (error.message === 'Booking product not found') {
      return res.status(404).json({ error: 'Booking product not found' });
    }
    console.error('Error getting exchange penalty suggestion:', error);
    res.status(500).json({ error: 'Failed to get penalty suggestion', details: error.message });
  }
});

module.exports = router;
