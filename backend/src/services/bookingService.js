const pool = require('../database/connection');
const chargeAccountingService = require('./chargeAccountingService');

class BookingService {
  /**
   * Create a new booking with products
   * @param {Object} bookingData - Booking information
   * @param {string} bookingData.customerName - Customer name
   * @param {string} bookingData.customerPhone - Customer phone
   * @param {string} bookingData.customerEmail - Customer email (optional)
   * @param {string} bookingData.customerAddress - Customer address (optional)
   * @param {Date} bookingData.bookingDate - Booking date
   * @param {Array} bookingData.products - Array of products to book
   * @param {number} bookingData.products[].productId - Product ID
   * @param {Date} bookingData.products[].bookedFrom - Start date
   * @param {Date} bookingData.products[].bookedTo - End date
   * @param {number} bookingData.products[].rent - Rent amount
   * @param {number} bookingData.products[].securityDeposit - Security deposit
   * @param {number} bookingData.products[].quantity - Quantity
   * @param {Object} bookingData.products[].measurements - Measurements (optional)
   * @param {string} bookingData.products[].specialRequirements - Special requirements (optional)
   * @param {number} bookingData.transportCharge - Transport charge (default 0)
   * @param {string} bookingData.createdBy - User who created the booking
   * @returns {Promise<Object>} Created booking with ID and product IDs
   */
  async createBooking(bookingData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const {
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        bookingDate,
        products,
        transportCharge = 0,
        createdBy
      } = bookingData;
      
      // Validate required fields
      if (!customerName || !customerPhone || !bookingDate || !products || products.length === 0) {
        throw new Error('Missing required fields: customerName, customerPhone, bookingDate, products');
      }
      
      // Create booking
      const bookingResult = await client.query(
        `INSERT INTO bookings (
          customer_name, customer_phone, customer_email, customer_address,
          booking_date, status, transport_charge, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, created_at`,
        [
          customerName,
          customerPhone,
          customerEmail || null,
          customerAddress || null,
          bookingDate,
          'pending',
          transportCharge,
          createdBy
        ]
      );
      
      const bookingId = bookingResult.rows[0].id;
      const createdAt = bookingResult.rows[0].created_at;
      
      // Create booking products and their charges
      const bookingProductIds = [];
      const productDetails = [];
      
      for (const product of products) {
        const { 
          productId, 
          bookedFrom, 
          bookedTo, 
          rent, 
          securityDeposit, 
          quantity = 1,
          measurements,
          specialRequirements
        } = product;
        
        if (!productId || !bookedFrom || !bookedTo || rent === undefined || securityDeposit === undefined) {
          throw new Error('Each product must have productId, bookedFrom, bookedTo, rent, and securityDeposit');
        }
        
        // Create booking_product entry
        const bpResult = await client.query(
          `INSERT INTO booking_products (
            booking_id, product_id, quantity, booked_from, booked_to,
            status, rent, security_deposit, effective_rent,
            measurements, special_requirements
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id`,
          [
            bookingId,
            productId,
            quantity,
            bookedFrom,
            bookedTo,
            'pending',
            rent,
            securityDeposit,
            rent, // effective_rent initially equals rent
            measurements ? JSON.stringify(measurements) : null,
            specialRequirements || null
          ]
        );
        
        const bookingProductId = bpResult.rows[0].id;
        bookingProductIds.push(bookingProductId);
        
        // Initialize charges for this product using ChargeAccountingService
        await chargeAccountingService.initializeProductCharges(
          bookingProductId,
          rent,
          securityDeposit,
          client
        );
        
        // Get product name for activity log
        const productInfo = await client.query(
          'SELECT name, code FROM products WHERE id = $1',
          [productId]
        );
        
        productDetails.push({
          product_id: productId,
          booking_product_id: bookingProductId,
          name: productInfo.rows[0]?.name,
          code: productInfo.rows[0]?.code,
          rent,
          security_deposit: securityDeposit
        });
      }
      
      // Log booking creation activity
      await client.query(
        `INSERT INTO booking_activity_log (
          booking_id, event_type, details, performed_by
        ) VALUES ($1, $2, $3, $4)`,
        [
          bookingId,
          'booking_created',
          JSON.stringify({
            products: productDetails,
            transport_charge: transportCharge,
            total_products: products.length
          }),
          createdBy
        ]
      );
      
      await client.query('COMMIT');
      
      return {
        booking_id: bookingId,
        booking_product_ids: bookingProductIds,
        status: 'pending',
        created_at: createdAt
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Update booking status to 'completed' if all products are in terminal states
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Object>} Updated status info
   */
  async updateBookingStatus(bookingId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current booking status
      const bookingResult = await client.query(
        'SELECT status FROM bookings WHERE id = $1',
        [bookingId]
      );
      
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }
      
      const currentStatus = bookingResult.rows[0].status;
      
      // Check if all products are in terminal states
      const productsResult = await client.query(
        `SELECT status, COUNT(*) as count
         FROM booking_products
         WHERE booking_id = $1
         GROUP BY status`,
        [bookingId]
      );
      
      const statusCounts = {};
      let totalProducts = 0;
      
      productsResult.rows.forEach(row => {
        statusCounts[row.status] = parseInt(row.count);
        totalProducts += parseInt(row.count);
      });
      
      // Terminal states: completed, cancelled, exchanged
      const terminalStates = ['completed', 'cancelled', 'exchanged'];
      let terminalCount = 0;
      
      terminalStates.forEach(state => {
        terminalCount += statusCounts[state] || 0;
      });
      
      const allTerminal = terminalCount === totalProducts;
      const hasCompleted = (statusCounts['completed'] || 0) > 0;
      
      // Determine new status if all products are in terminal states
      let newStatus = null;
      if (allTerminal && currentStatus !== 'completed' && currentStatus !== 'cancelled') {
        if (hasCompleted) {
          // At least one product completed - mark booking as completed
          newStatus = 'completed';
        } else {
          // No products completed (all cancelled/exchanged) - mark booking as cancelled
          newStatus = 'cancelled';
        }
      }
      
      if (newStatus) {
        // Update booking status
        await client.query(
          'UPDATE bookings SET status = $1 WHERE id = $2',
          [newStatus, bookingId]
        );
        
        // Log activity
        await client.query(
          `INSERT INTO booking_activity_log (
            booking_id, event_type, details, performed_by
          ) VALUES ($1, $2, $3, $4)`,
          [
            bookingId,
            newStatus === 'completed' ? 'booking_completed' : 'booking_cancelled',
            JSON.stringify({
              previous_status: currentStatus,
              total_products: totalProducts,
              status_counts: statusCounts
            }),
            'system'
          ]
        );
      }
      
      await client.query('COMMIT');
      
      return {
        booking_id: bookingId,
        status: newStatus || currentStatus,
        updated: !!newStatus,
        all_terminal: allTerminal,
        status_counts: statusCounts
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Confirm a pending booking (transition to 'confirmed' status)
   * @param {number} bookingId - Booking ID
   * @param {string} confirmedBy - User confirming the booking
   * @returns {Promise<Object>} Confirmation result
   */
  async confirmBooking(bookingId, confirmedBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get booking and verify it's pending
      const bookingResult = await client.query(
        'SELECT status FROM bookings WHERE id = $1',
        [bookingId]
      );
      
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }
      
      const currentStatus = bookingResult.rows[0].status;
      
      if (currentStatus !== 'pending') {
        throw new Error(`Cannot confirm booking with status: ${currentStatus}`);
      }
      
      // Update booking status
      await client.query(
        'UPDATE bookings SET status = $1 WHERE id = $2',
        ['confirmed', bookingId]
      );
      
      // Update all pending products to confirmed
      const productsResult = await client.query(
        `UPDATE booking_products 
         SET status = 'confirmed' 
         WHERE booking_id = $1 AND status = 'pending'
         RETURNING id`,
        [bookingId]
      );
      
      const confirmedProductCount = productsResult.rows.length;
      
      // Log activity
      await client.query(
        `INSERT INTO booking_activity_log (
          booking_id, event_type, details, performed_by
        ) VALUES ($1, $2, $3, $4)`,
        [
          bookingId,
          'booking_confirmed',
          JSON.stringify({
            confirmed_products: confirmedProductCount
          }),
          confirmedBy
        ]
      );
      
      await client.query('COMMIT');
      
      return {
        booking_id: bookingId,
        status: 'confirmed',
        confirmed_products: confirmedProductCount
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get booking by ID with full details
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Object>} Booking details
   */
  async getBookingById(bookingId) {
    const result = await pool.query(
      `SELECT 
        b.*,
        json_agg(
          json_build_object(
            'id', bp.id,
            'product_id', p.id,
            'product_name', p.name,
            'product_code', p.code,
            'product_image', p.image,
            'quantity', bp.quantity,
            'booked_from', bp.booked_from,
            'booked_to', bp.booked_to,
            'status', bp.status,
            'rent', bp.rent,
            'security_deposit', bp.security_deposit,
            'effective_rent', bp.effective_rent,
            'measurements', bp.measurements,
            'special_requirements', bp.special_requirements,
            'picked_up_at', bp.picked_up_at,
            'returned_at', bp.returned_at
          )
        ) FILTER (WHERE p.id IS NOT NULL) as products
       FROM bookings b
       LEFT JOIN booking_products bp ON b.id = bp.booking_id
       LEFT JOIN products p ON bp.product_id = p.id
       WHERE b.id = $1
       GROUP BY b.id`,
      [bookingId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Booking not found');
    }
    
    return result.rows[0];
  }
  
  /**
   * Get list of bookings with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.status - Filter by status
   * @param {string} filters.search - Search in customer name/phone
   * @param {number} filters.limit - Limit results
   * @param {number} filters.offset - Offset for pagination
   * @returns {Promise<Array>} List of bookings
   */
  async getBookingsList(filters = {}) {
    const { status, search, limit = 100, offset = 0 } = filters;
    
    let query = `
      SELECT 
        b.id,
        b.customer_name,
        b.customer_phone,
        b.customer_email,
        b.booking_date,
        b.booked_from,
        b.booked_to,
        b.status,
        b.transport_charge,
        b.transport_paid,
        b.created_at,
        COUNT(bp.id) FILTER (WHERE bp.status NOT IN ('exchanged', 'cancelled')) as product_count,
        COALESCE(SUM(bp.rent) FILTER (WHERE bp.status NOT IN ('exchanged', 'cancelled')), 0) as total_rent,
        COALESCE(SUM(bp.security_deposit) FILTER (WHERE bp.status NOT IN ('exchanged', 'cancelled')), 0) as total_security,
        COALESCE(SUM(pc.paid_amount), 0) as total_paid,
        json_agg(
          json_build_object(
            'id', bp.id,
            'product_id', p.id,
            'name', p.name,
            'code', p.code,
            'image', p.image,
            'rent', bp.rent,
            'security_deposit', bp.security_deposit,
            'status', bp.status,
            'booked_from', bp.booked_from,
            'booked_to', bp.booked_to
          ) ORDER BY bp.id
        ) FILTER (WHERE p.id IS NOT NULL) as products
      FROM bookings b
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      LEFT JOIN product_charges pc ON bp.id = pc.booking_product_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      query += ` AND b.status = $${paramCount}`;
      params.push(status);
    }
    
    if (search) {
      paramCount++;
      query += ` AND (b.customer_name ILIKE $${paramCount} OR b.customer_phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    
    query += ` GROUP BY b.id ORDER BY b.created_at DESC`;
    
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Apply final settlement discount to a booking
   * @param {number} bookingId
   * @param {number} discountAmount
   * @param {string} reason
   * @param {string} appliedBy
   * @returns {Promise<Object>}
   */
  async applyFinalSettlementDiscount(bookingId, discountAmount, reason, appliedBy) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify booking exists and doesn't already have final discount
      const bookingResult = await client.query(
        'SELECT id, final_discount FROM bookings WHERE id = $1',
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }

      const currentDiscount = bookingResult.rows[0].final_discount || 0;
      if (currentDiscount > 0) {
        throw new Error('Booking already has a final settlement discount');
      }

      if (discountAmount <= 0) {
        throw new Error('Discount amount must be greater than 0');
      }

      // Update booking with final discount
      await client.query(
        'UPDATE bookings SET final_discount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [discountAmount, bookingId]
      );

      // Log in activity log
      await client.query(
        `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
         VALUES ($1, $2, $3, $4)`,
        [
          bookingId,
          'final_discount_applied',
          JSON.stringify({ discount_amount: discountAmount, reason }),
          appliedBy
        ]
      );

      await client.query('COMMIT');

      return {
        booking_id: bookingId,
        discount_amount: discountAmount,
        reason,
        applied_by: appliedBy,
        applied_at: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Finalize booking with optional final discount
   * Calculates settlement (collect/refund/none) and updates booking status to completed
   * @param {number} bookingId - Booking ID
   * @param {number} finalDiscount - Optional final discount amount (default 0)
   * @param {string} finalizedBy - User finalizing the booking
   * @returns {Promise<Object>} - Settlement details
   */
  async finalizeBooking(bookingId, finalDiscount = 0, finalizedBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current booking status
      const bookingCheck = await client.query(
        'SELECT status FROM bookings WHERE id = $1',
        [bookingId]
      );

      if (bookingCheck.rows.length === 0) {
        throw new Error('Booking not found');
      }

      const currentStatus = bookingCheck.rows[0].status;

      // Only allow finalization if all products are completed or cancelled
      const productsCheck = await client.query(
        `SELECT COUNT(*) as active_count 
         FROM booking_products 
         WHERE booking_id = $1 AND status NOT IN ('completed', 'cancelled', 'exchanged')`,
        [bookingId]
      );

      if (parseInt(productsCheck.rows[0].active_count) > 0) {
        throw new Error('Cannot finalize booking: Some products are still active (not completed or cancelled)');
      }

      // Get payment summary
      const summary = await chargeAccountingService.getPaymentSummary(bookingId);
      const totalDue = summary.totals.total_due;
      const totalPaid = summary.totals.total_paid;
      // Raw balance accounts for overpayment (negative balance means overpayment)
      const rawBalance = (totalDue - totalPaid) - (summary.overpayment || 0);

      // Calculate final settlement
      const finalAmount = rawBalance - finalDiscount;
      
      let action;
      let amount;
      
      if (finalAmount > 0) {
        action = 'collect';
        amount = finalAmount;
      } else if (finalAmount < 0) {
        action = 'refund';
        amount = Math.abs(finalAmount);
      } else {
        action = 'none';
        amount = 0;
      }

      // Update booking with final discount and completed status
      await client.query(
        `UPDATE bookings 
         SET final_discount = $1, status = 'completed', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [finalDiscount, bookingId]
      );

      // Log activity
      await client.query(
        `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
         VALUES ($1, $2, $3, $4)`,
        [
          bookingId,
          'booking_finalized',
          JSON.stringify({
            final_discount: finalDiscount,
            settlement_action: action,
            settlement_amount: amount
          }),
          finalizedBy
        ]
      );

      await client.query('COMMIT');

      return {
        booking_id: bookingId,
        settlement: {
          total_due: totalDue,
          total_paid: totalPaid,
          raw_balance: rawBalance,
          final_discount: finalDiscount,
          action,
          amount
        },
        finalized_by: finalizedBy,
        finalized_at: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get activity log for a booking
   * Returns chronological list of all events related to the booking
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Array>} - Array of activity log entries
   */
  async getActivityLog(bookingId) {
    try {
      // Verify booking exists
      const bookingCheck = await pool.query(
        'SELECT id FROM bookings WHERE id = $1',
        [bookingId]
      );

      if (bookingCheck.rows.length === 0) {
        throw new Error('Booking not found');
      }

      // Fetch all activity log entries for this booking
      const result = await pool.query(
        `SELECT 
          id,
          booking_id,
          event_type,
          event_reference_id,
          details,
          performed_by,
          created_at
        FROM booking_activity_log
        WHERE booking_id = $1
        ORDER BY created_at ASC, id ASC`,
        [bookingId]
      );

      return result.rows;
    } catch (error) {
      console.error('Error fetching activity log:', error);
      throw error;
    }
  }
}

module.exports = new BookingService();
