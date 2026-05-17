/**
 * Booking Calculation Service
 * Centralized logic for calculating booking totals, discounts, and previews
 * Used by both booking creation and preview endpoints
 */

const discountCalculator = require('../utils/discountCalculator');
const pool = require('../database/connection');

class BookingCalculationService {
  /**
   * Fetch product details from database
   * @param {number[]} productIds - Array of product IDs
   * @returns {Promise<Object>} Map of product ID to product data
   */
  async fetchProductDetails(productIds) {
    const result = await pool.query(
      'SELECT id, name, code, rent, security_deposit FROM products WHERE id = ANY($1)',
      [productIds]
    );

    const productMap = {};
    result.rows.forEach(p => {
      productMap[p.id] = p;
    });

    return productMap;
  }

  /**
   * Calculate per-product discounts and effective rents
   * @param {Array} products - Array of {id, discountType, discountValue}
   * @param {Object} productMap - Map of product details from database
   * @returns {Array} Array of calculated product data with effective_rent
   */
  calculateProductDiscounts(products, productMap) {
    const calculatedProducts = [];
    let subtotal = 0;

    for (const productInput of products) {
      const product = productMap[productInput.id];
      if (!product) {
        throw new Error(`Product with id ${productInput.id} not found`);
      }

      const rent = product.rent || 0;
      const securityDeposit = product.security_deposit || 0;

      // Calculate effective rent with discount using centralized calculator
      const { effectiveRent, discountAmount } = discountCalculator.calculateEffectiveRent(
        rent,
        productInput.discountType,
        productInput.discountValue
      );

      calculatedProducts.push({
        id: product.id,
        name: product.name,
        code: product.code,
        rent,
        effective_rent: effectiveRent,
        discount_amount: discountAmount,
        discount_type: productInput.discountType || null,
        security_deposit: securityDeposit
      });

      subtotal += effectiveRent;
    }

    return { calculatedProducts, subtotal };
  }

  /**
   * Calculate booking-level discount
   * @param {number} subtotal - Subtotal before booking discount
   * @param {string|null} discountType - 'percentage' or 'amount'
   * @param {number} discountValue - Discount value
   * @returns {number} Discount amount
   */
  calculateBookingDiscount(subtotal, discountType, discountValue) {
    let bookingDiscountAmount = 0;
    
    if (discountType && discountValue) {
      if (discountType === 'percentage') {
        bookingDiscountAmount = subtotal - Math.floor(subtotal / (1 + discountValue / 100));
      } else if (discountType === 'amount') {
        bookingDiscountAmount = Math.min(discountValue, subtotal);
      }
    }

    return bookingDiscountAmount;
  }

  /**
   * Calculate complete booking preview
   * @param {Object} bookingData - Booking data
   * @param {Array} bookingData.products - Products with discount info
   * @param {number} bookingData.transport_charge - Transport charge
   * @param {string} bookingData.booking_discount_type - Booking discount type
   * @param {number} bookingData.booking_discount_value - Booking discount value
   * @returns {Promise<Object>} Complete booking calculation
   */
  async calculateBookingPreview(bookingData) {
    const { 
      products = [], 
      transport_charge = 0,
      booking_discount_type = null,
      booking_discount_value = 0
    } = bookingData;

    if (!Array.isArray(products) || products.length === 0) {
      throw new Error('Products array is required and cannot be empty');
    }

    // Fetch product details
    const productIds = products.map(p => p.id);
    const productMap = await this.fetchProductDetails(productIds);

    // Calculate per-product discounts
    const { calculatedProducts, subtotal } = this.calculateProductDiscounts(products, productMap);

    // Calculate booking-level discount
    const bookingDiscountAmount = this.calculateBookingDiscount(
      subtotal,
      booking_discount_type,
      booking_discount_value
    );

    // Calculate total
     const total = subtotal + (transport_charge || 0) - bookingDiscountAmount;

    return {
      products: calculatedProducts,
      subtotal,
      transport_charge: transport_charge || 0,
      booking_discount_amount: bookingDiscountAmount,
      total: Math.max(0, total)
    };
  }
}

module.exports = new BookingCalculationService();
