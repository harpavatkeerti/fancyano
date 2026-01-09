-- Complaint Notes/History Table for tracking conversation
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
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_complaint_notes_complaint ON complaint_notes(complaint_id);
CREATE INDEX IF NOT EXISTS idx_complaint_notes_created ON complaint_notes(created_at);

