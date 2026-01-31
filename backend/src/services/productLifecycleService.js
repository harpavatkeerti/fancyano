const pool = require('../database/connection');
const policyService = require('./policyService');
const chargeAccountingService = require('./chargeAccountingService');

/**
 * ProductLifecycleService - Manages booking product lifecycle events
 * Handles exchange, cancellation, pickup, and return operations
 */
class ProductLifecycleService {
  /**
   * Helper: Calculate exchange penalties (shared logic)
   * @private
   */
  _calculateExchangePenalties(originalRent, exchangePenalty, totalNewRent) {
    // Calculate downgrade penalty: max(0, old_rent - (exchange_penalty + new_total_rent))
    const downgradePenalty = Math.max(0, originalRent - (exchangePenalty + totalNewRent));
    return { downgradePenalty };
  }

  /**
   * Exchange a product in a booking (ONE-TO-MANY: one old product for multiple new products)
   * @param {number} bookingProductId - The booking product to exchange
   * @param {Array<Object>} newProducts - Array of {productId, rent, securityDeposit}
   * @param {string} reason - Reason for exchange
   * @param {number} userId - User performing the exchange
   * @returns {Promise<Object>} - Exchange details
   */
  async exchangeProduct(bookingProductId, newProducts, reason, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get existing booking product
      const bpResult = await client.query(
        'SELECT * FROM booking_products WHERE id = $1',
        [bookingProductId]
      );
      
      if (bpResult.rows.length === 0) {
        throw new Error('Booking product not found');
      }
      
      const oldBookingProduct = bpResult.rows[0];
      
      if (['in_progress', 'exchanged', 'cancelled', 'completed'].includes(oldBookingProduct.status)) {
        throw new Error(`Cannot exchange product with status: ${oldBookingProduct.status}`);
      }
      
      // Calculate exchange penalty based on EFFECTIVE rent (after discount)
      const penaltyResult = await policyService.calculateExchangePenalty(
        oldBookingProduct.effective_rent,  // Use effective_rent instead of rent
        oldBookingProduct.created_at
      );
      
      // Mark old product as exchanged
      await client.query(
        'UPDATE booking_products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['exchanged', bookingProductId]
      );
      
      // Add exchange penalty charge to old product
      if (penaltyResult.amount > 0) {
        await chargeAccountingService.addCharge(
          bookingProductId,
          'exchange_penalty',
          penaltyResult.amount,
          penaltyResult.policy?.key || null,
          `Exchange penalty: ${penaltyResult.policy?.days || 0} days since product added`,
          client
        );
      }
      
      // Calculate total new rent
      const newTotalRent = newProducts.reduce((sum, p) => sum + p.rent, 0);
      
      // Use shared calculation logic with EFFECTIVE rent
      const { downgradePenalty } = this._calculateExchangePenalties(
        oldBookingProduct.effective_rent,  // Use effective_rent instead of rent
        penaltyResult.amount,
        newTotalRent
      );
      
      // Add downgrade penalty if applicable
      if (downgradePenalty > 0) {
        await chargeAccountingService.addCharge(
          bookingProductId,
          'downgrade_penalty',
          downgradePenalty,
          null,
          `Downgrade: old effective rent ₹${oldBookingProduct.effective_rent} vs new total ₹${newTotalRent}`,
          client
        );
      }
      
      // Create new booking products
      const newBookingProductIds = [];
      for (const newProd of newProducts) {
        const newBpResult = await client.query(
          `INSERT INTO booking_products 
            (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            oldBookingProduct.booking_id,
            newProd.productId,
            oldBookingProduct.quantity,
            oldBookingProduct.booked_from,
            oldBookingProduct.booked_to,
            'confirmed',
            newProd.rent,
            newProd.securityDeposit,
            newProd.rent
          ]
        );
        
        const newBookingProductId = newBpResult.rows[0].id;
        newBookingProductIds.push(newBookingProductId);
        
        // Initialize charges for new product
        await chargeAccountingService.initializeProductCharges(
          newBookingProductId,
          newProd.rent,
          newProd.securityDeposit,
          client
        );
      }
      
      // Record exchange history
      const exchangeResult = await client.query(
        `INSERT INTO booking_exchange_history 
          (booking_id, old_booking_product_id, new_booking_product_ids, exchange_penalty, downgrade_penalty, reason, exchanged_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          oldBookingProduct.booking_id,
          bookingProductId,
          JSON.stringify(newBookingProductIds),
          penaltyResult.amount,
          downgradePenalty,
          reason,
          userId
        ]
      );
      
      // Log in booking activity
      await client.query(
        `INSERT INTO booking_activity_log 
          (booking_id, event_type, event_reference_id, details, performed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          oldBookingProduct.booking_id,
          'product_exchanged',
          exchangeResult.rows[0].id,
          { 
            old_product_id: oldBookingProduct.product_id, 
            new_product_ids: newProducts.map(p => p.productId),
            new_booking_product_ids: newBookingProductIds
          },
          userId
        ]
      );
      
      await client.query('COMMIT');
      
      return {
        old_booking_product_id: bookingProductId,
        new_booking_product_ids: newBookingProductIds,
        exchange_penalty: penaltyResult.amount,
        downgrade_penalty: downgradePenalty,
        total_penalty: penaltyResult.amount + downgradePenalty
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel a product in a booking
   * @param {number} bookingProductId - The booking product to cancel
   * @param {number} cancellationPenalty - Admin-set cancellation penalty
   * @param {string} reason - Reason for cancellation
   * @param {number} userId - User performing the cancellation
   * @returns {Promise<Object>} - Cancellation details
   */
  async cancelProduct(bookingProductId, cancellationPenalty, reason, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get existing booking product
      const bpResult = await client.query(
        'SELECT * FROM booking_products WHERE id = $1',
        [bookingProductId]
      );
      
      if (bpResult.rows.length === 0) {
        throw new Error('Booking product not found');
      }
      
      const bookingProduct = bpResult.rows[0];
      
      if (['in_progress', 'exchanged', 'cancelled', 'completed'].includes(bookingProduct.status)) {
        throw new Error(`Cannot cancel product with status: ${bookingProduct.status}`);
      }
      
      // Mark product as cancelled
      await client.query(
        'UPDATE booking_products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['cancelled', bookingProductId]
      );
      
      // Add cancellation penalty charge
      if (cancellationPenalty > 0) {
        await chargeAccountingService.addCharge(
          bookingProductId,
          'cancellation_penalty',
          cancellationPenalty,
          null,
          reason || 'Product cancelled',
          client
        );
      }
      
      // Record cancellation history
      const cancelResult = await client.query(
        `INSERT INTO booking_cancellation_history 
          (booking_id, booking_product_id, cancellation_penalty, reason, cancelled_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          bookingProduct.booking_id,
          bookingProductId,
          cancellationPenalty,
          reason,
          userId
        ]
      );
      
      // Log in booking activity
      await client.query(
        `INSERT INTO booking_activity_log 
          (booking_id, event_type, event_reference_id, details, performed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          bookingProduct.booking_id,
          'product_cancelled',
          cancelResult.rows[0].id,
          { product_id: bookingProduct.product_id, penalty: cancellationPenalty },
          userId
        ]
      );
      
      await client.query('COMMIT');
      
      return {
        booking_product_id: bookingProductId,
        cancellation_penalty: cancellationPenalty,
        status: 'cancelled'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate if product can be picked up
   * Requirements: status = 'confirmed', security fully paid, not past booked_to date
   * @param {number} bookingProductId - Booking product ID
   * @returns {Promise<Object>} - {eligible: boolean, reason?: string, security_pending?: number}
   */
  async validatePickupEligibility(bookingProductId) {
    try {
      const client = await pool.connect();
      try {
        // Get booking product
        const bpResult = await client.query(
          'SELECT * FROM booking_products WHERE id = $1',
          [bookingProductId]
        );

        if (bpResult.rows.length === 0) {
          return { eligible: false, reason: 'Booking product not found' };
        }

        const bp = bpResult.rows[0];

        // Check status
        if (bp.status !== 'confirmed') {
          return { eligible: false, reason: `Product status is ${bp.status}, must be confirmed` };
        }

        // Check if past return date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const bookedTo = new Date(bp.booked_to);
        bookedTo.setHours(0, 0, 0, 0);

        if (today > bookedTo) {
          return { eligible: false, reason: 'Product booking period has expired' };
        }

        // Check security deposit paid
        const securityResult = await client.query(
          `SELECT due_amount, paid_amount FROM product_charges 
           WHERE booking_product_id = $1 AND charge_type = 'security'`,
          [bookingProductId]
        );

        if (securityResult.rows.length > 0) {
          const security = securityResult.rows[0];
          const securityPending = security.due_amount - security.paid_amount;

          if (securityPending > 0) {
            return {
              eligible: false,
              reason: 'Full security deposit must be paid before pickup',
              security_pending: securityPending
            };
          }
        }

        return { eligible: true };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error validating pickup eligibility:', error);
      throw error;
    }
  }

  /**
   * Mark products as picked up
   * @param {number} bookingId - The booking ID
   * @param {Array<number>} bookingProductIds - Array of booking product IDs
   * @param {number} userId - User performing the pickup
   * @returns {Promise<Object>} - Pickup details
   */
  async pickupProducts(bookingId, bookingProductIds, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update product statuses to in_progress
      for (const bpId of bookingProductIds) {
        const result = await client.query(
          'UPDATE booking_products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = $3 RETURNING id',
          ['in_progress', bpId, 'confirmed']
        );
        
        if (result.rows.length === 0) {
          throw new Error(`Booking product ${bpId} not found or not in confirmed status`);
        }
      }
      
      // Update booking status if applicable
      await client.query(
        `UPDATE bookings 
         SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status = 'confirmed'`,
        [bookingId]
      );
      
      // Log in booking activity
      await client.query(
        `INSERT INTO booking_activity_log 
          (booking_id, event_type, details, performed_by)
         VALUES ($1, $2, $3, $4)`,
        [
          bookingId,
          'products_picked_up',
          { booking_product_ids: bookingProductIds },
          userId
        ]
      );
      
      await client.query('COMMIT');
      
      return {
        booking_id: bookingId,
        picked_up_count: bookingProductIds.length,
        status: 'in_progress'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark products as returned and apply late fees if applicable
   * @param {number} bookingId - The booking ID
   * @param {Array<Object>} returns - Array of {bookingProductId, damageFee}
   * @param {number} userId - User performing the return
   * @returns {Promise<Object>} - Return details
   */
  async returnProducts(bookingId, returns, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let totalLateFees = 0;
      let totalDamageFees = 0;
      
      // Get late fee policy
      const lateFeePolicy = await policyService.getLateFee();
      
      for (const ret of returns) {
        const { bookingProductId, damageFee } = ret;
        
        // Get booking product details to check expected return date
        const bpResult = await client.query(
          'SELECT booked_to FROM booking_products WHERE id = $1 AND status = $2',
          [bookingProductId, 'in_progress']
        );
        
        if (bpResult.rows.length === 0) {
          throw new Error(`Booking product ${bookingProductId} not found or not in in_progress status`);
        }
        
        const { booked_to } = bpResult.rows[0];
        
        // Calculate late days: current date - expected return date
        const currentDate = new Date();
        const expectedReturnDate = new Date(booked_to);
        const lateDays = Math.max(0, Math.floor((currentDate - expectedReturnDate) / (1000 * 60 * 60 * 24)));
        
        // Update product status to completed
        await client.query(
          'UPDATE booking_products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['completed', bookingProductId]
        );
        
        // Apply late fee if applicable
        if (lateDays > 0) {
          const lateFeeAmount = lateFeePolicy.amount * lateDays;
          totalLateFees += lateFeeAmount;
          
          await chargeAccountingService.addCharge(
            bookingProductId,
            'late_fee',
            lateFeeAmount,
            lateFeePolicy.policy?.key || null,
            `Late return: ${lateDays} day(s)`,
            client
          );
        }
        
        // Apply damage fee if applicable
        if (damageFee > 0) {
          totalDamageFees += damageFee;
          
          await chargeAccountingService.addCharge(
            bookingProductId,
            'damage_fee',
            damageFee,
            null,
            'Product damage',
            client
          );
        }
      }
      
      // Log in booking activity
      await client.query(
        `INSERT INTO booking_activity_log 
          (booking_id, event_type, details, performed_by)
         VALUES ($1, $2, $3, $4)`,
        [
          bookingId,
          'products_returned',
          { 
            booking_product_ids: returns.map(r => r.bookingProductId),
            total_late_fees: totalLateFees,
            total_damage_fees: totalDamageFees
          },
          userId
        ]
      );
      
      await client.query('COMMIT');
      
      return {
        booking_id: bookingId,
        returned_count: returns.length,
        total_late_fees: totalLateFees,
        total_damage_fees: totalDamageFees
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get calculated cancellation penalty for a product
   * @param {number} bookingProductId
   * @returns {Promise<Object>} - Suggested penalty amount and policy details
   */
  async getCancellationPenaltySuggestion(bookingProductId) {
    const result = await pool.query(
      'SELECT effective_rent, created_at FROM booking_products WHERE id = $1',
      [bookingProductId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Booking product not found');
    }
    
    const { effective_rent, created_at } = result.rows[0];
    
    return await policyService.calculateCancellationPenalty(effective_rent, created_at);
  }

  /**
   * Get calculated exchange penalty for a product
   * @param {number} bookingProductId
   * @returns {Promise<Object>} - Suggested penalty amount and policy details
   */
  async getExchangePenaltySuggestion(bookingProductId) {
    const result = await pool.query(
      'SELECT effective_rent, created_at FROM booking_products WHERE id = $1',
      [bookingProductId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Booking product not found');
    }
    
    const { effective_rent, created_at } = result.rows[0];
    
    return await policyService.calculateExchangePenalty(effective_rent, created_at);
  }

  /**
   * Calculate security deposit refund/adjustment amounts (read-only, no transactions)
   * @param {number} bookingProductId - Booking product ID
   * @returns {Promise<Object>} - Calculated amounts {adjusted_amount, refund_amount, total_security, balance_due}
   */
  async calculateSecurityReturn(bookingProductId) {
    try {
      // Get booking product
      const bpResult = await pool.query(
        'SELECT booking_id, status FROM booking_products WHERE id = $1',
        [bookingProductId]
      );

      if (bpResult.rows.length === 0) {
        throw new Error('Booking product not found');
      }

      const { booking_id, status } = bpResult.rows[0];

      // Only allow security return after product is completed
      if (status !== 'completed') {
        throw new Error(`Cannot calculate security return for product with status: ${status}`);
      }

      // Get security charge
      const securityResult = await pool.query(
        `SELECT due_amount, paid_amount FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [bookingProductId]
      );

      if (securityResult.rows.length === 0) {
        throw new Error('No security charge found for this product');
      }

      const security = securityResult.rows[0];
      const securityPaid = security.paid_amount;

      if (securityPaid === 0) {
        return {
          booking_id,
          booking_product_id: bookingProductId,
          total_security: 0,
          adjusted_amount: 0,
          refund_amount: 0,
          balance_due: 0,
          message: 'No security was paid for this product'
        };
      }

      // Get booking balance
      const summaryResult = await chargeAccountingService.getPaymentSummary(booking_id);
      const balanceDue = summaryResult.totals.balance;

      // Calculate amounts: if balance exists, adjust first then refund remainder
      const adjustedAmount = Math.min(securityPaid, Math.max(0, balanceDue));
      const refundAmount = securityPaid - adjustedAmount;

      return {
        booking_id,
        booking_product_id: bookingProductId,
        total_security: securityPaid,
        adjusted_amount: adjustedAmount,
        refund_amount: refundAmount,
        balance_due: balanceDue
      };
    } catch (error) {
      console.error('Error calculating security return:', error);
      throw error;
    }
  }

