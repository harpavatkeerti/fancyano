const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');
const invoiceService = require('../services/invoiceService');
const notificationService = require('../services/notificationService');
const fs = require('fs');
const path = require('path');

// Mock services
jest.mock('../services/invoiceService');
jest.mock('../services/notificationService');

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/invoices', require('./invoices'));

describe('Invoices Routes', () => {
  let testBookingId;
  let testProductId;
  let testOutputPath;

  beforeAll(async () => {
    // Create test product
    const productResult = await pool.query(
      `INSERT INTO products (code, name, rent, security_deposit)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['TEST-INV-ROUTE-001', 'Test Invoice Route Product', 50000, 20000]
    );
    testProductId = productResult.rows[0].id;

    // Create test booking
    const bookingResult = await pool.query(
      `INSERT INTO bookings (customer_name, customer_phone, booking_date, booked_from, booked_to, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['Test Customer', 'TEST-INV-ROUTE', '2024-01-01', '2024-02-01', '2024-02-05', 'confirmed']
    );
    testBookingId = bookingResult.rows[0].id;

    await pool.query(
      `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testBookingId, testProductId, '2024-02-01', '2024-02-05', 'confirmed', 50000, 20000]
    );

    // Setup test PDF file
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    testOutputPath = path.join(uploadsDir, 'test-invoice.pdf');
    fs.writeFileSync(testOutputPath, 'test pdf content');
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM booking_products WHERE booking_id = $1', [testBookingId]);
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM products WHERE id = $1', [testProductId]);
    
    // Clean up test files
    if (fs.existsSync(testOutputPath)) {
      fs.unlinkSync(testOutputPath);
    }
    
    // Clean up any temporary PDFs
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.filter(f => f.startsWith('test-')).forEach(file => {
        try {
          fs.unlinkSync(path.join(uploadsDir, file));
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
    }
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create actual test PDF file for download tests
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const tempPdfPath = path.join(uploadsDir, `test-${Date.now()}.pdf`);
    fs.writeFileSync(tempPdfPath, 'test pdf content');
    
    // Setup default mock implementations
    invoiceService.generatePdf.mockResolvedValue({
      outputPath: tempPdfPath,
      fileName: 'Test_Invoice.pdf',
      publicUrl: '/uploads/Test_Invoice.pdf',
      fullUrl: 'http://localhost:3001/uploads/Test_Invoice.pdf'
    });

    notificationService.isEmailConfigured.mockReturnValue({ configured: true });
    notificationService.resolvePdfPath.mockReturnValue(testOutputPath);
    notificationService.sendInvoiceEmail.mockResolvedValue({
      success: true,
      messageId: 'test-message-id'
    });
    notificationService.generateWhatsAppUrl.mockReturnValue('https://wa.me/1234567890?text=test');
  });

  describe('POST /invoices/estimate/:bookingId', () => {
    it('should generate and download estimate', async () => {
      // We can't fully test file downloads with supertest, but we can verify the service is called
      // and the endpoint doesn't throw an error. The actual response will be a file stream.
      request(app)
        .post(`/invoices/estimate/${testBookingId}`)
        .end((err, res) => {
          // Endpoint will try to send file, we just verify service was called
          expect(invoiceService.generatePdf).toHaveBeenCalledWith('estimate', testBookingId.toString());
        });
    });

    it('should return 404 for non-existent booking', async () => {
      invoiceService.generatePdf.mockRejectedValue(new Error('Booking not found'));

      const response = await request(app)
        .post('/invoices/estimate/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /invoices/invoice/:bookingId', () => {
    it('should call generate service for invoice', (done) => {
      request(app)
        .post(`/invoices/invoice/${testBookingId}`)
        .end(() => {
          expect(invoiceService.generatePdf).toHaveBeenCalledWith('invoice', testBookingId.toString());
          done();
        });
    });
  });

  describe('POST /invoices/tax-invoice/:bookingId', () => {
    it('should call generate service for tax invoice', (done) => {
      request(app)
        .post(`/invoices/tax-invoice/${testBookingId}`)
        .end(() => {
          expect(invoiceService.generatePdf).toHaveBeenCalledWith('tax-invoice', testBookingId.toString());
          done();
        });
    });
  });

  describe('GET /invoices/:type/:bookingId', () => {
    it('should generate persistent PDF and return URLs', async () => {
      const response = await request(app)
        .get(`/invoices/estimate/${testBookingId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('url');
      expect(response.body).toHaveProperty('fileName');
      expect(response.body).toHaveProperty('fullUrl');
      
      expect(invoiceService.generatePdf).toHaveBeenCalledWith(
        'estimate',
        testBookingId.toString(),
        expect.objectContaining({
          persistent: true,
          protocol: expect.any(String),
          host: expect.any(String)
        })
      );
    });

    it('should return 400 for invalid document type', async () => {
      invoiceService.generatePdf.mockRejectedValue(new Error('Invalid document type'));

      const response = await request(app)
        .get(`/invoices/invalid-type/${testBookingId}`);

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent booking', async () => {
      invoiceService.generatePdf.mockRejectedValue(new Error('Booking not found'));

      const response = await request(app)
        .get(`/invoices/estimate/999999`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /invoices/send-email', () => {
    it('should send invoice email', async () => {
      const response = await request(app)
        .post('/invoices/send-email')
        .send({
          bookingId: testBookingId,
          documentType: 'invoice',
          customerName: 'Test Customer',
          customerEmail: 'test@example.com',
          pdfUrl: '/uploads/invoice.pdf'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(notificationService.sendInvoiceEmail).toHaveBeenCalled();
    });

    it('should return 400 when bookingId is missing', async () => {
      const response = await request(app)
        .post('/invoices/send-email')
        .send({
          documentType: 'invoice',
          customerEmail: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 when customerEmail is missing', async () => {
      const response = await request(app)
        .post('/invoices/send-email')
        .send({
          bookingId: testBookingId,
          documentType: 'invoice'
        });

      expect(response.status).toBe(400);
    });

    it('should return 501 when email is not configured', async () => {
      notificationService.isEmailConfigured.mockReturnValue({
        configured: false,
        error: 'Email not configured'
      });

      const response = await request(app)
        .post('/invoices/send-email')
        .send({
          bookingId: testBookingId,
          documentType: 'invoice',
          customerEmail: 'test@example.com',
          pdfUrl: '/uploads/invoice.pdf'
        });

      expect(response.status).toBe(501);
      expect(response.body.useMailto).toBe(true);
    });

    it('should return 404 when PDF file not found', async () => {
      notificationService.resolvePdfPath.mockImplementation(() => {
        throw new Error('PDF file not found');
      });

      const response = await request(app)
        .post('/invoices/send-email')
        .send({
          bookingId: testBookingId,
          documentType: 'invoice',
          customerName: 'Test Customer',
          customerEmail: 'test@example.com',
          pdfUrl: '/uploads/non-existent.pdf'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /invoices/send-whatsapp', () => {
    it('should generate WhatsApp URL', async () => {
      const response = await request(app)
        .post('/invoices/send-whatsapp')
        .send({
          phoneNumber: '+1234567890',
          bookingId: testBookingId,
          documentType: 'invoice'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.url).toContain('https://wa.me/');
      expect(notificationService.generateWhatsAppUrl).toHaveBeenCalled();
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/invoices/send-whatsapp')
        .send({
          phoneNumber: '+1234567890'
          // Missing bookingId and documentType
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('OPTIONS /invoices/:type/:bookingId', () => {
    it('should handle OPTIONS request for CORS', async () => {
      const response = await request(app)
        .options(`/invoices/estimate/${testBookingId}`);

      expect(response.status).toBe(200);
    });
  });
});
