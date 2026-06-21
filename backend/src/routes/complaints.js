const express = require('express');
const router = express.Router();
const complaintsService = require('../services/complaintsService');

// GET /complaints
router.get('/', async (req, res) => {
  try {
    const complaints = await complaintsService.listComplaints();
    res.json(complaints);
  } catch (error) {
    console.error('Error fetching complaints:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch complaints' });
  }
});

// GET /complaints/:id
router.get('/:id', async (req, res) => {
  try {
    const complaint = await complaintsService.getComplaintById(req.params.id);
    res.json(complaint);
  } catch (error) {
    console.error('Error fetching complaint:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch complaint' });
  }
});

// POST /complaints
router.post('/', async (req, res) => {
  try {
    const complaint = await complaintsService.createComplaint(req.body);
    res.status(201).json(complaint);
  } catch (error) {
    console.error('Error creating complaint:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to create complaint' });
  }
});

// PUT /complaints/:id
router.put('/:id', async (req, res) => {
  try {
    const complaint = await complaintsService.updateComplaint(req.params.id, req.body);
    res.json(complaint);
  } catch (error) {
    console.error('Error updating complaint:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to update complaint' });
  }
});

// GET /complaints/:id/notes
router.get('/:id/notes', async (req, res) => {
  try {
    const notes = await complaintsService.getComplaintNotes(req.params.id);
    res.json(notes);
  } catch (error) {
    console.error('Error fetching complaint notes:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch complaint notes' });
  }
});

// POST /complaints/:id/notes
router.post('/:id/notes', async (req, res) => {
  try {
    const note = await complaintsService.addComplaintNote(req.params.id, req.body);
    res.status(201).json(note);
  } catch (error) {
    console.error('Error adding complaint note:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to add complaint note' });
  }
});

// DELETE /complaints/:id
router.delete('/:id', async (req, res) => {
  try {
    await complaintsService.deleteComplaint(req.params.id);
    res.json({ message: 'Complaint deleted successfully' });
  } catch (error) {
    console.error('Error deleting complaint:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to delete complaint' });
  }
});

module.exports = router;
