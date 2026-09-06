const pool = require('../database/connection');
const chargeAccountingService = require('./chargeAccountingService');
const DiscountCalculator = require('../utils/discountCalculator');
const { recalcBookingDateRange, checkProductAvailability } = require('../utils/bookingDateUtils');
const { validatePhoneLength, validateBusNumber } = require('../utils/phoneUtils');

class BookingService {
  /**
   * Create a new booking with products
   * @param {Object} bookingData - Booking information
   * @param {number} bookingData.userId - ID of the customer (users.id FK)
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
        userId,
        bookingDate,
        products,
        transportCharge = 0,
        createdBy,
        discountAmount = 0
      } = bookingData;

      // Validate required fields
      if (!userId || !bookingDate || !products || products.length === 0) {
        throw new Error('Missing required fields: userId, bookingDate, products');
      }

      // Verify user exists
      const userCheck = await client.query(
        'SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE',
        [userId]
      );
      if (userCheck.rows.length === 0) {
        throw new Error(`User with id ${userId} not found`);
      }

      // Calculate overall booked_from (earliest) and booked_to (latest) from products
      const bookedFromDates = products.map(p => p.bookedFrom).filter(Boolean).sort();
      const bookedToDates = products.map(p => p.bookedTo).filter(Boolean).sort();
      const overallBookedFrom = bookedFromDates.length > 0 ? bookedFromDates[0] : null;
      const overallBookedTo = bookedToDates.length > 0 ? bookedToDates[bookedToDates.length - 1] : null;

      // Create booking
      const bookingResult = await client.query(
        `INSERT INTO bookings (
          user_id,
          booking_date, status, transport_charge, created_by,
          booked_from, booked_to
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at`,
        [
          userId,
          bookingDate,
          'pending',
          transportCharge,
          createdBy,
          overallBookedFrom,
          overallBookedTo
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
          size,
          quantity = 1,
          measurements,
          specialRequirements,
          discountType,    // 'percentage' or 'fixed'
          discountValue,   // discount value
          transportDetails // per-product transport snapshot (JSONB)
        } = product;

        if (!productId || !bookedFrom || !bookedTo || rent === undefined || securityDeposit === undefined) {
          throw new Error('Each product must have productId, bookedFrom, bookedTo, rent, and securityDeposit');
        }

        // Calculate effective rent with discount
        const { effectiveRent, discountAmount } = DiscountCalculator.calculateEffectiveRent(
          rent,
          discountType,
          discountValue
        );

        // Guard: reject if the product is archived
        const productInfo = await client.query(
          'SELECT name, code, status, available_sizes FROM products WHERE id = $1',
          [productId]
        );
        if (!productInfo.rows[0]) {
          throw new Error(`Product ${productId} not found`);
        }
        if (productInfo.rows[0].status !== 'available') {
          throw new Error(`Product "${productInfo.rows[0].name}" (${productInfo.rows[0].code}) is archived and cannot be booked`);
        }

        // Guard: validate size against product's available_sizes
        const availableSizes = productInfo.rows[0].available_sizes;
        if (availableSizes && availableSizes.length > 0) {
          if (!size || !availableSizes.includes(size)) {
            throw new Error(`Invalid size "${size}" for product "${productInfo.rows[0].name}". Available: ${availableSizes.join(', ')}`);
          }
        }

        // Guard: reject if the product is already booked over this date range (for this size)
        await checkProductAvailability(productId, bookedFrom, bookedTo, { client, size: size || null });

        // Guard: validate transport_details phone numbers and bus_no
        if (transportDetails) {
          if (transportDetails.phone) {
            const phoneErr = validatePhoneLength(transportDetails.phone, 'IN');
            if (phoneErr) throw Object.assign(new Error(phoneErr), { status: 400 });
          }
          if (transportDetails.destination_phone) {
            const destPhoneErr = validatePhoneLength(transportDetails.destination_phone, 'IN');
            if (destPhoneErr) throw Object.assign(new Error(`Destination phone: ${destPhoneErr}`), { status: 400 });
          }
          if (transportDetails.bus_no) {
            const busErr = validateBusNumber(transportDetails.bus_no);
            if (busErr) throw Object.assign(new Error(busErr), { status: 400 });
          }
        }

        // Split transport: transporter_id as FK column, per-shipment fields in JSONB
        const transporterId = transportDetails?.transporter_id || null;
        const perShipmentDetails = transportDetails
          ? (() => {
              const { transporter_id, transporter_name, phone, bus_no, ...shipment } = transportDetails;
              return Object.keys(shipment).length > 0 ? shipment : null;
            })()
          : null;

        // Create booking_product entry with discount information and transport details
        const bpResult = await client.query(
          `INSERT INTO booking_products (
            booking_id, product_id, quantity, booked_from, booked_to,
            status, rent, security_deposit, effective_rent,
            discount_amount, discount_type,
            measurements, special_requirements, size, transporter_id, transport_details
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
            effectiveRent,        // Use calculated effective rent
            discountAmount,       // Store calculated discount amount
            discountType || null, // Store discount type (null if no discount)
            measurements ? JSON.stringify(measurements) : null,
            specialRequirements || null,
            size || null,
            transporterId,
            perShipmentDetails ? JSON.stringify(perShipmentDetails) : null
          ]
        );

        const bookingProductId = bpResult.rows[0].id;
        bookingProductIds.push(bookingProductId);

        // Initialize charges for this product using EFFECTIVE RENT (after discount)
        await chargeAccountingService.initializeProductCharges(
          bookingProductId,
          effectiveRent,  // Use effective rent, not original rent
          securityDeposit,
          client
        );

        productDetails.push({
          product_id: productId,
          booking_product_id: bookingProductId,
          name: productInfo.rows[0]?.name,
          code: productInfo.rows[0]?.code,
          rent,
          effective_rent: effectiveRent,
          discount_amount: discountAmount,
          discount_type: discountType || null,
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

      // Apply booking-level discount if provided
      if (discountAmount > 0) {
        await client.query(
          'UPDATE bookings SET final_discount = $1 WHERE id = $2',
          [discountAmount, bookingId]
        );

        await chargeAccountingService.applyBookingDiscount(
          bookingId, discountAmount, createdBy || 'system',
          `Booking discount of ₹${discountAmount} applied at creation`,
          client
        );
      }

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
   * Update booking measurements and special requirements
   * @param {number} bookingId - Booking ID
   * @param {Object} data - Update data
   * @param {Object} data.measurements - Measurements keyed by "{bp_id}_{booked_from}_{booked_to}"
   * @param {string} data.special_requirements - JSON string of special requirements keyed similarly
   * @returns {Promise<Object>} Updated booking
   */
  async updateBooking(bookingId, data) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify booking exists and get current state
      const bookingResult = await client.query(
        'SELECT id, status FROM bookings WHERE id = $1',
        [bookingId]
      );
      if (bookingResult.rows.length === 0) {
        throw new Error('Booking not found');
      }
      const currentStatus = bookingResult.rows[0].status;

