/**
 * Tests for Booking Preview API
 */

const request = require('supertest');
const express = require('express');
const bookingPreviewRouter = require('./bookingPreview');
const bookingCalculationService = require('../services/bookingCalculationService');

// Mock the service
jest.mock('../services/bookingCalculationService');

const app = express();
app.use(express.json());
app.use('/api/booking-preview', bookingPreviewRouter);

describe('POST /api/booking-preview/preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should calculate preview with percentage discount', async () => {
    const mockPreview = {
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
      booking_discount_amount: 0,
      total: 3100
    };

    bookingCalculationService.calculateBookingPreview.mockResolvedValueOnce(mockPreview);

    const response = await request(app)
      .post('/api/booking-preview/preview')
      .send({
        products: [
          { id: 1, discountType: 'percentage', discountValue: 10 },
          { id: 2, discountType: null, discountValue: 0 }
        ],
        transport_charge: 200,
        booking_discount_type: null,
        booking_discount_value: 0
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockPreview);
    expect(bookingCalculationService.calculateBookingPreview).toHaveBeenCalledWith({
      products: [
        { id: 1, discountType: 'percentage', discountValue: 10 },
        { id: 2, discountType: null, discountValue: 0 }
      ],
      transport_charge: 200,
      booking_discount_type: null,
      booking_discount_value: 0
    });
  });

  it('should return 400 if products array is empty', async () => {
    bookingCalculationService.calculateBookingPreview.mockRejectedValueOnce(
      new Error('Products array is required and cannot be empty')
    );

    const response = await request(app)
      .post('/api/booking-preview/preview')
      .send({
        products: [],
        transport_charge: 0
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Products array is required and cannot be empty');
  });

  it('should return 404 if product not found', async () => {
    bookingCalculationService.calculateBookingPreview.mockRejectedValueOnce(
      new Error('Product with id 999 not found')
    );

    const response = await request(app)
      .post('/api/booking-preview/preview')
      .send({
        products: [
          { id: 999, discountType: null, discountValue: 0 }
        ],
        transport_charge: 0
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Product with id 999 not found');
  });

  it('should handle service errors gracefully', async () => {
    bookingCalculationService.calculateBookingPreview.mockRejectedValueOnce(
      new Error('Database connection failed')
    );

    const response = await request(app)
      .post('/api/booking-preview/preview')
      .send({
        products: [
          { id: 1, discountType: null, discountValue: 0 }
        ],
        transport_charge: 0
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to calculate preview');
    expect(response.body.details).toBe('Database connection failed');
  });
});
