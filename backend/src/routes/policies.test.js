const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const policyService = require('../services/policyService');

const app = express();
app.use(express.json());
app.use('/policies', require('./policies'));

describe('Policy Routes', () => {
  let testProductId;
  let testBookingId;
  let testBookingProductId;
  let testPolicyId;

  beforeAll(async () => {
    // Deactivate real policies to avoid conflicts with test policies
    await pool.query(`UPDATE rental_policies SET is_active = false WHERE policy_key NOT LIKE 'test_%'`);
    
    // Clean up test policies
    await pool.query(`DELETE FROM rental_policies WHERE policy_key LIKE 'test_route_%'`);

    // Create test product and booking for applicable policy tests
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['TEST-POLICY-001', 'Test Policy Product', 50000, 20000, 'test']
    );
    testProductId = productResult.rows[0].id;

    const bookingResult = await pool.query(
      `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status)
       VALUES (1, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed')
       RETURNING id`
    );
    testBookingId = bookingResult.rows[0].id;

    const bpResult = await pool.query(
      `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit, effective_rent)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + 5, 'confirmed', 50000, 20000, 50000)
       RETURNING id`,
      [testBookingId, testProductId]
    );
    testBookingProductId = bpResult.rows[0].id;
  });

  afterAll(async () => {
    // Reactivate default policies
    await pool.query(`UPDATE rental_policies SET is_active = true WHERE policy_key NOT LIKE 'test_route_%'`);
    
    // Cleanup
    await pool.query(`DELETE FROM booking_products WHERE booking_id = $1`, [testBookingId]);
    await pool.query(`DELETE FROM bookings WHERE id = $1`, [testBookingId]);
    await pool.query(`DELETE FROM products WHERE id = $1`, [testProductId]);
    await pool.query(`DELETE FROM rental_policies WHERE policy_key LIKE 'test_route_%'`);
  });

  describe('GET /policies', () => {
    // Test: Returns all active policies
    it('should return all active policies', async () => {
      const response = await request(app).get('/policies');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    // Test: Filters policies by type
    it('should filter policies by type', async () => {
      // Create test policies
      await policyService.upsertPolicy({
        policy_key: 'test_route_late_fee',
        policy_name: 'Test Late Fee',
        policy_type: 'late_fee',
        value_type: 'fixed',
        value: 200,
        created_by: 'test'
      });

      const response = await request(app)
        .get('/policies')
        .query({ policy_type: 'late_fee' });

      expect(response.status).toBe(200);
      expect(response.body.every(p => p.policy_type === 'late_fee')).toBe(true);
    });
  });

  describe('GET /policies/applicable', () => {
    // Test: Returns applicable policy for booking product
    it('should return applicable policy for a booking product', async () => {
      // Create time-based test policy
      await policyService.upsertPolicy({
        policy_key: 'test_route_exchange_0_5',
        policy_name: 'Test Exchange 0-5 days',
        policy_type: 'exchange_penalty',
        value_type: 'percentage',
        value: 10,
        days_from_booking_min: 0,
        days_from_booking_max: 5,
        created_by: 'test'
      });

      const response = await request(app)
        .get('/policies/applicable')
        .query({
          policy_type: 'exchange_penalty',
          booking_product_id: testBookingProductId
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('policy');
      expect(response.body).toHaveProperty('days_since_product_added');
      expect(response.body).toHaveProperty('max_penalty');
      expect(response.body.max_penalty).toBe(5000); // 10% of 50000
    });

    // Test: Returns 400 if required params missing
    it('should return 400 if required parameters are missing', async () => {
      const response = await request(app)
        .get('/policies/applicable')
        .query({ policy_type: 'exchange_penalty' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    // Test: Returns 404 if booking product not found
    it('should return 404 if booking product does not exist', async () => {
      const response = await request(app)
        .get('/policies/applicable')
        .query({
          policy_type: 'exchange_penalty',
          booking_product_id: 999999
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /policies', () => {
    // Test: Creates new policy successfully
    it('should create a new policy', async () => {
      const response = await request(app)
        .post('/policies')
        .send({
          policy_key: 'test_route_new_policy',
          policy_name: 'Test New Policy',
          policy_type: 'cancellation_penalty',
          value_type: 'percentage',
          value: 15,
          days_from_booking_min: 6,
          days_from_booking_max: 10,
          created_by: 'test-user'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.policy).toHaveProperty('policy_key', 'test_route_new_policy');
      testPolicyId = response.body.policy.id;
    });

    // Test: Returns 400 if required fields missing
    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/policies')
        .send({
          policy_key: 'test_incomplete',
          policy_name: 'Incomplete Policy'
          // Missing policy_type, value_type, value
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    // Test: Returns 400 if invalid policy_type
    it('should return 400 for invalid policy_type', async () => {
      const response = await request(app)
        .post('/policies')
        .send({
          policy_key: 'test_invalid_type',
          policy_name: 'Invalid Type Policy',
          policy_type: 'invalid_type',
          value_type: 'fixed',
          value: 100
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid policy_type');
    });

    // Test: Returns 409 if date range overlaps
    it('should return 409 if date range overlaps with existing policy', async () => {
      // First policy: 6-10 days
      await policyService.upsertPolicy({
        policy_key: 'test_route_overlap_1',
        policy_name: 'Test Overlap 1',
        policy_type: 'exchange_penalty',
        value_type: 'percentage',
        value: 20,
        days_from_booking_min: 6,
        days_from_booking_max: 10,
        created_by: 'test'
      });

      // Try to create overlapping policy: 8-12 days
      const response = await request(app)
        .post('/policies')
        .send({
          policy_key: 'test_route_overlap_2',
          policy_name: 'Test Overlap 2',
          policy_type: 'exchange_penalty',
          value_type: 'percentage',
          value: 25,
          days_from_booking_min: 8,
          days_from_booking_max: 12
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('overlaps');
    });
  });

  describe('PUT /policies/batch/:policy_type', () => {
    // Test: Replaces all policies for a type via the batch endpoint
    it('should batch replace exchange_penalty policies', async () => {
      const response = await request(app)
        .put('/policies/batch/exchange_penalty')
        .send({
          tiers: [
            {
              policy_key: 'test_route_batch_0',
              policy_name: 'Batch Exchange 0-3 days',
              value_type: 'percentage',
              value: 8,
              days_from_booking_min: 0,
              days_from_booking_max: 3
            },
            {
              policy_key: 'test_route_batch_1',
              policy_name: 'Batch Exchange 4+ days',
              value_type: 'percentage',
              value: 30,
              days_from_booking_min: 4,
              days_from_booking_max: null
            }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.policies).toHaveLength(2);
      expect(response.body.policies[0].value).toBe(8);
      expect(response.body.policies[1].value).toBe(30);
    });

    // Test: Returns 400 for invalid policy type
    it('should return 400 for invalid policy_type', async () => {
      const response = await request(app)
        .put('/policies/batch/invalid_type')
        .send({ tiers: [{ policy_key: 'x', policy_name: 'X', value_type: 'fixed', value: 1, days_from_booking_min: 0, days_from_booking_max: null }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid policy_type');
    });

    // Test: Returns 400 if tiers array is empty
    it('should return 400 if tiers array is empty', async () => {
      const response = await request(app)
        .put('/policies/batch/exchange_penalty')
        .send({ tiers: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('tiers');
    });

    // Test: Returns 400 if tiers is missing
    it('should return 400 if tiers is missing', async () => {
      const response = await request(app)
        .put('/policies/batch/cancellation_penalty')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /policies/:id', () => {
    let updateTestPolicyId;

    beforeAll(async () => {
      // Create policy to update
      const policy = await policyService.upsertPolicy({
        policy_key: 'test_route_update',
        policy_name: 'Test Update Policy',
        policy_type: 'late_fee',
        value_type: 'fixed',
        value: 150,
        created_by: 'test'
      });
      updateTestPolicyId = policy.id;
    });

    // Test: Updates policy successfully
    it('should update policy fields', async () => {
      const response = await request(app)
        .put(`/policies/${updateTestPolicyId}`)
        .send({
          value: 250,
          policy_name: 'Updated Test Policy'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.policy.value).toBe(250);
      expect(response.body.policy.policy_name).toBe('Updated Test Policy');
    });

    // Test: Returns 404 if policy not found
    it('should return 404 if policy does not exist', async () => {
      const response = await request(app)
        .put('/policies/999999')
        .send({ value: 300 });

      expect(response.status).toBe(404);
    });

    // Test: Returns 400 if no fields to update
    it('should return 400 if no fields provided', async () => {
      const response = await request(app)
        .put(`/policies/${updateTestPolicyId}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No fields to update');
    });

    // Test: Detects overlaps when updating date range
    it('should return 409 if updated date range overlaps', async () => {
      // Create first policy with specific range
      const policy1 = await policyService.upsertPolicy({
        policy_key: 'test_route_overlap_update_1',
        policy_name: 'Overlap Update 1',
        policy_type: 'cancellation_penalty',
        value_type: 'percentage',
        value: 15,
        days_from_booking_min: 15,
        days_from_booking_max: 20,
        created_by: 'test'
      });

      // Create second policy with non-overlapping range
      const policy2 = await policyService.upsertPolicy({
        policy_key: 'test_route_overlap_update_2',
        policy_name: 'Overlap Update 2',
        policy_type: 'cancellation_penalty',
        value_type: 'percentage',
        value: 25,
        days_from_booking_min: 25,
        days_from_booking_max: 30,
        created_by: 'test'
      });

      // Try to update second policy to overlap with first
      const response = await request(app)
        .put(`/policies/${policy2.id}`)
        .send({
          days_from_booking_min: 18,
          days_from_booking_max: 28
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('overlaps');
    });
  });
});
