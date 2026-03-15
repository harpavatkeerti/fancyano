const pool = require('../database/connection');
const policyService = require('./policyService');
const chargeAccountingService = require('./chargeAccountingService');
const bookingService = require('./bookingService');

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
            newProd.bookedFrom,
            newProd.bookedTo,
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

      // Get existing booking product with its charges
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

      // Get per-product paid amounts from product_charges (rent + security paid for THIS product)
      const chargesResult = await client.query(
        `SELECT charge_type, due_amount, paid_amount
         FROM product_charges
         WHERE booking_product_id = $1 AND charge_type IN ('rent', 'security')`,
        [bookingProductId]
      );

      let rentPaid = 0;
      let securityPaid = 0;
      for (const charge of chargesResult.rows) {
        if (charge.charge_type === 'rent') rentPaid = parseInt(charge.paid_amount) || 0;
        if (charge.charge_type === 'security') securityPaid = parseInt(charge.paid_amount) || 0;
      }

      // Mark product as cancelled (keep due_amount INTACT per blueprint for audit trail)
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

      // Calculate refund: what was paid towards this product minus penalty
      const refundAmount = Math.max(0, rentPaid + securityPaid - cancellationPenalty);

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
          { product_id: bookingProduct.product_id, penalty: cancellationPenalty, refund_amount: refundAmount },
          userId
        ]
      );

      // Update booking date range (recalculate from remaining active products)
      await this.updateBookingDateRange(bookingProduct.booking_id, client);

      await client.query('COMMIT');

      // Update booking status (after commit, uses its own transaction)
      const bookingService = require('./bookingService');
      const statusResult = await bookingService.updateBookingStatus(bookingProduct.booking_id);

      return {
        booking_product_id: bookingProductId,
        booking_id: bookingProduct.booking_id,
        cancellation_penalty: cancellationPenalty,
        rent_paid: rentPaid,
        security_paid: securityPaid,
        refund_amount: refundAmount,
        requires_settlement: refundAmount > 0,
        has_active_products: !statusResult.all_terminal,
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
   * Process settlement after cancellation — refund or adjust the computed refund amount
   * @param {number} bookingId - The booking ID
   * @param {number} refundAmount - Amount to settle (from cancelProduct result)
   * @param {'refund' | 'adjust' | 'none'} action - Settlement action
   * @param {string} refundMethod - Payment method for refund (e.g. 'Cash', 'UPI')
   * @param {string} recordedBy - User performing the settlement
   * @param {string} notes - Optional notes
   * @returns {Promise<Object>} - Settlement details
   */
  async processCancellationSettlement(bookingId, refundAmount, action, refundMethod, recordedBy, notes) {
    if (!['refund', 'adjust', 'none'].includes(action)) {
      throw new Error('settlement_action must be "refund", "adjust", or "none"');
    }

    if (action === 'none' || refundAmount <= 0) {
      return {
        booking_id: bookingId,
        settlement_action: 'none',
        amount: 0,
        transaction_recorded: false
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (action === 'refund') {
        // Record a refund transaction — money goes back to customer
        await client.query(
          `INSERT INTO payment_transactions 
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'refund', $3, $4, $5, CURRENT_TIMESTAMP)`,
          [bookingId, refundAmount, refundMethod || 'Cash',
            notes || 'Cancellation refund', recordedBy]
        );

        await client.query(
          `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
           VALUES ($1, 'refund_issued', $2, $3)`,
          [bookingId, JSON.stringify({
            amount: refundAmount,
            method: refundMethod || 'Cash',
            reason: 'Cancellation refund',
            notes
          }), recordedBy]
        );
      } else if (action === 'adjust') {
        // Get current outstanding balance
        const balanceResult = await client.query(
          `SELECT 
             COALESCE(SUM(pc.due_amount), 0) - COALESCE(SUM(pc.paid_amount), 0) as remaining_balance
           FROM product_charges pc
           JOIN booking_products bp ON pc.booking_product_id = bp.id
           WHERE bp.booking_id = $1 AND bp.status != 'cancelled'`,
          [bookingId]
        );
        const remainingDues = Math.max(0, parseFloat(balanceResult.rows[0].remaining_balance));

        // Cap adjustment at outstanding dues — remainder becomes an immediate refund
        const adjustAmount = Math.min(refundAmount, remainingDues);
        const refundRemainder = refundAmount - adjustAmount;

        // Apply adjustment against dues
        if (adjustAmount > 0) {
          await chargeAccountingService._applyPaymentInternal(bookingId, adjustAmount, client);

          await client.query(
            `INSERT INTO payment_transactions 
             (booking_id, amount, type, method, notes, recorded_by, transaction_date)
             VALUES ($1, $2, 'adjustment', 'Adjustment', $3, $4, CURRENT_TIMESTAMP)`,
            [bookingId, adjustAmount,
              notes || 'Cancellation refund adjusted against outstanding dues',
              recordedBy]
          );

          await client.query(
            `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
             VALUES ($1, 'adjustment_applied', $2, $3)`,
            [bookingId, JSON.stringify({
              amount: adjustAmount,
              reason: 'Cancellation refund adjusted against dues',
              notes
            }), recordedBy]
          );
        }

        // Refund any remainder that exceeds outstanding dues
        if (refundRemainder > 0) {
          await client.query(
            `INSERT INTO payment_transactions 
             (booking_id, amount, type, method, notes, recorded_by, transaction_date)
             VALUES ($1, $2, 'refund', $3, $4, $5, CURRENT_TIMESTAMP)`,
            [bookingId, refundRemainder, refundMethod || 'Cash',
              `Cancellation refund remainder after adjusting ₹${adjustAmount} against dues`,
              recordedBy]
          );

          await client.query(
            `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
             VALUES ($1, 'refund_issued', $2, $3)`,
            [bookingId, JSON.stringify({
              amount: refundRemainder,
              method: refundMethod || 'Cash',
              reason: 'Cancellation refund remainder after dues adjustment',
              notes
            }), recordedBy]
          );
        }
      }

      await client.query('COMMIT');

      return {
        booking_id: bookingId,
        settlement_action: action,
        amount: refundAmount,
        method: action === 'refund' ? (refundMethod || 'Cash') : 'Adjustment',
        transaction_recorded: true
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing cancellation settlement:', error);
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

      // Update booking status based on new product states (after commit, uses its own transaction)
      const statusResult = await bookingService.updateBookingStatus(bookingId);

      return {
        booking_id: bookingId,
        returned_count: returns.length,
        total_late_fees: totalLateFees,
        total_damage_fees: totalDamageFees,
        booking_status: statusResult.status
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
   * Process security deposit return (execute refund or adjustment transaction)
   * @param {number} bookingProductId - Booking product ID
   * @param {'refund' | 'adjust'} action - 'refund' returns cash, 'adjust' applies against dues
   * @param {string} recordedBy - User performing the action
   * @returns {Promise<Object>} - Transaction details
   */
  async processSecurityReturn(bookingProductId, action, recordedBy) {
    if (!['refund', 'adjust'].includes(action)) {
      throw new Error('action must be "refund" or "adjust"');
    }

    // First calculate what should happen
    const calculation = await this.calculateSecurityReturn(bookingProductId);

    if (calculation.total_security === 0) {
      return {
        ...calculation,
        action,
        transaction_recorded: false,
        message: 'No security was paid for this product — nothing to process'
      };
    }

    const { booking_id, total_security, adjusted_amount, refund_amount } = calculation;

    if (action === 'adjust') {
      // Apply the full security amount against outstanding dues via chargeAccountingService
      if (total_security > 0) {
        const adjustResult = await chargeAccountingService.applyAdjustment(
          booking_id,
          total_security,
          'Adjustment',
          recordedBy,
          `Security deposit adjustment for booking product #${bookingProductId}`
        );

        return {
          booking_id,
          booking_product_id: bookingProductId,
          action: 'adjust',
          total_security,
          adjusted_amount: total_security,
          refund_amount: 0,
          transaction_recorded: true,
          adjustment_details: adjustResult
        };
      }
    }

    if (action === 'refund') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Refund the full security amount back to customer
        await client.query(
          `INSERT INTO payment_transactions 
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'refund', 'Cash', $3, $4, CURRENT_TIMESTAMP)`,
          [booking_id, total_security,
            `Security deposit refund for product #${bookingProductId}`,
            recordedBy]
        );

        // Log refund activity
        await client.query(
          `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
           VALUES ($1, 'refund_issued', $2, $3)`,
          [booking_id, JSON.stringify({
            amount: total_security,
            reason: 'Security deposit refund',
            booking_product_id: bookingProductId
          }), recordedBy]
        );

        await client.query('COMMIT');

        return {
          booking_id,
          booking_product_id: bookingProductId,
          action: 'refund',
          total_security,
          adjusted_amount: 0,
          refund_amount: total_security,
          transaction_recorded: true
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
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
   * Calculate complete cancellation preview for a booking
   * Uses existing validateCancellationEligibility + chargeAccountingService.getPaymentSummary
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Object>} - Full preview with all products, penalties, and financial summary
   */
  async calculateCancellationPreview(bookingId) {
    try {
      // 1. Get booking info
      const bookingResult = await pool.query(
        'SELECT id, booking_date, created_at FROM bookings WHERE id = $1',
        [bookingId]
      );
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }
      const booking = bookingResult.rows[0];

      // 2. Get all booking products with product details AND per-product paid amounts
      const bpResult = await pool.query(
        `SELECT bp.id, bp.product_id, bp.rent, bp.effective_rent, bp.security_deposit, bp.status, bp.created_at,
                p.name, p.code,
                COALESCE((SELECT paid_amount FROM product_charges WHERE booking_product_id = bp.id AND charge_type = 'rent'), 0) as rent_paid,
                COALESCE((SELECT paid_amount FROM product_charges WHERE booking_product_id = bp.id AND charge_type = 'security'), 0) as security_paid
         FROM booking_products bp
         JOIN products p ON bp.product_id = p.id
         WHERE bp.booking_id = $1
         ORDER BY bp.id`,
        [bookingId]
      );

      // 3. Filter to cancellable products (not already cancelled/exchanged/completed/in_progress)
      const cancellableProducts = bpResult.rows.filter(p =>
        !['cancelled', 'exchanged', 'completed', 'in_progress'].includes(p.status)
      );

      // 4. Build all_products and products_to_cancel with penalty + per-product paid info
      const allProducts = [];
      const productsToCancel = [];

      for (const bp of cancellableProducts) {
        const rent = parseInt(bp.rent) || 0;
        const securityDeposit = parseInt(bp.security_deposit) || 0;
        const effectiveRent = parseInt(bp.effective_rent) || rent;
        const rentPaid = parseInt(bp.rent_paid) || 0;
        const securityPaid = parseInt(bp.security_paid) || 0;

        // Get penalty using existing policyService
        const penaltyResult = await policyService.calculateCancellationPenalty(
          effectiveRent,
          bp.created_at
        );

        const penaltyAmount = penaltyResult.amount || 0;
        // Per-product refund = what was paid for this product - penalty
        const productRefund = Math.max(0, rentPaid + securityPaid - penaltyAmount);

        const productData = {
          product_id: bp.id, // booking_product ID (used by frontend for selection)
          code: bp.code,
          name: bp.name,
          rent: rent,
          security_deposit: securityDeposit,
          rent_paid: rentPaid,
          security_paid: securityPaid
        };

        allProducts.push(productData);

        productsToCancel.push({
          ...productData,
          penalty_percentage: penaltyResult.policy?.value || 0,
          penalty_amount: penaltyAmount,
          refund_amount: productRefund
        });
      }

      // 5. Calculate totals
      const totalCancelledRent = allProducts.reduce((sum, p) => sum + p.rent, 0);
      const totalCancelledSecurity = allProducts.reduce((sum, p) => sum + p.security_deposit, 0);
      const totalRentPaid = allProducts.reduce((sum, p) => sum + p.rent_paid, 0);
      const totalSecurityPaid = allProducts.reduce((sum, p) => sum + p.security_paid, 0);
      const totalPenaltyAmount = productsToCancel.reduce((sum, p) => sum + p.penalty_amount, 0);
      const totalRefundAmount = productsToCancel.reduce((sum, p) => sum + p.refund_amount, 0);

      // Days from booking
      const bookingDate = new Date(booking.booking_date || booking.created_at);
      const daysFromBooking = Math.floor((Date.now() - bookingDate.getTime()) / (1000 * 60 * 60 * 24));

      // Common penalty percentage (from first product, for display)
      const penaltyPercentage = productsToCancel.length > 0 ? productsToCancel[0].penalty_percentage : 0;

      // Payment action based on total refund
      let paymentAction = 'none';
      let paymentDifference = 0;
      if (totalRefundAmount > 0) {
        paymentAction = 'refund';
        paymentDifference = totalRefundAmount;
      } else if (totalPenaltyAmount > (totalRentPaid + totalSecurityPaid)) {
        // Penalty exceeds what was paid for these products — need to collect
        paymentAction = 'collect';
        paymentDifference = totalPenaltyAmount - (totalRentPaid + totalSecurityPaid);
      }

      return {
        booking_id: bookingId,
        booking_date: booking.booking_date || booking.created_at,
        days_from_booking: daysFromBooking,
        penalty_percentage: penaltyPercentage,
        policy: productsToCancel.length > 0 ? { value: penaltyPercentage } : null,
        all_products: allProducts,
        products_to_cancel: productsToCancel,
        // Per-product totals
        total_cancelled_rent: totalCancelledRent,
        total_cancelled_security: totalCancelledSecurity,
        total_rent_paid: totalRentPaid,
        total_security_paid: totalSecurityPaid,
        total_penalty_amount: totalPenaltyAmount,
        total_refund_amount: totalRefundAmount,
        // Payment action
        payment_action: paymentAction,
        payment_difference: paymentDifference,
        is_partial: false // Frontend determines based on user selection
      };
    } catch (error) {
      console.error('Error calculating cancellation preview:', error);
      throw error;
    }
  }

  /**
   * Calculate cancellation summary for a specific set of selected products.
   * Accepts user overrides for penalties and extra refund. Returns all computed values.
   * This is the single source of truth for the live preview — frontend should NOT compute anything.
   * @param {number} bookingId - Booking ID
   * @param {number[]} selectedProductIds - Array of booking_product IDs the user selected to cancel
   * @param {Object} penaltyOverrides - Map of { booking_product_id: penalty_amount } for user-edited penalties
   * @param {number} extraRefund - Extra refund amount (optional, default 0)
   * @returns {Promise<Object>} - Complete summary with all totals and refund amount
   */
  async calculateCancellationSummary(bookingId, selectedProductIds = [], penaltyOverrides = {}, extraRefund = 0) {
    try {
      // Get the full preview first (all products, per-product paid amounts, penalties)
      const preview = await this.calculateCancellationPreview(bookingId);

      // Filter to only selected products
      const selectedProducts = preview.all_products.filter(p =>
        selectedProductIds.includes(p.product_id)
      );
      const selectedPenaltyProducts = preview.products_to_cancel.filter(p =>
        selectedProductIds.includes(p.product_id)
      );

      // Calculate totals for selected products, applying penalty overrides
      let totalSelectedRent = 0;
      let totalSelectedSecurity = 0;
      let totalSelectedRentPaid = 0;
      let totalSelectedSecurityPaid = 0;
      let totalPenalty = 0;

      for (const product of selectedPenaltyProducts) {
        totalSelectedRent += product.rent || 0;
        totalSelectedSecurity += product.security_deposit || 0;
        totalSelectedRentPaid += product.rent_paid || 0;
        totalSelectedSecurityPaid += product.security_paid || 0;

        // Use override if provided, otherwise use backend-calculated penalty
        const penalty = penaltyOverrides[product.product_id] !== undefined
          ? parseFloat(penaltyOverrides[product.product_id]) || 0
          : product.penalty_amount || 0;
        totalPenalty += penalty;
      }

      const totalPaidForSelected = totalSelectedRentPaid + totalSelectedSecurityPaid;
      const refundAmount = Math.max(0, Math.floor(totalPaidForSelected - totalPenalty + extraRefund));

      // Payment action
      let paymentAction = 'none';
      let paymentDifference = 0;
      if (refundAmount > 0) {
        paymentAction = 'refund';
        paymentDifference = refundAmount;
      } else if (totalPenalty > totalPaidForSelected) {
        paymentAction = 'collect';
        paymentDifference = Math.ceil(totalPenalty - totalPaidForSelected);
      }

      return {
        selected_count: selectedProducts.length,
        total_count: preview.all_products.length,
        selected_rent: totalSelectedRent,
        selected_security: totalSelectedSecurity,
        selected_rent_paid: totalSelectedRentPaid,
        selected_security_paid: totalSelectedSecurityPaid,
        total_penalty: totalPenalty,
        extra_refund: extraRefund,
        refund_amount: refundAmount,
        payment_action: paymentAction,
        payment_difference: paymentDifference,
      };
    } catch (error) {
      console.error('Error calculating cancellation summary:', error);
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

      // Get all current active booking products for booking-wide totals
      const allBpResult = await pool.query(
        `SELECT bp.rent, bp.effective_rent, bp.security_deposit
         FROM booking_products bp
         WHERE bp.booking_id = $1
           AND bp.status NOT IN ('cancelled', 'exchanged')`,
        [oldProduct.booking_id]
      );

      let currentTotalRent = 0;
      let currentTotalSecurity = 0;
      for (const bp of allBpResult.rows) {
        currentTotalRent += parseFloat(bp.rent) || 0;
        currentTotalSecurity += parseFloat(bp.security_deposit) || 0;
      }

      // After exchange: remove exchanged product, add new product(s)
      const afterExchangeRent = currentTotalRent - originalRent + totalNewRent;
      const afterExchangeSecurity = currentTotalSecurity - originalSecurity + totalNewSecurity;

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
          security_difference: securityDifference,
          current_total_rent: currentTotalRent,
          current_total_security: currentTotalSecurity,
          after_exchange_rent: afterExchangeRent,
          after_exchange_security: afterExchangeSecurity
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
