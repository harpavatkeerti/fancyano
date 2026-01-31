/**
 * Booking Preview Routes
 * Provides preview calculations for bookings without persisting data
 */

const express = require('express');
const router = express.Router();
const bookingCalculationService = require('../services/bookingCalculationService');

/**
 * POST /preview
 * Calculate booking preview with discounts
 * 
 * Request body:
 * {
 *   products: [
 *     {
 *       id: number,
 *       discountType: 'percentage' | 'fixed' | null,
 *       discountValue: number
 *     }
 *   ],
 *   transport_charge: number,
 *   booking_discount_type: 'percentage' | 'amount' | null,
 *   booking_discount_value: number
 * }
 * 
 * Response:
 * {
 *   products: [
 *     {
 *       id: number,
 *       rent: number,
 *       effective_rent: number,
 *       discount_amount: number,
 *       discount_type: string,
 *       security_deposit: number
 *     }
 *   ],
 *   subtotal: number,  // Sum of all effective rents
 *   transport_charge: number,
 *   booking_discount_amount: number,
 *   total: number  // subtotal + transport - booking_discount
 * }
 */
router.post('/preview', async (req, res) => {
  try {
    const preview = await bookingCalculationService.calculateBookingPreview(req.body);
    res.json(preview);
  } catch (error) {
    console.error('Error calculating booking preview:', error);
    
    // Handle specific error types
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('required')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: 'Failed to calculate preview', 
      details: error.message 
    });
  }
});

module.exports = router;
