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

    test('should calculate percentage discount using tax-inclusive formula', () => {
      // 10% on 5000: floor(5000 / 1.10) = floor(4545.45) = 4545, discount = 455
      const result = DiscountCalculator.calculateEffectiveRent(5000, 'percentage', 10);
      expect(result.effectiveRent).toBe(4545);
      expect(result.discountAmount).toBe(455);
    });

    test('0% discount should return original rent', () => {
      const result = DiscountCalculator.calculateEffectiveRent(10000, 'percentage', 0);
      expect(result.effectiveRent).toBe(10000);
      expect(result.discountAmount).toBe(0);
    });

    test('10% on ₹10,000 → effectiveRent = 9091, discount = 909', () => {
      // floor(10000 / 1.10) = floor(9090.909) = 9090, discount = 910
      const result = DiscountCalculator.calculateEffectiveRent(10000, 'percentage', 10);
      expect(result.effectiveRent).toBe(9090);
      expect(result.discountAmount).toBe(910);
    });

    test('50% on ₹10,000 → effectiveRent = 6666, discount = 3334', () => {
      // floor(10000 / 1.50) = floor(6666.67) = 6666, discount = 3334
      const result = DiscountCalculator.calculateEffectiveRent(10000, 'percentage', 50);
      expect(result.effectiveRent).toBe(6666);
      expect(result.discountAmount).toBe(3334);
    });

    test('100% on ₹10,000 → effectiveRent = 5000, discount = 5000', () => {
      // floor(10000 / 2.00) = 5000, discount = 5000
      const result = DiscountCalculator.calculateEffectiveRent(10000, 'percentage', 100);
      expect(result.effectiveRent).toBe(5000);
      expect(result.discountAmount).toBe(5000);
    });

    test('small rent values with rounding (₹100, 15%)', () => {
      // floor(100 / 1.15) = floor(86.956) = 86, discount = 14
      const result = DiscountCalculator.calculateEffectiveRent(100, 'percentage', 15);
      expect(result.effectiveRent).toBe(86);
      expect(result.discountAmount).toBe(14);
    });

    test('should floor percentage discount amounts', () => {
      // 10% on 5555: floor(5555 / 1.10) = floor(5050.0) = 5050, discount = 505
      const result = DiscountCalculator.calculateEffectiveRent(5555, 'percentage', 10);
      expect(result.effectiveRent).toBe(5050);
      expect(result.discountAmount).toBe(505);
    });

    test('should calculate fixed discount correctly', () => {
      const result = DiscountCalculator.calculateEffectiveRent(5000, 'fixed', 1000);
      expect(result.discountAmount).toBe(1000);
      expect(result.effectiveRent).toBe(4000);  // 5000 - 1000
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
