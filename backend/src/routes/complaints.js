const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// Create complaint_notes table if it doesn't exist
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
`).catch(err => console.log('complaint_notes table might already exist'));

// Get all complaints
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name as assigned_to_name 
       FROM complaints c 
       LEFT JOIN users u ON c.assigned_to = u.id 
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching complaints:', error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// Get complaint by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT c.*, u.name as assigned_to_name 
       FROM complaints c 
       LEFT JOIN users u ON c.assigned_to = u.id 
       WHERE c.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching complaint:', error);
    res.status(500).json({ error: 'Failed to fetch complaint' });
  }
});

// Create new complaint
router.post('/', async (req, res) => {
  try {
    const { booking_id, raised_by, title, description } = req.body;
    
    if (!raised_by || !title) {
      return res.status(400).json({ error: 'raised_by and title are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO complaints (booking_id, raised_by, title, description, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [booking_id || null, raised_by, title, description || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating complaint:', error);
    res.status(500).json({ error: 'Failed to create complaint' });
  }
});

// Update complaint
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assigned_to, title, description, note, user_name, user_role } = req.body;
    
    // Get current complaint to track changes
    const currentComplaint = await pool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (currentComplaint.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    const oldStatus = currentComplaint.rows[0].status;
    const newStatus = status || oldStatus;
    const statusChanged = status && status !== oldStatus;
    
    console.log('Updating complaint:', {
      id,
      oldStatus,
      newStatus,
      statusChanged,
      note: note ? 'provided' : 'not provided',
      user_name,
      user_role,
    });
    
    // Update complaint - use explicit values, not COALESCE for status to ensure it updates
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    
    if (status !== undefined && status !== null) {
      updateFields.push(`status = $${paramIndex}`);
      updateValues.push(status);
      paramIndex++;
    }
    
    if (assigned_to !== undefined && assigned_to !== null) {
      updateFields.push(`assigned_to = $${paramIndex}`);
      updateValues.push(assigned_to);
      paramIndex++;
    }
    
    if (title !== undefined && title !== null) {
      updateFields.push(`title = $${paramIndex}`);
      updateValues.push(title);
      paramIndex++;
    }
    
    if (description !== undefined && description !== null) {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(description);
      paramIndex++;
    }
    
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(id);
    
    const updateQuery = `UPDATE complaints 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`;
    
    console.log('Update query:', updateQuery);
    console.log('Update values:', updateValues);
    
    const result = await pool.query(updateQuery, updateValues);
    
    // Add note to history if provided or if status changed
    if (user_name && user_role) {
      if (note) {
        // User provided a note
        const note_type = statusChanged ? 'status_change' : 'comment';
        await pool.query(
          `INSERT INTO complaint_notes (complaint_id, user_name, user_role, note_type, content, old_status, new_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, user_name, user_role, note_type, note, oldStatus, newStatus]
        );
        console.log('Note added:', note);
      } else if (statusChanged) {
        // Status changed but no note - auto-log the change
        await pool.query(
          `INSERT INTO complaint_notes (complaint_id, user_name, user_role, note_type, content, old_status, new_status)
           VALUES ($1, $2, $3, 'status_change', $4, $5, $6)`,
          [id, user_name, user_role, `Status changed from ${oldStatus} to ${newStatus}`, oldStatus, newStatus]
        );
        console.log('Status change logged automatically');
      }
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating complaint:', error);
    res.status(500).json({ error: 'Failed to update complaint' });
  }
});

// Get complaint notes/history
router.get('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM complaint_notes WHERE complaint_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching complaint notes:', error);
    res.status(500).json({ error: 'Failed to fetch complaint notes' });
  }
});

// Add note to complaint
router.post('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_name, user_role, note_type, content, old_status, new_status } = req.body;
    
    if (!user_name || !user_role || !content) {
      return res.status(400).json({ error: 'user_name, user_role, and content are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO complaint_notes (complaint_id, user_name, user_role, note_type, content, old_status, new_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, user_name, user_role, note_type || 'comment', content, old_status, new_status]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding complaint note:', error);
    res.status(500).json({ error: 'Failed to add complaint note' });
  }
});

// Delete complaint
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM complaints WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    res.json({ message: 'Complaint deleted successfully' });
  } catch (error) {
    console.error('Error deleting complaint:', error);
    res.status(500).json({ error: 'Failed to delete complaint' });
  }
});

module.exports = router;

