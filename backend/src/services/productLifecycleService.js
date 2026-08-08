const pool = require('../database/connection');
const policyService = require('./policyService');
const chargeAccountingService = require('./chargeAccountingService');
const bookingService = require('./bookingService');
const { recalcBookingDateRange, checkProductAvailability } = require('../utils/bookingDateUtils');

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
   * Helper: Check how much security deposit has been paid for a booking product
   * @private
   * @param {number} bookingProductId
   * @param {Object} [dbClient] - Optional DB client (for use inside transactions). Falls back to pool.
   * @returns {Promise<number>} - Amount of security paid (0 if none)
   */
  async _getSecurityPaidAmount(bookingProductId, dbClient) {
    const db = dbClient || pool;
    const result = await db.query(
      `SELECT COALESCE(paid_amount, 0) as paid FROM product_charges
       WHERE booking_product_id = $1 AND charge_type = 'security'`,
      [bookingProductId]
    );
    return parseInt(result.rows[0]?.paid) || 0;
  }

  /**
   * Exchange a product in a booking (ONE-TO-MANY: one old product for multiple new products)
   * @param {number} bookingProductId - The booking product to exchange
   * @param {Array<Object>} newProducts - Array of {productId, rent, securityDeposit}
   * @param {string} reason - Reason for exchange
   * @param {number} userId - User performing the exchange
   * @param {Object} payment - Optional payment to record atomically {amount, method, recorded_by, notes}
   * @returns {Promise<Object>} - Exchange details
   */
  async exchangeProduct(bookingProductId, newProducts, reason, userId, payment = {}) {
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

      // Guard: every replacement product must have explicit date range provided
      for (const newProd of newProducts) {
        if (!newProd.bookedFrom || !newProd.bookedTo) {
          throw new Error(
            `Product ${newProd.productId} is missing booked_from or booked_to. ` +
            'Dates must be explicitly provided for all replacement products and cannot default to booking dates.'
          );
        }
      }

      // Guard: new products must not already be active in this booking
      const activeRows = await client.query(
        `SELECT DISTINCT product_id, size FROM booking_products
         WHERE booking_id = $1
           AND status NOT IN ('cancelled', 'exchanged', 'completed')`,
        [oldBookingProduct.booking_id]
      );
      const activeKeys = new Set(activeRows.rows.map(r => `${r.product_id}:${r.size || ''}`));
      const conflicting = newProducts
        .filter(p => activeKeys.has(`${p.productId}:${p.size || ''}`))
        .map(p => `${p.productId}${p.size ? ` (${p.size})` : ''}`);
      if (conflicting.length > 0) {
        throw new Error(`Cannot exchange to a product already active in this booking (${conflicting.join(', ')})`);
      }

      // Check if any security has been paid — blocks exchange
      const securityPaid = await this._getSecurityPaidAmount(bookingProductId, client);
      if (securityPaid > 0) {
        throw new Error('Cannot exchange product: security deposit has been partially or fully paid. Amount paid: ₹' + securityPaid);
      }

      // Calculate exchange penalty based on EFFECTIVE rent (after discount)
      const penaltyResult = await policyService.calculateExchangePenalty(
        oldBookingProduct.effective_rent,  // Use effective_rent instead of rent
        oldBookingProduct.created_at
      );

      // Add exchange penalty charge to old product (product still 'confirmed' — charge routing works)
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
        // Guard: reject if the replacement product is archived
        const newProdInfo = await client.query(
          'SELECT name, code, status, available_sizes FROM products WHERE id = $1',
          [newProd.productId]
        );
        if (!newProdInfo.rows[0]) {
          throw new Error(`Product ${newProd.productId} not found`);
        }
        if (newProdInfo.rows[0].status !== 'available') {
          throw new Error(`Product "${newProdInfo.rows[0].name}" (${newProdInfo.rows[0].code}) is archived and cannot be added to a booking`);
        }

        // Guard: validate size against available_sizes
        const availableSizes = newProdInfo.rows[0].available_sizes;
        if (availableSizes && availableSizes.length > 0) {
          if (!newProd.size || !availableSizes.includes(newProd.size)) {
            throw new Error(`Invalid size "${newProd.size}" for product "${newProdInfo.rows[0].name}". Available: ${availableSizes.join(', ')}`);
          }
        }

        // Guard: reject if the replacement product is already booked on these dates (for this size)
        await checkProductAvailability(
          newProd.productId, newProd.bookedFrom, newProd.bookedTo, { client, size: newProd.size || null }
        );

        const newBpResult = await client.query(
          `INSERT INTO booking_products 
            (booking_id, product_id, quantity, booked_from, booked_to, status, rent, security_deposit, effective_rent, size)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
            newProd.rent,
            newProd.size || null
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

      // STEP 3: Mark old product as exchanged FIRST — waterfall now excludes it
      await client.query(
        'UPDATE booking_products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['exchanged', bookingProductId]
      );

      // STEP 4: Settle exchange finances — zeros old product's rent, combines old rent credit
      // + payment into one pool, pays penalties first, drains remainder into new product(s)'
      // rent only. Records a single payment_transaction only when paymentAmount > 0.
      const paymentAmount = payment.amount || 0;
      await chargeAccountingService.settleExchange(
        oldBookingProduct.booking_id,
        bookingProductId,
        newBookingProductIds,
        paymentAmount,
        payment.method || 'Cash',
        payment.recorded_by || userId,
        payment.notes || 'Exchange payment',
        client
      );

      const paymentResult = paymentAmount > 0 ? {
        amount: paymentAmount,
        method: payment.method || 'Cash',
        transaction_recorded: true
      } : null;

      // Revoke the exchanged product's global discount share
      if (oldBookingProduct.global_discount_share > 0) {
        await chargeAccountingService.revokeGlobalDiscountForExchange(
          oldBookingProduct.booking_id,
          oldBookingProduct.global_discount_share,
          client
        );
      }

      // STEP 6: Derive booking-level status from product statuses
      await bookingService.updateBookingStatus(oldBookingProduct.booking_id);

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

      // STEP 7: Recalculate booking date range — old product is now 'exchanged' (excluded),
      // new products carry the real dates, so the booking window reflects them.
      await recalcBookingDateRange(oldBookingProduct.booking_id, client);

      await client.query('COMMIT');

      return {
        old_booking_product_id: bookingProductId,
        new_booking_product_ids: newBookingProductIds,
        exchange_penalty: penaltyResult.amount,
        downgrade_penalty: downgradePenalty,
        total_penalty: penaltyResult.amount + downgradePenalty,
        payment: paymentResult
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
  async cancelProduct(bookingProductId, cancellationPenalty, reason, userId, settlement = {}) {
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

      // Check if any security has been paid — blocks cancel
      const securityPaidAmount = await this._getSecurityPaidAmount(bookingProductId, client);
      if (securityPaidAmount > 0) {
        throw new Error('Cannot cancel product: security deposit has been partially or fully paid. Amount paid: ₹' + securityPaidAmount);
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

      // Add cancellation penalty charge FIRST (product still 'confirmed' — payment routing works)
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

      // Revoke global discount (sets final_discount to 0, adjusts remaining products)
      const { discountReverted } = await chargeAccountingService.revokeGlobalDiscountForCancellation(
        bookingProduct.booking_id, client, bookingProductId
      );

      // diffAmount: positive = refund to customer, negative = collect from customer
      // discount_reverted is deducted from the refund
      const totalPaidForProduct = rentPaid + securityPaid;
      const diffAmount = totalPaidForProduct - cancellationPenalty - discountReverted;

      // Block cancellation if refund is negative — penalty + discount exceeds what was paid
      if (diffAmount < 0) {
        throw new Error(
          `Cannot cancel: refund would be negative (₹${diffAmount}). ` +
          `Paid: ₹${totalPaidForProduct}, Penalty: ₹${cancellationPenalty}, ` +
          `Discount reverted: ₹${discountReverted}`
        );
      }

      // MONEY FIRST — process settlement before status change, in same transaction
      const { action: settlementAction = 'none', method: settlementMethod = 'Cash', notes: settlementNotes, security_product_ids: settlementSecProductIds = [] } = settlement;
      let settlementResult = null;
      const settlementAmount = Math.abs(diffAmount);
      if (settlementAction !== 'none' && settlementAmount > 0) {
        settlementResult = await this.processCancellationSettlement(
          bookingProduct.booking_id, settlementAmount, settlementAction,
          settlementMethod, userId, settlementNotes, client,
          [bookingProductId], settlementSecProductIds
        );
      }

      // Mark penalty as paid if covered (by existing per-product payments or by settlement)
      if (cancellationPenalty > 0 && (diffAmount >= 0 || settlementResult)) {
        await client.query(
          `UPDATE product_charges SET paid_amount = due_amount, updated_at = CURRENT_TIMESTAMP
           WHERE booking_product_id = $1 AND charge_type = 'cancellation_penalty'`,
          [bookingProductId]
        );
      }

      // STATUS CHANGE LAST — mark product as cancelled
      await client.query(
        'UPDATE booking_products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['cancelled', bookingProductId]
      );

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
          {
            product_id: bookingProduct.product_id,
            penalty: cancellationPenalty,
            discount_reverted: discountReverted,
            diff_amount: diffAmount
          },
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
        discount_reverted: discountReverted,
        rent_paid: rentPaid,
        security_paid: securityPaid,
        diff_amount: diffAmount,
        settlement: settlementResult,
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
   * @param {number} amount - Amount to settle (from cancelProduct result)
   * @param {'refund' | 'adjust' | 'collect' | 'none'} action - Settlement action
   * @param {string} paymentMethod - Payment method for refund/collect (e.g. 'Cash', 'UPI')
   * @param {string} recordedBy - User performing the settlement
   * @param {string} notes - Optional notes
   * @param {Object} [existingClient] - Optional DB client to share transaction
   * @returns {Promise<Object>} - Settlement details
   */
  async processCancellationSettlement(bookingId, amount, action, paymentMethod, recordedBy, notes, existingClient, excludeProductIds = [], securityProductIds = []) {
    if (!['refund', 'adjust', 'adjust_security', 'collect', 'none'].includes(action)) {
      throw new Error('settlement_action must be "refund", "adjust", "adjust_security", "collect", or "none"');
    }

    if (action === 'none' || amount <= 0) {
      return {
        booking_id: bookingId,
        settlement_action: 'none',
        amount: 0,
        transaction_recorded: false
      };
    }

    const ownClient = !existingClient;
    const client = existingClient || await pool.connect();
    try {
      if (ownClient) await client.query('BEGIN');

      if (action === 'refund') {
        // Record a refund transaction — money goes back to customer
        await client.query(
          `INSERT INTO payment_transactions 
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'refund', $3, $4, $5, CURRENT_TIMESTAMP)`,
          [bookingId, amount, paymentMethod || 'Cash',
            notes || 'Cancellation refund', recordedBy]
        );

        await client.query(
          `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
           VALUES ($1, 'refund_issued', $2, $3)`,
          [bookingId, JSON.stringify({
            amount: amount,
            method: paymentMethod || 'Cash',
            reason: 'Cancellation refund',
            notes
          }), recordedBy]
        );
      } else if (action === 'adjust') {
        // Get current outstanding NON-SECURITY balance on other active products.
        // Security is excluded — security credits require explicit user confirmation
        // via the 'adjust_security' action.
        const balanceResult = await client.query(
          `SELECT 
             (COALESCE(SUM(pc.due_amount), 0) - COALESCE(SUM(pc.paid_amount), 0))::INTEGER as remaining_balance
           FROM product_charges pc
           JOIN booking_products bp ON pc.booking_product_id = bp.id
           WHERE bp.booking_id = $1
             AND bp.status != 'cancelled'
             AND NOT (bp.id = ANY($2::int[]))
             AND pc.charge_type NOT IN ('security')`,
          [bookingId, excludeProductIds]
        );
        // Also include unpaid transport (booking-level field, not in product_charges)
        const transportResult = await client.query(
          `SELECT GREATEST(0, COALESCE(transport_charge,0) - COALESCE(transport_paid,0))::INTEGER AS transport_remaining
           FROM bookings WHERE id = $1`,
          [bookingId]
        );
        const transportRemaining = transportResult.rows[0]?.transport_remaining || 0;
        const remainingDues = Math.max(0, (balanceResult.rows[0].remaining_balance || 0) + transportRemaining);

        // Cap adjustment at outstanding dues — remainder becomes an immediate refund
        const adjustAmount = Math.min(amount, remainingDues);
        const refundRemainder = amount - adjustAmount;

        // Apply adjustment against dues
        if (adjustAmount > 0) {
          await chargeAccountingService._applyPaymentInternal(bookingId, adjustAmount, client, null, excludeProductIds);

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
            [bookingId, refundRemainder, paymentMethod || 'Cash',
              `Cancellation refund remainder after adjusting ₹${adjustAmount} against dues`,
              recordedBy]
          );

          await client.query(
            `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
             VALUES ($1, 'refund_issued', $2, $3)`,
            [bookingId, JSON.stringify({
              amount: refundRemainder,
              method: paymentMethod || 'Cash',
              reason: 'Cancellation refund remainder after dues adjustment',
              notes
            }), recordedBy]
          );
        }
      } else if (action === 'adjust_security') {
        // Credit the cancellation refund toward pending security of specific other products.
        // Step 1 (mandatory): auto-adjust non-security dues first, same as 'adjust' action.
        // Step 2: credit the remainder to selected security products.
        if (!securityProductIds || securityProductIds.length === 0) {
          throw new Error('security_product_ids is required for adjust_security settlement');
        }

        // ── Step 1: auto-adjust non-security dues ──────────────────────────────
        const nonSecDuesResult = await client.query(
          `SELECT COALESCE(SUM(pc.due_amount - pc.paid_amount), 0)::INTEGER AS remaining
           FROM product_charges pc
           JOIN booking_products bp ON pc.booking_product_id = bp.id
           WHERE bp.booking_id = $1
             AND bp.status NOT IN ('cancelled', 'exchanged')
             AND NOT (bp.id = ANY($2::int[]))
             AND pc.charge_type NOT IN ('security')`,
          [bookingId, excludeProductIds]
        );
        // Also include unpaid transport (booking-level field, not in product_charges)
        const nonSecTransportResult = await client.query(
          `SELECT GREATEST(0, COALESCE(transport_charge,0) - COALESCE(transport_paid,0))::INTEGER AS transport_remaining
           FROM bookings WHERE id = $1`,
          [bookingId]
        );
        const nonSecTransportRemaining = nonSecTransportResult.rows[0]?.transport_remaining || 0;
        const nonSecDues = Math.max(0, (nonSecDuesResult.rows[0].remaining || 0) + nonSecTransportRemaining);
        const autoAdjust = Math.min(amount, nonSecDues);

        if (autoAdjust > 0) {
          await chargeAccountingService._applyPaymentInternal(bookingId, autoAdjust, client, null, excludeProductIds);
          await client.query(
            `INSERT INTO payment_transactions
             (booking_id, amount, type, method, notes, recorded_by, transaction_date)
             VALUES ($1, $2, 'adjustment', 'N/A', $3, $4, CURRENT_TIMESTAMP)`,
            [bookingId, autoAdjust,
              `Cancellation refund of ₹${autoAdjust} auto-adjusted against outstanding dues`,
              recordedBy]
          );
          await client.query(
            `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
             VALUES ($1, 'adjustment_applied', $2, $3)`,
            [bookingId, JSON.stringify({ amount: autoAdjust, reason: 'auto-adjust non-security dues', notes }), recordedBy]
          );
        }

        // ── Step 2: credit remainder to selected security products ─────────────
        const afterAutoAdjust = amount - autoAdjust;

        if (afterAutoAdjust > 0) {
          const secCapResult = await client.query(
            `SELECT COALESCE(SUM(pc.due_amount - pc.paid_amount), 0)::INTEGER AS capacity
             FROM product_charges pc
             JOIN booking_products bp ON pc.booking_product_id = bp.id
             WHERE bp.id = ANY($1::int[])
               AND pc.charge_type = 'security'`,
            [securityProductIds]
          );
          const secCapacity = Math.max(0, secCapResult.rows[0].capacity || 0);
          const adjustAmount = Math.min(afterAutoAdjust, secCapacity);
          const refundRemainder = afterAutoAdjust - adjustAmount;

          if (adjustAmount > 0) {
            await chargeAccountingService._applyPaymentInternal(
              bookingId, adjustAmount, client, securityProductIds, excludeProductIds
            );
            await client.query(
              `INSERT INTO payment_transactions
               (booking_id, amount, type, method, notes, recorded_by, transaction_date)
               VALUES ($1, $2, 'adjustment', 'N/A', $3, $4, CURRENT_TIMESTAMP)`,
              [bookingId, adjustAmount,
                notes || `Cancellation refund of ₹${adjustAmount} credited to security of other product(s)`,
                recordedBy]
            );
            await client.query(
              `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
               VALUES ($1, 'adjustment_applied', $2, $3)`,
              [bookingId, JSON.stringify({ amount: adjustAmount, security_product_ids: securityProductIds, notes }), recordedBy]
            );
          }

          if (refundRemainder > 0) {
            await client.query(
              `INSERT INTO payment_transactions
               (booking_id, amount, type, method, notes, recorded_by, transaction_date)
               VALUES ($1, $2, 'refund', $3, $4, $5, CURRENT_TIMESTAMP)`,
              [bookingId, refundRemainder, paymentMethod || 'Cash',
                `Cancellation refund remainder (₹${refundRemainder}) after crediting security`,
                recordedBy]
            );
          }
        }
      } else if (action === 'collect') {
        // Collect penalty from customer — record incoming payment
        await client.query(
          `INSERT INTO payment_transactions 
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'payment', $3, $4, $5, CURRENT_TIMESTAMP)`,
          [bookingId, amount, paymentMethod || 'Cash',
            notes || 'Cancellation penalty collection', recordedBy]
        );

        await client.query(
          `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
           VALUES ($1, 'payment_applied', $2, $3)`,
          [bookingId, JSON.stringify({
            amount: amount,
            method: paymentMethod || 'Cash',
            reason: 'Cancellation penalty collection',
            notes
          }), recordedBy]
        );
      }

      if (ownClient) await client.query('COMMIT');

      return {
        booking_id: bookingId,
        settlement_action: action,
        amount: amount,
        method: (action === 'refund' || action === 'collect') ? (paymentMethod || 'Cash') : 'Adjustment',
        transaction_recorded: true
      };
    } catch (error) {
      if (ownClient) await client.query('ROLLBACK');
      console.error('Error processing cancellation settlement:', error);
      throw error;
    } finally {
      if (ownClient) client.release();
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

      // Insert picked_by_customer tracking row for each picked-up product
      for (const bpId of bookingProductIds) {
        const bpRow = await client.query(
          `SELECT bp.product_id, p.code
           FROM booking_products bp
           JOIN products p ON p.id = bp.product_id
           WHERE bp.id = $1`,
          [bpId]
        );
        if (bpRow.rows[0]) {
          await client.query(
            `INSERT INTO product_tracking
               (product_id, booking_id, product_code, tracking_status, notes)
             VALUES ($1, $2, $3, 'picked_by_customer', $4)`,
            [
              bpRow.rows[0].product_id,
              bookingId,
              bpRow.rows[0].code,
              `Picked up by customer for booking #${bookingId}`
            ]
          );
        }
      }

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
   * Mark products as returned (in_progress → completed).
   *
   * Late fees and damage fees are NOT created here — they are handled during
   * security deposit settlement (processSecurityReturn) so that the admin can
   * review/adjust amounts in the refund dialog before they become charges.
   *
   * @param {number} bookingId - The booking ID
   * @param {Array<Object>} returns - Array of {bookingProductId}
   * @param {number} userId - User performing the return
   * @returns {Promise<Object>} - Return details
   */
  async returnProducts(bookingId, returns, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const ret of returns) {
        const { bookingProductId } = ret;

        // Validate product is in_progress
        const bpResult = await client.query(
          'SELECT booked_to FROM booking_products WHERE id = $1 AND status = $2',
          [bookingProductId, 'in_progress']
        );

        if (bpResult.rows.length === 0) {
          throw new Error(`Booking product ${bookingProductId} not found or not in in_progress status`);
        }

        // Mark product as completed
        await client.query(
          'UPDATE booking_products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['completed', bookingProductId]
        );

        // Insert in_house tracking row — product is back in store
        const prodRow = await client.query(
          `SELECT bp.product_id, p.code
           FROM booking_products bp
           JOIN products p ON p.id = bp.product_id
           WHERE bp.id = $1`,
          [bookingProductId]
        );
        if (prodRow.rows[0]) {
          await client.query(
            `INSERT INTO product_tracking
               (product_id, booking_id, product_code, tracking_status, notes)
             VALUES ($1, $2, $3, 'in_house', $4)`,
            [
              prodRow.rows[0].product_id,
              bookingId,
              prodRow.rows[0].code,
              `Returned by customer, booking #${bookingId} product completed`
            ]
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
   * Calculate security deposit settlement amounts (read-only, no transactions).
   *
   * Auto-calculates the suggested late fee based on the product's return date
   * and the active late fee policy. The frontend pre-populates this value and
   * the admin can adjust it before confirming.
   *
   * No status gate — calculate is called before the user confirms, so the product
   * may still be 'in_progress'. The actual status enforcement is in processSecurityReturn.
   *
   * @param {number} bookingProductId - Booking product ID
   * @param {number} [lateFee=0]    - Late fee the user intends to retain
   * @param {number} [damageFee=0]  - Damage fee the user intends to retain
   * @returns {Promise<Object>} {
   *   total_security, late_fee, damage_fee, total_deduction, net_security,
   *   non_security_pending, auto_adjust_amount, remainder_amount,
   *   suggested_late_fee, late_fee_days, late_fee_per_day,
   *   eligible_security_products
   * }
   */
  async calculateSecurityReturn(bookingProductId, lateFee = null, damageFee = 0) {
    const bpResult = await pool.query(
      'SELECT booking_id, status, booked_to FROM booking_products WHERE id = $1',
      [bookingProductId]
    );
    if (bpResult.rows.length === 0) throw new Error('Booking product not found');
    const { booking_id, booked_to } = bpResult.rows[0];

    // ── Auto-calculate suggested late fee ──────────────────────────────────────
    let suggestedLateFee = 0;
    let lateFeeDays = 0;
    let lateFeePerDay = 0;

    if (booked_to) {
      const currentDate = new Date();
      const expectedReturnDate = new Date(booked_to);
      lateFeeDays = Math.max(0, Math.floor((currentDate - expectedReturnDate) / (1000 * 60 * 60 * 24)));

      if (lateFeeDays > 0) {
        const lateFeePolicy = await policyService.getLateFee();
        lateFeePerDay = lateFeePolicy.amount;
        suggestedLateFee = lateFeePerDay * lateFeeDays;
      }
    }

    // When lateFee is null (first call, no explicit value), auto-apply suggested.
    // When lateFee is 0 (admin explicitly set to zero), respect that.
    const effectiveLateFee = (lateFee === null) ? suggestedLateFee : lateFee;

    // Authoritative security paid (from product_charges, not booking_products face value)
    const secResult = await pool.query(
      `SELECT paid_amount FROM product_charges
       WHERE booking_product_id = $1 AND charge_type = 'security'`,
      [bookingProductId]
    );
    if (secResult.rows.length === 0) throw new Error('No security charge found for this product');
    const totalSecurity = secResult.rows[0].paid_amount;

    const totalDeduction = Math.max(0, Math.min(effectiveLateFee + damageFee, totalSecurity));
    const netSecurity = totalSecurity - totalDeduction;

    // Non-security pending on OTHER active products (rent, transport, penalties, fees)
    const nonSecResult = await pool.query(
      `SELECT COALESCE(SUM(pc.due_amount - pc.paid_amount), 0)::INTEGER AS pending
       FROM product_charges pc
       JOIN booking_products bp ON pc.booking_product_id = bp.id
       WHERE bp.booking_id = $1
         AND bp.status NOT IN ('exchanged', 'cancelled', 'completed')
         AND bp.id != $2
         AND pc.charge_type != 'security'`,
      [booking_id, bookingProductId]
    );
    const nonSecurityPending = Math.max(0, nonSecResult.rows[0].pending);

    // auto_adjust: applied automatically against non-security dues (no user choice needed)
    const autoAdjust = Math.min(netSecurity, nonSecurityPending);
    // remainder: user decides — refund cash or credit to other products' security
    const remainder = netSecurity - autoAdjust;

    // Products with outstanding security the user can credit toward
    const eligibleResult = await pool.query(
      `SELECT bp.id                                           AS "bpId",
              p.name                                         AS name,
              p.code                                         AS code,
              pc.due_amount                                  AS due,
              pc.paid_amount                                 AS paid,
              (pc.due_amount - pc.paid_amount)::INTEGER      AS remaining,
              bp.booked_from                                 AS "bookedFrom"
       FROM product_charges pc
       JOIN booking_products bp ON pc.booking_product_id = bp.id
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1
         AND bp.status NOT IN ('exchanged', 'cancelled', 'completed')
         AND bp.id != $2
         AND pc.charge_type = 'security'
         AND (pc.due_amount - pc.paid_amount) > 0
       ORDER BY bp.booked_from ASC, bp.id ASC`,
      [booking_id, bookingProductId]
    );

    return {
      booking_id,
      booking_product_id: bookingProductId,
      total_security: totalSecurity,
      late_fee: Math.max(0, Math.min(effectiveLateFee, totalSecurity)),
      damage_fee: Math.max(0, Math.min(damageFee, totalSecurity - Math.max(0, Math.min(effectiveLateFee, totalSecurity)))),
      total_deduction: totalDeduction,
      net_security: netSecurity,
      non_security_pending: nonSecurityPending,
      auto_adjust_amount: autoAdjust,
      remainder_amount: remainder,
      suggested_late_fee: suggestedLateFee,
      late_fee_days: lateFeeDays,
      late_fee_per_day: lateFeePerDay,
      eligible_security_products: eligibleResult.rows
    };
  }

  /**
   * Process security deposit return — explicit amounts, full validation, atomic execution.
   *
   * The frontend calls calculateSecurityReturn to get the computed split, then
   * sends the user's explicit choices here. This function validates everything
   * server-side and raises descriptive errors on any issue.
   *
   * @param {number} bookingProductId - Booking product ID (must be 'completed')
   * @param {Object} opts
   * @param {number}   opts.late_fee              - ≥ 0: late fee retained from security
   * @param {number}   opts.damage_fee            - ≥ 0: damage fee retained from security
   * @param {number}   opts.adjust_non_security   - ≥ 0: applied against rent/transport/fees on other products
   * @param {number}   opts.adjust_security_amount - ≥ 0: applied against pending security on other products
   * @param {number[]} opts.security_product_ids   - required (non-empty) if adjust_security_amount > 0
   * @param {number}   opts.refund_amount          - ≥ 0: cash refunded to customer
   * @param {string}   opts.payment_method         - 'Cash'|'UPI'|etc.
   * @param {string}   opts.recorded_by
   * @returns {Promise<Object>}
   */
  async processSecurityReturn(bookingProductId, {
    late_fee = 0,
    damage_fee = 0,
    adjust_non_security = 0,
    adjust_security_amount = 0,
    security_product_ids = [],
    refund_amount = 0,
    payment_method = 'Cash',
    recorded_by,
    notes = ''
  } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── 1. Fetch product and security charge ────────────────────────────────
      const bpResult = await client.query(
        'SELECT booking_id, status FROM booking_products WHERE id = $1',
        [bookingProductId]
      );
      if (bpResult.rows.length === 0) throw new Error('Booking product not found');

      const { booking_id, status } = bpResult.rows[0];
      if (status !== 'completed') {
        throw new Error(`Security return requires product status 'completed', got '${status}'`);
      }

      const secResult = await client.query(
        `SELECT paid_amount FROM product_charges
         WHERE booking_product_id = $1 AND charge_type = 'security'`,
        [bookingProductId]
      );
      if (secResult.rows.length === 0) throw new Error('No security charge found for this product');

      const totalSecurity = secResult.rows[0].paid_amount;

      // ── 2. Validate amounts ─────────────────────────────────────────────────
      const totalDeduction = late_fee + damage_fee;
      const amounts = [late_fee, damage_fee, adjust_non_security, adjust_security_amount, refund_amount];
      if (amounts.some(a => typeof a !== 'number' || a < 0)) {
        throw new Error('All amounts must be non-negative numbers');
      }
      const submittedTotal = amounts.reduce((s, a) => s + a, 0);
      if (submittedTotal !== totalSecurity) {
        throw new Error(
          `Amounts do not sum to security paid: ` +
          `late_fee(${late_fee}) + damage_fee(${damage_fee}) + adjust_non_security(${adjust_non_security}) + ` +
          `adjust_security(${adjust_security_amount}) + refund(${refund_amount}) = ${submittedTotal}, ` +
          `expected ${totalSecurity}`
        );
      }
      if (adjust_security_amount > 0 && (!security_product_ids || security_product_ids.length === 0)) {
        throw new Error('security_product_ids is required when adjust_security_amount > 0');
      }

      // ── 3. Late fee: create charge and mark paid ────────────────────────────
      if (late_fee > 0) {
        await chargeAccountingService.addCharge(
          bookingProductId,
          'late_fee',
          late_fee,
          null,
          `Late fee retained from security`,
          client
        );
        await client.query(
          `UPDATE product_charges
           SET paid_amount = due_amount, updated_at = CURRENT_TIMESTAMP
           WHERE booking_product_id = $1 AND charge_type = 'late_fee'`,
          [bookingProductId]
        );
        await client.query(
          `INSERT INTO payment_transactions
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'adjustment', 'N/A', $3, $4, CURRENT_TIMESTAMP)`,
          [
            booking_id,
            late_fee,
            `Late fee of ₹${late_fee} retained from security deposit (product #${bookingProductId})`,
            recorded_by
          ]
        );
      }

      // ── 4. Damage fee: create charge and mark paid ──────────────────────────
      if (damage_fee > 0) {
        await chargeAccountingService.addCharge(
          bookingProductId,
          'damage_fee',
          damage_fee,
          null,
          `Damage fee retained from security`,
          client
        );
        await client.query(
          `UPDATE product_charges
           SET paid_amount = due_amount, updated_at = CURRENT_TIMESTAMP
           WHERE booking_product_id = $1 AND charge_type = 'damage_fee'`,
          [bookingProductId]
        );
        await client.query(
          `INSERT INTO payment_transactions
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'adjustment', 'N/A', $3, $4, CURRENT_TIMESTAMP)`,
          [
            booking_id,
            damage_fee,
            `Damage fee of ₹${damage_fee} retained from security deposit (product #${bookingProductId})`,
            recorded_by
          ]
        );
      }

      // ── 5. Auto-adjust against non-security dues on other products ──────────
      if (adjust_non_security > 0) {
        await chargeAccountingService._applyPaymentInternal(
          booking_id,
          adjust_non_security,
          client,
          null,                  // no security_product_ids filter
          [bookingProductId]     // exclude the product being returned
        );
        await client.query(
          `INSERT INTO payment_transactions
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'adjustment', 'N/A', $3, $4, CURRENT_TIMESTAMP)`,
          [
            booking_id,
            adjust_non_security,
            `₹${adjust_non_security} from security deposit auto-adjusted against outstanding dues (product #${bookingProductId})`,
            recorded_by
          ]
        );
      }

      // ── 6. Adjust against security on specific other products ───────────────
      if (adjust_security_amount > 0) {
        await chargeAccountingService._applyPaymentInternal(
          booking_id,
          adjust_security_amount,
          client,
          security_product_ids,
          [bookingProductId]
        );
        await client.query(
          `INSERT INTO payment_transactions
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'adjustment', 'N/A', $3, $4, CURRENT_TIMESTAMP)`,
          [
            booking_id,
            adjust_security_amount,
            `₹${adjust_security_amount} from security deposit credited to security of product(s) [${security_product_ids.join(', ')}] (returned product #${bookingProductId})`,
            recorded_by
          ]
        );
      }

      // ── 7. Cash refund to customer ──────────────────────────────────────────
      if (refund_amount > 0) {
        const deductionNotes = [];
        if (late_fee > 0) deductionNotes.push(`late fee: ₹${late_fee}`);
        if (damage_fee > 0) deductionNotes.push(`damage fee: ₹${damage_fee}`);
        const deductionSuffix = deductionNotes.length > 0 ? ` (${deductionNotes.join(', ')} retained)` : '';

        await client.query(
          `INSERT INTO payment_transactions
           (booking_id, amount, type, method, notes, recorded_by, transaction_date)
           VALUES ($1, $2, 'refund', $3, $4, $5, CURRENT_TIMESTAMP)`,
          [
            booking_id,
            refund_amount,
            payment_method,
            `Security deposit refund for product #${bookingProductId}${deductionSuffix}` +
            (notes ? ` | ${notes}` : ''),
            recorded_by
          ]
        );
      }

      // ── 8. Activity log ─────────────────────────────────────────────────────
      await client.query(
        `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
         VALUES ($1, 'security_return_processed', $2, $3)`,
        [
          booking_id,
          JSON.stringify({
            booking_product_id: bookingProductId,
            total_security: totalSecurity,
            late_fee,
            damage_fee,
            adjust_non_security,
            adjust_security_amount,
            security_product_ids,
            refund_amount,
            payment_method
          }),
          recorded_by
        ]
      );

      await client.query('COMMIT');

      return {
        booking_id,
        booking_product_id: bookingProductId,
        total_security: totalSecurity,
        late_fee,
        damage_fee,
        adjust_non_security,
        adjust_security_amount,
        refund_amount,
        transaction_recorded: true
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing security return:', error);
      throw error;
    } finally {
      client.release();
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

      // Check if any security has been paid — blocks exchange
      const securityPaid = await this._getSecurityPaidAmount(bookingProductId);
      if (securityPaid > 0) {
        return {
          eligible: false,
          reason: `Cannot exchange: security deposit already paid (₹${securityPaid})`,
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

      // Check if any security has been paid — blocks cancellation
      const securityPaid = await this._getSecurityPaidAmount(bookingProductId);
      if (securityPaid > 0) {
        return {
          eligible: false,
          reason: 'Cannot cancel: security deposit already paid (₹' + securityPaid + ')',
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
        'SELECT id, booking_date, created_at, final_discount FROM bookings WHERE id = $1',
        [bookingId]
      );
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }
      const booking = bookingResult.rows[0];
      const discountReverted = booking.final_discount || 0;

      // 2. Get all booking products with product details AND per-product paid amounts
      const bpResult = await pool.query(
        `SELECT bp.id, bp.product_id, bp.rent, bp.effective_rent, bp.security_deposit, bp.status, bp.created_at,
                bp.global_discount_share,
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
          effective_rent: effectiveRent,
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
      const totalCancelledRent = allProducts.reduce((sum, p) => sum + p.effective_rent, 0);
      const totalCancelledSecurity = allProducts.reduce((sum, p) => sum + p.security_deposit, 0);
      const totalRentPaid = allProducts.reduce((sum, p) => sum + p.rent_paid, 0);
      const totalSecurityPaid = allProducts.reduce((sum, p) => sum + p.security_paid, 0);
      const totalPenaltyAmount = productsToCancel.reduce((sum, p) => sum + p.penalty_amount, 0);
      const totalRefundBeforeDiscount = productsToCancel.reduce((sum, p) => sum + p.refund_amount, 0);
      // Deduct global discount reverted from total refund
      const totalRefundAmount = Math.max(0, totalRefundBeforeDiscount - discountReverted);
      const refundBlocked = (totalRefundBeforeDiscount - discountReverted) < 0;

      // Days from booking
      const bookingDate = new Date(booking.booking_date || booking.created_at);
      const daysFromBooking = Math.floor((Date.now() - bookingDate.getTime()) / (1000 * 60 * 60 * 24));

      // Common penalty percentage (from first product, for display)
      const penaltyPercentage = productsToCancel.length > 0 ? productsToCancel[0].penalty_percentage : 0;

      // Payment action based on total refund
      let paymentAction = 'none';
      let paymentDifference = 0;
      if (refundBlocked) {
        paymentAction = 'blocked';
        paymentDifference = Math.abs(totalRefundBeforeDiscount - discountReverted);
      } else if (totalRefundAmount > 0) {
        paymentAction = 'refund';
        paymentDifference = totalRefundAmount;
      } else if (totalPenaltyAmount + discountReverted > (totalRentPaid + totalSecurityPaid)) {
        // Penalty + discount exceeds what was paid — need to collect
        paymentAction = 'collect';
        paymentDifference = totalPenaltyAmount + discountReverted - (totalRentPaid + totalSecurityPaid);
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
        discount_reverted: discountReverted,
        total_refund_amount: totalRefundAmount,
        refund_blocked: refundBlocked,
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
        totalSelectedRent += product.effective_rent || product.rent || 0;
        totalSelectedSecurity += product.security_deposit || 0;
        totalSelectedRentPaid += product.rent_paid || 0;
        totalSelectedSecurityPaid += product.security_paid || 0;

        // Use override if provided, otherwise use backend-calculated penalty
        const penalty = penaltyOverrides[product.product_id] !== undefined
          ? (penaltyOverrides[product.product_id] || 0)
          : product.penalty_amount || 0;
        totalPenalty += penalty;
      }

      const totalPaidForSelected = totalSelectedRentPaid + totalSelectedSecurityPaid;

      // Only the global_discount_share of products that will REMAIN active is actually reverted
      // (matches what revokeGlobalDiscountForCancellation does after Step 8 fix).
      const discountReverted = await chargeAccountingService.getActiveGlobalDiscountShare(
        bookingId, selectedProductIds
      );
      const refundBeforeDiscount = Math.floor(totalPaidForSelected - totalPenalty + extraRefund);
      const refundAmount = Math.max(0, refundBeforeDiscount - discountReverted);
      const refundBlocked = (refundBeforeDiscount - discountReverted) < 0;

      // Payment action
      let paymentAction = 'none';
      let paymentDifference = 0;
      if (refundBlocked) {
        paymentAction = 'blocked';
        paymentDifference = Math.abs(refundBeforeDiscount - discountReverted);
      } else if (refundAmount > 0) {
        paymentAction = 'refund';
        paymentDifference = refundAmount;
      } else if (totalPenalty + discountReverted > totalPaidForSelected) {
        paymentAction = 'collect';
        paymentDifference = Math.ceil(totalPenalty + discountReverted - totalPaidForSelected);
      }

      // Dues on products that will remain active after this cancellation (non-security only).
      // Security is tracked separately via eligible_security_products and requires
      // explicit user confirmation to adjust.
      const otherDuesResult = await pool.query(
        `SELECT COALESCE(SUM(pc.due_amount - pc.paid_amount), 0)::INTEGER as remaining_dues
         FROM product_charges pc
         JOIN booking_products bp ON pc.booking_product_id = bp.id
         WHERE bp.booking_id = $1
           AND bp.status NOT IN ('cancelled', 'exchanged')
           AND NOT (bp.id = ANY($2::int[]))
           AND pc.charge_type NOT IN ('security')`,
        [bookingId, selectedProductIds]
      );
      // Also include unpaid transport (booking-level field, not in product_charges)
      const transportDuesResult = await pool.query(
        `SELECT GREATEST(0, COALESCE(transport_charge,0) - COALESCE(transport_paid,0))::INTEGER AS transport_remaining
         FROM bookings WHERE id = $1`,
        [bookingId]
      );
      const transportDuesRemaining = transportDuesResult.rows[0]?.transport_remaining || 0;
      const remainingDuesOnOtherProducts = Math.max(
        0, (otherDuesResult.rows[0].remaining_dues || 0) + transportDuesRemaining
      );

      // Products with outstanding security the refund could be credited toward
      const eligibleSecResult = await pool.query(
        `SELECT bp.id                                           AS "bpId",
                p.name                                         AS name,
                p.code                                         AS code,
                pc.due_amount                                  AS due,
                pc.paid_amount                                 AS paid,
                (pc.due_amount - pc.paid_amount)::INTEGER      AS remaining,
                bp.booked_from                                 AS "bookedFrom"
         FROM product_charges pc
         JOIN booking_products bp ON pc.booking_product_id = bp.id
         JOIN products p ON bp.product_id = p.id
         WHERE bp.booking_id = $1
           AND bp.status NOT IN ('exchanged', 'cancelled', 'completed')
           AND NOT (bp.id = ANY($2::int[]))
           AND pc.charge_type = 'security'
           AND (pc.due_amount - pc.paid_amount) > 0
         ORDER BY bp.booked_from ASC, bp.id ASC`,
        [bookingId, selectedProductIds]
      );

      return {
        selected_count: selectedProducts.length,
        total_count: preview.all_products.length,
        selected_rent: totalSelectedRent,
        selected_security: totalSelectedSecurity,
        selected_rent_paid: totalSelectedRentPaid,
        selected_security_paid: totalSelectedSecurityPaid,
        total_penalty: totalPenalty,
        discount_reverted: discountReverted,
        extra_refund: extraRefund,
        refund_amount: refundAmount,
        refund_blocked: refundBlocked,
        payment_action: paymentAction,
        payment_difference: paymentDifference,
        remaining_dues_on_other_products: remainingDuesOnOtherProducts,
        eligible_security_products: eligibleSecResult.rows,
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
    await recalcBookingDateRange(bookingId, client);
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
      const originalRent = oldProduct.rent || 0;
      const effectiveRent = oldProduct.effective_rent || 0;  // Use effective rent for calculations
      const originalSecurity = oldProduct.security_deposit || 0;

      // Get old product's actual rent paid (credit is based on what was PAID, not what was due)
      const oldRentPaidResult = await pool.query(
        `SELECT COALESCE(paid_amount, 0) as paid FROM product_charges 
         WHERE booking_product_id = $1 AND charge_type = 'rent'`,
        [oldBookingProductId]
      );
      const oldRentPaid = parseInt(oldRentPaidResult.rows[0]?.paid) || 0;

      // Get new product details
      const newProductResult = await pool.query(
        'SELECT id, name, rent, security_deposit FROM products WHERE id = $1',
        [newProductId]
      );

      if (newProductResult.rows.length === 0) {
        throw new Error('New product not found');
      }

      const newProduct = newProductResult.rows[0];
      const newRent = newProduct.rent || 0;
      const newSecurity = newProduct.security_deposit || 0;

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
          additionalRent += product.rent || 0;
          additionalSecurity += product.security_deposit || 0;
          additionalProducts.push({
            id: product.id,
            name: product.name,
            rent: product.rent || 0,
            security_deposit: product.security_deposit || 0
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

      // Total payment due: customer gets credit only for rent actually PAID (not rent due)
      // Downgrade penalty uses rent DUE (product cost), but credit uses rent PAID
      const totalPaymentDue = Math.max(0, exchangePenalty + downgradePenalty + totalNewRent - oldRentPaid);

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
        currentTotalRent += bp.effective_rent || bp.rent || 0;
        currentTotalSecurity += bp.security_deposit || 0;
      }

      // After exchange: remove exchanged product, add new product(s)
      const afterExchangeRent = currentTotalRent - effectiveRent + totalNewRent;
      const afterExchangeSecurity = currentTotalSecurity - originalSecurity + totalNewSecurity;

      return {
        old_product: {
          id: oldProduct.id,
          product_id: oldProduct.product_id,
          name: oldProduct.product_name,
          rent: originalRent,
          effective_rent: effectiveRent,
          discount_amount: oldProduct.discount_amount || 0,
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
          old_rent_paid: oldRentPaid,
          rent_credit: oldRentPaid,
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
