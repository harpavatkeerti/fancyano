/**
 * feedbackService.js
 *
 * All database logic for the feedback feature.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

// ── Queries ───────────────────────────────────────────────────────────────────

const FEEDBACK_SELECT = `
  SELECT f.*,
         usr.name  AS customer_name,
         usr.phone AS customer_phone
  FROM feedback f
  LEFT JOIN bookings b  ON f.booking_id = b.id
  LEFT JOIN users   usr ON b.user_id    = usr.id
`;

// ── Service Functions ─────────────────────────────────────────────────────────

async function listFeedback() {
  const result = await pool.query(`${FEEDBACK_SELECT} ORDER BY f.created_at DESC`);
  return result.rows;
}

async function getFeedbackById(id) {
  const result = await pool.query(
    `${FEEDBACK_SELECT} WHERE f.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    const err = new Error('Feedback not found');
    err.status = 404;
    throw err;
  }
  return result.rows[0];
}

async function createFeedback({ booking_id, feedback_by, rating, description }) {
  if (!feedback_by || !rating) {
    const err = new Error('feedback_by and rating are required');
    err.status = 400;
    throw err;
  }
  if (!booking_id) {
    const err = new Error('booking_id is required');
    err.status = 400;
    throw err;
  }
  if (rating < 1 || rating > 5) {
    const err = new Error('Rating must be between 1 and 5');
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    `INSERT INTO feedback (booking_id, feedback_by, rating, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [booking_id, feedback_by, rating, description || null]
  );
  return result.rows[0];
}

async function deleteFeedback(id) {
  const result = await pool.query(
    'DELETE FROM feedback WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rows.length === 0) {
    const err = new Error('Feedback not found');
    err.status = 404;
    throw err;
  }
}

module.exports = {
  listFeedback,
  getFeedbackById,
  createFeedback,
  deleteFeedback,
};
