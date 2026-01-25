const pool = require('../database/connection');
const policyService = require('./policyService');
const chargeAccountingService = require('./chargeAccountingService');

/**
 * ProductLifecycleService - Manages booking product lifecycle events
 * Handles exchange, cancellation, pickup, and return operations
 */
class ProductLifecycleService {
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
      
      // Calculate exchange penalty based on when product was added
      const penaltyResult = await policyService.calculateExchangePenalty(
        oldBookingProduct.rent,
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
      
      // Calculate downgrade penalty: max(0, old_rent - (exchange_penalty + new_total_rent))
      const downgradePenalty = Math.max(0, oldBookingProduct.rent - (penaltyResult.amount + newTotalRent));
      
      // Add downgrade penalty if applicable
      if (downgradePenalty > 0) {
        await chargeAccountingService.addCharge(
          bookingProductId,
          'downgrade_penalty',
          downgradePenalty,
          null,
          `Downgrade: old rent ₹${oldBookingProduct.rent} vs new total ₹${newTotalRent}`,
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
      'SELECT rent, created_at FROM booking_products WHERE id = $1',
      [bookingProductId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Booking product not found');
    }
    
    const { rent, created_at } = result.rows[0];
    
    return await policyService.calculateCancellationPenalty(rent, created_at);
  }

  /**
   * Get calculated exchange penalty for a product
   * @param {number} bookingProductId
   * @returns {Promise<Object>} - Suggested penalty amount and policy details
   */
  async getExchangePenaltySuggestion(bookingProductId) {
    const result = await pool.query(
      'SELECT rent, created_at FROM booking_products WHERE id = $1',
      [bookingProductId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Booking product not found');
    }
    
    const { rent, created_at } = result.rows[0];
    
    return await policyService.calculateExchangePenalty(rent, created_at);
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
}

module.exports = new ProductLifecycleService();
