const pool = require('../database/connection');

/**
 * ChargeAccountingService - Core financial calculation and payment application
 * Handles all charge tracking and payment priority logic
 */
class ChargeAccountingService {
  /**
   * Get complete payment summary for a booking
   * @param {number} bookingId
   * @returns {Promise<Object>} - Complete financial summary
   */
  async getPaymentSummary(bookingId) {
    const client = await pool.connect();
    try {
      // Get booking with transport charges
      const bookingResult = await client.query(
        'SELECT * FROM bookings WHERE id = $1',
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }

      const booking = bookingResult.rows[0];

      // Get all products with their charges
      const productsResult = await client.query(
        `SELECT 
          bp.*,
          p.name as product_name,
          p.code as product_code,
          COALESCE(
            json_agg(
              json_build_object(
                'charge_type', pc.charge_type,
                'due_amount', pc.due_amount,
                'paid_amount', pc.paid_amount,
                'notes', pc.notes,
                'policy_reference', pc.policy_reference
              ) ORDER BY 
                CASE pc.charge_type
                  WHEN 'rent' THEN 1
                  WHEN 'exchange_penalty' THEN 2
                  WHEN 'downgrade_penalty' THEN 3
                  WHEN 'cancellation_penalty' THEN 4
                  WHEN 'late_fee' THEN 5
                  WHEN 'damage_fee' THEN 6
                  WHEN 'security' THEN 7
                END
            ) FILTER (WHERE pc.id IS NOT NULL),
            '[]'
          ) as charges
        FROM booking_products bp
        LEFT JOIN products p ON bp.product_id = p.id
        LEFT JOIN product_charges pc ON bp.id = pc.booking_product_id
        WHERE bp.booking_id = $1
        GROUP BY bp.id, p.name, p.code
        ORDER BY bp.id`,
        [bookingId]
      );

      const products = productsResult.rows;

      // Calculate totals per category
      const summary = {
        booking_id: bookingId,
        products: products.map(p => ({
          booking_product_id: p.id,
          product_id: p.product_id,
          product_name: p.product_name,
          product_code: p.product_code,
          status: p.status,
          rent: p.rent,
          security_deposit: p.security_deposit,
          charges: p.charges
        })),
        charges: {
          rent: { due: 0, paid: 0 },
          transport: { due: booking.transport_charge || 0, paid: booking.transport_paid || 0 },
          penalties: { due: 0, paid: 0 },
          fees: { due: 0, paid: 0 },
          security: { due: 0, paid: 0 }
        },
        totals: {
          total_due: 0,
          total_paid: 0,
          balance: 0
        },
        final_discount: booking.final_discount || 0
      };

      // Per-charge-type breakdown for detailed display
      const chargeBreakdown = {};

      // Aggregate charges by category
      products.forEach(product => {
        const isActive = !['exchanged', 'cancelled'].includes(product.status);
        const includeSecurityDue = !['exchanged', 'cancelled', 'completed'].includes(product.status);

        product.charges.forEach(charge => {
          // Track individual charge type dues for breakdown display
          const chargeType = charge.charge_type;
          let dueToAdd = 0;

          if (chargeType === 'rent') {
            if (isActive) {
              summary.charges.rent.due += charge.due_amount;
              summary.charges.rent.paid += charge.paid_amount;
              dueToAdd = charge.due_amount;
            }
          } else if (['exchange_penalty', 'downgrade_penalty', 'cancellation_penalty'].includes(chargeType)) {
            summary.charges.penalties.due += charge.due_amount;
            summary.charges.penalties.paid += charge.paid_amount;
            dueToAdd = charge.due_amount;
          } else if (['late_fee', 'damage_fee'].includes(chargeType)) {
            summary.charges.fees.due += charge.due_amount;
            summary.charges.fees.paid += charge.paid_amount;
            dueToAdd = charge.due_amount;
          } else if (chargeType === 'security') {
            if (includeSecurityDue) {
              summary.charges.security.due += charge.due_amount;
              summary.charges.security.paid += charge.paid_amount;
              dueToAdd = charge.due_amount;
            }
          }

          // Add to per-type breakdown
          if (dueToAdd > 0) {
            chargeBreakdown[chargeType] = (chargeBreakdown[chargeType] || 0) + dueToAdd;
          }
        });
      });

      // Add transport to breakdown if non-zero
      if (summary.charges.transport.due > 0) {
        chargeBreakdown['transport'] = summary.charges.transport.due;
      }

      summary.charge_breakdown = chargeBreakdown;

      // Calculate totals
      // Note: final_discount is NOT subtracted here because it is already distributed
      // into product effective_rents and reflected in charge due_amounts.
      summary.totals.total_due =
        summary.charges.rent.due +
        summary.charges.transport.due +
        summary.charges.penalties.due +
        summary.charges.fees.due +
        summary.charges.security.due;

      summary.totals.total_paid =
        summary.charges.rent.paid +
        summary.charges.transport.paid +
        summary.charges.penalties.paid +
        summary.charges.fees.paid +
        summary.charges.security.paid;

      // Get actual total refunded from payment_transactions
      // This is the only source of truth for money returned to customer
      // (includes security refunds for completed products, cancellation refunds,
      // and correctly reflects any penalty/damage deductions)
      const refundResult = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::INTEGER as total_refunded
         FROM payment_transactions
         WHERE booking_id = $1 AND type = 'refund'`,
        [bookingId]
      );
      summary.totals.total_refunded = refundResult.rows[0].total_refunded || 0;

      // Balance = what's owed (after discount) minus what's been paid
      summary.totals.balance = summary.totals.total_due - summary.totals.total_paid;

      return summary;
    } finally {
      client.release();
    }
  }

  /**
   * Apply payment to a booking with complete transaction handling
   * @param {number} bookingId
   * @param {number} paymentAmount - Amount in integer (paise/cents)
   * @param {string} paymentMethod - Payment method (Cash, Card, etc.)
   * @param {string} recordedBy - User who recorded the payment
   * @param {string} notes - Optional notes
   * @returns {Promise<Object>} - Payment details with breakdown
   */
  async applyPayment(bookingId, paymentAmount, paymentMethod, recordedBy, notes, existingClient) {
    return await this._applyPaymentOrAdjustment(
      bookingId,
      paymentAmount,
      paymentMethod,
      recordedBy,
      notes,
      'payment',
      'payment_applied',
      existingClient
    );
  }

  /**
   * Internal helper: Apply payment to booking following priority order
   * Priority: Rent → Transport → Penalties → Fees → Security → Excess
   * @param {number} bookingId
   * @param {number} paymentAmount - Amount in integer (paise/cents)
   * @param {Object} client - Database client (transaction)
   * @returns {Promise<Object>} - Payment application breakdown
   */
  async _applyPaymentInternal(bookingId, paymentAmount, client) {
    const breakdown = {
      total_applied: paymentAmount,
      applications: []
    };

    let remaining = paymentAmount;

    // Priority 1: Rent
    remaining = await this._applyToRent(bookingId, remaining, breakdown, client);
    if (remaining <= 0) return breakdown;

    // Priority 2: Transport
    remaining = await this._applyToTransport(bookingId, remaining, breakdown, client);
    if (remaining <= 0) return breakdown;

    // Priority 3: Penalties (exchange, downgrade, cancellation)
    remaining = await this._applyToPenalties(bookingId, remaining, breakdown, client);
    if (remaining <= 0) return breakdown;

    // Priority 4: Fees (late, damage)
    remaining = await this._applyToFees(bookingId, remaining, breakdown, client);
    if (remaining <= 0) return breakdown;

    // Priority 5: Security
    remaining = await this._applyToSecurity(bookingId, remaining, breakdown, client);
    if (remaining <= 0) return breakdown;

    return breakdown;
  }

  /**
   * Apply payment to rent charges
   */
  async _applyToRent(bookingId, amount, breakdown, client) {
    const charges = await client.query(
      `SELECT pc.*, bp.id as booking_product_id
       FROM product_charges pc
       JOIN booking_products bp ON pc.booking_product_id = bp.id
       WHERE bp.booking_id = $1 
       AND bp.status NOT IN ('exchanged', 'cancelled')
       AND pc.charge_type = 'rent'
       AND pc.paid_amount < pc.due_amount
       ORDER BY bp.id`,
      [bookingId]
    );

    return await this._applyToCharges(charges.rows, amount, breakdown, client, 'rent');
  }

  /**
   * Apply payment to transport charge
   */
  async _applyToTransport(bookingId, amount, breakdown, client) {
    const booking = await client.query(
      'SELECT transport_charge, transport_paid FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (booking.rows.length === 0) return amount;

    const { transport_charge, transport_paid } = booking.rows[0];
    const charge = transport_charge || 0;
    const paid = transport_paid || 0;
    const due = charge - paid;

    if (due <= 0) return amount;

    const toApply = Math.min(amount, due);

    await client.query(
      'UPDATE bookings SET transport_paid = transport_paid + $1 WHERE id = $2',
      [toApply, bookingId]
    );

    breakdown.applications.push({
      category: 'transport',
      amount: toApply
    });

    return amount - toApply;
  }

  /**
   * Apply payment to penalty charges
   */
  async _applyToPenalties(bookingId, amount, breakdown, client) {
    const charges = await client.query(
      `SELECT pc.*, bp.id as booking_product_id
       FROM product_charges pc
       JOIN booking_products bp ON pc.booking_product_id = bp.id
       WHERE bp.booking_id = $1 
       AND pc.charge_type IN ('exchange_penalty', 'downgrade_penalty', 'cancellation_penalty')
       AND pc.paid_amount < pc.due_amount
       ORDER BY bp.id, CASE pc.charge_type
         WHEN 'exchange_penalty' THEN 1
         WHEN 'downgrade_penalty' THEN 2
         WHEN 'cancellation_penalty' THEN 3
       END`,
      [bookingId]
    );

    return await this._applyToCharges(charges.rows, amount, breakdown, client, 'penalties');
  }

  /**
   * Apply payment to fee charges
   */
  async _applyToFees(bookingId, amount, breakdown, client) {
    const charges = await client.query(
      `SELECT pc.*, bp.id as booking_product_id
       FROM product_charges pc
       JOIN booking_products bp ON pc.booking_product_id = bp.id
       WHERE bp.booking_id = $1 
       AND pc.charge_type IN ('late_fee', 'damage_fee')
       AND pc.paid_amount < pc.due_amount
       ORDER BY bp.id, pc.charge_type`,
      [bookingId]
    );

    return await this._applyToCharges(charges.rows, amount, breakdown, client, 'fees');
  }

  /**
   * Apply payment to security charges
   */
  async _applyToSecurity(bookingId, amount, breakdown, client) {
    const charges = await client.query(
      `SELECT pc.*, bp.id as booking_product_id
       FROM product_charges pc
       JOIN booking_products bp ON pc.booking_product_id = bp.id
       WHERE bp.booking_id = $1 
       AND bp.status NOT IN ('exchanged', 'cancelled')
       AND pc.charge_type = 'security'
       AND pc.paid_amount < pc.due_amount
       ORDER BY bp.id`,
      [bookingId]
    );

    return await this._applyToCharges(charges.rows, amount, breakdown, client, 'security');
  }

  /**
   * Helper to apply payment to a list of charges
   */
  async _applyToCharges(charges, amount, breakdown, client, category) {
    let remaining = amount;

    for (const charge of charges) {
      if (remaining <= 0) break;

      const due = charge.due_amount - charge.paid_amount;
      const toApply = Math.min(remaining, due);

      await client.query(
        'UPDATE product_charges SET paid_amount = paid_amount + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [toApply, charge.id]
      );

      breakdown.applications.push({
        category,
        charge_type: charge.charge_type,
        booking_product_id: charge.booking_product_id,
        amount: toApply
      });

      remaining -= toApply;
    }

    return remaining;
  }

  /**
   * Initialize charges for a booking product
   * @param {number} bookingProductId
   * @param {number} rent
   * @param {number} securityDeposit
   * @param {Object} client - Database client
   */
  async initializeProductCharges(bookingProductId, rent, securityDeposit, client) {
    await client.query(
      `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount)
       VALUES 
         ($1, 'rent', $2, 0),
         ($1, 'security', $3, 0)`,
      [bookingProductId, rent, securityDeposit]
    );
  }

  /**
   * Add a charge to a booking product
   * @param {number} bookingProductId
   * @param {string} chargeType
   * @param {number} amount
   * @param {string} policyReference
   * @param {string} notes
   * @param {Object} client
   */
  async addCharge(bookingProductId, chargeType, amount, policyReference, notes, client) {
    const result = await client.query(
      `INSERT INTO product_charges (booking_product_id, charge_type, due_amount, paid_amount, policy_reference, notes)
       VALUES ($1, $2, $3, 0, $4, $5)
       ON CONFLICT (booking_product_id, charge_type)
       DO UPDATE SET 
         due_amount = product_charges.due_amount + EXCLUDED.due_amount,
         policy_reference = EXCLUDED.policy_reference,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [bookingProductId, chargeType, amount, policyReference, notes]
    );