  /**
   * Validate if a product is eligible for exchange
   * @param {number} bookingProductId - Booking product ID
   * @returns {Promise<Object>} - {eligible: boolean, reason: string, product: Object}
   */
  async validateExchangeEligibility(bookingProductId) {
    try {
      const result = await pool.query(
        `SELECT bp.*, p.name as product_name, p.code as product_code
         FROM booking_products bp
         JOIN products p ON bp.product_id = p.id
         WHERE bp.id = $1`,
        [bookingProductId]
      );

      if (result.rows.length === 0) {
        return { eligible: false, reason: 'Booking product not found', product: null };
      }

      const product = result.rows[0];

      // Cannot exchange products that are already exchanged, cancelled, completed, or in_progress
      if (['in_progress', 'exchanged', 'cancelled', 'completed'].includes(product.status)) {
        return {
          eligible: false,
          reason: `Cannot exchange product with status: ${product.status}. Only confirmed products can be exchanged.`,
          product
        };
      }

      return {
        eligible: true,
        reason: 'Product is eligible for exchange',
        product
      };
    } catch (error) {
      console.error('Error validating exchange eligibility:', error);
      throw error;
    }
  }

  /**
   * Validate if a product is eligible for cancellation
   * @param {number} bookingProductId - Booking product ID
   * @returns {Promise<Object>} - {eligible: boolean, reason: string, max_penalty: number, policy: Object, product: Object}
   */
  async validateCancellationEligibility(bookingProductId) {
    try {
      const result = await pool.query(
        `SELECT bp.*, p.name as product_name, p.code as product_code
         FROM booking_products bp
         JOIN products p ON bp.product_id = p.id
         WHERE bp.id = $1`,
        [bookingProductId]
      );

      if (result.rows.length === 0) {
        return { eligible: false, reason: 'Booking product not found', product: null, max_penalty: 0, policy: null };
      }

      const product = result.rows[0];

      // Cannot cancel products that are already cancelled, exchanged, or completed
      if (['in_progress', 'cancelled', 'exchanged', 'completed'].includes(product.status)) {
        return {
          eligible: false,
          reason: `Cannot cancel product with status: ${product.status}`,
          product,
          max_penalty: 0,
          policy: null
        };
      }

      // Get cancellation penalty policy using EFFECTIVE rent
      const penaltyResult = await policyService.calculateCancellationPenalty(
        product.effective_rent,
        product.created_at
      );

      return {
        eligible: true,
        reason: 'Product is eligible for cancellation',
        product,
        max_penalty: penaltyResult.amount,
        policy: penaltyResult.policy
      };
    } catch (error) {
      console.error('Error validating cancellation eligibility:', error);
      throw error;
    }
  }

