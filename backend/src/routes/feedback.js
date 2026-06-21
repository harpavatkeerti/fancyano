const express = require('express');
const router = express.Router();
const feedbackService = require('../services/feedbackService');

// GET /feedback
router.get('/', async (req, res) => {
  try {
    const feedback = await feedbackService.listFeedback();
    res.json(feedback);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch feedback' });
  }
});

// GET /feedback/:id
router.get('/:id', async (req, res) => {
  try {
    const feedback = await feedbackService.getFeedbackById(req.params.id);
    res.json(feedback);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch feedback' });
  }
});

// POST /feedback
router.post('/', async (req, res) => {
  try {
    const feedback = await feedbackService.createFeedback(req.body);
    res.status(201).json(feedback);
  } catch (error) {
    console.error('Error creating feedback:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to create feedback' });
  }
});

// DELETE /feedback/:id
router.delete('/:id', async (req, res) => {
  try {
    await feedbackService.deleteFeedback(req.params.id);
    res.json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to delete feedback' });
  }
});

module.exports = router;