    return result.rows[0];
  }

  /**
   * Apply adjustment to charges (works like a payment, always reduces charges)
   * @param {number} bookingId
   * @param {number} adjustmentAmount - Total adjustment amount to apply
   * @param {string} paymentMethod - Payment method for the adjustment
   * @param {string} adjustedBy - Who applied the adjustment
   * @param {string} notes - Reason/notes for adjustment
   * @param {Object} [existingClient] - Optional DB client for running within an existing transaction
   * @returns {Promise<Object>}
   */
  async applyAdjustment(bookingId, adjustmentAmount, paymentMethod, adjustedBy, notes, existingClient) {
    return await this._applyPaymentOrAdjustment(
      bookingId,
      adjustmentAmount,
      paymentMethod,
      adjustedBy,
      notes,
      'adjustment',
      'adjustment_applied',
      existingClient
    );
  }

  /**
   * Internal method to apply payment or adjustment (shared logic)
   * @private
   */
  async _applyPaymentOrAdjustment(bookingId, amount, paymentMethod, recordedBy, notes, transactionType, eventType, existingClient) {
    const ownClient = !existingClient;
    const client = existingClient || await pool.connect();
    try {
      if (ownClient) await client.query('BEGIN');

      // Verify booking exists
      const bookingResult = await client.query(
        'SELECT id FROM bookings WHERE id = $1',
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }

      if (amount <= 0) {
        throw new Error(`${transactionType === 'payment' ? 'Payment' : 'Adjustment'} amount must be greater than 0`);
      }

      // For payments and adjustments, cap at the outstanding balance — excess must not be accepted
      if (transactionType === 'payment' || transactionType === 'adjustment') {
        // Get current balance to enforce hard cap
        const summaryResult = await client.query(
           `SELECT 
             COALESCE(SUM(pc.due_amount), 0)::INTEGER as total_charge_due,
             COALESCE(SUM(pc.paid_amount), 0)::INTEGER as total_charge_paid
            FROM product_charges pc
            JOIN booking_products bp ON pc.booking_product_id = bp.id
            WHERE bp.booking_id = $1 AND (
              bp.status NOT IN ('exchanged', 'cancelled')
              OR pc.charge_type IN ('exchange_penalty','downgrade_penalty','cancellation_penalty','late_fee','damage_fee')
            )`,
          [bookingId]
        );
        const booking = await client.query(
          'SELECT transport_charge, transport_paid, final_discount FROM bookings WHERE id = $1',
          [bookingId]
        );
        const b = booking.rows[0];
        const totalDue = (summaryResult.rows[0].total_charge_due || 0) +
          (b.transport_charge || 0);
        const totalPaid = (summaryResult.rows[0].total_charge_paid || 0) +
          (b.transport_paid || 0);
        const remainingBalance = totalDue - totalPaid;

        if (remainingBalance <= 0) {
          throw new Error('Payment rejected: all charges are already fully paid');
        }
        if (amount > remainingBalance) {
          throw new Error(`Payment amount (${amount}) exceeds outstanding balance (${remainingBalance}). Maximum allowed: ${remainingBalance}`);
        }
      }

      // Apply payment using internal helper
      const breakdown = await this._applyPaymentInternal(bookingId, amount, client);
      const totalApplied = amount;

      // Create payment transaction record
      const transactionNotes = transactionType === 'adjustment'
        ? `${notes || 'Charge adjustment'} | Applied: ${totalApplied}`
        : (notes || '');

      await client.query(
        `INSERT INTO payment_transactions 
         (booking_id, amount, type, method, notes, recorded_by, transaction_date)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [bookingId, amount, transactionType, paymentMethod, transactionNotes, recordedBy]
      );

      // Log in activity log
      const activityDetails = transactionType === 'adjustment'
        ? {
          amount,
          payment_method: paymentMethod,
          total_applied: totalApplied,
          notes,
          breakdown: breakdown.applications
        }
        : {
          amount,
          payment_method: paymentMethod,
          breakdown: breakdown.applications
        };

      await client.query(
        `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
         VALUES ($1, $2, $3, $4)`,
        [bookingId, eventType, JSON.stringify(activityDetails), recordedBy]
      );

      if (ownClient) await client.query('COMMIT');

      // Return unified response structure
      return {
        booking_id: bookingId,
        total_applied: totalApplied,
        residual_amount: 0,
        breakdown: breakdown.applications,
        recorded_by: recordedBy,
        recorded_at: new Date()
      };
    } catch (error) {
      if (ownClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownClient) client.release();
    }
  }

  /**
   * Record a refund transaction (money going OUT to customer)
   * Optionally records a deduction charge (e.g. damage_fee, late_fee) on the booking product.
   * @param {number} bookingId
   * @param {number} amount - Refund amount
   * @param {string} method - Payment method (Cash, UPI, etc.)
   * @param {string} recordedBy - User recording the refund
   * @param {string} notes - Optional notes
   * @param {Object} [deduction] - Optional deduction details
   * @param {number} deduction.bookingProductId - Booking product ID
   * @param {number} deduction.amount - Deduction amount
   * @param {string} deduction.type - Charge type (e.g. 'damage_fee', 'late_fee')
   * @returns {Promise<Object>} - Refund details
   */
  async recordRefund(bookingId, amount, method, recordedBy, notes, deduction) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify booking exists
      const bookingResult = await client.query('SELECT id FROM bookings WHERE id = $1', [bookingId]);
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }

      if (amount <= 0) {
        throw new Error('Refund amount must be greater than 0');
      }

      // If there's a deduction, create a charge for it
      // (tracks the deduction amount as a fee — not an extra payment,
      // it's funded by retaining part of the security deposit)
      if (deduction && deduction.amount > 0 && deduction.bookingProductId && deduction.type) {
        await this.addCharge(
          deduction.bookingProductId,
          deduction.type,
          deduction.amount,
          null,
          `Deduction: ${deduction.type}`,
          client
        );
      }

      // Record refund transaction (money going OUT to customer)
      await client.query(
        `INSERT INTO payment_transactions 
         (booking_id, amount, type, method, notes, recorded_by, transaction_date)
         VALUES ($1, $2, 'refund', $3, $4, $5, CURRENT_TIMESTAMP)`,
        [bookingId, amount, method, notes || '', recordedBy]
      );

      // Log activity
      await client.query(
        `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
         VALUES ($1, 'refund_issued', $2, $3)`,
        [bookingId, JSON.stringify({ amount, method, notes, deduction: deduction || null }), recordedBy]
      );

      await client.query('COMMIT');

      return {
        booking_id: bookingId,
        amount,
        method,
        recorded_by: recordedBy,
        deduction: deduction || null,
        recorded_at: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Distribute global discount proportionally across active products by rent.
   * Updates each product's global_discount_share, discount_amount, effective_rent,
   * and rent charge due_amount.
   * @param {number} bookingId
   * @param {number} discountAmount
   * @param {string} appliedBy
   * @param {string} notes
   * @param {Object} [existingClient]
   */
  async applyBookingDiscount(bookingId, discountAmount, appliedBy, notes, existingClient) {
    const ownClient = !existingClient;
    const client = existingClient || await pool.connect();
    try {
      if (ownClient) await client.query('BEGIN');

      // Get active products
      const products = await client.query(
        `SELECT id, rent, discount_amount, global_discount_share
         FROM booking_products
         WHERE booking_id = $1 AND status NOT IN ('exchanged', 'cancelled')
         ORDER BY rent DESC`,
        [bookingId]
      );

      if (products.rows.length === 0) {
        throw new Error('No active products to apply discount');
      }

      const allocations = this._distributeProportionally(products.rows, discountAmount);

      // Apply allocations
      for (const alloc of allocations) {
        const newDiscountAmount = (alloc.product.discount_amount || 0) + alloc.share;
        const newEffectiveRent = alloc.product.rent - newDiscountAmount;

        await client.query(
          `UPDATE booking_products
           SET global_discount_share = $1, discount_amount = $2, effective_rent = $3,
               discount_type = CASE WHEN $2 > 0 THEN 'fixed' ELSE NULL END
           WHERE id = $4`,
          [alloc.share, newDiscountAmount, newEffectiveRent, alloc.product.id]
        );

        // Update rent charge due_amount
        await client.query(
          `UPDATE product_charges SET due_amount = $1, updated_at = CURRENT_TIMESTAMP
           WHERE booking_product_id = $2 AND charge_type = 'rent'`,
          [newEffectiveRent, alloc.product.id]
        );
      }

      // Activity log
      await client.query(
        `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
         VALUES ($1, 'booking_discount_applied', $2, $3)`,
        [bookingId, JSON.stringify({
          discount_amount: discountAmount,
          notes,
          allocations: allocations.map(a => ({ product_id: a.product.id, share: a.share }))
        }), appliedBy]
      );

      if (ownClient) await client.query('COMMIT');
      return { discount_amount: discountAmount, allocations };
    } catch (error) {
      if (ownClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownClient) client.release();
    }
  }

  /**
   * Update booking-level discount. Reverses old allocation, applies new one.
   * @param {number} bookingId
   * @param {number} newDiscountAmount
   * @param {string} updatedBy
   * @param {Object} [existingClient]
   */
  async updateBookingDiscount(bookingId, newDiscountAmount, updatedBy, existingClient) {
    const ownClient = !existingClient;
    const client = existingClient || await pool.connect();
    try {
      if (ownClient) await client.query('BEGIN');

      const booking = await client.query(
        'SELECT final_discount FROM bookings WHERE id = $1',
        [bookingId]
      );
      if (booking.rows.length === 0) {
        throw new Error('Booking not found');
      }
      const oldDiscount = booking.rows[0].final_discount || 0;

      if (oldDiscount === newDiscountAmount) {
        throw new Error('Discount amount unchanged');
      }

      // Step 1: Reverse old allocations on active products
      await this._reverseGlobalDiscountShares(bookingId, client);

      // Step 2: Apply new allocations if newDiscountAmount > 0
      if (newDiscountAmount > 0) {
        const products = await client.query(
          `SELECT id, rent, discount_amount, global_discount_share
           FROM booking_products
           WHERE booking_id = $1 AND status NOT IN ('exchanged', 'cancelled')
           ORDER BY rent DESC`,
          [bookingId]
        );

        const allocations = this._distributeProportionally(products.rows, newDiscountAmount);

        for (const alloc of allocations) {
          const newDiscAmount = (alloc.product.discount_amount || 0) + alloc.share;
          const newEffectiveRent = alloc.product.rent - newDiscAmount;

          await client.query(
            `UPDATE booking_products
             SET global_discount_share = $1, discount_amount = $2, effective_rent = $3,
                 discount_type = CASE WHEN $2 > 0 THEN 'fixed' ELSE NULL END
             WHERE id = $4`,
            [alloc.share, newDiscAmount, newEffectiveRent, alloc.product.id]
          );

          await client.query(
            `UPDATE product_charges SET due_amount = $1, updated_at = CURRENT_TIMESTAMP
             WHERE booking_product_id = $2 AND charge_type = 'rent'`,
            [newEffectiveRent, alloc.product.id]
          );
        }
      }

      // Step 3: Update final_discount
      await client.query(
        'UPDATE bookings SET final_discount = $1 WHERE id = $2',
        [newDiscountAmount, bookingId]
      );

      // Audit trail
      await client.query(
        `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
         VALUES ($1, 'booking_discount_updated', $2, $3)`,
        [bookingId, JSON.stringify({
          old_discount: oldDiscount,
          new_discount: newDiscountAmount,
          change: newDiscountAmount - oldDiscount
        }), updatedBy]
      );

      if (ownClient) await client.query('COMMIT');
      return { old_discount: oldDiscount, new_discount: newDiscountAmount };
    } catch (error) {
      if (ownClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownClient) client.release();
    }
  }

  /**
   * Revoke global discount for an exchanged product.
   * Reduces final_discount by the exchanged product's share. Other products keep their shares.
   * @param {number} bookingId
   * @param {number} exchangedProductShare - the global_discount_share of the exchanged product
   * @param {Object} client
   */
  async revokeGlobalDiscountForExchange(bookingId, exchangedProductShare, client) {
    if (!exchangedProductShare || exchangedProductShare <= 0) return;

    await client.query(
      'UPDATE bookings SET final_discount = GREATEST(final_discount - $1, 0) WHERE id = $2',
      [exchangedProductShare, bookingId]
    );

    await client.query(
      `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
       VALUES ($1, 'global_discount_reduced_exchange', $2, 'system')`,
      [bookingId, JSON.stringify({
        reduced_by: exchangedProductShare,
        reason: 'Product exchanged — its global discount share removed'
      })]
    );
  }

  /**
   * Revoke entire global discount for a cancellation.
   * Returns the discount_reverted amount and adjusts remaining products.
   * - Sets final_discount to 0
   * - For remaining active products: removes global_discount_share, restores effective_rent,
   *   increases rent charge due_amount, and adds adjustment payment for the difference.
   * @param {number} bookingId
   * @param {Object} client
   * @returns {{ discountReverted: number }} The total global discount that was revoked
   */
  async revokeGlobalDiscountForCancellation(bookingId, client) {
    const booking = await client.query(
      'SELECT final_discount FROM bookings WHERE id = $1',
      [bookingId]
    );
    const globalDiscount = booking.rows[0].final_discount || 0;

    if (globalDiscount <= 0) {
      return { discountReverted: 0 };
    }

    // Get remaining active products (NOT the one being cancelled — caller sets that status first)
    const activeProducts = await client.query(
      `SELECT id, rent, discount_amount, global_discount_share
       FROM booking_products
       WHERE booking_id = $1 AND status NOT IN ('exchanged', 'cancelled')
       ORDER BY id`,
      [bookingId]
    );

    // For each remaining active product: remove global share, restore effective_rent, add adjustment
    const adjustmentDetails = [];
    for (const product of activeProducts.rows) {
      const share = product.global_discount_share || 0;
      if (share <= 0) continue;

      const newDiscountAmount = (product.discount_amount || 0) - share;
      const newEffectiveRent = product.rent - newDiscountAmount;

      await client.query(
        `UPDATE booking_products
         SET global_discount_share = 0, discount_amount = $1, effective_rent = $2,
             discount_type = CASE WHEN $1 > 0 THEN 'fixed' ELSE NULL END
         WHERE id = $3`,
        [newDiscountAmount, newEffectiveRent, product.id]
      );

      // Increase rent charge due_amount
      await client.query(
        `UPDATE product_charges SET due_amount = $1, updated_at = CURRENT_TIMESTAMP
         WHERE booking_product_id = $2 AND charge_type = 'rent'`,
        [newEffectiveRent, product.id]
      );

      // Add adjustment payment to cover the increase (funded from cancelled product's reduced refund)
      await client.query(
        `UPDATE product_charges SET paid_amount = paid_amount + $1, updated_at = CURRENT_TIMESTAMP
         WHERE booking_product_id = $2 AND charge_type = 'rent'`,
        [share, product.id]
      );

      adjustmentDetails.push({ booking_product_id: product.id, amount: share });
    }

    // Log adjustment in payment_transactions (total amount across all remaining products)
    const totalAdjustment = adjustmentDetails.reduce((sum, d) => sum + d.amount, 0);
    if (totalAdjustment > 0) {
      await client.query(
        `INSERT INTO payment_transactions
         (booking_id, amount, type, method, notes, recorded_by, transaction_date)
         VALUES ($1, $2, 'adjustment', 'Adjustment', $3, 'system', CURRENT_TIMESTAMP)`,
        [bookingId, totalAdjustment,
          `Discount revocation adjustment: global discount ₹${globalDiscount} revoked, ₹${totalAdjustment} applied as adjustment to remaining products`]
      );
    }

    // Set final_discount to 0
    await client.query(
      'UPDATE bookings SET final_discount = 0 WHERE id = $1',
      [bookingId]
    );

    // Activity log
    await client.query(
      `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
       VALUES ($1, 'global_discount_revoked_cancellation', $2, 'system')`,
      [bookingId, JSON.stringify({
        discount_reverted: globalDiscount,
        adjustment_total: totalAdjustment,
        adjustments: adjustmentDetails,
        reason: 'Product cancelled — entire global discount revoked'
      })]
    );

    return { discountReverted: globalDiscount };
  }

  /**
   * Distribute amount proportionally across products by rent.
   * Uses floor() for each, assigns remainder to the product with highest rent (first in array).
   * @param {Array} products - sorted by rent DESC
   * @param {number} amount
   * @returns {Array<{product, share}>}
   */
  _distributeProportionally(products, amount) {
    const totalRent = products.reduce((sum, p) => sum + p.rent, 0);
    if (totalRent <= 0) return [];

    const allocations = products.map(product => ({
      product,
      share: Math.floor(amount * product.rent / totalRent)
    }));

    // Assign remainder to product with highest rent (first in sorted array)
    const allocated = allocations.reduce((sum, a) => sum + a.share, 0);
    const remainder = amount - allocated;
    if (remainder > 0 && allocations.length > 0) {
      allocations[0].share += remainder;
    }

    return allocations;
  }

  /**
   * Reverse all global_discount_share allocations on active products.
   * Removes the global share from discount_amount, restores effective_rent,
   * and updates rent charge due_amount.
   * @param {number} bookingId
   * @param {Object} client
   */
  async _reverseGlobalDiscountShares(bookingId, client) {
    const products = await client.query(
      `SELECT id, rent, discount_amount, global_discount_share
       FROM booking_products
       WHERE booking_id = $1 AND status NOT IN ('exchanged', 'cancelled')
       AND global_discount_share > 0`,
      [bookingId]
    );

    for (const product of products.rows) {
      const newDiscountAmount = (product.discount_amount || 0) - (product.global_discount_share || 0);
      const newEffectiveRent = product.rent - newDiscountAmount;

      await client.query(
        `UPDATE booking_products
         SET global_discount_share = 0, discount_amount = $1, effective_rent = $2,
             discount_type = CASE WHEN $1 > 0 THEN 'fixed' ELSE NULL END
         WHERE id = $3`,
        [newDiscountAmount, newEffectiveRent, product.id]
      );

      await client.query(
        `UPDATE product_charges SET due_amount = $1, updated_at = CURRENT_TIMESTAMP
         WHERE booking_product_id = $2 AND charge_type = 'rent'`,
        [newEffectiveRent, product.id]
      );
    }
  }

  /**
   * Reverse a payment amount from charges in REVERSE priority order.
   * Security → Fees → Penalties → Transport → Rent
   * Reduces paid_amount on charges that have been paid.
   * @param {number} bookingId
   * @param {number} amount
   * @param {Object} client
   */
  async _reversePaymentInternal(bookingId, amount, client) {
    let remaining = amount;

    // Reverse in opposite priority order: Security → Fees → Penalties → Transport → Rent
    remaining = await this._reverseFromChargeType(bookingId, remaining, client, 'security');
    if (remaining <= 0) return;
    remaining = await this._reverseFromChargeType(bookingId, remaining, client, 'fee');
    if (remaining <= 0) return;
    remaining = await this._reverseFromChargeType(bookingId, remaining, client, 'penalty');
    if (remaining <= 0) return;
    remaining = await this._reverseFromTransport(bookingId, remaining, client);
    if (remaining <= 0) return;
    remaining = await this._reverseFromChargeType(bookingId, remaining, client, 'rent');
  }

  /**
   * Reverse payment from a specific charge type category
   * @param {number} bookingId
   * @param {number} amount
   * @param {Object} client
   * @param {string} chargeCategory - 'rent', 'security', 'fee', or 'penalty'
   */
  async _reverseFromChargeType(bookingId, amount, client, chargeCategory) {
    // Map category to charge_type patterns
    let typeCondition;
    if (chargeCategory === 'rent') {
      typeCondition = "pc.charge_type = 'rent'";
    } else if (chargeCategory === 'security') {
      typeCondition = "pc.charge_type = 'security'";
    } else if (chargeCategory === 'fee') {
      typeCondition = "pc.charge_type IN ('late_fee', 'damage_fee')";
    } else if (chargeCategory === 'penalty') {
      typeCondition = "pc.charge_type IN ('exchange_penalty', 'downgrade_penalty', 'cancellation_penalty')";
    } else {
      return amount;
    }

    const charges = await client.query(
      `SELECT pc.*
       FROM product_charges pc
       JOIN booking_products bp ON pc.booking_product_id = bp.id
       WHERE bp.booking_id = $1
       AND ${typeCondition}
       AND pc.paid_amount > 0
       ORDER BY bp.id DESC`,
      [bookingId]
    );

    let remaining = amount;
    for (const charge of charges.rows) {
      if (remaining <= 0) break;
      const toReverse = Math.min(remaining, charge.paid_amount);
      await client.query(
        'UPDATE product_charges SET paid_amount = paid_amount - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [toReverse, charge.id]
      );
      remaining -= toReverse;
    }
    return remaining;
  }

  /**
   * Reverse payment from transport charge
   */
  async _reverseFromTransport(bookingId, amount, client) {
    const booking = await client.query(
      'SELECT transport_paid FROM bookings WHERE id = $1',
      [bookingId]
    );
    if (booking.rows.length === 0) return amount;

    const paid = booking.rows[0].transport_paid || 0;
    if (paid <= 0) return amount;

    const toReverse = Math.min(amount, paid);
    await client.query(
      'UPDATE bookings SET transport_paid = transport_paid - $1 WHERE id = $2',
      [toReverse, bookingId]
    );
    return amount - toReverse;
  }
}

module.exports = new ChargeAccountingService();
