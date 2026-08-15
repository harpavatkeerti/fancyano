const invoiceService = require('./invoiceService');
const pool = require('../database/connection');
const InvoiceGenerator = require('../utils/invoiceGenerator');
const fs = require('fs');
const path = require('path');

// Mock InvoiceGenerator
jest.mock('../utils/invoiceGenerator');

describe('InvoiceService', () => {
  let testBookingId;
  let testProductId;

  beforeAll(async () => {
    // Setup mocks
    InvoiceGenerator.generateEstimate.mockResolvedValue(true);
    InvoiceGenerator.generateInvoice.mockResolvedValue(true);
    InvoiceGenerator.generateTaxInvoice.mockResolvedValue(true);

    // Create test product
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['TEST-INV-001', 'Test Invoice Product', 50000, 20000]
    );
    testProductId = productResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
  });

  afterEach(async () => {
    // Cleanup after each test
    await pool.query('DELETE FROM payment_transactions WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    testBookingId = null;
    
    // Clean up generated PDFs
    const uploadsDir = path.join(__dirname, '../../uploads');
    const storageDir = path.join(__dirname, '../../storage/uploads');
    [uploadsDir, storageDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.filter(f => f.includes('TEST-INV')).forEach(file => {
          fs.unlinkSync(path.join(dir, file));
        });
      }
    });
  });

  beforeEach(async () => {
    // Create test booking with product
    const bookingResult = await pool.query(
      `INSERT INTO bookings (user_id, booking_date, booked_from, booked_to, status, transport_charge)
       VALUES (1, $1, $2, $3, $4, $5)
       RETURNING id`,
      ['2024-01-01', '2024-02-01', '2024-02-05', 'confirmed', 5000]
    );
    testBookingId = bookingResult.rows[0].id;

    await pool.query(
      `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testBookingId, testProductId, '2024-02-01', '2024-02-05', 'confirmed', 50000, 20000]
    );
  });

  describe('getInvoiceData', () => {
    it('should fetch complete invoice data', async () => {
      const data = await invoiceService.getInvoiceData(testBookingId);
      
      expect(data).toHaveProperty('booking');
      expect(data).toHaveProperty('products');
      expect(data).toHaveProperty('transactions');
      expect(data).toHaveProperty('paymentSummary');
      
      expect(data.booking.id).toBe(testBookingId);
      expect(data.products).toHaveLength(1);
      expect(data.products[0]).toHaveProperty('booking_product_id');
    });

    it('should include size in invoice product data', async () => {
      // Create a booking with a sized product
      await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit, size)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testBookingId, testProductId, '2024-02-01', '2024-02-05', 'confirmed', 50000, 20000, '42']
      );

      const data = await invoiceService.getInvoiceData(testBookingId);
      expect(data.products).toHaveLength(1);
      expect(data.products[0]).toHaveProperty('size');
      expect(data.products[0].size).toBe('42');
    });


    it('should throw error for non-existent booking', async () => {
      await expect(invoiceService.getInvoiceData(999999))
        .rejects
        .toThrow('Booking not found');
    });
  });

  describe('getPaymentTransactions', () => {
    it('should return empty array when no transactions exist', async () => {
      const transactions = await invoiceService.getPaymentTransactions(testBookingId);
      
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions).toHaveLength(0);
    });

    it('should return transactions ordered by created_at', async () => {
      // Add test transactions
      await pool.query(
        `INSERT INTO payment_transactions (booking_id, amount, type, method, recorded_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [testBookingId, 10000, 'payment', 'cash', 'test-user']
      );
      
      await pool.query(
        `INSERT INTO payment_transactions (booking_id, amount, type, method, recorded_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [testBookingId, 5000, 'payment', 'upi', 'test-user']
      );

      const transactions = await invoiceService.getPaymentTransactions(testBookingId);
      
      expect(transactions).toHaveLength(2);
      expect(new Date(transactions[0].transaction_date).getTime())
        .toBeLessThanOrEqual(new Date(transactions[1].transaction_date).getTime());
    });
  });

  describe('getPaymentSummary', () => {
    it('should return default values when no transactions exist', async () => {
      const summary = await invoiceService.getPaymentSummary(testBookingId);
      
      expect(summary).toEqual({
        transaction_count: '0',
        total_payments: null,
        total_refunds: null,
        total_adjustments: null,
        net_amount: null
      });
    });

    it('should calculate payment summary correctly', async () => {
      await pool.query(
        `INSERT INTO payment_transactions (booking_id, amount, type, method, recorded_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [testBookingId, 10000, 'payment', 'cash', 'test-user']
      );
      
      await pool.query(
        `INSERT INTO payment_transactions (booking_id, amount, type, method, recorded_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [testBookingId, 3000, 'refund', 'cash', 'test-user']
      );

      const summary = await invoiceService.getPaymentSummary(testBookingId);
      
      expect(parseInt(summary.total_payments)).toBe(10000);
      expect(parseInt(summary.total_refunds)).toBe(3000);
      expect(parseInt(summary.net_amount)).toBe(7000); // 10000 - 3000
    });
  });

  describe('generatePdf', () => {
    it('should generate PDF for temporary download', async () => {
      const result = await invoiceService.generatePdf('estimate', testBookingId);
      
      expect(result).toHaveProperty('outputPath');
      expect(result).toHaveProperty('fileName');
      expect(result.outputPath).toContain('uploads');
      expect(result.fileName).toContain('Estimate');
      expect(InvoiceGenerator.generateEstimate).toHaveBeenCalled();
    });

    it('should generate PDF for persistent storage with URLs', async () => {
      const result = await invoiceService.generatePdf('invoice', testBookingId, {
        persistent: true,
        protocol: 'http',
        host: 'localhost:3001'
      });
      
      expect(result).toHaveProperty('outputPath');
      expect(result).toHaveProperty('fileName');
      expect(result).toHaveProperty('publicUrl');
      expect(result).toHaveProperty('fullUrl');
      expect(result.outputPath).toContain('storage/uploads');
      expect(result.publicUrl).toContain('/uploads/');
      expect(result.fullUrl).toContain('http://localhost:3001');
      expect(InvoiceGenerator.generateInvoice).toHaveBeenCalled();
    });

    it('should generate tax invoice', async () => {
      const result = await invoiceService.generatePdf('tax-invoice', testBookingId);
      
      expect(result.fileName).toContain('TaxInvoice');
      expect(InvoiceGenerator.generateTaxInvoice).toHaveBeenCalled();
    });

    it('should throw error for invalid document type', async () => {
      await expect(invoiceService.generatePdf('invalid-type', testBookingId))
        .rejects
        .toThrow('Invalid document type');
    });

    it('should throw error for non-existent booking', async () => {
      await expect(invoiceService.generatePdf('estimate', 999999))
        .rejects
        .toThrow('Booking not found');
    });
  });
});