  /**
   * Update booking date range based on active products
   * Calculates min(booked_from) and max(booked_to) from non-cancelled/exchanged products
   * @param {number} bookingId - Booking ID
   * @param {Object} client - Optional database client for transactions
   */
  async updateBookingDateRange(bookingId, client = null) {
    const db = client || pool;

    try {
      // Calculate date range from active products
      const result = await db.query(
        `SELECT MIN(booked_from) as min_from, MAX(booked_to) as max_to
         FROM booking_products
         WHERE booking_id = $1 AND status NOT IN ('cancelled', 'exchanged')`,
        [bookingId]
      );

      const { min_from, max_to } = result.rows[0];

      // Only update if there are active products
      if (min_from && max_to) {
        await db.query(
          `UPDATE bookings 
           SET booked_from = $1, booked_to = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [min_from, max_to, bookingId]
        );
      }
    } catch (error) {
      console.error('Error updating booking date range:', error);
      throw error;
    }
  }

  /**
   * Calculate complete exchange preview with all financial calculations
   * @param {number} oldBookingProductId - Original booking product ID
   * @param {number} newProductId - New product ID to exchange to
   * @param {Array<number>} additionalProductIds - Additional product IDs (optional)
   * @returns {Promise<Object>} - Complete preview with all calculations
   */
  async calculateExchangePreview(oldBookingProductId, newProductId, additionalProductIds = []) {
    try {
      // Get original booking product details
      const bpResult = await pool.query(
        `SELECT bp.*, b.id as booking_id, b.booked_from as booking_from, b.booked_to as booking_to, p.name as product_name
         FROM booking_products bp
         JOIN bookings b ON bp.booking_id = b.id
         JOIN products p ON bp.product_id = p.id
         WHERE bp.id = $1`,
        [oldBookingProductId]
      );

      if (bpResult.rows.length === 0) {
        throw new Error('Booking product not found');
      }

      const oldProduct = bpResult.rows[0];
      const originalRent = parseFloat(oldProduct.rent) || 0;
      const effectiveRent = parseFloat(oldProduct.effective_rent) || 0;  // Use effective rent for calculations
      const originalSecurity = parseFloat(oldProduct.security_deposit) || 0;

      // Get new product details
      const newProductResult = await pool.query(
        'SELECT id, name, rent, security_deposit FROM products WHERE id = $1',
        [newProductId]
      );

      if (newProductResult.rows.length === 0) {
        throw new Error('New product not found');
      }

      const newProduct = newProductResult.rows[0];
      const newRent = parseFloat(newProduct.rent) || 0;
      const newSecurity = parseFloat(newProduct.security_deposit) || 0;

      // Get additional products if any
      let additionalRent = 0;
      let additionalSecurity = 0;
      const additionalProducts = [];

      if (additionalProductIds.length > 0) {
        const addResult = await pool.query(
          'SELECT id, name, rent, security_deposit FROM products WHERE id = ANY($1::int[])',
          [additionalProductIds]
        );

        for (const product of addResult.rows) {
          additionalRent += parseFloat(product.rent) || 0;
          additionalSecurity += parseFloat(product.security_deposit) || 0;
          additionalProducts.push({
            id: product.id,
            name: product.name,
            rent: parseFloat(product.rent) || 0,
            security_deposit: parseFloat(product.security_deposit) || 0
          });
        }
      }

      // Get exchange penalty from policy using EFFECTIVE rent
      const penaltyData = await policyService.calculateExchangePenalty(effectiveRent, oldProduct.created_at);
      const exchangePenalty = penaltyData.amount || 0;

      // Calculate totals
      const totalNewRent = newRent + additionalRent;
      const totalNewSecurity = newSecurity + additionalSecurity;

      // Use shared calculation logic - NO DUPLICATION!
      const { downgradePenalty } = this._calculateExchangePenalties(effectiveRent, exchangePenalty, totalNewRent);

      // Total payment due = exchange_penalty + downgrade_penalty + new_total_rent - effective_rent
      const totalPaymentDue = exchangePenalty + downgradePenalty + totalNewRent - effectiveRent;

      // Calculate security difference
      const securityDifference = totalNewSecurity - originalSecurity;

      return {
        old_product: {
          id: oldProduct.id,
          product_id: oldProduct.product_id,
          name: oldProduct.product_name,
          rent: originalRent,
          effective_rent: effectiveRent,
          discount_amount: parseFloat(oldProduct.discount_amount) || 0,
          discount_type: oldProduct.discount_type || null,
          security_deposit: originalSecurity
        },
        new_product: {
          id: newProduct.id,
          name: newProduct.name,
          rent: newRent,
          security_deposit: newSecurity
        },
        additional_products: additionalProducts,
        calculations: {
          original_rent: originalRent,
          effective_rent: effectiveRent,
          original_security: originalSecurity,
          new_rent: newRent,
          additional_rent: additionalRent,
          total_new_rent: totalNewRent,
          new_security: newSecurity,
          additional_security: additionalSecurity,
          total_new_security: totalNewSecurity,
          exchange_penalty: exchangePenalty,
          penalty_percentage: penaltyData.policy?.value || 0,
          downgrade_penalty: downgradePenalty, // Rent difference when downgrading
          total_payment_due: totalPaymentDue,
          security_difference: securityDifference
        },
        penalty_policy: penaltyData.policy
      };
    } catch (error) {
      console.error('Error calculating exchange preview:', error);
      throw error;
    }
  }
}

module.exports = new ProductLifecycleService();
