const pool = require('../database/connection');

/**
 * PolicyService - Manages rental policies and penalty calculations
 * Policies are time-based and calculated from booking_product.created_at
 */
class PolicyService {
  /**
   * Get applicable policy for a given type and days since product was added
   * @param {string} policyType - 'exchange_penalty', 'cancellation_penalty', 'late_fee', 'transport_fee'
   * @param {number} daysSinceProductAdded - Days from booking_product.created_at to now
   * @returns {Promise<Object|null>} - Policy object or null
   */
  async getApplicablePolicy(policyType, daysSinceProductAdded = null) {
    try {
      let query = `
        SELECT * FROM rental_policies 
        WHERE policy_type = $1 
        AND is_active = true
      `;
      
      const params = [policyType];
      
      // For time-based policies, find matching date range
      if (daysSinceProductAdded !== null) {
        query += ` AND (
          (days_from_booking_min IS NULL OR days_from_booking_min <= $2)
          AND (days_from_booking_max IS NULL OR days_from_booking_max >= $2)
        )`;
        params.push(daysSinceProductAdded);
      } else {
        // For non-time-based policies (e.g., transport_fee, late_fee)
        query += ` AND days_from_booking_min IS NULL AND days_from_booking_max IS NULL`;
      }
      
      query += ` ORDER BY created_at DESC LIMIT 1`;
      
      const result = await pool.query(query, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting applicable policy:', error);
      throw error;
    }
  }

  /**
   * Calculate penalty amount based on policy
   * @param {Object} policy - Policy object from database
   * @param {number} baseAmount - Amount to apply percentage to (e.g., rent amount)
   * @returns {number} - Calculated penalty amount (integer, in paise/cents)
   */
  calculatePenaltyAmount(policy, baseAmount) {
    if (!policy) return 0;
    
    let amount = 0;
    
    if (policy.value_type === 'fixed') {
      amount = policy.value;
    } else if (policy.value_type === 'percentage') {
      amount = Math.round((baseAmount * policy.value) / 100);
    }
    
    // Apply min/max constraints
    if (policy.min_value && amount < policy.min_value) {
      amount = policy.min_value;
    }
    if (policy.max_value && amount > policy.max_value) {
      amount = policy.max_value;
    }
    
    return Math.round(amount);
  }

  /**
   * Calculate exchange penalty for a product
   * @param {number} rentAmount - Product rent amount
   * @param {Date} productCreatedAt - When product was added to booking
   * @returns {Promise<Object>} - { amount, policy }
   */
  async calculateExchangePenalty(rentAmount, productCreatedAt) {
    try {
      const daysSince = this._getDaysSince(productCreatedAt);
      const policy = await this.getApplicablePolicy('exchange_penalty', daysSince);
      const amount = this.calculatePenaltyAmount(policy, rentAmount);
      
      return {
        amount,
        policy: policy ? {
          key: policy.policy_key,
          name: policy.policy_name,
          type: policy.value_type,
          value: policy.value,
          days: daysSince
        } : null
      };
    } catch (error) {
      console.error('Error calculating exchange penalty:', error);
      throw error;
    }
  }

  /**
   * Calculate cancellation penalty for a product
   * @param {number} rentAmount - Product rent amount
   * @param {Date} productCreatedAt - When product was added to booking
   * @returns {Promise<Object>} - { amount, policy }
   */
  async calculateCancellationPenalty(rentAmount, productCreatedAt) {
    try {
      const daysSince = this._getDaysSince(productCreatedAt);
      const policy = await this.getApplicablePolicy('cancellation_penalty', daysSince);
      const amount = this.calculatePenaltyAmount(policy, rentAmount);
      
      return {
        amount,
        policy: policy ? {
          key: policy.policy_key,
          name: policy.policy_name,
          type: policy.value_type,
          value: policy.value,
          days: daysSince
        } : null
      };
    } catch (error) {
      console.error('Error calculating cancellation penalty:', error);
      throw error;
    }
  }

  /**
   * Get late fee policy
   * @returns {Promise<Object>} - { amount, policy }
   */
  async getLateFee() {
    try {
      const policy = await this.getApplicablePolicy('late_fee');
      const amount = policy ? policy.value : 0;
      
      return {
        amount,
        perDay: true,
        policy: policy ? {
          key: policy.policy_key,
          name: policy.policy_name,
          type: policy.value_type,
          value: policy.value
        } : null
      };
    } catch (error) {
      console.error('Error getting late fee:', error);
      throw error;
    }
  }

  /**
   * Get transport fee policy
   * @returns {Promise<Object>} - { amount, policy }
   */
  async getTransportFee() {
    try {
      const policy = await this.getApplicablePolicy('transport_fee');
      const amount = policy ? policy.value : 0;
      
      return {
        amount,
        policy: policy ? {
          key: policy.policy_key,
          name: policy.policy_name,
          type: policy.value_type,
          value: policy.value
        } : null
      };
    } catch (error) {
      console.error('Error getting transport fee:', error);
      throw error;
    }
  }

  /**
   * Get all active policies
   * @param {string} policyType - Optional filter by policy type
   * @returns {Promise<Array>} - Array of policies
   */
  async getAllPolicies(policyType = null) {
    try {
      let query = 'SELECT * FROM rental_policies WHERE is_active = true';
      const params = [];
      
      if (policyType) {
        query += ' AND policy_type = $1';
        params.push(policyType);
      }
      
      query += ' ORDER BY policy_type, days_from_booking_min NULLS FIRST, created_at DESC';
      
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting all policies:', error);
      throw error;
    }
  }

  /**
   * Create or update a policy
   * @param {Object} policyData - Policy data
   * @returns {Promise<Object>} - Created/updated policy
   */
  async upsertPolicy(policyData) {
    const {
      policy_key,
      policy_name,
      policy_type,
      value_type,
      value,
      days_from_booking_min,
      days_from_booking_max,
      min_value,
      max_value,
      created_by
    } = policyData;

    try {
      // Check for overlapping date ranges for the same policy type
      if (days_from_booking_min !== null || days_from_booking_max !== null) {
        const overlapCheck = await pool.query(
          `SELECT * FROM rental_policies 
           WHERE policy_type = $1 
           AND policy_key != $2
           AND is_active = true
           AND (days_from_booking_min IS NOT NULL OR days_from_booking_max IS NOT NULL)
           AND (
             ($3::INTEGER IS NULL OR days_from_booking_max IS NULL OR $3::INTEGER <= days_from_booking_max)
             AND ($4::INTEGER IS NULL OR days_from_booking_min IS NULL OR $4::INTEGER >= days_from_booking_min)
           )`,
          [policy_type, policy_key, days_from_booking_min, days_from_booking_max]
        );

        if (overlapCheck.rows.length > 0) {
          throw new Error('Date range overlaps with existing policy: ' + overlapCheck.rows[0].policy_name);
        }
      }

      const result = await pool.query(
        `INSERT INTO rental_policies 
         (policy_key, policy_name, policy_type, value_type, value, 
          days_from_booking_min, days_from_booking_max, min_value, max_value, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (policy_key) 
         DO UPDATE SET
           policy_name = EXCLUDED.policy_name,
           policy_type = EXCLUDED.policy_type,
           value_type = EXCLUDED.value_type,
           value = EXCLUDED.value,
           days_from_booking_min = EXCLUDED.days_from_booking_min,
           days_from_booking_max = EXCLUDED.days_from_booking_max,
           min_value = EXCLUDED.min_value,
           max_value = EXCLUDED.max_value,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [policy_key, policy_name, policy_type, value_type, value,
         days_from_booking_min, days_from_booking_max, min_value, max_value, created_by]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error upserting policy:', error);
      throw error;
    }
  }

  /**
   * Deactivate a policy
   * @param {string} policyKey - Policy key to deactivate
   * @returns {Promise<boolean>}
   */
  async deactivatePolicy(policyKey) {
    try {
      const result = await pool.query(
        `UPDATE rental_policies 
         SET is_active = false, updated_at = CURRENT_TIMESTAMP 
         WHERE policy_key = $1
         RETURNING *`,
        [policyKey]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error deactivating policy:', error);
      throw error;
    }
  }

  /**
   * Update an existing policy
   * @param {number} policyId - Policy ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated policy
   */
  async updatePolicy(policyId, updates) {
    try {
      // Get existing policy
      const existingResult = await pool.query(
        'SELECT * FROM rental_policies WHERE id = $1',
        [policyId]
      );

      if (existingResult.rows.length === 0) {
        throw new Error('Policy not found');
      }

      const existing = existingResult.rows[0];

      // Check for overlaps if date range is being changed
      const {
        days_from_booking_min,
        days_from_booking_max
      } = updates;

      if (days_from_booking_min !== undefined || days_from_booking_max !== undefined) {
        const newMin = days_from_booking_min !== undefined ? days_from_booking_min : existing.days_from_booking_min;
        const newMax = days_from_booking_max !== undefined ? days_from_booking_max : existing.days_from_booking_max;

        if (newMin !== null || newMax !== null) {
          const overlapCheck = await pool.query(
            `SELECT * FROM rental_policies 
             WHERE policy_type = $1 
             AND id != $2
             AND is_active = true
             AND (days_from_booking_min IS NOT NULL OR days_from_booking_max IS NOT NULL)
             AND (
               ($3::INTEGER IS NULL OR days_from_booking_max IS NULL OR $3::INTEGER <= days_from_booking_max)
               AND ($4::INTEGER IS NULL OR days_from_booking_min IS NULL OR $4::INTEGER >= days_from_booking_min)
             )`,
            [existing.policy_type, policyId, newMin, newMax]
          );

          if (overlapCheck.rows.length > 0) {
            throw new Error('Date range overlaps with existing policy: ' + overlapCheck.rows[0].policy_name);
          }
        }
      }

      // Build update query
      const setClauses = [];
      const values = [];
      let paramCount = 1;

      const allowedFields = [
        'policy_name', 'value', 'days_from_booking_min', 
        'days_from_booking_max', 'min_value', 'max_value', 'is_active'
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = $${paramCount++}`);
          values.push(updates[field]);
        }
      }

      if (setClauses.length === 0) {
        throw new Error('No fields to update');
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(policyId);

      const result = await pool.query(
        `UPDATE rental_policies SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error updating policy:', error);
      throw error;
    }
  }

  /**
   * Get applicable policy for a specific booking product
   * @param {string} policyType - Policy type
   * @param {number} bookingProductId - Booking product ID
   * @returns {Promise<Object>} - Policy details with calculated max penalty
   */
  async getApplicablePolicyForBookingProduct(policyType, bookingProductId) {
    try {
      // Get booking product to calculate days since added
      const bpResult = await pool.query(
        'SELECT id, rent, created_at FROM booking_products WHERE id = $1',
        [bookingProductId]
      );

      if (bpResult.rows.length === 0) {
        throw new Error('Booking product not found');
      }

      const bookingProduct = bpResult.rows[0];
      const daysSince = this._getDaysSince(bookingProduct.created_at);

      // Get applicable policy
      const policy = await this.getApplicablePolicy(policyType, daysSince);
      
      if (!policy) {
        return {
          policy: null,
          days_since_product_added: daysSince,
          max_penalty: 0
        };
      }

      // Calculate max penalty
      const maxPenalty = this.calculatePenaltyAmount(policy, bookingProduct.rent);

      return {
        policy,
        value: policy.value,
        value_type: policy.value_type,
        days_since_product_added: daysSince,
        max_penalty: maxPenalty
      };
    } catch (error) {
      console.error('Error getting applicable policy for booking product:', error);
      throw error;
    }
  }

  /**
   * Calculate days since a date
   * @param {Date|string} date
   * @returns {number}
   */
  _getDaysSince(date) {
    const now = new Date();
    const then = new Date(date);
    const diffTime = now - then;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}

module.exports = new PolicyService();
