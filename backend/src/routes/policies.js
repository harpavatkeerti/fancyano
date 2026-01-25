const express = require('express');
const router = express.Router();
const policyService = require('../services/policyService');

// GET all active policies
router.get('/', async (req, res) => {
  try {
    const { policy_type } = req.query;
    const policies = await policyService.getAllPolicies(policy_type);
    res.json(policies);
  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({ error: 'Failed to fetch policies', details: error.message });
  }
});

// GET applicable policy for a booking product
router.get('/applicable', async (req, res) => {
  try {
    const { policy_type, booking_product_id } = req.query;
    
    if (!policy_type || !booking_product_id) {
      return res.status(400).json({ 
        error: 'policy_type and booking_product_id are required',
        example: '/api/policies/applicable?policy_type=exchange_penalty&booking_product_id=123'
      });
    }

    const result = await policyService.getApplicablePolicyForBookingProduct(
      policy_type,
      parseInt(booking_product_id)
    );

    res.json(result);
  } catch (error) {
    if (error.message === 'Booking product not found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Error fetching applicable policy:', error);
    res.status(500).json({ error: 'Failed to fetch applicable policy', details: error.message });
  }
});

// POST create new policy
router.post('/', async (req, res) => {
  try {
    const {
      policy_key,
      policy_name,
      policy_type,
      value_type,
      value,
      days_from_booking_min,
      days_from_booking_max,
      min_value,
      max_value,
      created_by
    } = req.body;

    // Validate required fields
    if (!policy_key || !policy_name || !policy_type || !value_type || value === undefined) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['policy_key', 'policy_name', 'policy_type', 'value_type', 'value']
      });
    }

    // Validate policy_type
    const validTypes = ['exchange_penalty', 'cancellation_penalty', 'late_fee', 'transport_fee'];
    if (!validTypes.includes(policy_type)) {
      return res.status(400).json({
        error: 'Invalid policy_type',
        valid_types: validTypes
      });
    }

    // Validate value_type
    if (!['percentage', 'fixed'].includes(value_type)) {
      return res.status(400).json({
        error: 'Invalid value_type',
        valid_types: ['percentage', 'fixed']
      });
    }

    const policy = await policyService.upsertPolicy({
      policy_key,
      policy_name,
      policy_type,
      value_type,
      value,
      days_from_booking_min: days_from_booking_min || null,
      days_from_booking_max: days_from_booking_max || null,
      min_value: min_value || null,
      max_value: max_value || null,
      created_by: created_by || 'system'
    });

    res.status(201).json({
      success: true,
      policy
    });
  } catch (error) {
    if (error.message.includes('overlaps')) {
      return res.status(409).json({ 
        error: error.message 
      });
    }
    console.error('Error creating policy:', error);
    res.status(500).json({ error: 'Failed to create policy', details: error.message });
  }
});

// PUT update existing policy
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const policy = await policyService.updatePolicy(parseInt(id), updates);

    res.json({
      success: true,
      policy
    });
  } catch (error) {
    if (error.message === 'Policy not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'No fields to update') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.includes('overlaps')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('Error updating policy:', error);
    res.status(500).json({ error: 'Failed to update policy', details: error.message });
  }
});

module.exports = router;