      const { status, performed_by, measurements, special_requirements } = data;

      // ── Status update ──────────────────────────────────────────────────────
      // Update booking status and the corresponding product statuses
      // independently in the same transaction, driven by the business action.
      if (status !== undefined) {
        const validStatuses = ['pending', 'confirmed', 'in_progress', 'partially_completed', 'completed', 'cancelled', 'discarded'];
        if (!validStatuses.includes(status)) {
          throw new Error(`Invalid status: ${status}`);
        }

        // Update booking status directly
        await client.query(
          'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [status, bookingId]
        );

        // Log the status change
        await client.query(
          `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
           VALUES ($1, $2, $3, $4)`,
          [
            bookingId,
            'status_changed',
            JSON.stringify({ previous_status: currentStatus, new_status: status }),
            performed_by || 'system'
          ]
        );
      }


      // ── Measurements / special requirements update ─────────────────────────
      if (measurements || special_requirements) {
        const specialReqs = special_requirements ? JSON.parse(special_requirements) : {};

        // Get valid booking product IDs for this booking with their product info
        const bpResult = await client.query(
          `SELECT bp.id, bp.product_id, p.name AS product_name
           FROM booking_products bp
           JOIN products p ON bp.product_id = p.id
           WHERE bp.booking_id = $1`,
          [bookingId]
        );
        const validBpIds = new Set(bpResult.rows.map(r => r.id));

        // Build a map of bpId → measurement_template (fields + id)
        // by looking up product_name → product_types → measurement_templates
        const bpTemplateMap = new Map();
        for (const bp of bpResult.rows) {
          const templateResult = await client.query(
            `SELECT mt.id AS template_id, mt.fields
             FROM product_types pt
             JOIN measurement_templates mt ON pt.measurement_template_id = mt.id
             WHERE pt.name = $1 AND pt.is_active = true
             LIMIT 1`,
            [bp.product_name]
          );
          if (templateResult.rows.length > 0) {
            const row = templateResult.rows[0];
            const fields = typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields;
            bpTemplateMap.set(bp.id, {
              templateId: row.template_id,
              allowedKeys: new Set(fields.map(f => f.key)),
            });
          }
        }

        // Extract booking_product_id from keys (format: "bpId_bookedFrom_bookedTo")
        // and update each product's measurements/special_requirements
        const allKeys = new Set([
          ...Object.keys(measurements || {}),
          ...Object.keys(specialReqs)
        ]);

        for (const key of allKeys) {
          const bpId = parseInt(key.split('_')[0]);
          if (isNaN(bpId) || !validBpIds.has(bpId)) continue;

          let productMeasurements = measurements ? measurements[key] : undefined;
          const productSpecialReqs = specialReqs[key];

          // Template validation: if a template exists for this product,
          // strip any fields not defined in the template
          const templateInfo = bpTemplateMap.get(bpId);
          let templateId = null;

          if (templateInfo && productMeasurements && typeof productMeasurements === 'object') {
            templateId = templateInfo.templateId;
            const filtered = {};
            for (const [fieldKey, fieldValue] of Object.entries(productMeasurements)) {
              if (templateInfo.allowedKeys.has(fieldKey)) {
                filtered[fieldKey] = fieldValue;
              }
            }
            productMeasurements = filtered;
          } else if (templateInfo) {
            templateId = templateInfo.templateId;
          }

          if (productMeasurements !== undefined || productSpecialReqs !== undefined) {
            await client.query(
              `UPDATE booking_products
               SET measurements = COALESCE($1, measurements),
                   special_requirements = COALESCE($2, special_requirements),
                   measurement_template_id = COALESCE($3, measurement_template_id)
               WHERE id = $4 AND booking_id = $5`,
              [
                productMeasurements ? JSON.stringify(productMeasurements) : null,
                productSpecialReqs !== undefined ? productSpecialReqs : null,
                templateId,
                bpId,
                bookingId
              ]
            );
          }
        }
      }

