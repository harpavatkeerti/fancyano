const express = require('express');
const router = express.Router();
const productLifecycleService = require('../services/productLifecycleService');
const chargeAccountingService = require('../services/chargeAccountingService');
const bookingService = require('../services/bookingService');
const checkSalesmanPermission = require('../middleware/checkSalesmanPermission');

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
// Salesman requires cancellation_allowed permission (this is part of the cancel flow)
router.post('/calculate-summary', checkSalesmanPermission('cancellation_allowed'), async (req, res) => {
  try {
    const {
      booking_id,
      selected_product_ids
    } = req.body;

    if (!booking_id || !selected_product_ids || !Array.isArray(selected_product_ids)) {
      return res.status(400).json({
        error: 'booking_id and selected_product_ids array are required'
      });
    }

    const summary = await productLifecycleService.calculateCancellationSummary(
      parseInt(booking_id),
      selected_product_ids.map(id => parseInt(id))
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

// POST cancel product(s) in a booking — salesman requires cancellation_allowed permission
router.post('/', checkSalesmanPermission('cancellation_allowed'), async (req, res) => {
  try {
    const {
      booking_product_ids, // Array of booking_product IDs to cancel
      cancellation_reason,
      cancelled_by,
      extra_refund,      // Integer: editedRefund - calculatedRefund
      extra_refund_note, // Optional note explaining the refund adjustment
      settlement_action, // 'adjust' | 'adjust_security' | 'refund' | 'none' (default 'none')
      payment_method,    // Payment method (e.g. 'Cash', 'UPI')
      settlement_notes,  // Optional notes for settlement
      security_product_ids  // Required when settlement_action === 'adjust_security'
    } = req.body;

    if (!booking_product_ids || !Array.isArray(booking_product_ids) || booking_product_ids.length === 0) {
      return res.status(400).json({
        error: 'booking_product_ids array is required',
        example: {
          booking_product_ids: [1, 2],
          extra_refund: 0,
          settlement_action: 'adjust',
          payment_method: 'Cash'
        }
      });
    }

    // Resolve booking_id from the first booking_product
    const bookingId = await bookingService.getBookingIdByBookingProductId(booking_product_ids[0]);
    if (!bookingId) {
      return res.status(404).json({ error: 'Booking not found for the given product' });
    }

    // Delegate everything to the service layer
    const result = await productLifecycleService.cancelProducts({
      bookingId,
      bookingProductIds: booking_product_ids,
      cancellationReason: cancellation_reason,
      cancelledBy: cancelled_by || req.user?.id || 'system',
      extraRefund: parseInt(extra_refund) || 0,
      extraRefundNote: extra_refund_note || settlement_notes,
      settlementAction: settlement_action || 'none',
      paymentMethod: payment_method || 'Cash',
      securityProductIds: security_product_ids || []
    });

    res.json(result);
  } catch (error) {
    if (error.message.includes('Cannot cancel') || error.message.includes('Invalid extra_refund')) {
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
