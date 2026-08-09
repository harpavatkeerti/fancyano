const pool = require('../database/connection');

/**
 * AvailabilityService - Manages product availability checks
 */
class AvailabilityService {
  /**
   * Check if a product is available for given date range
   * @param {number} productId - Product ID
   * @param {string} dateFrom - Start date (YYYY-MM-DD)
   * @param {string} dateTo - End date (YYYY-MM-DD)
   * @param {string|null} size - Size to check (null for sizeless products)
   * @returns {Promise<Object>} - Availability status and conflicts
   */
  async checkProductAvailability(productId, dateFrom, dateTo, size = null) {
    // Query bookings for this product that overlap with the requested dates
    // Only check booking_products status - exclude cancelled, completed, and exchanged products
    const query = `
      SELECT 
        b.id,
        u.name AS customer_name,
        b.status,
        bp.booked_from,
        bp.booked_to,
        bp.status as product_status
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN booking_products bp ON b.id = bp.booking_id
      WHERE 
        bp.product_id = $1
        AND bp.status NOT IN ('cancelled', 'completed', 'exchanged', 'discarded')
        AND (
          (bp.booked_from <= $2 AND bp.booked_to >= $2) OR
          (bp.booked_from <= $3 AND bp.booked_to >= $3) OR
          (bp.booked_from >= $2 AND bp.booked_to <= $3)
        )
        AND ($4::text IS NULL OR bp.size = $4)
      ORDER BY bp.booked_from
    `;

    const result = await pool.query(query, [productId, dateFrom, dateTo, size]);

    if (result.rows.length > 0) {
      // Product is not available
      const conflicts = result.rows.map(row => ({
        booking_id: row.id,
        customer: row.customer_name,
        status: row.status,
        from: row.booked_from,
        to: row.booked_to
      }));

      return {
        available: false,
        conflicts,
        message: `Product is already booked from ${conflicts[0].from} to ${conflicts[0].to}`
      };
    }

    return {
      available: true,
      conflicts: [],
      message: 'Product is available for the selected dates'
    };
  }

  /**
   * Check availability for multiple products
   * @param {Array<Object>} products - Array of {product_id, date_from, date_to}
   * @returns {Promise<Object>} - Availability results for all products
   */
  async checkBulkAvailability(products) {
    const results = [];

    for (const item of products) {
      const { product_id, date_from, date_to, size } = item;
      
      if (!product_id || !date_from || !date_to) {
        results.push({
          product_id,
          available: false,
          error: 'Missing required fields'
        });
        continue;
      }

      try {
        const availabilityResult = await this.checkProductAvailability(
          product_id,
          date_from,
          date_to,
          size || null
        );

        results.push({
          product_id,
          ...availabilityResult
        });
      } catch (error) {
        results.push({
          product_id,
          available: false,
          error: error.message
        });
      }
    }

    return {
      results,
      all_available: results.every(r => r.available)
    };
  }

  // ──────────────────────────────────────────────
  // Tight-schedule (urgent) checks
  // ──────────────────────────────────────────────

  /**
   * Shared helper: find nearby bookings within GAP_DAYS of a product's date range.
   * Returns rows with booking_id, product_code, booked_from, booked_to, gap_days, direction.
   * @private
   */
  async _findNearbyBookings(productId, size, bookedFrom, bookedTo, excludeBookingId = null) {
    const GAP_DAYS = 2;

    // Find active booking_products for the same product+size whose dates are
    // within GAP_DAYS before bookedFrom or within GAP_DAYS after bookedTo.
    const query = `
      SELECT
        b.id       AS booking_id,
        p.code     AS product_code,
        p.name     AS product_name,
        bp.booked_from,
        bp.booked_to,
        bp.size
      FROM booking_products bp
      JOIN bookings b ON bp.booking_id = b.id
      JOIN products p ON bp.product_id = p.id
      WHERE bp.product_id = $1
        AND bp.status NOT IN ('cancelled', 'completed', 'exchanged', 'discarded')
        AND b.status  NOT IN ('cancelled', 'completed', 'discarded')
        AND ($2::text IS NULL OR bp.size = $2)
        AND ($5::integer IS NULL OR b.id != $5)
        AND (
          -- other booking ends within GAP_DAYS before our start
          (bp.booked_to < $3::date AND bp.booked_to >= ($3::date - $6::integer))
          OR
          -- other booking starts within GAP_DAYS after our end
          (bp.booked_from > $4::date AND bp.booked_from <= ($4::date + $6::integer))
        )
      ORDER BY bp.booked_from
    `;

    const result = await pool.query(query, [
      productId,
      size || null,
      bookedFrom,
      bookedTo,
      excludeBookingId,
      GAP_DAYS
    ]);

    // Compute gap_days and direction for each row
    const fromDate = new Date(bookedFrom);
    const toDate = new Date(bookedTo);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(0, 0, 0, 0);

    return result.rows.map(row => {
      const otherFrom = new Date(row.booked_from);
      const otherTo = new Date(row.booked_to);
      otherFrom.setHours(0, 0, 0, 0);
      otherTo.setHours(0, 0, 0, 0);

      // Determine direction
      const gapBefore = Math.ceil((fromDate.getTime() - otherTo.getTime()) / (1000 * 60 * 60 * 24));
      const gapAfter = Math.ceil((otherFrom.getTime() - toDate.getTime()) / (1000 * 60 * 60 * 24));

      if (gapBefore > 0 && gapBefore <= 2) {
        return { ...row, gap_days: gapBefore, direction: 'before' };
      }
      if (gapAfter > 0 && gapAfter <= 2) {
        return { ...row, gap_days: gapAfter, direction: 'after' };
      }
      return null;
    }).filter(Boolean);
  }

