/**
 * Discount Calculator Utility
 * Handles per-product discount calculations and validations
 */

class DiscountCalculator {
  /**
   * Validate discount parameters
   * @param {string} discountType - 'percentage' or 'fixed'
   * @param {number} discountValue - Discount value
   * @param {number} rent - Original rent amount
   * @returns {Object} - { valid: boolean, error: string }
   */
  static validateDiscount(discountType, discountValue, rent) {
    // No discount is valid
    if (!discountType && !discountValue) {
      return { valid: true, error: null };
    }

    // Both must be provided if one is provided
    if (!discountType || !discountValue) {
      return { 
        valid: false, 
        error: 'Both discountType and discountValue must be provided together' 
      };
    }

    // Validate discount type
    if (!['percentage', 'fixed'].includes(discountType)) {
      return { 
        valid: false, 
        error: 'discountType must be either "percentage" or "fixed"' 
      };
    }

    // Validate discount value
    if (typeof discountValue !== 'number' || discountValue < 0) {
      return { 
        valid: false, 
        error: 'discountValue must be a non-negative number' 
      };
    }

    // Validate percentage range
    if (discountType === 'percentage' && discountValue > 100) {
      return { 
        valid: false, 
        error: 'Percentage discount cannot exceed 100%' 
      };
    }

    // Validate fixed discount doesn't exceed rent
    if (discountType === 'fixed' && discountValue > rent) {
      return { 
        valid: false, 
        error: `Fixed discount (${discountValue}) cannot exceed rent (${rent})` 
      };
    }

    return { valid: true, error: null };
  }

  /**
   * Calculate effective rent after discount
   * @param {number} rent - Original rent amount
   * @param {string} discountType - 'percentage' or 'fixed'
   * @param {number} discountValue - Discount value
   * @returns {Object} - { effectiveRent, discountAmount }
   */
  static calculateEffectiveRent(rent, discountType, discountValue) {
    // No discount
    if (!discountType || !discountValue) {
      return {
        effectiveRent: rent,
        discountAmount: 0
      };
    }

    // Validate first
    const validation = this.validateDiscount(discountType, discountValue, rent);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    let discountAmount = 0;

    if (discountType === 'percentage') {
      // Calculate percentage discount using tax-inclusive formula
      // effective_rent = rent / (1 + discountValue / 100)
      const effectiveRentCalc = Math.floor(rent / (1 + discountValue / 100));
      discountAmount = rent - effectiveRentCalc;
    } else if (discountType === 'fixed') {
      // Use fixed discount (already validated to not exceed rent)
      discountAmount = discountValue;
    }

    const effectiveRent = Math.max(0, rent - discountAmount);

    return {
      effectiveRent,
      discountAmount
    };
  }

  /**
   * Format discount for display
   * @param {string} discountType - 'percentage' or 'fixed'
   * @param {number} discountValue - Discount value
   * @param {number} discountAmount - Calculated discount amount
   * @returns {string} - Formatted string like "10% (₹500)" or "₹500"
   */
  static formatDiscount(discountType, discountValue, discountAmount) {
    if (!discountType || !discountValue) {
      return 'No discount';
    }

    if (discountType === 'percentage') {
      return `${discountValue}% (₹${discountAmount.toLocaleString('en-IN')})`;
    } else {
      return `₹${discountAmount.toLocaleString('en-IN')}`;
    }
  }
}

module.exports = DiscountCalculator;
