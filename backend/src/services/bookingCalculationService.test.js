/**
 * Tests for Booking Calculation Service
 */

const bookingCalculationService = require('./bookingCalculationService');
const pool = require('../database/connection');
const discountCalculator = require('../utils/discountCalculator');

// Mock dependencies
jest.mock('../database/connection');
jest.mock('../utils/discountCalculator');

describe('BookingCalculationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchProductDetails', () => {
    it('should fetch and map product details', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Sherwani', code: 'SH-001', rent: 1000, security_deposit: 500 },
          { id: 2, name: 'Lehenga', code: 'LH-001', rent: 2000, security_deposit: 1000 }
        ]
      });

      const result = await bookingCalculationService.fetchProductDetails([1, 2]);

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT id, name, code, rent, security_deposit, rent_overrides FROM products WHERE id = ANY($1)',
        [[1, 2]]
      );
      expect(result).toEqual({
        1: { id: 1, name: 'Sherwani', code: 'SH-001', rent: 1000, security_deposit: 500 },
        2: { id: 2, name: 'Lehenga', code: 'LH-001', rent: 2000, security_deposit: 1000 }
      });
    });
  });

  describe('calculateProductDiscounts', () => {
    it('should calculate discounts for all products', () => {
      const products = [
        { id: 1, discountType: 'percentage', discountValue: 10 },
        { id: 2, discountType: null, discountValue: 0 }
      ];

      const productMap = {
        1: { id: 1, name: 'Sherwani', code: 'SH-001', rent: 1000, security_deposit: 500 },
        2: { id: 2, name: 'Lehenga', code: 'LH-001', rent: 2000, security_deposit: 1000 }
      };

      discountCalculator.calculateEffectiveRent
        .mockReturnValueOnce({ effectiveRent: 900, discountAmount: 100 })
        .mockReturnValueOnce({ effectiveRent: 2000, discountAmount: 0 });

      const result = bookingCalculationService.calculateProductDiscounts(products, productMap);

      expect(result.calculatedProducts).toEqual([
        {
          id: 1,
          name: 'Sherwani',
          code: 'SH-001',
          rent: 1000,
          effective_rent: 900,
          discount_amount: 100,
          discount_type: 'percentage',
          security_deposit: 500
        },
        {
          id: 2,
          name: 'Lehenga',
          code: 'LH-001',
          rent: 2000,
          effective_rent: 2000,
          discount_amount: 0,
          discount_type: null,
          security_deposit: 1000
        }
      ]);
      expect(result.subtotal).toBe(2900);
    });

    it('should throw error if product not found', () => {
      const products = [{ id: 999, discountType: null, discountValue: 0 }];
      const productMap = {};

      expect(() => {
        bookingCalculationService.calculateProductDiscounts(products, productMap);
      }).toThrow('Product with id 999 not found');
    });
  });

  describe('calculateBookingDiscount', () => {
    it('should calculate percentage discount (inclusive formula)', () => {
      const result = bookingCalculationService.calculateBookingDiscount(
        1000,
        'percentage',
        10
      );
      // Inclusive: 1000 - floor(1000 / 1.1) = 1000 - 909 = 91
      expect(result).toBe(91);
    });

    it('should calculate fixed amount discount', () => {
      const result = bookingCalculationService.calculateBookingDiscount(
        1000,
        'amount',
        200
      );
      expect(result).toBe(200);
    });

    it('should cap fixed discount at subtotal', () => {
      const result = bookingCalculationService.calculateBookingDiscount(
        1000,
        'amount',
        1500
      );
      expect(result).toBe(1000); // Can't discount more than subtotal
    });

    it('should return 0 for null discount type', () => {
      const result = bookingCalculationService.calculateBookingDiscount(
        1000,
        null,
        10
      );
      expect(result).toBe(0);
    });

    it('should return 0 for 0 discount value', () => {
      const result = bookingCalculationService.calculateBookingDiscount(
        1000,
        'percentage',
        0
      );
      expect(result).toBe(0);
    });
  });

  describe('calculateBookingPreview', () => {
    it('should calculate complete booking preview', async () => {
      const bookingData = {
        products: [
          { id: 1, discountType: 'percentage', discountValue: 10 },
          { id: 2, discountType: null, discountValue: 0 }
        ],
        transport_charge: 200,
        booking_discount_type: 'percentage',
        booking_discount_value: 5
      };

      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Sherwani', code: 'SH-001', rent: 1000, security_deposit: 500 },
          { id: 2, name: 'Lehenga', code: 'LH-001', rent: 2000, security_deposit: 1000 }
        ]
      });

      discountCalculator.calculateEffectiveRent
        .mockReturnValueOnce({ effectiveRent: 900, discountAmount: 100 })
        .mockReturnValueOnce({ effectiveRent: 2000, discountAmount: 0 });

      const result = await bookingCalculationService.calculateBookingPreview(bookingData);

      expect(result).toEqual({
        products: [
          {
            id: 1,
            name: 'Sherwani',
            code: 'SH-001',
            rent: 1000,
            effective_rent: 900,
            discount_amount: 100,
            discount_type: 'percentage',
            security_deposit: 500
          },
          {
            id: 2,
            name: 'Lehenga',
            code: 'LH-001',
            rent: 2000,
            effective_rent: 2000,
            discount_amount: 0,
            discount_type: null,
            security_deposit: 1000
          }
        ],
        subtotal: 2900,
        transport_charge: 200,
        booking_discount_amount: 139, // inclusive 5% of 2900: 2900 - floor(2900/1.05) = 2900 - 2761 = 139
        total: 2961 // 2900 + 200 - 139
      });
    });

    it('should throw error for empty products array', async () => {
      await expect(
        bookingCalculationService.calculateBookingPreview({ products: [] })
      ).rejects.toThrow('Products array is required and cannot be empty');
    });

    it('should throw error for missing products array', async () => {
      await expect(
        bookingCalculationService.calculateBookingPreview({})
      ).rejects.toThrow('Products array is required and cannot be empty');
    });

    it('should handle product not found error', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        bookingCalculationService.calculateBookingPreview({
          products: [{ id: 999, discountType: null, discountValue: 0 }]
        })
      ).rejects.toThrow('Product with id 999 not found');
    });
  });
});
