const express = require('express');
const router = express.Router();
const chargeAccountingService = require('../services/chargeAccountingService');
const invoiceService = require('../services/invoiceService');

// GET all transactions
router.get('/', async (req, res) => {
  try {
    const transactions = await invoiceService.getAllTransactions();
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET payment summary for a booking
router.get('/summary/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const summary = await chargeAccountingService.getPaymentSummary(parseInt(bookingId));
    
    res.json(summary);
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error fetching payment summary:', error);
    res.status(500).json({ error: 'Failed to fetch payment summary', details: error.message });
  }
});

// GET transactions for a booking (reuses invoiceService.getPaymentTransactions)
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const transactions = await invoiceService.getPaymentTransactions(parseInt(bookingId));
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST apply payment to a booking
router.post('/', async (req, res) => {
  try {
    const { 
      booking_id, 
      amount, 
      payment_method,
      method,
      recorded_by,
      notes 
    } = req.body;
    
    // Accept both 'payment_method' and 'method' for compatibility
    const resolvedMethod = payment_method || method;
    
    if (!booking_id || !amount || amount <= 0 || !resolvedMethod || !recorded_by) {
      return res.status(400).json({ 
        error: 'Missing required fields: booking_id, amount (> 0), payment_method/method, recorded_by' 
      });
    }
    
    const result = await chargeAccountingService.applyPayment(
      booking_id,
      amount,
      resolvedMethod,
      recorded_by,
      notes
    );
    
    res.status(201).json({
      message: 'Payment applied successfully',
      payment_details: result
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message === 'Payment amount must be greater than 0') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error applying payment:', error);
    res.status(500).json({ error: 'Failed to apply payment', details: error.message });
  }
});

// POST apply adjustments to charges
router.post('/adjustment', async (req, res) => {
  try {
    const { 
      booking_id, 
      adjustment_amount,
      payment_method,
      reason,
      adjusted_by
    } = req.body;
    
    if (!booking_id || !adjustment_amount || adjustment_amount <= 0 || !payment_method || !adjusted_by) {
      return res.status(400).json({ 
        error: 'Missing required fields: booking_id, adjustment_amount (> 0), payment_method, adjusted_by',
        example: {
          booking_id: 1,
          adjustment_amount: 10000,
          payment_method: 'Adjustment',
          reason: 'Goodwill adjustment',
          adjusted_by: 'admin'
        }
      });
    }
    
    const result = await chargeAccountingService.applyAdjustment(
      booking_id,
      adjustment_amount,
      payment_method,
      adjusted_by,
      reason
    );
    
    res.json({
      message: 'Adjustment applied successfully',
      adjustment_details: result
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message.includes('must be greater than 0')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error applying adjustment:', error);
    res.status(500).json({ error: 'Failed to apply adjustment', details: error.message });
  }
});

module.exports = router;
