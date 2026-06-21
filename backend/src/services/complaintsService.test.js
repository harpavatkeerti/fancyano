/**
 * complaintsService.test.js
 *
 * Integration tests for complaintsService functions.
 * Calls service functions directly (no HTTP) and verifies DB state.
 */

const pool = require('../database/connection');
const complaintsService = require('./complaintsService');

// ── Sentinel phone prefix — avoids collisions with real data ─────────────────
const TEST_PHONE = '9000000011';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function createTestUser() {
  const result = await pool.query(
    `INSERT INTO users (name, phone, phone_country, username, password, role)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    ['CS Test User', TEST_PHONE, 'IN', 'cs_test_user', 'hash', 'customer']
  );
  return result.rows[0].id;
}

async function createTestBooking(userId) {
  const result = await pool.query(
    `INSERT INTO bookings (user_id, booking_date, status)
     VALUES ($1, CURRENT_DATE, 'pending') RETURNING id`,
    [userId]
  );
  return result.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM complaints WHERE raised_by = 'CS Test Agent'`);
  await pool.query(`DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE phone = $1)`, [TEST_PHONE]);
  await pool.query('DELETE FROM users WHERE phone = $1', [TEST_PHONE]);
}

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('complaintsService', () => {
  let userId;
  let bookingId;

  beforeAll(async () => {
    await cleanup();
    userId = await createTestUser();
    bookingId = await createTestBooking(userId);
  });

  afterAll(cleanup);

  // ── createComplaint ─────────────────────────────────────────────────────────
  describe('createComplaint', () => {
    test('should create a complaint with status=pending', async () => {
      const complaint = await complaintsService.createComplaint({
        booking_id: bookingId,
        raised_by: 'CS Test Agent',
        title: 'Test complaint',
        description: 'Details here',
      });

      expect(complaint).toHaveProperty('id');
      expect(complaint.booking_id).toBe(bookingId);
      expect(complaint.raised_by).toBe('CS Test Agent');
      expect(complaint.status).toBe('pending');
    });

    test('should throw 400 if raised_by is missing', async () => {
      await expect(complaintsService.createComplaint({
        booking_id: bookingId,
        title: 'No raised_by',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 if title is missing', async () => {
      await expect(complaintsService.createComplaint({
        booking_id: bookingId,
        raised_by: 'CS Test Agent',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 if booking_id is missing', async () => {
      await expect(complaintsService.createComplaint({
        raised_by: 'CS Test Agent',
        title: 'No booking',
      })).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── getComplaintById ────────────────────────────────────────────────────────
  describe('getComplaintById', () => {
    test('should return the complaint with customer info joined', async () => {
      const created = await complaintsService.createComplaint({
        booking_id: bookingId,
        raised_by: 'CS Test Agent',
        title: 'Fetch test',
      });

      const fetched = await complaintsService.getComplaintById(created.id);
      expect(fetched.id).toBe(created.id);
      // Should include joined user name from bookings → users
      expect(fetched.customer_name).toBe('CS Test User');
    });

    test('should throw 404 for non-existent complaint', async () => {
      await expect(complaintsService.getComplaintById(999999)).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── listComplaints ──────────────────────────────────────────────────────────
  describe('listComplaints', () => {
    test('should return an array', async () => {
      const complaints = await complaintsService.listComplaints();
      expect(Array.isArray(complaints)).toBe(true);
    });
  });

  // ── updateComplaint ─────────────────────────────────────────────────────────
  describe('updateComplaint', () => {
    test('should update status and auto-log a status_change note', async () => {
      const created = await complaintsService.createComplaint({
        booking_id: bookingId,
        raised_by: 'CS Test Agent',
        title: 'Update test',
      });

      const updated = await complaintsService.updateComplaint(created.id, {
        status: 'in_progress',
        user_name: 'Admin',
        user_role: 'admin',
      });

      expect(updated.status).toBe('in_progress');

      // Auto-logged note
      const notes = await complaintsService.getComplaintNotes(created.id);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0].note_type).toBe('status_change');
      expect(notes[0].old_status).toBe('pending');
      expect(notes[0].new_status).toBe('in_progress');
    });

    test('should log a comment note when note text is provided', async () => {
      const created = await complaintsService.createComplaint({
        booking_id: bookingId,
        raised_by: 'CS Test Agent',
        title: 'Comment note test',
      });

      await complaintsService.updateComplaint(created.id, {
        note: 'Looking into it',
        user_name: 'Admin',
        user_role: 'admin',
      });

      const notes = await complaintsService.getComplaintNotes(created.id);
      const comment = notes.find(n => n.note_type === 'comment');
      expect(comment).toBeDefined();
      expect(comment.content).toBe('Looking into it');
    });

    test('should throw 404 for non-existent complaint', async () => {
      await expect(complaintsService.updateComplaint(999999, { status: 'resolved' }))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ── addComplaintNote / getComplaintNotes ─────────────────────────────────────
  describe('addComplaintNote', () => {
    test('should add a note and return it', async () => {
      const created = await complaintsService.createComplaint({
        booking_id: bookingId,
        raised_by: 'CS Test Agent',
        title: 'Note add test',
      });

      const note = await complaintsService.addComplaintNote(created.id, {
        user_name: 'Support',
        user_role: 'salesman',
        note_type: 'comment',
        content: 'Following up',
      });

      expect(note).toHaveProperty('id');
      expect(note.content).toBe('Following up');
      expect(note.complaint_id).toBe(created.id);
    });

    test('should throw 400 when required fields are missing', async () => {
      await expect(complaintsService.addComplaintNote(1, { user_name: 'X' }))
        .rejects.toMatchObject({ status: 400 });
    });
  });

  // ── deleteComplaint ─────────────────────────────────────────────────────────
  describe('deleteComplaint', () => {
    test('should delete the complaint', async () => {
      const created = await complaintsService.createComplaint({
        booking_id: bookingId,
        raised_by: 'CS Test Agent',
        title: 'Delete test',
      });

      await complaintsService.deleteComplaint(created.id);

      const check = await pool.query('SELECT id FROM complaints WHERE id = $1', [created.id]);
      expect(check.rows.length).toBe(0);
    });

    test('should throw 404 for non-existent complaint', async () => {
      await expect(complaintsService.deleteComplaint(999999)).rejects.toMatchObject({ status: 404 });
    });
  });
});
