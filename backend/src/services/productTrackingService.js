/**
 * productTrackingService.js
 *
 * All database logic for the product_tracking feature.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

// ── Constants ─────────────────────────────────────────────────────────────────

// Statuses that can only be set by the booking lifecycle service
const LIFECYCLE_ONLY_STATUSES = ['in_house', 'picked_by_customer'];

// Valid statuses that the Track modal can create via POST
const MANUAL_TRACKING_STATUSES = [
  'going_to_dry_clean',
  'alternation_related_work',
  'repair',
  'other_work',
];

// ── Shared SELECT ─────────────────────────────────────────────────────────────

const TRACKING_SELECT = `
  SELECT
    pt.*,
    p.name AS product_name,
    p.code AS product_code_ref,
    p.size AS product_size,
    usr.name AS customer_name,
    b.id     AS booking_ref_id
  FROM product_tracking pt
  LEFT JOIN products p   ON pt.product_id  = p.id
  LEFT JOIN bookings b   ON pt.booking_id  = b.id
  LEFT JOIN users    usr ON b.user_id      = usr.id
`;

// ── Service Functions ─────────────────────────────────────────────────────────

async function listTrackingRecords() {
  const result = await pool.query(`${TRACKING_SELECT} ORDER BY pt.created_at DESC`);
  return result.rows;
}

async function getCurrentTrackingForProduct(productId) {
  const result = await pool.query(`
    SELECT
      pt.*,
      p.name AS product_name,
      p.code AS product_code_ref,
      p.size AS product_size,
      usr.name AS customer_name,
      b.id     AS booking_ref_id
    FROM product_tracking pt
    LEFT JOIN products p   ON pt.product_id  = p.id
    LEFT JOIN bookings b   ON pt.booking_id  = b.id
    LEFT JOIN users    usr ON b.user_id      = usr.id
    WHERE pt.product_id = $1
    ORDER BY pt.created_at DESC, pt.id DESC
    LIMIT 1`,
    [productId]
  );
  // null means no history — product is implicitly in_house
  return result.rows[0] || null;
}

async function getTrackingHistoryByProductId(productId) {
  const result = await pool.query(
    `${TRACKING_SELECT}
     WHERE pt.product_id = $1
     ORDER BY pt.created_at DESC`,
    [productId]
  );
  return result.rows;
}

async function getTrackingHistoryByProductCode(code) {
  const result = await pool.query(
    `${TRACKING_SELECT}
     WHERE pt.product_code = $1
     ORDER BY pt.created_at DESC`,
    [code]
  );
  return result.rows;
}

async function createTrackingRecord({ product_id, booking_id, product_code, tracking_status, notes }) {
  if (!product_code || !tracking_status) {
    const err = new Error('product_code and tracking_status are required');
    err.status = 400;
    throw err;
  }

  if (!MANUAL_TRACKING_STATUSES.includes(tracking_status)) {
    const err = new Error(
      `tracking_status '${tracking_status}' is not allowed via this endpoint. ` +
      `Must be one of: ${MANUAL_TRACKING_STATUSES.join(', ')}. ` +
      `'in_house' and 'picked_by_customer' are managed by the booking lifecycle.`
    );
    err.status = 400;
    throw err;
  }

  if (tracking_status === 'other_work' && !notes) {
    const err = new Error('notes is required for other_work');
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    `INSERT INTO product_tracking
       (product_id, booking_id, product_code, tracking_status, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [product_id, booking_id || null, product_code, tracking_status, notes || null]
  );
  return result.rows[0];
}

async function listActiveTrackingRecords() {
  const result = await pool.query(`
    SELECT
      latest.*,
      p.name  AS product_name,
      p.code  AS product_code_ref,
      p.size  AS product_size,
      usr.name AS customer_name,
      b.id     AS booking_ref_id
    FROM (
      SELECT DISTINCT ON (product_id) *
      FROM product_tracking
      ORDER BY product_id, created_at DESC, id DESC
    ) latest
    LEFT JOIN products p   ON latest.product_id  = p.id
    LEFT JOIN bookings b   ON latest.booking_id  = b.id
    LEFT JOIN users    usr ON b.user_id           = usr.id
    WHERE latest.tracking_status != 'in_house'
    ORDER BY latest.created_at DESC, latest.id DESC
  `);
  return result.rows;
}

async function returnTrackingRecord(id, notes) {
  const existing = await pool.query(
    'SELECT product_id, product_code FROM product_tracking WHERE id = $1',
    [id]
  );
  if (existing.rows.length === 0) {
    const err = new Error('Tracking record not found');
    err.status = 404;
    throw err;
  }

  const { product_id, product_code } = existing.rows[0];

  // Insert a new in_house row — preserves full audit history
  const result = await pool.query(
    `INSERT INTO product_tracking
       (product_id, product_code, tracking_status, notes)
     VALUES ($1, $2, 'in_house', $3)
     RETURNING *`,
    [product_id, product_code, notes || null]
  );
  return result.rows[0];
}

async function deleteTrackingRecord(id) {
  const result = await pool.query(
    'DELETE FROM product_tracking WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rows.length === 0) {
    const err = new Error('Tracking record not found');
    err.status = 404;
    throw err;
  }
  return result.rows[0];
}

module.exports = {
  MANUAL_TRACKING_STATUSES,
  LIFECYCLE_ONLY_STATUSES,
  listTrackingRecords,
  getCurrentTrackingForProduct,
  getTrackingHistoryByProductId,
  getTrackingHistoryByProductCode,
  createTrackingRecord,
  listActiveTrackingRecords,
  returnTrackingRecord,
  deleteTrackingRecord,
};
