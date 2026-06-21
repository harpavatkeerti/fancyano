/**
 * complaintsService.js
 *
 * All database logic for the complaints feature.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

// Ensure complaint_notes table exists (idempotent)
pool.query(`
  CREATE TABLE IF NOT EXISTS complaint_notes (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(20) NOT NULL,
    note_type VARCHAR(20) DEFAULT 'comment' CHECK (note_type IN ('comment', 'status_change', 'assignment', 'reopened')),
    content TEXT NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.log('complaint_notes table might already exist:', err.message));

// ── Queries ───────────────────────────────────────────────────────────────────

const COMPLAINT_SELECT = `
  SELECT c.*, u.name as assigned_to_name,
         bk.user_id,
         usr.name  AS customer_name,
         usr.phone AS customer_phone
  FROM complaints c
  LEFT JOIN users u   ON c.assigned_to = u.id
  LEFT JOIN bookings bk ON c.booking_id = bk.id
  LEFT JOIN users usr  ON bk.user_id    = usr.id
`;

// ── Service Functions ─────────────────────────────────────────────────────────

async function listComplaints() {
  const result = await pool.query(`${COMPLAINT_SELECT} ORDER BY c.created_at DESC`);
  return result.rows;
}

async function getComplaintById(id) {
  const result = await pool.query(
    `${COMPLAINT_SELECT} WHERE c.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    const err = new Error('Complaint not found');
    err.status = 404;
    throw err;
  }
  return result.rows[0];
}

async function createComplaint({ booking_id, raised_by, title, description }) {
  if (!raised_by || !title) {
    const err = new Error('raised_by and title are required');
    err.status = 400;
    throw err;
  }
  if (!booking_id) {
    const err = new Error('booking_id is required');
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    `INSERT INTO complaints (booking_id, raised_by, title, description, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [booking_id, raised_by, title, description || null]
  );
  return result.rows[0];
}

async function updateComplaint(id, { status, assigned_to, title, description, note, user_name, user_role }) {
  // Fetch current state for audit trail
  const currentResult = await pool.query('SELECT * FROM complaints WHERE id = $1', [id]);
  if (currentResult.rows.length === 0) {
    const err = new Error('Complaint not found');
    err.status = 404;
    throw err;
  }

  const current = currentResult.rows[0];
  const oldStatus = current.status;
  const newStatus = status || oldStatus;
  const statusChanged = status && status !== oldStatus;

  // Build dynamic SET clause
  const fields = [];
  const values = [];
  let i = 1;

  if (status !== undefined && status !== null) { fields.push(`status = $${i++}`); values.push(status); }
  if (assigned_to !== undefined && assigned_to !== null) { fields.push(`assigned_to = $${i++}`); values.push(assigned_to); }
  if (title !== undefined && title !== null) { fields.push(`title = $${i++}`); values.push(title); }
  if (description !== undefined && description !== null) { fields.push(`description = $${i++}`); values.push(description); }
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const result = await pool.query(
    `UPDATE complaints SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );

  // Audit note
  if (user_name && user_role) {
    if (note) {
      const note_type = statusChanged ? 'status_change' : 'comment';
      await pool.query(
        `INSERT INTO complaint_notes (complaint_id, user_name, user_role, note_type, content, old_status, new_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, user_name, user_role, note_type, note, oldStatus, newStatus]
      );
    } else if (statusChanged) {
      await pool.query(
        `INSERT INTO complaint_notes (complaint_id, user_name, user_role, note_type, content, old_status, new_status)
         VALUES ($1, $2, $3, 'status_change', $4, $5, $6)`,
        [id, user_name, user_role, `Status changed from ${oldStatus} to ${newStatus}`, oldStatus, newStatus]
      );
    }
  }

  return result.rows[0];
}

async function getComplaintNotes(complaintId) {
  const result = await pool.query(
    'SELECT * FROM complaint_notes WHERE complaint_id = $1 ORDER BY created_at ASC',
    [complaintId]
  );
  return result.rows;
}

async function addComplaintNote(complaintId, { user_name, user_role, note_type, content, old_status, new_status }) {
  if (!user_name || !user_role || !content) {
    const err = new Error('user_name, user_role, and content are required');
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    `INSERT INTO complaint_notes (complaint_id, user_name, user_role, note_type, content, old_status, new_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [complaintId, user_name, user_role, note_type || 'comment', content, old_status, new_status]
  );
  return result.rows[0];
}

async function deleteComplaint(id) {
  const result = await pool.query(
    'DELETE FROM complaints WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rows.length === 0) {
    const err = new Error('Complaint not found');
    err.status = 404;
    throw err;
  }
}

module.exports = {
  listComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  getComplaintNotes,
  addComplaintNote,
  deleteComplaint,
};