      // ── Product date updates ──────────────────────────────────────────────────
      // Accepts: products: [{ id: booking_product_id, booked_from, booked_to }]
      if (data.products && Array.isArray(data.products) && data.products.length > 0) {
        for (const p of data.products) {
          if (!p.id || !p.booked_from || !p.booked_to) continue;

          // Resolve the catalog product_id for this booking_product row
          const bpRow = await client.query(
            'SELECT product_id FROM booking_products WHERE id = $1 AND booking_id = $2',
            [p.id, bookingId]
          );
          if (bpRow.rows.length === 0) continue; // not owned by this booking

          // Guard: reject if the new dates clash with another booking (exclude self)
          await checkProductAvailability(
            bpRow.rows[0].product_id, p.booked_from, p.booked_to,
            { excludeBookingId: bookingId, client }
          );

          await client.query(
            `UPDATE booking_products
               SET booked_from = $1, booked_to = $2
             WHERE id = $3 AND booking_id = $4`,
            [p.booked_from, p.booked_to, p.id, bookingId]
          );
        }

        // Recalculate booking-level date range from the remaining active products
        await recalcBookingDateRange(bookingId, client);

        // Activity log
        await client.query(
          `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
           VALUES ($1, $2, $3, $4)`,
          [
            bookingId,
            'date_changed',
            JSON.stringify({
              products: data.products
                .filter(p => p.id && p.booked_from && p.booked_to)
                .map(p => ({
                  booking_product_id: p.id,
                  booked_from: p.booked_from,
                  booked_to: p.booked_to,
                }))
            }),
            performed_by || 'system'
          ]
        );
      }

