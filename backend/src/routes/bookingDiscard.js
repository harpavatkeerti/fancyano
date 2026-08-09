const express = require('express');
const router = express.Router();
const productLifecycleService = require('../services/productLifecycleService');

// POST /:bookingId — discard a booking (admin-only)
router.post('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { discarded_by } = req.body;

    if (!discarded_by) {
      return res.status(400).json({ error: 'discarded_by is required' });
    }

    const result = await productLifecycleService.discardBooking(
      parseInt(bookingId),
      discarded_by
    );

    res.json({
      message: `Booking #${bookingId} discarded successfully`,
      ...result
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message.includes('Cannot discard')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error discarding booking:', error);
    res.status(500).json({ error: 'Failed to discard booking', details: error.message });
  }
});

module.exports = router;
