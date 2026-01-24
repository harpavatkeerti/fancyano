const policyService = require('../services/policyService');
const pool = require('../database/connection');

describe('PolicyService', () => {
  // Setup: Clean and seed test data before each test
  beforeEach(async () => {
    // Clean existing policies
    await pool.query('DELETE FROM rental_policies');
    
    // Insert test policies
    await pool.query(`
      INSERT INTO rental_policies 
        (policy_key, policy_name, policy_type, value_type, value, days_from_booking_min, days_from_booking_max)
      VALUES
        ('test_transport', 'Test Transport Fee', 'transport_fee', 'fixed', 100, NULL, NULL),
        ('test_late_fee', 'Test Late Fee', 'late_fee', 'fixed', 200, NULL, NULL),
        ('test_exchange_0_5', 'Exchange 0-5 days', 'exchange_penalty', 'percentage', 10, 0, 5),
        ('test_exchange_6_10', 'Exchange 6-10 days', 'exchange_penalty', 'percentage', 20, 6, 10),
        ('test_exchange_11_plus', 'Exchange 11+ days', 'exchange_penalty', 'percentage', 30, 11, NULL),
        ('test_cancel_0_5', 'Cancel 0-5 days', 'cancellation_penalty', 'percentage', 10, 0, 5),
        ('test_cancel_6_10', 'Cancel 6-10 days', 'cancellation_penalty', 'percentage', 20, 6, 10),
        ('test_cancel_11_plus', 'Cancel 11+ days', 'cancellation_penalty', 'percentage', 30, 11, NULL)
    `);
  });

  afterAll(async () => {
    // Clean up test policies
    await pool.query(`DELETE FROM rental_policies WHERE policy_key LIKE 'test_%'`);
    await pool.end();
  });

  describe('getApplicablePolicy', () => {
    // Test: Retrieves a simple fixed-value policy without time-based rules (transport fee)
    test('should get transport fee policy (non-time-based)', async () => {
      const policy = await policyService.getApplicablePolicy('transport_fee');
      
      expect(policy).not.toBeNull();
      expect(policy.policy_key).toBe('test_transport');
      expect(policy.value).toBe(100);
      expect(policy.value_type).toBe('fixed');
    });

    // Test: Retrieves another non-time-based policy (late fee) to verify basic policy retrieval works
    test('should get late fee policy (non-time-based)', async () => {
      const policy = await policyService.getApplicablePolicy('late_fee');
      
      expect(policy).not.toBeNull();
      expect(policy.policy_key).toBe('test_late_fee');
      expect(policy.value).toBe(200);
    });

    // Test: Verifies time-based policy selection works for the earliest date range (0-5 days)
    test('should get exchange penalty for 3 days (0-5 range)', async () => {
      const policy = await policyService.getApplicablePolicy('exchange_penalty', 3);
      
      expect(policy).not.toBeNull();
      expect(policy.policy_key).toBe('test_exchange_0_5');
      expect(policy.value).toBe(10);
    });

    // Test: Verifies time-based policy selection works for middle date range (6-10 days)
    test('should get exchange penalty for 7 days (6-10 range)', async () => {
      const policy = await policyService.getApplicablePolicy('exchange_penalty', 7);
      
      expect(policy).not.toBeNull();
      expect(policy.policy_key).toBe('test_exchange_6_10');
      expect(policy.value).toBe(20);
    });

    // Test: Verifies time-based policy selection works for open-ended date range (11+ days)
    test('should get exchange penalty for 15 days (11+ range)', async () => {
      const policy = await policyService.getApplicablePolicy('exchange_penalty', 15);
      
      expect(policy).not.toBeNull();
      expect(policy.policy_key).toBe('test_exchange_11_plus');
      expect(policy.value).toBe(30);
    });

    // Test: Returns null when requesting a policy type that doesn't exist in the database
    test('should return null for non-existent policy type', async () => {
      const policy = await policyService.getApplicablePolicy('non_existent');
      
      expect(policy).toBeNull();
    });

    // Test: Returns null when no active policy covers the requested time range
    test('should return null for days outside all ranges', async () => {
      // Delete the 11+ policy temporarily
      await pool.query(`UPDATE rental_policies SET is_active = false WHERE policy_key = 'test_exchange_11_plus'`);
      
      const policy = await policyService.getApplicablePolicy('exchange_penalty', 15);
      expect(policy).toBeNull();
      
      // Restore
      await pool.query(`UPDATE rental_policies SET is_active = true WHERE policy_key = 'test_exchange_11_plus'`);
    });
  });

  describe('calculatePenaltyAmount', () => {
    // Test: Calculates penalty using a fixed amount, ignoring the base amount
    test('should calculate fixed penalty', () => {
      const policy = { value_type: 'fixed', value: 500 };
      const amount = policyService.calculatePenaltyAmount(policy, 10000);
      
      expect(amount).toBe(500);
    });

    // Test: Calculates penalty as a percentage of the base amount
    test('should calculate percentage penalty', () => {
      const policy = { value_type: 'percentage', value: 20 };
      const amount = policyService.calculatePenaltyAmount(policy, 10000);
      
      expect(amount).toBe(2000); // 20% of 10000
    });

    // Test: Applies minimum value constraint when calculated penalty is below min_value
    test('should apply min_value constraint', () => {
      const policy = { value_type: 'percentage', value: 5, min_value: 500 };
      const amount = policyService.calculatePenaltyAmount(policy, 1000);
      
      // 5% of 1000 = 50, but min is 500
      expect(amount).toBe(500);
    });

    // Test: Applies maximum value constraint when calculated penalty exceeds max_value
    test('should apply max_value constraint', () => {
      const policy = { value_type: 'percentage', value: 50, max_value: 3000 };
      const amount = policyService.calculatePenaltyAmount(policy, 10000);
      
      // 50% of 10000 = 5000, but max is 3000
      expect(amount).toBe(3000);
    });

    // Test: Returns 0 when no policy is provided (graceful handling of null)
    test('should return 0 for null policy', () => {
      const amount = policyService.calculatePenaltyAmount(null, 10000);
      expect(amount).toBe(0);
    });

    // Test: Properly rounds fractional penalty amounts to nearest integer
    test('should round percentage calculations', () => {
      const policy = { value_type: 'percentage', value: 15 };
      const amount = policyService.calculatePenaltyAmount(policy, 333);
      
      // 15% of 333 = 49.95, should round to 50
      expect(amount).toBe(50);
    });
  });

  describe('calculateExchangePenalty', () => {
    // Test: Calculates 10% exchange penalty for product added 3 days ago (falls in 0-5 day range)
    test('should calculate exchange penalty for recent product (3 days)', async () => {
      const productCreatedAt = new Date();
      productCreatedAt.setDate(productCreatedAt.getDate() - 3);
      
      const result = await policyService.calculateExchangePenalty(10000, productCreatedAt);
      
      expect(result.amount).toBe(1000); // 10% of 10000
      expect(result.policy).not.toBeNull();
      expect(result.policy.key).toBe('test_exchange_0_5');
      expect(result.policy.days).toBe(3);
    });

    // Test: Calculates 20% exchange penalty for product added 8 days ago (falls in 6-10 day range)
    test('should calculate exchange penalty for medium range (8 days)', async () => {
      const productCreatedAt = new Date();
      productCreatedAt.setDate(productCreatedAt.getDate() - 8);
      
      const result = await policyService.calculateExchangePenalty(5000, productCreatedAt);
      
      expect(result.amount).toBe(1000); // 20% of 5000
      expect(result.policy.key).toBe('test_exchange_6_10');
      expect(result.policy.days).toBe(8);
    });

    // Test: Calculates 30% exchange penalty for product added 20 days ago (falls in 11+ day range)
    test('should calculate exchange penalty for old product (20 days)', async () => {
      const productCreatedAt = new Date();
      productCreatedAt.setDate(productCreatedAt.getDate() - 20);
      
      const result = await policyService.calculateExchangePenalty(8000, productCreatedAt);
      
      expect(result.amount).toBe(2400); // 30% of 8000
      expect(result.policy.key).toBe('test_exchange_11_plus');
      expect(result.policy.days).toBe(20);
    });
  });

  describe('calculateCancellationPenalty', () => {
    // Test: Calculates 10% cancellation penalty for product added 4 days ago (0-5 day range)
    test('should calculate cancellation penalty for recent product', async () => {
      const productCreatedAt = new Date();
      productCreatedAt.setDate(productCreatedAt.getDate() - 4);
      
      const result = await policyService.calculateCancellationPenalty(15000, productCreatedAt);
      
      expect(result.amount).toBe(1500); // 10% of 15000
      expect(result.policy.key).toBe('test_cancel_0_5');
    });

    // Test: Calculates 30% cancellation penalty for product added 25 days ago (11+ day range)
    test('should calculate cancellation penalty for old product', async () => {
      const productCreatedAt = new Date();
      productCreatedAt.setDate(productCreatedAt.getDate() - 25);
      
      const result = await policyService.calculateCancellationPenalty(12000, productCreatedAt);
      
      expect(result.amount).toBe(3600); // 30% of 12000
      expect(result.policy.key).toBe('test_cancel_11_plus');
    });
  });

  describe('getLateFee', () => {
    // Test: Retrieves the late fee policy and returns structured result with per-day flag
    test('should get late fee policy', async () => {
      const result = await policyService.getLateFee();
      
      expect(result.amount).toBe(200);
      expect(result.perDay).toBe(true);
      expect(result.policy).not.toBeNull();
      expect(result.policy.key).toBe('test_late_fee');
    });
  });

  describe('getTransportFee', () => {
    // Test: Retrieves the transport fee policy and returns structured result
    test('should get transport fee policy', async () => {
      const result = await policyService.getTransportFee();
      
      expect(result.amount).toBe(100);
      expect(result.policy).not.toBeNull();
      expect(result.policy.key).toBe('test_transport');
    });
  });

  describe('getAllPolicies', () => {
    // Test: Retrieves all 8 active test policies from the database
    test('should get all active policies', async () => {
      const policies = await policyService.getAllPolicies();
      
      expect(policies.length).toBe(8);
    });

    // Test: Filters policies by type to return only exchange penalty policies
    test('should filter by policy type', async () => {
      const policies = await policyService.getAllPolicies('exchange_penalty');
      
      expect(policies.length).toBe(3);
      expect(policies.every(p => p.policy_type === 'exchange_penalty')).toBe(true);
    });

    // Test: Excludes inactive policies from results (only returns is_active = true)
    test('should only return active policies', async () => {
      // Deactivate one policy
      await pool.query(`UPDATE rental_policies SET is_active = false WHERE policy_key = 'test_transport'`);
      
      const policies = await policyService.getAllPolicies();
      expect(policies.length).toBe(7);
      expect(policies.find(p => p.policy_key === 'test_transport')).toBeUndefined();
      
      // Restore
      await pool.query(`UPDATE rental_policies SET is_active = true WHERE policy_key = 'test_transport'`);
    });
  });

  describe('upsertPolicy', () => {
    // Test: Creates a brand new policy that doesn't exist in the database
    test('should create new policy', async () => {
      const newPolicy = {
        policy_key: 'test_new_policy',
        policy_name: 'New Test Policy',
        policy_type: 'late_fee',
        value_type: 'fixed',
        value: 300,
        days_from_booking_min: null,
        days_from_booking_max: null,
        min_value: 0,
        max_value: null,
        created_by: 'test_user'
      };
      
      const result = await policyService.upsertPolicy(newPolicy);
      
      expect(result).not.toBeNull();
      expect(result.policy_key).toBe('test_new_policy');
      expect(result.value).toBe(300);
    });

    // Test: Updates an existing policy by its policy_key (changes value from 100 to 150)
    test('should update existing policy', async () => {
      const updatePolicy = {
        policy_key: 'test_transport',
        policy_name: 'Updated Transport Fee',
        policy_type: 'transport_fee',
        value_type: 'fixed',
        value: 150, // Changed from 100
        days_from_booking_min: null,
        days_from_booking_max: null,
        min_value: 0,
        max_value: null,
        created_by: 'test_user'
      };
      
      const result = await policyService.upsertPolicy(updatePolicy);
      
      expect(result.value).toBe(150);
      expect(result.policy_name).toBe('Updated Transport Fee');
    });

    // Test: Prevents creating policies with overlapping date ranges for the same policy type
    test('should reject overlapping date ranges', async () => {
      const overlappingPolicy = {
        policy_key: 'test_overlap',
        policy_name: 'Overlapping Policy',
        policy_type: 'exchange_penalty',
        value_type: 'percentage',
        value: 25,
        days_from_booking_min: 4,  // Overlaps with 0-5 range
        days_from_booking_max: 8,   // Overlaps with 6-10 range
        min_value: 0,
        max_value: null,
        created_by: 'test_user'
      };
      
      await expect(policyService.upsertPolicy(overlappingPolicy))
        .rejects.toThrow('Date range overlaps');
    });
  });

  describe('deactivatePolicy', () => {
    // Test: Marks an existing policy as inactive (is_active = false) and verifies it's no longer retrieved
    test('should deactivate existing policy', async () => {
      const result = await policyService.deactivatePolicy('test_transport');
      
      expect(result).toBe(true);
      
      // Verify it's deactivated
      const policy = await policyService.getApplicablePolicy('transport_fee');
      expect(policy).toBeNull();
    });

    // Test: Returns false when attempting to deactivate a policy that doesn't exist
    test('should return false for non-existent policy', async () => {
      const result = await policyService.deactivatePolicy('non_existent_key');
      expect(result).toBe(false);
    });
  });

  describe('_getDaysSince', () => {
    // Test: Calculates the number of days between a past date and today (10 days)
    test('should calculate days correctly', () => {
      const date = new Date();
      date.setDate(date.getDate() - 10);
      
      const days = policyService._getDaysSince(date);
      expect(days).toBe(10);
    });

    // Test: Returns 0 days when the provided date is today
    test('should handle today correctly', () => {
      const date = new Date();
      const days = policyService._getDaysSince(date);
      expect(days).toBe(0);
    });
  });
});
