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
        overpayment: booking.overpayment || 0,
        final_discount: booking.final_discount || 0
      };
      
      // Aggregate charges by category
      products.forEach(product => {
        // Skip exchanged/cancelled products for due calculations, but include paid amounts
        const includeInDue = !['exchanged', 'cancelled'].includes(product.status);
        
        product.charges.forEach(charge => {
          if (charge.charge_type === 'rent') {
            if (includeInDue) summary.charges.rent.due += charge.due_amount;
            summary.charges.rent.paid += charge.paid_amount;
          } else if (['exchange_penalty', 'downgrade_penalty', 'cancellation_penalty'].includes(charge.charge_type)) {
            if (includeInDue) summary.charges.penalties.due += charge.due_amount;
            summary.charges.penalties.paid += charge.paid_amount;
          } else if (['late_fee', 'damage_fee'].includes(charge.charge_type)) {
            if (includeInDue) summary.charges.fees.due += charge.due_amount;
            summary.charges.fees.paid += charge.paid_amount;
          } else if (charge.charge_type === 'security') {
            if (includeInDue) summary.charges.security.due += charge.due_amount;
            summary.charges.security.paid += charge.paid_amount;
          }
        });
      });
      
      // Calculate totals
      summary.totals.total_due = 
        summary.charges.rent.due +
        summary.charges.transport.due +
        summary.charges.penalties.due +
        summary.charges.fees.due +
        summary.charges.security.due -
        summary.final_discount; // Discount reduces what's due
      
      summary.totals.total_paid = 
        summary.charges.rent.paid +
        summary.charges.transport.paid +
        summary.charges.penalties.paid +
        summary.charges.fees.paid +
        summary.charges.security.paid;
      
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
  async applyPayment(bookingId, paymentAmount, paymentMethod, recordedBy, notes) {
    return await this._applyPaymentOrAdjustment(
      bookingId,
      paymentAmount,
      paymentMethod,
      recordedBy,
      notes,
      'payment',
      'payment_applied'
    );
  }

  /**
   * Internal helper: Apply payment to booking following priority order
   * Priority: Rent → Transport → Penalties → Fees → Security → Overpayment
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
    
    // Remaining becomes overpayment
    if (remaining > 0) {
      await client.query(
        'UPDATE bookings SET overpayment = overpayment + $1 WHERE id = $2',
        [remaining, bookingId]
      );
      breakdown.applications.push({
        category: 'overpayment',
        amount: remaining,
        notes: 'Excess payment'
      });
    }
    
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
       AND bp.status NOT IN ('exchanged', 'cancelled')
       AND pc.charge_type IN ('exchange_penalty', 'downgrade_penalty', 'cancellation_penalty')
       AND pc.paid_amount < pc.due_amount
       ORDER BY bp.id, pc.charge_type`,
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
       AND bp.status NOT IN ('exchanged', 'cancelled')
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
   * @returns {Promise<Object>}
   */
  async applyAdjustment(bookingId, adjustmentAmount, paymentMethod, adjustedBy, notes) {
    return await this._applyPaymentOrAdjustment(
      bookingId,
      adjustmentAmount,
      paymentMethod,
      adjustedBy,
      notes,
      'adjustment',
      'adjustment_applied'
    );
  }

  /**
   * Internal method to apply payment or adjustment (shared logic)
   * @private
   */
  async _applyPaymentOrAdjustment(bookingId, amount, paymentMethod, recordedBy, notes, transactionType, eventType) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

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

      // Apply payment using internal helper
      const breakdown = await this._applyPaymentInternal(bookingId, amount, client);

      // Calculate residual (overpayment from breakdown if any)
      const overpaymentApp = breakdown.applications.find(app => app.category === 'overpayment');
      const residualAmount = overpaymentApp ? overpaymentApp.amount : 0;
      const totalApplied = amount - residualAmount;

      // Create payment transaction record
      const transactionNotes = transactionType === 'adjustment'
        ? `${notes || 'Charge adjustment'} | Applied: ${totalApplied} | Residual: ${residualAmount}`
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
            residual_amount: residualAmount,
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

      await client.query('COMMIT');

      // Return unified response structure
      return {
        booking_id: bookingId,
        total_applied: totalApplied,
        residual_amount: residualAmount,
        breakdown: breakdown.applications,
        recorded_by: recordedBy,
        recorded_at: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new ChargeAccountingService();
