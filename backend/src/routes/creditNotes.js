const express = require('express');
const router = express.Router();
const creditNotesService = require('../services/creditNotesService');

// GET /credit-notes
router.get('/', async (req, res) => {
  try {
    const notes = await creditNotesService.listCreditNotes();
    res.json(notes);
  } catch (error) {
    console.error('Error fetching credit notes:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch credit notes' });
  }
});

// GET /credit-notes/customer?customer_name=&customer_phone=
router.get('/customer', async (req, res) => {
  try {
    const notes = await creditNotesService.getCreditNotesByCustomer(req.query);
    res.json(notes);
  } catch (error) {
    console.error('Error fetching customer credit notes:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch credit notes' });
  }
});

// GET /credit-notes/booking/:bookingId
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const notes = await creditNotesService.getCreditNotesByBookingId(req.params.bookingId);
    res.json(notes);
  } catch (error) {
    console.error('Error fetching credit notes by booking ID:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch credit notes' });
  }
});

// GET /credit-notes/:id
router.get('/:id', async (req, res) => {
  try {
    const note = await creditNotesService.getCreditNoteById(req.params.id);
    res.json(note);
  } catch (error) {
    console.error('Error fetching credit note:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch credit note' });
  }
});

// POST /credit-notes
router.post('/', async (req, res) => {
  try {
    const note = await creditNotesService.createCreditNote(req.body);
    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating credit note:', error);
    const body = { error: error.message || 'Failed to create credit note' };
    if (error.existing_credit_note_id) {
      body.existing_credit_note_id = error.existing_credit_note_id;
      body.message = error.message_detail;
    }
    res.status(error.status || 500).json(body);
  }
});

// PUT /credit-notes/:id/use
router.put('/:id/use', async (req, res) => {
  try {
    const note = await creditNotesService.useCreditNote(req.params.id, req.body.amount_used);
    res.json(note);
  } catch (error) {
    console.error('Error using credit note:', error);
    const body = { error: error.message || 'Failed to use credit note' };
    if (error.available !== undefined) body.available = error.available;
    res.status(error.status || 500).json(body);
  }
});

// DELETE /credit-notes/:id
router.delete('/:id', async (req, res) => {
  try {
    const note = await creditNotesService.deleteCreditNote(req.params.id);
    res.json({ message: 'Credit note deleted', credit_note: note });
  } catch (error) {
    console.error('Error deleting credit note:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to delete credit note' });
  }
});

module.exports = router;