  /**
   * Check tight schedule for products being added to a NEW booking.
   * @param {Array<Object>} products - Array of { product_id, size, booked_from, booked_to }
   * @returns {Promise<Object>} - { has_tight_schedule: bool, warnings: string[] }
   */
  async checkTightScheduleForProducts(products) {
    const warnings = [];

    for (const product of products) {
      const { product_id, size, booked_from, booked_to } = product;

      if (!product_id || !booked_from || !booked_to) continue;

      const nearby = await this._findNearbyBookings(product_id, size || null, booked_from, booked_to);

      for (const match of nearby) {
        const name = match.product_name || match.product_code;
        const code = match.product_code;
        if (match.direction === 'before') {
          warnings.push(`${name} (${code}) is booked ${match.gap_days} day before your selected date.`);
        } else {
          warnings.push(`${name} (${code}) is booked ${match.gap_days} day after your selected date.`);
        }
      }
    }

    return {
      has_tight_schedule: warnings.length > 0,
      warnings
    };
  }

  /**
   * Check if an existing booking is urgent (has tight schedule with neighbouring bookings).
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Object>} - { is_urgent: bool, reasons: string[] }
   */
  async checkTightScheduleForBooking(bookingId) {
    // Get the active products in this booking
    const productsResult = await pool.query(
      `SELECT bp.product_id, bp.size, bp.booked_from, bp.booked_to, p.code AS product_code
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1
         AND bp.status NOT IN ('cancelled', 'completed', 'exchanged', 'discarded')`,
      [bookingId]
    );

    // Also check booking-level status
    const bookingResult = await pool.query(
      'SELECT status FROM bookings WHERE id = $1',
      [bookingId]
    );
    if (bookingResult.rows.length === 0) {
      return { is_urgent: false, reasons: [] };
    }
    const bookingStatus = bookingResult.rows[0].status;
    if (['cancelled', 'completed', 'discarded'].includes(bookingStatus)) {
      return { is_urgent: false, reasons: [] };
    }

    const reasons = [];

    for (const bp of productsResult.rows) {
      const nearby = await this._findNearbyBookings(
        bp.product_id, bp.size || null, bp.booked_from, bp.booked_to, bookingId
      );

      for (const match of nearby) {
        if (match.direction === 'before') {
          reasons.push(`${bp.product_code}: Only ${match.gap_days} day gap before pickup`);
        } else {
          reasons.push(`${bp.product_code}: Only ${match.gap_days} day gap after return`);
        }
      }
    }

    return {
      is_urgent: reasons.length > 0,
      reasons
    };
  }

  /**
   * Bulk check urgency for multiple bookings (used by the booking list page).
   * @param {number[]} bookingIds - Array of booking IDs
   * @returns {Promise<Object>} - Map of { [bookingId]: { is_urgent, reasons } }
   */
  async checkTightScheduleBulk(bookingIds) {
    const result = {};

    for (const bookingId of bookingIds) {
      try {
        result[bookingId] = await this.checkTightScheduleForBooking(bookingId);
      } catch (error) {
        result[bookingId] = { is_urgent: false, reasons: [] };
      }
    }

    return result;
  }
}

module.exports = new AvailabilityService();
