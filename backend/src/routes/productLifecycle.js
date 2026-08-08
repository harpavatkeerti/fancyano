const express = require('express');
const router = express.Router();
const productLifecycleService = require('../services/productLifecycleService');

// POST pickup product(s)
router.post('/:bookingId/products/pickup', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { booking_product_ids, picked_up_by } = req.body;

    if (!booking_product_ids || !Array.isArray(booking_product_ids) || booking_product_ids.length === 0) {
      return res.status(400).json({
        error: 'booking_product_ids array is required',
        example: { booking_product_ids: [1, 2], picked_up_by: 'user_id' }
      });
    }

    // Validate eligibility for each product
    for (const bpId of booking_product_ids) {
      const validation = await productLifecycleService.validatePickupEligibility(bpId);
      
      if (!validation.eligible) {
        return res.status(400).json({
          error: `Product ${bpId}: ${validation.reason}`,
          details: validation
        });
      }
    }

    // Pickup products
    const result = await productLifecycleService.pickupProducts(
      parseInt(bookingId),
      booking_product_ids,
      picked_up_by || 'system'
    );

    res.json({
      success: true,
      message: `${booking_product_ids.length} product(s) picked up successfully`,
      pickup_details: result
    });
  } catch (error) {
    console.error('Error picking up products:', error);
    res.status(500).json({ error: 'Failed to pickup products', details: error.message });
  }
});

// POST return product(s)
router.post('/:bookingId/products/return', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { returns, returned_by } = req.body;

    if (!returns || !Array.isArray(returns) || returns.length === 0) {
      return res.status(400).json({
        error: 'returns array is required',
        example: {
          returns: [
            { booking_product_id: 1, damage_fee: 0 },
            { booking_product_id: 2, damage_fee: 500 }
          ],
          returned_by: 'user_id'
        }
      });
    }

    // Validate each return entry
    for (const ret of returns) {
      if (!ret.booking_product_id) {
        return res.status(400).json({
          error: 'Each return entry must have booking_product_id'
        });
      }
    }

    // Format returns for service
    const formattedReturns = returns.map(r => ({
      bookingProductId: r.booking_product_id,
      damageFee: r.damage_fee || 0
    }));

    const result = await productLifecycleService.returnProducts(
      parseInt(bookingId),
      formattedReturns,
      returned_by || 'system'
    );

    res.json({
      success: true,
      message: `${returns.length} product(s) returned successfully`,
      return_details: result
    });
  } catch (error) {
    if (error.message.includes('not found or not in in_progress status')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error returning products:', error);
    res.status(500).json({ error: 'Failed to return products', details: error.message });
  }
});
// GET calculate security return amounts (read-only).
// ?deduction_amount=<number> — pass the intended deduction so the backend computes
// the full split (auto_adjust, remainder, eligible_security_products) server-side.
// The frontend MUST NOT compute any of these values itself.
router.get('/:bookingId/products/:productId/security-refund/calculate', async (req, res) => {
  try {
    const { productId } = req.params;
    const deductionAmount = Number(req.query.deduction_amount) || 0;

    const result = await productLifecycleService.calculateSecurityReturn(
      parseInt(productId),
      deductionAmount
    );

    res.json({ success: true, security_calculation: result });
  } catch (error) {
    const isClientError = error.message.includes('not found');
    if (isClientError) return res.status(400).json({ error: error.message });
    console.error('Error calculating security return:', error);
    res.status(500).json({ error: 'Failed to calculate security return', details: error.message });
  }
});

// POST process security return (validates and executes atomically)
router.post('/:bookingId/products/:productId/security-refund/process', async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      deduction_amount = 0,
      deduction_type = null,
      adjust_non_security = 0,
      adjust_security_amount = 0,
      security_product_ids = [],
      refund_amount = 0,
      payment_method = 'Cash',
      recorded_by,
      notes = ''
    } = req.body;

    if (!recorded_by) {
      return res.status(400).json({ error: 'recorded_by is required' });
    }

    const result = await productLifecycleService.processSecurityReturn(
      parseInt(productId),
      {
        deduction_amount: Number(deduction_amount),
        deduction_type,
        adjust_non_security: Number(adjust_non_security),
        adjust_security_amount: Number(adjust_security_amount),
        security_product_ids: Array.isArray(security_product_ids) ? security_product_ids : [],
        refund_amount: Number(refund_amount),
        payment_method,
        recorded_by,
        notes: notes || ''
      }
    );

    res.json({ success: true, security_return: result });
  } catch (error) {
    const isClientError = [
      'not found', 'completed', 'sum to security', 'non-negative',
      'deduction_type', 'security_product_ids'
    ].some(s => error.message.includes(s));

    if (isClientError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error processing security return:', error);
    res.status(500).json({ error: 'Failed to process security return', details: error.message });
  }
});

module.exports = router;
