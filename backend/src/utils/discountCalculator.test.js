const DiscountCalculator = require('../utils/discountCalculator');

describe('DiscountCalculator', () => {
  describe('validateDiscount', () => {
    test('should allow no discount', () => {
      const result = DiscountCalculator.validateDiscount(null, null, 5000);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test('should require both type and value', () => {
      const result1 = DiscountCalculator.validateDiscount('percentage', null, 5000);
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Both discountType and discountValue');

      const result2 = DiscountCalculator.validateDiscount(null, 10, 5000);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Both discountType and discountValue');
    });

    test('should only allow valid discount types', () => {
      const result = DiscountCalculator.validateDiscount('invalid', 10, 5000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be either "percentage" or "fixed"');
    });

    test('should reject negative discount values', () => {
      const result = DiscountCalculator.validateDiscount('fixed', -100, 5000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-negative number');
    });

    test('should reject percentage > 100', () => {
      const result = DiscountCalculator.validateDiscount('percentage', 101, 5000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed 100%');
    });

    test('should reject fixed discount > rent', () => {
      const result = DiscountCalculator.validateDiscount('fixed', 6000, 5000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed rent');
    });

    test('should accept valid percentage discount', () => {
      const result = DiscountCalculator.validateDiscount('percentage', 10, 5000);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test('should accept valid fixed discount', () => {
      const result = DiscountCalculator.validateDiscount('fixed', 500, 5000);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('calculateEffectiveRent', () => {
    test('should return original rent when no discount', () => {
      const result = DiscountCalculator.calculateEffectiveRent(5000, null, null);
      expect(result.effectiveRent).toBe(5000);
      expect(result.discountAmount).toBe(0);
    });

    test('should calculate percentage discount correctly', () => {
      const result = DiscountCalculator.calculateEffectiveRent(5000, 'percentage', 10);
      expect(result.discountAmount).toBe(500);  // 10% of 5000
      expect(result.effectiveRent).toBe(4500);  // 5000 - 500
    });

    test('should floor percentage discount amounts', () => {
      const result = DiscountCalculator.calculateEffectiveRent(5555, 'percentage', 10);
      expect(result.discountAmount).toBe(555);  // floor(555.5)
      expect(result.effectiveRent).toBe(5000);  // 5555 - 555
    });

    test('should calculate fixed discount correctly', () => {
      const result = DiscountCalculator.calculateEffectiveRent(5000, 'fixed', 1000);
      expect(result.discountAmount).toBe(1000);
      expect(result.effectiveRent).toBe(4000);  // 5000 - 1000
    });

    test('should handle 100% discount', () => {
      const result = DiscountCalculator.calculateEffectiveRent(5000, 'percentage', 100);
      expect(result.discountAmount).toBe(5000);
      expect(result.effectiveRent).toBe(0);
    });

    test('should handle discount equal to rent', () => {
      const result = DiscountCalculator.calculateEffectiveRent(5000, 'fixed', 5000);
      expect(result.discountAmount).toBe(5000);
      expect(result.effectiveRent).toBe(0);
    });

    test('should throw error for invalid discount', () => {
      expect(() => {
        DiscountCalculator.calculateEffectiveRent(5000, 'fixed', 6000);
      }).toThrow('cannot exceed rent');
    });
  });

  describe('formatDiscount', () => {
    test('should format no discount', () => {
      const result = DiscountCalculator.formatDiscount(null, null, 0);
      expect(result).toBe('No discount');
    });

    test('should format percentage discount', () => {
      const result = DiscountCalculator.formatDiscount('percentage', 10, 500);
      expect(result).toBe('10% (₹500)');
    });

    test('should format fixed discount', () => {
      const result = DiscountCalculator.formatDiscount('fixed', 500, 500);
      expect(result).toBe('₹500');
    });

    test('should format with Indian number format', () => {
      const result = DiscountCalculator.formatDiscount('percentage', 15, 7500);
      expect(result).toContain('7,500');
    });
  });
});
