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
   * @returns {Promise<Object>} - Availability status and conflicts
   */
  async checkProductAvailability(productId, dateFrom, dateTo) {
    // Query bookings for this product that overlap with the requested dates
    // Only check booking_products status - exclude cancelled, completed, and exchanged products
    const query = `
      SELECT 
        b.id,
        b.customer_name,
        b.status,
        bp.booked_from,
        bp.booked_to,
        bp.status as product_status
      FROM bookings b
      JOIN booking_products bp ON b.id = bp.booking_id
      WHERE 
        bp.product_id = $1
        AND bp.status NOT IN ('cancelled', 'completed', 'exchanged')
        AND (
          (bp.booked_from <= $2 AND bp.booked_to >= $2) OR
          (bp.booked_from <= $3 AND bp.booked_to >= $3) OR
          (bp.booked_from >= $2 AND bp.booked_to <= $3)
        )
      ORDER BY bp.booked_from
    `;

    const result = await pool.query(query, [productId, dateFrom, dateTo]);

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
      const { product_id, date_from, date_to } = item;
      
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
          date_to
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
}

module.exports = new AvailabilityService();