      // ── Transport details update ────────────────────────────────────────────
      // Accepts: transport_details: { [booking_product_id]: { transporter_id?, transporter_name?, phone?, bus_no?, destination? } }
      if (data.transport_details && typeof data.transport_details === 'object') {
        // Fetch valid booking_product IDs for this booking
        const bpTransportResult = await client.query(
          'SELECT id FROM booking_products WHERE booking_id = $1',
          [bookingId]
        );
        const validTransportBpIds = new Set(bpTransportResult.rows.map(r => r.id));

        for (const [bpIdStr, details] of Object.entries(data.transport_details)) {
          const bpId = parseInt(bpIdStr);
          if (isNaN(bpId) || !validTransportBpIds.has(bpId)) continue;

          // Validate phone numbers and bus_no
          if (details.phone) {
            const phoneErr = validatePhoneLength(details.phone, 'IN');
            if (phoneErr) throw Object.assign(new Error(phoneErr), { status: 400 });
          }
          if (details.destination_phone) {
            const destPhoneErr = validatePhoneLength(details.destination_phone, 'IN');
            if (destPhoneErr) throw Object.assign(new Error(`Destination phone: ${destPhoneErr}`), { status: 400 });
          }
          if (details.bus_no) {
            const busErr = validateBusNumber(details.bus_no);
            if (busErr) throw Object.assign(new Error(busErr), { status: 400 });
          }

          // Split: transporter_id as FK column, per-shipment fields in JSONB
          const updTransporterId = details.transporter_id || null;
          const { transporter_id: _tid, transporter_name: _tn, phone: _ph, bus_no: _bn, ...updShipment } = details;
          const updPerShipment = Object.keys(updShipment).length > 0 ? updShipment : null;

          await client.query(
            'UPDATE booking_products SET transporter_id = $1, transport_details = $2 WHERE id = $3 AND booking_id = $4',
            [updTransporterId, updPerShipment ? JSON.stringify(updPerShipment) : null, bpId, bookingId]
          );
        }

        // Activity log
        await client.query(
          `INSERT INTO booking_activity_log (booking_id, event_type, details, performed_by)
           VALUES ($1, $2, $3, $4)`,
          [
            bookingId,
            'transport_details_updated',
            JSON.stringify({ updated_products: Object.keys(data.transport_details) }),
            performed_by || 'system'
          ]
        );
      }

      await client.query('COMMIT');

      return await this.getBookingById(bookingId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }


