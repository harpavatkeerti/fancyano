/**
 * creditNotesService.test.js
 *
 * Integration tests for creditNotesService functions.
 * Calls service functions directly (no HTTP) and verifies DB state.
 */

const pool = require('../database/connection');
const creditNotesService = require('./creditNotesService');

// ── Helpers ───────────────────────────────────────────────────────────────────
const TEST_CUSTOMER = 'CN Test Customer';
const TEST_PHONE    = '9000000012';
const VALID_UNTIL   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

async function createTestUser() {
  const r = await pool.query(
    `INSERT INTO users (name, phone, phone_country, username, password, role)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [TEST_CUSTOMER, TEST_PHONE, 'IN', 'cn_test_user', 'hash', 'customer']
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
  await pool.query('DELETE FROM credit_notes WHERE customer_name = $1', [TEST_CUSTOMER]);
  await pool.query(`DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE phone = $1)`, [TEST_PHONE]);
  await pool.query('DELETE FROM users WHERE phone = $1', [TEST_PHONE]);
}

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('creditNotesService', () => {
  let userId;
  let bookingId;

  beforeAll(async () => {
    await cleanup();
    userId = await createTestUser();
    bookingId = await createTestBooking(userId);
  });

  afterAll(cleanup);

  // ── createCreditNote ────────────────────────────────────────────────────────
  describe('createCreditNote', () => {
    afterEach(async () => {
      // Keep slate clean between creation tests
      await pool.query('DELETE FROM credit_notes WHERE customer_name = $1', [TEST_CUSTOMER]);
    });

    test('should create a credit note and return it', async () => {
      const note = await creditNotesService.createCreditNote({
        booking_id: bookingId,
        customer_name: TEST_CUSTOMER,
        customer_phone: TEST_PHONE,
        amount: 500,
        valid_until: VALID_UNTIL,
        issued_by: 'Admin',
      });

      expect(note).toHaveProperty('id');
      expect(note.customer_name).toBe(TEST_CUSTOMER);
      expect(parseFloat(note.amount)).toBe(500);
      expect(note.status).toBe('active');
    });

    test('should throw 400 if customer_name is missing', async () => {
      await expect(creditNotesService.createCreditNote({
        amount: 500,
        valid_until: VALID_UNTIL,
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 if a credit note already exists for the booking', async () => {
      // Create first note
      await creditNotesService.createCreditNote({
        booking_id: bookingId,
        customer_name: TEST_CUSTOMER,
        amount: 200,
        valid_until: VALID_UNTIL,
      });

      // Second note for same booking should fail
      await expect(creditNotesService.createCreditNote({
        booking_id: bookingId,
        customer_name: TEST_CUSTOMER,
        amount: 100,
        valid_until: VALID_UNTIL,
      })).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── getCreditNoteById ───────────────────────────────────────────────────────
  describe('getCreditNoteById', () => {
    test('should return the credit note', async () => {
      const created = await creditNotesService.createCreditNote({
        customer_name: TEST_CUSTOMER,
        amount: 300,
        valid_until: VALID_UNTIL,
      });

      const fetched = await creditNotesService.getCreditNoteById(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.customer_name).toBe(TEST_CUSTOMER);
    });

    test('should throw 404 for non-existent credit note', async () => {
      await expect(creditNotesService.getCreditNoteById(999999)).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── getCreditNotesByBookingId ────────────────────────────────────────────────
  describe('getCreditNotesByBookingId', () => {
    test('should return notes linked to a booking', async () => {
      await creditNotesService.createCreditNote({
        booking_id: bookingId,
        customer_name: TEST_CUSTOMER,
        amount: 150,
        valid_until: VALID_UNTIL,
      });

      const notes = await creditNotesService.getCreditNotesByBookingId(bookingId);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0].booking_id).toBe(bookingId);
    });
  });

  // ── listCreditNotes ─────────────────────────────────────────────────────────
  describe('listCreditNotes', () => {
    test('should return an array', async () => {
      const notes = await creditNotesService.listCreditNotes();
      expect(Array.isArray(notes)).toBe(true);
    });
  });

  // ── useCreditNote ───────────────────────────────────────────────────────────
  describe('useCreditNote', () => {
    test('should deduct amount and update status to partially_used', async () => {
      const created = await creditNotesService.createCreditNote({
        customer_name: TEST_CUSTOMER,
        amount: 1000,
        valid_until: VALID_UNTIL,
      });

      const updated = await creditNotesService.useCreditNote(created.id, 400);
      expect(parseFloat(updated.used_amount)).toBe(400);
      expect(updated.status).toBe('partially_used');
    });

    test('should set status to fully_used when amount is fully consumed', async () => {
      const created = await creditNotesService.createCreditNote({
        customer_name: TEST_CUSTOMER,
        amount: 500,
        valid_until: VALID_UNTIL,
      });

      const updated = await creditNotesService.useCreditNote(created.id, 500);
      expect(updated.status).toBe('fully_used');
    });

    test('should throw 400 if amount_used exceeds credit note value', async () => {
      const created = await creditNotesService.createCreditNote({
        customer_name: TEST_CUSTOMER,
        amount: 100,
        valid_until: VALID_UNTIL,
      });

      await expect(creditNotesService.useCreditNote(created.id, 200))
        .rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 if amount_used is zero or negative', async () => {
      await expect(creditNotesService.useCreditNote(1, 0)).rejects.toMatchObject({ status: 400 });
      await expect(creditNotesService.useCreditNote(1, -50)).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 404 for non-existent credit note', async () => {
      await expect(creditNotesService.useCreditNote(999999, 100)).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── deleteCreditNote ────────────────────────────────────────────────────────
  describe('deleteCreditNote', () => {
    test('should delete and return the deleted note', async () => {
      const created = await creditNotesService.createCreditNote({
        customer_name: TEST_CUSTOMER,
        amount: 50,
        valid_until: VALID_UNTIL,
      });

      const deleted = await creditNotesService.deleteCreditNote(created.id);
      expect(deleted.id).toBe(created.id);

      const check = await pool.query('SELECT id FROM credit_notes WHERE id = $1', [created.id]);
      expect(check.rows.length).toBe(0);
    });

    test('should throw 404 for non-existent credit note', async () => {
      await expect(creditNotesService.deleteCreditNote(999999)).rejects.toMatchObject({ status: 404 });
    });
  });
});
