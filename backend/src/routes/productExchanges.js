const express = require('express');
const router = express.Router();
const productLifecycleService = require('../services/productLifecycleService');
const chargeAccountingService = require('../services/chargeAccountingService');
const bookingService = require('../services/bookingService');
const bookingCalculationService = require('../services/bookingCalculationService');
const { ProductService } = require('../services/productService');
const checkSalesmanPermission = require('../middleware/checkSalesmanPermission');

// GET exchange eligibility check for a booking product
router.get('/eligibility/:booking_product_id', async (req, res) => {
  try {
    const { booking_product_id } = req.params;

    const eligibility = await productLifecycleService.validateExchangeEligibility(
      parseInt(booking_product_id)
    );

    res.json(eligibility);
  } catch (error) {
    console.error('Error checking exchange eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility', details: error.message });
  }
});

// GET exchange preview with all calculations
router.get('/preview/:old_booking_product_id', async (req, res) => {
  try {
    const { old_booking_product_id } = req.params;
    const { new_product_id, additional_product_ids, new_product_size, additional_product_sizes } = req.query;

    if (!new_product_id) {
      return res.status(400).json({ error: 'new_product_id query parameter is required' });
    }

    const additionalIds = additional_product_ids
      ? additional_product_ids.split(',').map(id => parseInt(id))
      : [];

    // Parse additional_product_sizes from JSON string (e.g. '{"123":"M","456":"L"}')
    let parsedAdditionalSizes = {};
    if (additional_product_sizes) {
      try {
        parsedAdditionalSizes = JSON.parse(additional_product_sizes);
      } catch (e) {
        // Ignore parse errors — sizes are optional
      }
    }

    const preview = await productLifecycleService.calculateExchangePreview(
      parseInt(old_booking_product_id),
      parseInt(new_product_id),
      additionalIds,
      new_product_size || null,
      parsedAdditionalSizes
    );

    res.json(preview);
  } catch (error) {
    console.error('Error calculating exchange preview:', error);
    res.status(500).json({ error: 'Failed to calculate preview', details: error.message });
  }
});

// POST exchange product(s) in a booking — salesman requires exchange_allowed permission
router.post('/', checkSalesmanPermission('exchange_allowed'), async (req, res) => {
  try {
    const {
      old_booking_product_id,
      new_product_ids, // Array of { product_id, booked_from, booked_to }
      exchange_penalty,
      downgrade_penalty,
      exchange_reason,
      exchanged_by,
      // Optional payment params — recorded atomically with the exchange
      payment_amount,
      payment_method,
      payment_notes,
      payment_recorded_by
    } = req.body;

    if (!old_booking_product_id || !new_product_ids || !Array.isArray(new_product_ids) || new_product_ids.length === 0) {
      return res.status(400).json({
        error: 'old_booking_product_id and new_product_ids array are required',
        example: {
          old_booking_product_id: 1,
          new_product_ids: [{ product_id: 2, booked_from: '2024-01-01', booked_to: '2024-01-05' }],
          exchange_penalty: 100,
          downgrade_penalty: 50
        }
      });
    }

    // Validate that every replacement product has explicit dates
    for (let i = 0; i < new_product_ids.length; i++) {
      const p = new_product_ids[i];
      if (!p.booked_from || !p.booked_to) {
        return res.status(400).json({
          error: `Replacement product at index ${i} is missing booked_from or booked_to. Dates must be explicitly provided for all replacement products.`,
          product_id: p.product_id
        });
      }
    }

    // Look up rent and security_deposit from DB (same pattern as booking creation route)
    const productIds = new_product_ids.map(p => p.product_id);
    const productMap = await bookingCalculationService.fetchProductDetails(productIds);

    // Map snake_case API fields to camelCase expected by service
    const mappedProducts = new_product_ids.map(p => {
      const productDetails = productMap[p.product_id];
      if (!productDetails) {
        throw new Error(`Product with id ${p.product_id} not found`);
      }
      const size = p.size || null;
      return {
        productId: p.product_id,
        bookedFrom: p.booked_from,
        bookedTo: p.booked_to,
        rent: ProductService.getProductRent(productDetails, size),
        securityDeposit: productDetails.security_deposit,
        size,
      };
    });

    // Perform exchange (with optional atomic payment)
    const result = await productLifecycleService.exchangeProduct(
      old_booking_product_id,
      mappedProducts,
      exchange_reason || 'Product exchanged',
      exchanged_by || 'system',
      {
        amount: payment_amount,
        method: payment_method,
        recorded_by: payment_recorded_by || exchanged_by || 'system',
        notes: payment_notes
      }
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
