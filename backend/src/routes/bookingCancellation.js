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

// POST calculate cancellation summary for selected products (live preview)
// Frontend sends selection + penalty overrides + extra refund, backend returns all computed values
router.post('/calculate-summary', async (req, res) => {
  try {
    const {
      booking_id,
      selected_product_ids,
      penalty_overrides,
      extra_refund
    } = req.body;

    if (!booking_id || !selected_product_ids || !Array.isArray(selected_product_ids)) {
      return res.status(400).json({
        error: 'booking_id and selected_product_ids array are required'
      });
    }

    const summary = await productLifecycleService.calculateCancellationSummary(
      parseInt(booking_id),
      selected_product_ids.map(id => parseInt(id)),
      penalty_overrides || {},
      parseInt(extra_refund) || 0
    );

    res.json(summary);
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error calculating cancellation summary:', error);
    res.status(500).json({ error: 'Failed to calculate cancellation summary', details: error.message });
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
      cancelled_by,
      settlement_action, // 'refund' | 'adjust' | 'none' (optional, default 'none')
      payment_method,    // Payment method (e.g. 'Cash', 'UPI')
      settlement_notes   // Optional notes for settlement
    } = req.body;

    if (!booking_product_ids || !Array.isArray(booking_product_ids) || booking_product_ids.length === 0) {
      return res.status(400).json({
        error: 'booking_product_ids array is required',
        example: {
          booking_product_ids: [1, 2],
          cancellation_penalties: [{ booking_product_id: 1, penalty_amount: 300 }],
          settlement_action: 'refund',
          payment_method: 'Cash'
        }
      });
    }

    const results = [];

    // Get the preview to know the policy-based default penalties per product
    // This ensures that when no manual override is provided, the correct penalty is applied
    const firstBp = await require('../database/connection').query(
      'SELECT booking_id FROM booking_products WHERE id = $1', [booking_product_ids[0]]
    );
    const previewBookingId = firstBp.rows[0]?.booking_id;
    let defaultPenalties = {};
    if (previewBookingId) {
      const preview = await productLifecycleService.calculateCancellationPreview(previewBookingId);
      for (const product of preview.products_to_cancel) {
        defaultPenalties[product.product_id] = product.penalty_amount;
      }
    }

    // Cancel each product
    for (const bpId of booking_product_ids) {
      const penaltyInfo = cancellation_penalties?.find(p => p.booking_product_id === bpId);
      // Use manual override if provided, otherwise use policy-based default
      const penaltyAmount = penaltyInfo ? penaltyInfo.penalty_amount : (defaultPenalties[bpId] || 0);

      const result = await productLifecycleService.cancelProduct(
        bpId,
        penaltyAmount,
        cancellation_reason || 'Cancelled by user',
        cancelled_by || 'system',
        {
          action: settlement_action || 'none',
          method: payment_method || 'Cash',
          notes: settlement_notes
        }
      );
      
      results.push(result);
    }

    // Aggregate results
    const totalDiffAmount = results.reduce((sum, r) => sum + (r.diff_amount || 0), 0);
    
    res.json({
      message: `${booking_product_ids.length} product(s) cancelled successfully`,
      cancelled_products: results,
      total_diff_amount: totalDiffAmount,
      settlement: results[0]?.settlement || null
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
