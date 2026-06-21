/**
 * feedbackService.test.js
 *
 * Integration tests for feedbackService functions.
 * Calls service functions directly (no HTTP) and verifies DB state.
 */

const pool = require('../database/connection');
const feedbackService = require('./feedbackService');

// ── Helpers ───────────────────────────────────────────────────────────────────
const TEST_PHONE = '9000000013';

async function createTestUser() {
  const r = await pool.query(
    `INSERT INTO users (name, phone, phone_country, username, password, role)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    ['FB Test User', TEST_PHONE, 'IN', 'fb_test_user', 'hash', 'customer']
  );
  return r.rows[0].id;
}

async function createTestBooking(userId) {
  const r = await pool.query(
    `INSERT INTO bookings (user_id, booking_date, status)
     VALUES ($1, CURRENT_DATE, 'pending') RETURNING id`,
    [userId]
  );
  return r.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM feedback WHERE feedback_by = 'FB Test Agent'`);
  await pool.query(`DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE phone = $1)`, [TEST_PHONE]);
  await pool.query('DELETE FROM users WHERE phone = $1', [TEST_PHONE]);
}

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('feedbackService', () => {
  let userId;
  let bookingId;

  beforeAll(async () => {
    await cleanup();
    userId = await createTestUser();
    bookingId = await createTestBooking(userId);
  });

  afterAll(cleanup);

  // ── createFeedback ──────────────────────────────────────────────────────────
  describe('createFeedback', () => {
    test('should create feedback and return it', async () => {
      const fb = await feedbackService.createFeedback({
        booking_id: bookingId,
        feedback_by: 'FB Test Agent',
        rating: 5,
        description: 'Excellent service',
      });

      expect(fb).toHaveProperty('id');
      expect(fb.booking_id).toBe(bookingId);
      expect(fb.rating).toBe(5);
    });

    test('should throw 400 when feedback_by is missing', async () => {
      await expect(feedbackService.createFeedback({
        booking_id: bookingId,
        rating: 4,
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 when rating is missing', async () => {
      await expect(feedbackService.createFeedback({
        booking_id: bookingId,
        feedback_by: 'FB Test Agent',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 when booking_id is missing', async () => {
      await expect(feedbackService.createFeedback({
        feedback_by: 'FB Test Agent',
        rating: 3,
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 when rating is out of range (> 5)', async () => {
      await expect(feedbackService.createFeedback({
        booking_id: bookingId,
        feedback_by: 'FB Test Agent',
        rating: 6,
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 when rating is out of range (< 1)', async () => {
      await expect(feedbackService.createFeedback({
        booking_id: bookingId,
        feedback_by: 'FB Test Agent',
        rating: 0,
      })).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── getFeedbackById ─────────────────────────────────────────────────────────
  describe('getFeedbackById', () => {
    test('should return feedback with customer info joined', async () => {
      const created = await feedbackService.createFeedback({
        booking_id: bookingId,
        feedback_by: 'FB Test Agent',
        rating: 4,
      });

      const fetched = await feedbackService.getFeedbackById(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.customer_name).toBe('FB Test User');
    });

    test('should throw 404 for non-existent feedback', async () => {
      await expect(feedbackService.getFeedbackById(999999)).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── listFeedback ────────────────────────────────────────────────────────────
  describe('listFeedback', () => {
    test('should return an array', async () => {
      const list = await feedbackService.listFeedback();
      expect(Array.isArray(list)).toBe(true);
    });
  });

  // ── deleteFeedback ──────────────────────────────────────────────────────────
  describe('deleteFeedback', () => {
    test('should delete feedback', async () => {
      const created = await feedbackService.createFeedback({
        booking_id: bookingId,
        feedback_by: 'FB Test Agent',
        rating: 2,
      });

      await feedbackService.deleteFeedback(created.id);

      const check = await pool.query('SELECT id FROM feedback WHERE id = $1', [created.id]);
      expect(check.rows.length).toBe(0);
    });

    test('should throw 404 for non-existent feedback', async () => {
      await expect(feedbackService.deleteFeedback(999999)).rejects.toMatchObject({ status: 404 });
    });
  });
});