  /**
   * Update booking status based on current product lifecycle states.
   *
   * Status transition rules (derived from blueprint):
   * - All products pending/confirmed             → booking: confirmed
   * - Any product in_progress (none completed)   → booking: in_progress
   * - Some completed + some still active         → booking: partially_completed
   * - All products terminal (completed/cancelled/exchanged):
   *     at least 1 completed                     → booking: completed
   *     none completed                            → booking: cancelled
   * - Booking already completed/cancelled        → no change
   *
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

      // Never downgrade a finalized booking
      if (currentStatus === 'completed' || currentStatus === 'cancelled' || currentStatus === 'discarded') {
        await client.query('COMMIT');
        return {
          booking_id: bookingId,
          status: currentStatus,
          updated: false,
          all_terminal: true,
          status_counts: {}
        };
      }

      // Aggregate product statuses
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

      if (totalProducts === 0) {
        // No products — leave status unchanged
        await client.query('COMMIT');
        return { booking_id: bookingId, status: currentStatus, updated: false, all_terminal: false, status_counts: statusCounts };
      }

      const countOf = (s) => statusCounts[s] || 0;

      const terminalCount = countOf('completed') + countOf('cancelled') + countOf('exchanged') + countOf('discarded');
      const allTerminal = terminalCount === totalProducts;
      const hasCompleted = countOf('completed') > 0;
      const hasInProgress = countOf('in_progress') > 0;
      const hasPending = countOf('pending') > 0;
      const hasConfirmed = countOf('confirmed') > 0;

      let newStatus;

      if (allTerminal) {
        // All products are done — finalize booking
        newStatus = hasCompleted ? 'completed' : 'cancelled';
      } else if (hasCompleted) {
        // At least one product returned, others still active
        newStatus = 'partially_completed';
      } else if (hasInProgress) {
        // At least one product picked up, none returned yet
        newStatus = 'in_progress';
      } else {
        // Products are still pending or confirmed — no auto-change
        // (pending → confirmed is an explicit user action, not auto-derived)
        newStatus = currentStatus;
      }

      let updated = false;

      if (newStatus !== currentStatus) {
        await client.query(
          'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newStatus, bookingId]
        );
        updated = true;

        // Map newStatus → activity event name
        const eventMap = {
          confirmed: 'booking_confirmed',
          in_progress: 'booking_in_progress',
          partially_completed: 'booking_partially_completed',
          completed: 'booking_completed',
          cancelled: 'booking_cancelled',
          discarded: 'booking_discarded'
        };

        await client.query(
          `INSERT INTO booking_activity_log (
            booking_id, event_type, details, performed_by
          ) VALUES ($1, $2, $3, $4)`,
          [
            bookingId,
            eventMap[newStatus] || 'status_updated',
            JSON.stringify({
              previous_status: currentStatus,
              new_status: newStatus,
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
        status: newStatus,
        updated,
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
        b.id,
        b.booking_date,
        b.status,
        b.transport_charge,
        b.transport_paid,
        b.final_discount,
        b.special_requirements,
        b.created_by,
        b.created_at,
        b.updated_at,
        COALESCE(b.booked_from, MIN(bp.booked_from)) AS booked_from,
        COALESCE(b.booked_to, MAX(bp.booked_to)) AS booked_to,
        json_build_object(
          'id',                      u.id,
          'name',                    u.name,
          'phone',                   u.phone,
          'phone_country',           u.phone_country,
          'alternate_phone',         u.alternate_phone,
          'alternate_phone_country', u.alternate_phone_country,
          'address',                 u.address,
          'email',                   u.email
        ) AS user,
        json_agg(
          json_build_object(
            'id', bp.id,
            'product_id', p.id,
            'name', p.name,
            'code', p.code,
            'image', p.image,
            'quantity', bp.quantity,
            'booked_from', bp.booked_from,
            'booked_to', bp.booked_to,
            'status', bp.status,
            'rent', bp.rent,
            'effective_rent', bp.effective_rent,
            'discount_amount', bp.discount_amount,
            'discount_type', bp.discount_type,
            'security_deposit', bp.security_deposit,
            'measurements', bp.measurements,
            'special_requirements', bp.special_requirements,
            'picked_up_at', bp.picked_up_at,
            'returned_at', bp.returned_at,
            'size', bp.size,
            'category_name', pc.name,
            'measurement_template_id', COALESCE(bp.measurement_template_id, pt.measurement_template_id),
            'measurement_template_fields', mt.fields,
            'transport_details', CASE WHEN bp.transporter_id IS NOT NULL THEN
              jsonb_build_object(
                'transporter_id', bp.transporter_id,
                'transporter_name', tr.name,
                'phone', tr.phone,
                'bus_no', tr.bus_no
              ) || COALESCE(bp.transport_details, '{}'::jsonb)
            ELSE bp.transport_details END
          ) ORDER BY bp.booked_from ASC, bp.id ASC
        ) FILTER (WHERE p.id IS NOT NULL) AS products
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       LEFT JOIN booking_products bp ON b.id = bp.booking_id
       LEFT JOIN products p ON bp.product_id = p.id
       LEFT JOIN product_categories pc ON p.category_id = pc.id
       LEFT JOIN product_types pt ON pt.name = p.name AND pt.is_active = true
         AND (pt.category_id = p.category_id OR (pt.category_id IS NULL AND p.category_id IS NULL))
       LEFT JOIN measurement_templates mt ON mt.id = COALESCE(bp.measurement_template_id, pt.measurement_template_id)
       LEFT JOIN transporters tr ON bp.transporter_id = tr.id
       WHERE b.id = $1
       GROUP BY b.id, u.id`,
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
        b.booking_date,
        COALESCE(b.booked_from, MIN(bp.booked_from)) AS booked_from,
        COALESCE(b.booked_to, MAX(bp.booked_to)) AS booked_to,
        b.status,
        b.transport_charge,
        b.transport_paid,
        b.created_by,
        b.created_at,
        json_build_object(
          'id',                      u.id,
          'name',                    u.name,
          'phone',                   u.phone,
          'phone_country',           u.phone_country,
          'alternate_phone',         u.alternate_phone,
          'alternate_phone_country', u.alternate_phone_country,
          'address',                 u.address,
          'email',                   u.email
        ) AS user,
        COUNT(DISTINCT bp.id) FILTER (WHERE bp.status NOT IN ('exchanged', 'cancelled', 'discarded')) AS product_count,
        COALESCE(SUM(bp.rent) FILTER (WHERE bp.status NOT IN ('exchanged', 'cancelled', 'discarded')), 0)::INTEGER AS total_rent,
        COALESCE(SUM(bp.effective_rent) FILTER (WHERE bp.status NOT IN ('exchanged', 'cancelled', 'discarded')), 0)::INTEGER AS total_effective_rent,
        COALESCE(SUM(bp.security_deposit) FILTER (WHERE bp.status NOT IN ('exchanged', 'cancelled', 'discarded')), 0)::INTEGER AS total_security,
        COALESCE((
          SELECT SUM(pc.paid_amount) 
          FROM product_charges pc 
          JOIN booking_products bp2 ON pc.booking_product_id = bp2.id
          WHERE bp2.booking_id = b.id
          AND (
            bp2.status NOT IN ('exchanged', 'cancelled', 'discarded')
            OR pc.charge_type IN ('exchange_penalty','downgrade_penalty','cancellation_penalty','late_fee','damage_fee')
          )
        ), 0)::INTEGER AS total_paid,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', bp.id,
            'product_id', p.id,
            'name', p.name,
            'code', p.code,
            'image', p.image,
            'rent', bp.rent,
            'effective_rent', bp.effective_rent,
            'discount_amount', bp.discount_amount,
            'discount_type', bp.discount_type,
            'security_deposit', bp.security_deposit,
            'status', bp.status,
            'booked_from', bp.booked_from,
            'booked_to', bp.booked_to,
            'size', bp.size,
            'category_name', pc.name,
            'transport_details', CASE WHEN bp.transporter_id IS NOT NULL THEN
              jsonb_build_object(
                'transporter_id', bp.transporter_id,
                'transporter_name', tr.name,
                'phone', tr.phone,
                'bus_no', tr.bus_no
              ) || COALESCE(bp.transport_details, '{}'::jsonb)
            ELSE bp.transport_details END
          )
        ) FILTER (WHERE p.id IS NOT NULL) AS products
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN transporters tr ON bp.transporter_id = tr.id
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
      query += ` AND (u.name ILIKE $${paramCount} OR u.phone ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY b.id, u.id ORDER BY b.created_at DESC`;

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
         WHERE booking_id = $1 AND status NOT IN ('completed', 'cancelled', 'exchanged', 'discarded')`,
        [bookingId]
      );

      if (parseInt(productsCheck.rows[0].active_count) > 0) {
        throw new Error('Cannot finalize booking: Some products are still active (not completed or cancelled)');
      }

      // Get payment summary
      const summary = await chargeAccountingService.getPaymentSummary(bookingId);
      const totalDue = summary.totals.total_due;
      const totalPaid = summary.totals.total_paid;
      const rawBalance = totalDue - totalPaid;

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
  /**
   * Get bookings for a specific product (for availability checking)
   * Returns only active bookings with non-cancelled/exchanged products
   */
  async getBookingsByProductId(productId, size = null) {
    try {
      const params = [productId];
      let sizeClause = '';
      if (size) {
        sizeClause = ' AND bp.size = $2';
        params.push(size);
      }
      const result = await pool.query(
        `SELECT b.id, b.booking_date, b.status,
                json_build_object(
                  'id',    u.id,
                  'name',  u.name,
                  'phone', u.phone
                ) AS user,
                bp.id AS booking_product_id, bp.status AS product_status,
                bp.booked_from, bp.booked_to, bp.size
         FROM bookings b
         JOIN users u ON b.user_id = u.id
         JOIN booking_products bp ON bp.booking_id = b.id
         WHERE bp.product_id = $1
           AND bp.status NOT IN ('cancelled', 'exchanged', 'completed', 'discarded')
           AND b.status NOT IN ('cancelled', 'discarded')${sizeClause}
         ORDER BY bp.booked_from`,
        params
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching bookings by product:', error);
      throw error;
    }
  }

  /**
   * Hard-delete a booking and all its cascaded records (admin only).
   * Runs inside a transaction so partial deletes never persist.
   * @param {number} bookingId
   * @throws {Error} with message 'Booking not found' if id does not exist
   */
  async deleteBooking(bookingId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const check = await client.query(
        'SELECT id FROM bookings WHERE id = $1',
        [bookingId]
      );
      if (check.rows.length === 0) {
        await client.query('ROLLBACK');
        const err = new Error('Booking not found');
        err.status = 404;
        throw err;
      }

      // ON DELETE CASCADE handles booking_products and related records
      await client.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resolve the booking_id for a given booking_product id.
   * Used by the cancellation flow to look up default penalties.
   * @param {number} bookingProductId
   * @returns {number|null} booking_id, or null if record not found
   */
  async getBookingIdByBookingProductId(bookingProductId) {
    const result = await pool.query(
      'SELECT booking_id FROM booking_products WHERE id = $1',
      [bookingProductId]
    );
    return result.rows[0]?.booking_id ?? null;
  }

  /**
   * Get all delayed bookings — bookings with products that were picked up
   * but not returned past their scheduled return date.
   *
   * A product is considered delayed when:
   * - The parent booking is 'confirmed' or 'in_progress'
   * - The product was picked up (picked_up_at IS NOT NULL)
   * - The product has not been returned (returned_at IS NULL)
   * - The product's booked_to date is in the past
   * - The product status is active (not cancelled/exchanged/discarded/completed)
   *
   * @returns {Promise<Array<{booking_id: number, delayed_products: Array<{name: string, code: string, booked_to: string, days_delayed: number}>}>>}
   */
  async getDelayedBookings() {
    const result = await pool.query(`
      SELECT
        bp.booking_id,
        json_agg(
          json_build_object(
            'name', p.name,
            'code', p.code,
            'size', bp.size,
            'booked_to', bp.booked_to,
            'days_delayed', (CURRENT_DATE - bp.booked_to::date)
          )
        ) AS delayed_products
      FROM booking_products bp
      JOIN bookings b ON bp.booking_id = b.id
      JOIN products p ON bp.product_id = p.id
      WHERE b.status IN ('confirmed', 'in_progress')
        AND bp.picked_up_at IS NOT NULL
        AND bp.returned_at IS NULL
        AND bp.booked_to::date < CURRENT_DATE
        AND bp.status NOT IN ('cancelled', 'exchanged', 'discarded', 'completed')
      GROUP BY bp.booking_id
    `);

    return result.rows;
  }
}

module.exports = new BookingService();
