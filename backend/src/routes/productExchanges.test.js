const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const bookingService = require('../services/bookingService');
const policyService = require('../services/policyService');

// Create express app for testing
const app = express();
app.use(express.json());
// Mock auth: tests run as admin so checkSalesmanPermission always passes
app.use((req, res, next) => { req.user = { role: 'admin', id: 'test-user' }; next(); });
app.use('/exchanges', require('./productExchanges'));

describe('Product Exchanges Routes', () => {
  let testBookingId;
  let testBookingProductId;
  let testProduct1Id;
  let testProduct2Id;
  let testPolicyId;

  beforeAll(async () => {
    // Deactivate real policies to avoid overlap conflicts with test policies
    await pool.query(`UPDATE rental_policies SET is_active = false WHERE policy_key NOT LIKE 'test_%'`);
    // Clean up ALL existing test policies that might conflict from other test suites
    await pool.query(`DELETE FROM rental_policies WHERE policy_key LIKE 'test_%'`);
    
    // Create test products
    const product1Result = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['TEST-EXCH-001', 'Test Exchange Product 1', 50000, 20000, 'test']
    );
    testProduct1Id = product1Result.rows[0].id;

    const product2Result = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['TEST-EXCH-002', 'Test Exchange Product 2', 60000, 25000, 'test']
    );
    testProduct2Id = product2Result.rows[0].id;

    // Create test policies for different time ranges
    await policyService.upsertPolicy({
      policy_key: 'test_exchange_0_1',
      policy_name: 'Exchange 0-1 days',
      policy_type: 'exchange_penalty',
      value_type: 'percentage',
      value: 0,
      days_from_booking_min: 0,
      days_from_booking_max: 1,
      created_by: 'test-user'
    });
    
    await policyService.upsertPolicy({
      policy_key: 'test_exchange_2_3',
      policy_name: 'Exchange 2-3 days',
      policy_type: 'exchange_penalty',
      value_type: 'percentage',
      value: 10,
      days_from_booking_min: 2,
      days_from_booking_max: 3,
      created_by: 'test-user'
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testBookingId) {
      await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM booking_exchange_history WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [testBookingId]);
      await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM bookings WHERE id = $1`, [testBookingId]);
    }
    await pool.query(`DELETE FROM products WHERE code LIKE 'TEST-EXCH-%'`);
    await pool.query(`DELETE FROM rental_policies WHERE policy_key IN ('test_exchange_0_1', 'test_exchange_2_3')`);
    // Re-activate real policies
    await pool.query(`UPDATE rental_policies SET is_active = true WHERE policy_key NOT LIKE 'test_%'`);
  });

  afterEach(async () => {
    // Cleanup after each test
    if (testBookingId) {
      await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM booking_exchange_history WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [testBookingId]);
      await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [testBookingId]);
      await pool.query(`DELETE FROM bookings WHERE id = $1`, [testBookingId]);
      testBookingId = null;
    }
  });

  describe('POST /exchanges', () => {
    beforeEach(async () => {
      // Create a test booking with confirmed status
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: '2024-01-01',
        products: [
          {
            productId: testProduct1Id,
            bookedFrom: '2024-02-01',
            bookedTo: '2024-02-05',
            rent: 50000,
            securityDeposit: 20000
          }
        ],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      testBookingId = result.booking_id;

      // Confirm the booking
      await bookingService.confirmBooking(testBookingId, 'test-user');

      // Get booking_product_id
      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [testBookingId]
      );
      testBookingProductId = bpResult.rows[0].id;
    });

    it('should exchange a product (one-to-one)', async () => {
      const response = await request(app)
        .post('/exchanges')
        .send({
          old_booking_product_id: testBookingProductId,
          new_product_ids: [
            {
              product_id: testProduct2Id,
              booked_from: '2024-02-01',
              booked_to: '2024-02-05',
              rent: 60000,
              security_deposit: 25000
            }
          ],
          exchange_reason: 'Customer requested different style',
          exchanged_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.exchange_details).toHaveProperty('old_booking_product_id', testBookingProductId);
      expect(response.body.exchange_details).toHaveProperty('new_booking_product_ids');
      expect(response.body.exchange_details.new_booking_product_ids).toHaveLength(1);
    });

    it('should exchange a product (one-to-many)', async () => {
      // Create another product for multi-exchange
      const product3Result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-EXCH-003', 'Test Exchange Product 3', 30000, 15000, 'test']
      );
      const product3Id = product3Result.rows[0].id;

      const response = await request(app)
        .post('/exchanges')
        .send({
          old_booking_product_id: testBookingProductId,
          new_product_ids: [
            {
              product_id: testProduct2Id,
              booked_from: '2024-02-01',
              booked_to: '2024-02-05',
              rent: 60000,
              security_deposit: 25000
            },
            {
              product_id: product3Id,
              booked_from: '2024-02-01',
              booked_to: '2024-02-05',
              rent: 30000,
              security_deposit: 15000
            }
          ],
          exchange_reason: 'Customer needs multiple items',
          exchanged_by: 'test-user'
        });

      expect(response.status).toBe(200);
      expect(response.body.exchange_details.new_booking_product_ids).toHaveLength(2);

      // Cleanup
      await pool.query(`DELETE FROM products WHERE id = $1`, [product3Id]);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/exchanges')
        .send({
          old_booking_product_id: testBookingProductId
          // Missing new_product_ids
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if trying to exchange already exchanged product', async () => {
      // Exchange the product first
      await request(app)
        .post('/exchanges')
        .send({
          old_booking_product_id: testBookingProductId,
          new_product_ids: [
            {
              product_id: testProduct2Id,
              booked_from: '2024-02-01',
              booked_to: '2024-02-05',
              rent: 60000,
              security_deposit: 25000
            }
          ],
          exchanged_by: 'test-user'
        });

      // Try to exchange again
      const response = await request(app)
        .post('/exchanges')
        .send({
          old_booking_product_id: testBookingProductId,
          new_product_ids: [
            {
              product_id: testProduct2Id,
              booked_from: '2024-02-01',
              booked_to: '2024-02-05',
              rent: 60000,
              security_deposit: 25000
            }
          ],
          exchanged_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot exchange');
    });

    it('should return 400 if security deposit has been partially paid on the original product', async () => {
      const chargeAccountingService = require('../services/chargeAccountingService');
      // Pay enough to cover rent (50000) + some security (25000+)
      await chargeAccountingService.applyPayment(testBookingId, 75000, 'Cash', 'test-user', 'Payment');

      const response = await request(app)
        .post('/exchanges')
        .send({
          old_booking_product_id: testBookingProductId,
          new_product_ids: [
            {
              product_id: testProduct2Id,
              booked_from: '2024-02-01',
              booked_to: '2024-02-05',
              rent: 60000,
              security_deposit: 25000
            }
          ],
          exchanged_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot exchange product: security deposit has been');
    });

    it('should return 400 if new product is already active in the same booking', async () => {
      // Add testProduct1 as a second active product in the same booking
      const bp2Result = await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, '2024-02-01', '2024-02-05', 'confirmed', 60000, 25000, 60000)
         RETURNING id`,
        [testBookingId, testProduct2Id]
      );
      const bp2Id = bp2Result.rows[0].id;
      await pool.query(
        `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount) VALUES
         ($1, 'rent', 60000, 0), ($1, 'security', 25000, 0)`,
        [bp2Id]
      );

      // Try to exchange testProduct1 → testProduct2, but testProduct2 is already active
      const response = await request(app)
        .post('/exchanges')
        .send({
          old_booking_product_id: testBookingProductId,
          new_product_ids: [
            {
              product_id: testProduct2Id,
              booked_from: '2024-02-01',
              booked_to: '2024-02-05',
              rent: 60000,
              security_deposit: 25000
            }
          ],
          exchanged_by: 'test-user'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot exchange to a product already active in this booking');

      // Cleanup
      await pool.query('DELETE FROM product_charges WHERE booking_product_id = $1', [bp2Id]);
      await pool.query('DELETE FROM booking_products WHERE id = $1', [bp2Id]);
    });
  });

  describe('GET /exchanges/penalty-suggestion/:booking_product_id', () => {
    beforeEach(async () => {
      const result = await bookingService.createBooking({
        userId: 1,
        bookingDate: '2024-01-01',
        products: [
          {
            productId: testProduct1Id,
            bookedFrom: '2024-02-01',
            bookedTo: '2024-02-05',
            rent: 50000,
            securityDeposit: 20000
          }
        ],
        transportCharge: 5000,
        createdBy: 'test-user'
      });
      testBookingId = result.booking_id;

      await bookingService.confirmBooking(testBookingId, 'test-user');

      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [testBookingId]
      );
      testBookingProductId = bpResult.rows[0].id;
    });

    it('should return penalty suggestion for exchange', async () => {
      const response = await request(app).get(
        `/exchanges/penalty-suggestion/${testBookingProductId}?new_product_rent=60000`
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('amount');
      expect(response.body).toHaveProperty('policy');
      expect(typeof response.body.amount).toBe('number');
    });

    it('should return 400 if new_product_rent is missing', async () => {
      const response = await request(app).get(`/exchanges/penalty-suggestion/${testBookingProductId}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('new_product_rent');
    });

    it('should return 404 for non-existent booking product', async () => {
      const response = await request(app).get('/exchanges/penalty-suggestion/999999?new_product_rent=60000');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /exchanges/eligibility/:booking_product_id', () => {
    let eligibilityTestBookingId;
    let eligibilityTestBPId;

    beforeEach(async () => {
      // Create test booking
      const booking = await bookingService.createBooking({
        userId: 1,
        customerEmail: 'exch-eligibility@test.com',
        bookingDate: new Date().toISOString().split('T')[0],
        products: [{
          productId: testProduct1Id,
          bookedFrom: new Date().toISOString().split('T')[0],
          bookedTo: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          rent: 50000,
          securityDeposit: 20000
        }],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      eligibilityTestBookingId = booking.booking_id;

      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [eligibilityTestBookingId]
      );
      eligibilityTestBPId = bpResult.rows[0].id;

      // Confirm booking
      await bookingService.confirmBooking(eligibilityTestBookingId, 'test-user');
    });

    afterEach(async () => {
      await pool.query('DELETE FROM booking_activity_log WHERE booking_id = $1', [eligibilityTestBookingId]);
      await pool.query('DELETE FROM product_charges WHERE booking_product_id = $1', [eligibilityTestBPId]);
      await pool.query('DELETE FROM booking_products WHERE id = $1', [eligibilityTestBPId]);
      await pool.query('DELETE FROM bookings WHERE id = $1', [eligibilityTestBookingId]);
    });

    it('should return eligible=true for confirmed product', async () => {
      const response = await request(app).get(`/exchanges/eligibility/${eligibilityTestBPId}`);

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(true);
      expect(response.body.reason).toBe('Product is eligible for exchange');
      expect(response.body.product).toBeDefined();
    });

    it('should return eligible=false for in_progress product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['in_progress', eligibilityTestBPId]);

      const response = await request(app).get(`/exchanges/eligibility/${eligibilityTestBPId}`);

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(false);
      expect(response.body.reason).toContain('Cannot exchange product with status: in_progress');
    });

    it('should return eligible=false for completed product', async () => {
      await pool.query('UPDATE booking_products SET status = $1 WHERE id = $2', ['completed', eligibilityTestBPId]);

      const response = await request(app).get(`/exchanges/eligibility/${eligibilityTestBPId}`);

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(false);
      expect(response.body.reason).toContain('Cannot exchange product with status: completed');
    });

    it('should return eligible=false for non-existent product', async () => {
      const response = await request(app).get('/exchanges/eligibility/999999');

      expect(response.status).toBe(200);
      expect(response.body.eligible).toBe(false);
      expect(response.body.reason).toBe('Booking product not found');
    });
  });

  describe('GET /exchanges/preview/:old_booking_product_id', () => {
    let previewTestBookingId;
    let previewTestBPId;

    beforeEach(async () => {
      // Create test booking
      const booking = await bookingService.createBooking({
        userId: 1,
        customerEmail: 'preview@test.com',
        bookingDate: new Date().toISOString().split('T')[0],
        products: [{
          productId: testProduct1Id,
          bookedFrom: new Date().toISOString().split('T')[0],
          bookedTo: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          rent: 50000,
          securityDeposit: 20000
        }],
        transportCharge: 0,
        createdBy: 'test-user'
      });
      previewTestBookingId = booking.booking_id;

      const bpResult = await pool.query(
        'SELECT id FROM booking_products WHERE booking_id = $1',
        [previewTestBookingId]
      );
      previewTestBPId = bpResult.rows[0].id;

      await bookingService.confirmBooking(previewTestBookingId, 'test-user');
    });

    afterEach(async () => {
      if (previewTestBookingId) {
        await pool.query(`DELETE FROM booking_activity_log WHERE booking_id = $1`, [previewTestBookingId]);
        await pool.query(`DELETE FROM booking_exchange_history WHERE booking_id = $1`, [previewTestBookingId]);
        await pool.query(`DELETE FROM product_charges WHERE booking_product_id IN (SELECT id FROM booking_products WHERE booking_id = $1)`, [previewTestBookingId]);
        await pool.query(`DELETE FROM payment_transactions WHERE booking_id = $1`, [previewTestBookingId]);
        await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [previewTestBookingId]);
        await pool.query(`DELETE FROM bookings WHERE id = $1`, [previewTestBookingId]);
        previewTestBookingId = null;
      }
    });

    it('should return complete exchange preview with calculations', async () => {
      const response = await request(app).get(
        `/exchanges/preview/${previewTestBPId}?new_product_id=${testProduct2Id}`
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('old_product');
      expect(response.body).toHaveProperty('new_product');
      expect(response.body).toHaveProperty('calculations');
      expect(response.body).toHaveProperty('penalty_policy');
      
      // Verify calculations structure
      const calc = response.body.calculations;
      expect(calc).toHaveProperty('original_rent');
      expect(calc).toHaveProperty('total_new_rent');
      expect(calc).toHaveProperty('exchange_penalty');
      expect(calc).toHaveProperty('downgrade_penalty');
      expect(calc).toHaveProperty('total_payment_due');
      expect(calc).toHaveProperty('security_difference');
      expect(calc).toHaveProperty('penalty_percentage');
    });

    it('should include additional products in preview', async () => {
      // Create another test product
      const product3Result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-EXCH-003', 'Test Exchange Product 3', 30000, 15000, 'test']
      );
      const product3Id = product3Result.rows[0].id;

      const response = await request(app).get(
        `/exchanges/preview/${previewTestBPId}?new_product_id=${testProduct2Id}&additional_product_ids=${product3Id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.additional_products).toHaveLength(1);
      expect(response.body.additional_products[0].id).toBe(product3Id);
      expect(response.body.calculations.additional_rent).toBe(30000);
      expect(response.body.calculations.additional_security).toBe(15000);

      // Cleanup
      await pool.query(`DELETE FROM products WHERE id = $1`, [product3Id]);
    });

    it('should calculate downgrade penalty correctly', async () => {
      const response = await request(app).get(
        `/exchanges/preview/${previewTestBPId}?new_product_id=${testProduct2Id}`
      );

      expect(response.status).toBe(200);
      const calc = response.body.calculations;
      
      // Verify downgrade penalty formula: max(0, original_rent - (exchange_penalty + total_new_rent))
      const expectedDowngrade = Math.max(0, calc.original_rent - (calc.exchange_penalty + calc.total_new_rent));
      expect(calc.downgrade_penalty).toBe(expectedDowngrade);
    });

    it('should return 400 if new_product_id is missing', async () => {
      const response = await request(app).get(`/exchanges/preview/${previewTestBPId}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('new_product_id');
    });

    it('should return 500 for non-existent booking product', async () => {
      const response = await request(app).get(
        `/exchanges/preview/999999?new_product_id=${testProduct2Id}`
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to calculate preview');
    });

    it('should return 500 for non-existent new product', async () => {
      const response = await request(app).get(
        `/exchanges/preview/${previewTestBPId}?new_product_id=999999`
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to calculate preview');
    });

    it('should handle multiple additional products', async () => {
      // Create two additional test products
      const product3Result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-EXCH-004', 'Test Exchange Product 4', 25000, 12000, 'test']
      );
      const product4Result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-EXCH-005', 'Test Exchange Product 5', 35000, 18000, 'test']
      );
      const product3Id = product3Result.rows[0].id;
      const product4Id = product4Result.rows[0].id;

      const response = await request(app).get(
        `/exchanges/preview/${previewTestBPId}?new_product_id=${testProduct2Id}&additional_product_ids=${product3Id},${product4Id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.additional_products).toHaveLength(2);
      expect(response.body.calculations.additional_rent).toBe(60000); // 25000 + 35000
      expect(response.body.calculations.additional_security).toBe(30000); // 12000 + 18000

      // Cleanup
      await pool.query(`DELETE FROM products WHERE id IN ($1, $2)`, [product3Id, product4Id]);
    });

    it('should use size-specific rent when new_product_size query param is provided', async () => {
      // Create a product with size-based pricing
      const sizedProduct = await pool.query(
        `INSERT INTO products (code, name, rent, rent_overrides, security_deposit, category, available_sizes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        ['TEST-EXCH-SIZED', 'Sized Exchange Product', 1000, JSON.stringify({ S: 800, L: 1500 }), 500, 'test', '{S,M,L}']
      );
      const sizedProductId = sizedProduct.rows[0].id;

      // Without size — should use base rent (1000)
      const responseNoSize = await request(app).get(
        `/exchanges/preview/${previewTestBPId}?new_product_id=${sizedProductId}`
      );
      expect(responseNoSize.status).toBe(200);
      expect(responseNoSize.body.calculations.new_rent).toBe(1000);

      // With size L — should use override (1500)
      const responseL = await request(app).get(
        `/exchanges/preview/${previewTestBPId}?new_product_id=${sizedProductId}&new_product_size=L`
      );
      expect(responseL.status).toBe(200);
      expect(responseL.body.calculations.new_rent).toBe(1500);

      // With size S — should use override (800)
      const responseS = await request(app).get(
        `/exchanges/preview/${previewTestBPId}?new_product_id=${sizedProductId}&new_product_size=S`
      );
      expect(responseS.status).toBe(200);
      expect(responseS.body.calculations.new_rent).toBe(800);

      // Cleanup
      await pool.query(`DELETE FROM products WHERE id = $1`, [sizedProductId]);
    });
  });
});
