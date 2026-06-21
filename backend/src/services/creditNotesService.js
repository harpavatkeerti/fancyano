/**
 * creditNotesService.js
 *
 * All database logic for the credit_notes feature.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

// ── Service Functions ─────────────────────────────────────────────────────────

async function listCreditNotes() {
  const result = await pool.query('SELECT * FROM credit_notes ORDER BY created_at DESC');
  return result.rows;
}

async function getCreditNotesByCustomer({ customer_name, customer_phone }) {
  if (!customer_name && !customer_phone) {
    const err = new Error('Customer name or phone required');
    err.status = 400;
    throw err;
  }

  let query = 'SELECT * FROM credit_notes WHERE status = $1';
  const params = ['active'];

  if (customer_name) {
    query += ' AND LOWER(customer_name) = LOWER($2)';
    params.push(customer_name);
  }

  if (customer_phone) {
    const idx = params.length + 1;
    query += ` AND customer_phone = $${idx}`;
    params.push(customer_phone);
  }

  query += ' AND valid_until >= CURRENT_DATE ORDER BY created_at DESC';

  const result = await pool.query(query, params);
  return result.rows;
}

async function getCreditNotesByBookingId(bookingId) {
  const result = await pool.query(
    'SELECT * FROM credit_notes WHERE booking_id = $1 ORDER BY created_at DESC',
    [bookingId]
  );
  return result.rows;
}

async function getCreditNoteById(id) {
  const result = await pool.query('SELECT * FROM credit_notes WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    const err = new Error('Credit note not found');
    err.status = 404;
    throw err;
  }
  return result.rows[0];
}

async function createCreditNote({ booking_id, customer_name, customer_phone, amount, valid_until, issued_by, notes }) {
  if (!customer_name || !amount || !valid_until) {
    const err = new Error('Customer name, amount, and validity date are required');
    err.status = 400;
    throw err;
  }

  // Prevent duplicate credit notes for the same booking
  if (booking_id) {
    const existing = await pool.query(
      'SELECT * FROM credit_notes WHERE booking_id = $1',
      [booking_id]
    );
    if (existing.rows.length > 0) {
      const err = new Error('A credit note already exists for this booking');
      err.status = 400;
      err.existing_credit_note_id = existing.rows[0].id;
      err.message_detail = `Credit note ID ${existing.rows[0].id} already exists for booking ID ${booking_id}. Please delete the existing credit note first if you want to create a new one.`;
      throw err;
    }
  }

  const result = await pool.query(
    `INSERT INTO credit_notes
     (booking_id, customer_name, customer_phone, amount, valid_until, issued_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [booking_id || null, customer_name, customer_phone || null, amount, valid_until, issued_by || null, notes || null]
  );
  return result.rows[0];
}

async function useCreditNote(id, amount_used) {
  if (!amount_used || amount_used <= 0) {
    const err = new Error('Valid amount_used is required');
    err.status = 400;
    throw err;
  }

  const noteResult = await pool.query('SELECT * FROM credit_notes WHERE id = $1', [id]);
  if (noteResult.rows.length === 0) {
    const err = new Error('Credit note not found');
    err.status = 404;
    throw err;
  }

  const note = noteResult.rows[0];
  const newUsedAmount = (note.used_amount || 0) + amount_used;

  if (newUsedAmount > note.amount) {
    const err = new Error('Amount used exceeds credit note value');
    err.status = 400;
    err.available = note.amount - (note.used_amount || 0);
    throw err;
  }

  let newStatus = 'active';
  if (newUsedAmount === note.amount) newStatus = 'fully_used';
  else if (newUsedAmount > 0) newStatus = 'partially_used';

  const result = await pool.query(
    `UPDATE credit_notes
     SET used_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [newUsedAmount, newStatus, id]
  );
  return result.rows[0];
}

async function deleteCreditNote(id) {
  const result = await pool.query(
    'DELETE FROM credit_notes WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rows.length === 0) {
    const err = new Error('Credit note not found');
    err.status = 404;
    throw err;
  }
  return result.rows[0];
}

module.exports = {
  listCreditNotes,
  getCreditNotesByCustomer,
  getCreditNotesByBookingId,
  getCreditNoteById,
  createCreditNote,
  useCreditNote,
  deleteCreditNote,
};
