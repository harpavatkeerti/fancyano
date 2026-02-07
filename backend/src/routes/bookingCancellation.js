const express = require('express');
const router = express.Router();
const productLifecycleService = require('../services/productLifecycleService');
const chargeAccountingService = require('../services/chargeAccountingService');
const bookingService = require('../services/bookingService');

// GET cancellation preview for a booking (all cancellable products with penalties & financials)
router.get('/preview/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const preview = await productLifecycleService.calculateCancellationPreview(
      parseInt(bookingId)
    );
    
    res.json(preview);
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error getting cancellation preview:', error);
    res.status(500).json({ error: 'Failed to get cancellation preview', details: error.message });
  }
});

// GET cancellation eligibility/info for a booking product
router.get('/info/:booking_product_id', async (req, res) => {
  try {
    const { booking_product_id } = req.params;
    
    const info = await productLifecycleService.validateCancellationEligibility(
      parseInt(booking_product_id)
    );
    
    res.json(info);
  } catch (error) {
    console.error('Error getting cancellation info:', error);
    res.status(500).json({ error: 'Failed to get cancellation info', details: error.message });
  }
});

// POST cancel product(s) in a booking
router.post('/', async (req, res) => {
  try {
    const {
      booking_product_ids, // Array of booking_product IDs to cancel
      cancellation_penalties, // Array of { booking_product_id, penalty_amount }
      cancellation_reason,
      cancelled_by
    } = req.body;
    
    if (!booking_product_ids || !Array.isArray(booking_product_ids) || booking_product_ids.length === 0) {
      return res.status(400).json({ 
        error: 'booking_product_ids array is required',
        example: { booking_product_ids: [1, 2], cancellation_penalties: [{ booking_product_id: 1, penalty_amount: 300 }] }
      });
    }
    
    const results = [];
    
    // Cancel each product
    for (const bpId of booking_product_ids) {
      const penaltyInfo = cancellation_penalties?.find(p => p.booking_product_id === bpId);
      const penaltyAmount = penaltyInfo?.penalty_amount || 0;
      
      const result = await productLifecycleService.cancelProduct(
        bpId,
        penaltyAmount,
        cancellation_reason || 'Cancelled by user',
        cancelled_by || 'system'
      );
      
      results.push(result);
    }
    
    res.json({
      message: `${booking_product_ids.length} product(s) cancelled successfully`,
      cancelled_products: results
    });
  } catch (error) {
    if (error.message.includes('Cannot cancel')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error cancelling products:', error);
    res.status(500).json({ error: 'Failed to cancel products', details: error.message });
  }
});

// GET cancellation penalty suggestion for a booking product
router.get('/penalty-suggestion/:booking_product_id', async (req, res) => {
  try {
    const { booking_product_id } = req.params;
    
    const suggestion = await productLifecycleService.getCancellationPenaltySuggestion(
      parseInt(booking_product_id)
    );
    
    res.json(suggestion);
  } catch (error) {
    if (error.message === 'Booking product not found') {
      return res.status(404).json({ error: 'Booking product not found' });
    }
    console.error('Error getting cancellation penalty suggestion:', error);
    res.status(500).json({ error: 'Failed to get penalty suggestion', details: error.message });
  }
});

module.exports = router;
