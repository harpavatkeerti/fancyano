const express = require('express');
const pool = require('../database/connection');

const router = express.Router();

// GET all credit notes
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM credit_notes ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching credit notes:', error);
    res.status(500).json({ error: 'Failed to fetch credit notes' });
  }
});

// GET credit notes by customer
router.get('/customer', async (req, res) => {
  try {
    const { customer_name, customer_phone } = req.query;
    
    if (!customer_name && !customer_phone) {
      return res.status(400).json({ error: 'Customer name or phone required' });
    }

    let query = 'SELECT * FROM credit_notes WHERE status = $1';
    const params = ['active'];
    
    if (customer_name) {
      query += ' AND LOWER(customer_name) = LOWER($2)';
      params.push(customer_name);
    }
    
    if (customer_phone) {
      const paramIndex = params.length + 1;
      query += ` AND customer_phone = $${paramIndex}`;
      params.push(customer_phone);
    }
    
    query += ' AND valid_until >= CURRENT_DATE ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customer credit notes:', error);
    res.status(500).json({ error: 'Failed to fetch credit notes' });
  }
});

// GET credit notes by booking ID
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const result = await pool.query(
      'SELECT * FROM credit_notes WHERE booking_id = $1 ORDER BY created_at DESC',
      [bookingId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching credit notes by booking ID:', error);
    res.status(500).json({ error: 'Failed to fetch credit notes' });
  }
});

// GET credit note by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM credit_notes WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credit note not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching credit note:', error);
    res.status(500).json({ error: 'Failed to fetch credit note' });
  }
});

// POST create credit note
router.post('/', async (req, res) => {
  try {
    const { 
      booking_id, 
      customer_name, 
      customer_phone, 
      amount, 
      valid_until, 
      issued_by,
      notes 
    } = req.body;

    if (!customer_name || !amount || !valid_until) {
      return res.status(400).json({ 
        error: 'Customer name, amount, and validity date are required' 
      });
    }

    // Check if a credit note already exists for this booking ID
    if (booking_id) {
      const existingNotes = await pool.query(
        'SELECT * FROM credit_notes WHERE booking_id = $1',
        [booking_id]
      );

      if (existingNotes.rows.length > 0) {
        return res.status(400).json({ 
          error: 'A credit note already exists for this booking',
          existing_credit_note_id: existingNotes.rows[0].id,
          message: `Credit note ID ${existingNotes.rows[0].id} already exists for booking ID ${booking_id}. Please delete the existing credit note first if you want to create a new one.`
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO credit_notes 
       (booking_id, customer_name, customer_phone, amount, valid_until, issued_by, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [booking_id || null, customer_name, customer_phone || null, amount, valid_until, issued_by || null, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating credit note:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to create credit note',
      details: error.message 
    });
  }
});

// PUT use/update credit note
router.put('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount_used } = req.body;

    if (!amount_used || amount_used <= 0) {
      return res.status(400).json({ error: 'Valid amount_used is required' });
    }

    // Get current credit note
    const noteResult = await pool.query('SELECT * FROM credit_notes WHERE id = $1', [id]);
    
    if (noteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Credit note not found' });
    }

    const note = noteResult.rows[0];
    const newUsedAmount = (note.used_amount || 0) + (amount_used || 0);
    
    if (newUsedAmount > note.amount) {
      return res.status(400).json({ 
        error: 'Amount used exceeds credit note value',
        available: note.amount - (note.used_amount || 0)
      });
    }

    // Determine new status
    let newStatus = 'active';
    if (newUsedAmount === note.amount) {
      newStatus = 'fully_used';
    } else if (newUsedAmount > 0) {
      newStatus = 'partially_used';
    }

    const result = await pool.query(
      `UPDATE credit_notes 
       SET used_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING *`,
      [newUsedAmount, newStatus, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error using credit note:', error);
    res.status(500).json({ error: 'Failed to use credit note' });
  }
});

// DELETE credit note (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM credit_notes WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Credit note not found' });
    }
    
    res.json({ message: 'Credit note deleted', credit_note: result.rows[0] });
  } catch (error) {
    console.error('Error deleting credit note:', error);
    res.status(500).json({ error: 'Failed to delete credit note' });
  }
});

module.exports = router;

