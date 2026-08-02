/**
 * productTrackingService.test.js
 *
 * Integration tests for productTrackingService functions.
 * Calls service functions directly (no HTTP) and verifies DB state.
 */

const pool = require('../database/connection');
const productTrackingService = require('./productTrackingService');

// ── Constants ─────────────────────────────────────────────────────────────────
const TEST_CODE = 'PT-TEST-SVC-001';
const SIZED_TEST_CODE = 'PT-TEST-SVC-002';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function createTestProduct() {
  const r = await pool.query(
    `INSERT INTO products (code, name, rent, security_deposit, category)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [TEST_CODE, 'PT Service Test Product', 1000, 500, 'test']
  );
  return r.rows[0].id;
}

async function createSizedTestProduct() {
  const r = await pool.query(
    `INSERT INTO products (code, name, rent, security_deposit, category, available_sizes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [SIZED_TEST_CODE, 'PT Sized Product', 1000, 500, 'test', '{M,L,XL}']
  );
  return r.rows[0].id;
}

async function cleanup() {
  await pool.query('DELETE FROM product_tracking WHERE product_code IN ($1, $2)', [TEST_CODE, SIZED_TEST_CODE]);
  await pool.query('DELETE FROM products WHERE code IN ($1, $2)', [TEST_CODE, SIZED_TEST_CODE]);
}

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('productTrackingService', () => {
  let productId;
  let sizedProductId;

  beforeAll(async () => {
    await cleanup();
    productId = await createTestProduct();
    sizedProductId = await createSizedTestProduct();
  });

  afterAll(cleanup);

  afterEach(async () => {
    // Clear tracking records between tests for a clean slate
    await pool.query('DELETE FROM product_tracking WHERE product_code IN ($1, $2)', [TEST_CODE, SIZED_TEST_CODE]);
  });

  // ── createTrackingRecord ────────────────────────────────────────────────────
  describe('createTrackingRecord', () => {
    test('should create a manual tracking record', async () => {
      const record = await productTrackingService.createTrackingRecord({
        product_id: productId,
        product_code: TEST_CODE,
        tracking_status: 'going_to_dry_clean',
        notes: 'Sending for dry clean',
      });

      expect(record).toHaveProperty('id');
      expect(record.product_code).toBe(TEST_CODE);
      expect(record.tracking_status).toBe('going_to_dry_clean');
    });

    test('should throw 400 if product_code is missing', async () => {
      await expect(productTrackingService.createTrackingRecord({
        product_id: productId,
        tracking_status: 'repair',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 if tracking_status is missing', async () => {
      await expect(productTrackingService.createTrackingRecord({
        product_id: productId,
        product_code: TEST_CODE,
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 for lifecycle-only status in_house', async () => {
      await expect(productTrackingService.createTrackingRecord({
        product_id: productId,
        product_code: TEST_CODE,
        tracking_status: 'in_house',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 for lifecycle-only status picked_by_customer', async () => {
      await expect(productTrackingService.createTrackingRecord({
        product_id: productId,
        product_code: TEST_CODE,
        tracking_status: 'picked_by_customer',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 for other_work without notes', async () => {
      await expect(productTrackingService.createTrackingRecord({
        product_id: productId,
        product_code: TEST_CODE,
        tracking_status: 'other_work',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should allow other_work when notes are provided', async () => {
      const record = await productTrackingService.createTrackingRecord({
        product_id: productId,
        product_code: TEST_CODE,
        tracking_status: 'other_work',
        notes: 'Custom work description',
      });
      expect(record.tracking_status).toBe('other_work');
    });

    test('should persist size when provided (sized product)', async () => {
      const record = await productTrackingService.createTrackingRecord({
        product_id: sizedProductId,
        product_code: SIZED_TEST_CODE,
        tracking_status: 'repair',
        size: 'M',
      });
      expect(record.size).toBe('M');
    });

    test('should store null size when not provided (sizeless product)', async () => {
      const record = await productTrackingService.createTrackingRecord({
        product_id: productId,
        product_code: TEST_CODE,
        tracking_status: 'repair',
      });
      expect(record.size).toBeNull();
    });

    test('should throw 400 when size is missing for a sized product', async () => {
      await expect(productTrackingService.createTrackingRecord({
        product_id: sizedProductId,
        product_code: SIZED_TEST_CODE,
        tracking_status: 'repair',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 for an invalid size on a sized product', async () => {
      await expect(productTrackingService.createTrackingRecord({
        product_id: sizedProductId,
        product_code: SIZED_TEST_CODE,
        tracking_status: 'repair',
        size: 'XXXL',
      })).rejects.toMatchObject({ status: 400 });
    });

    test('should throw 400 when size is passed for a sizeless product', async () => {
      await expect(productTrackingService.createTrackingRecord({
        product_id: productId,
        product_code: TEST_CODE,
        tracking_status: 'repair',
        size: 'M',
      })).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── getCurrentTrackingForProduct ─────────────────────────────────────────────
  describe('getCurrentTrackingForProduct', () => {
    test('should return null when no history exists', async () => {
      const record = await productTrackingService.getCurrentTrackingForProduct(productId);
      expect(record).toBeNull();
    });

    test('should return the most recent record', async () => {
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair')`,
        [productId, TEST_CODE]
      );
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'going_to_dry_clean')`,
        [productId, TEST_CODE]
      );

      const current = await productTrackingService.getCurrentTrackingForProduct(productId);
      // Most recent inserted is dry_clean
      expect(current.tracking_status).toBe('going_to_dry_clean');
    });

    test('should filter by size when provided', async () => {
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status, size)
         VALUES ($1, $2, 'repair', 'M')`,
        [productId, TEST_CODE]
      );
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status, size)
         VALUES ($1, $2, 'going_to_dry_clean', 'L')`,
        [productId, TEST_CODE]
      );

      const currentM = await productTrackingService.getCurrentTrackingForProduct(productId, 'M');
      expect(currentM.tracking_status).toBe('repair');
      expect(currentM.size).toBe('M');

      const currentL = await productTrackingService.getCurrentTrackingForProduct(productId, 'L');
      expect(currentL.tracking_status).toBe('going_to_dry_clean');
      expect(currentL.size).toBe('L');
    });

    test('should return all sizes when size is null', async () => {
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status, size)
         VALUES ($1, $2, 'repair', 'M')`,
        [productId, TEST_CODE]
      );
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status, size)
         VALUES ($1, $2, 'going_to_dry_clean', 'L')`,
        [productId, TEST_CODE]
      );

      // null size returns the most recent record regardless of size
      const current = await productTrackingService.getCurrentTrackingForProduct(productId, null);
      expect(current).not.toBeNull();
      expect(current.tracking_status).toBe('going_to_dry_clean');
    });
  });

  // ── getTrackingHistoryByProductId ────────────────────────────────────────────
  describe('getTrackingHistoryByProductId', () => {
    test('should return all records for a product in descending order', async () => {
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair'), ($1, $2, 'in_house')`,
        [productId, TEST_CODE]
      );

      const history = await productTrackingService.getTrackingHistoryByProductId(productId);
      expect(history.length).toBe(2);
    });

    test('should filter history by size when provided', async () => {
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status, size)
         VALUES ($1, $2, 'repair', 'M'), ($1, $2, 'going_to_dry_clean', 'M'), ($1, $2, 'repair', 'L')`,
        [productId, TEST_CODE]
      );

      const historyM = await productTrackingService.getTrackingHistoryByProductId(productId, 'M');
      expect(historyM.length).toBe(2);
      historyM.forEach(r => expect(r.size).toBe('M'));

      const historyL = await productTrackingService.getTrackingHistoryByProductId(productId, 'L');
      expect(historyL.length).toBe(1);
      expect(historyL[0].size).toBe('L');
    });

    test('should return all sizes when size is null', async () => {
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status, size)
         VALUES ($1, $2, 'repair', 'M'), ($1, $2, 'repair', 'L'), ($1, $2, 'in_house', NULL)`,
        [productId, TEST_CODE]
      );

      const allHistory = await productTrackingService.getTrackingHistoryByProductId(productId, null);
      expect(allHistory.length).toBe(3);
    });
  });

  // ── listActiveTrackingRecords ────────────────────────────────────────────────
  describe('listActiveTrackingRecords', () => {
    test('should not include products whose latest status is in_house', async () => {
      // Two separate inserts so in_house gets a strictly later created_at
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status) VALUES ($1, $2, 'repair')`,
        [productId, TEST_CODE]
      );
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status) VALUES ($1, $2, 'in_house')`,
        [productId, TEST_CODE]
      );

      const active = await productTrackingService.listActiveTrackingRecords();
      const codes = active.map(r => r.product_code);
      expect(codes).not.toContain(TEST_CODE);
    });

    test('should include products whose latest status is not in_house', async () => {
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair')`,
        [productId, TEST_CODE]
      );

      const active = await productTrackingService.listActiveTrackingRecords();
      const codes = active.map(r => r.product_code);
      expect(codes).toContain(TEST_CODE);
    });
  });

  // ── returnTrackingRecord ─────────────────────────────────────────────────────
  describe('returnTrackingRecord', () => {
    test('should insert a new in_house row and preserve the original', async () => {
      const outRecord = await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair') RETURNING id`,
        [productId, TEST_CODE]
      );
      const outId = outRecord.rows[0].id;

      const returned = await productTrackingService.returnTrackingRecord(outId, 'Fixed');
      expect(returned.tracking_status).toBe('in_house');
      expect(returned.product_code).toBe(TEST_CODE);

      // Original record should still exist
      const original = await pool.query('SELECT tracking_status FROM product_tracking WHERE id = $1', [outId]);
      expect(original.rows[0].tracking_status).toBe('repair');
    });

    test('should throw 404 for non-existent record', async () => {
      await expect(productTrackingService.returnTrackingRecord(999999, null))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ── deleteTrackingRecord ─────────────────────────────────────────────────────
  describe('deleteTrackingRecord', () => {
    test('should delete and return the record', async () => {
      const r = await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status)
         VALUES ($1, $2, 'repair') RETURNING id`,
        [productId, TEST_CODE]
      );
      const id = r.rows[0].id;

      const deleted = await productTrackingService.deleteTrackingRecord(id);
      expect(deleted.id).toBe(id);

      const check = await pool.query('SELECT id FROM product_tracking WHERE id = $1', [id]);
      expect(check.rows.length).toBe(0);
    });

    test('should throw 404 for non-existent record', async () => {
      await expect(productTrackingService.deleteTrackingRecord(999999))
        .rejects.toMatchObject({ status: 404 });
    });
  });
});
