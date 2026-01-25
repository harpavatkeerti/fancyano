const notificationService = require('./notificationService');
const path = require('path');
const fs = require('fs');

describe('NotificationService', () => {
  describe('isEmailConfigured', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return false when SMTP credentials are missing', () => {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      const result = notificationService.isEmailConfigured();
      
      expect(result.configured).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('should return false when SMTP_USER is placeholder', () => {
      process.env.SMTP_USER = 'your-email@gmail.com';
      process.env.SMTP_PASS = 'password';

      const result = notificationService.isEmailConfigured();
      
      expect(result.configured).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('should return true when properly configured', () => {
      process.env.SMTP_USER = 'real-email@gmail.com';
      process.env.SMTP_PASS = 'real-password';

      const result = notificationService.isEmailConfigured();
      
      expect(result.configured).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('generateWhatsAppUrl', () => {
    it('should generate correct WhatsApp URL', () => {
      const url = notificationService.generateWhatsAppUrl({
        phoneNumber: '+1234567890',
        bookingId: 123,
        documentType: 'invoice'
      });
      
      expect(url).toContain('https://wa.me/');
      expect(url).toContain('+1234567890');
      expect(url).toContain('booking%20%23123'); // URL encoded
      expect(url).toContain('invoice');
    });

    it('should encode message properly', () => {
      const url = notificationService.generateWhatsAppUrl({
        phoneNumber: '1234567890',
        bookingId: 456,
        documentType: 'estimate'
      });
      
      expect(url).toContain('text=');
      expect(url).not.toContain(' '); // Spaces should be encoded
    });
  });

  describe('resolvePdfPath', () => {
    let testPdfPath;

    beforeEach(() => {
      // Create a test PDF file in storage/uploads
      const storageDir = path.join(__dirname, '../../storage/uploads');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      testPdfPath = path.join(storageDir, 'test-invoice-123.pdf');
      fs.writeFileSync(testPdfPath, 'test content');
    });

    afterEach(() => {
      // Clean up test file
      if (fs.existsSync(testPdfPath)) {
        fs.unlinkSync(testPdfPath);
      }
    });

    it('should resolve PDF path from filename', () => {
      const resolvedPath = notificationService.resolvePdfPath('test-invoice-123.pdf');
      
      expect(resolvedPath).toBe(testPdfPath);
      expect(fs.existsSync(resolvedPath)).toBe(true);
    });

    it('should resolve PDF path from URL', () => {
      const resolvedPath = notificationService.resolvePdfPath('/uploads/test-invoice-123.pdf');
      
      expect(resolvedPath).toBe(testPdfPath);
    });

    it('should resolve PDF path from full URL with query params', () => {
      const resolvedPath = notificationService.resolvePdfPath('http://localhost:3001/uploads/test-invoice-123.pdf?v=1');
      
      expect(resolvedPath).toBe(testPdfPath);
    });

    it('should throw error when PDF not found', () => {
      expect(() => {
        notificationService.resolvePdfPath('non-existent-file.pdf');
      }).toThrow('PDF file not found');
    });

    it('should check alternative path', () => {
      // Remove from storage and create in uploads
      fs.unlinkSync(testPdfPath);
      
      const altDir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(altDir)) {
        fs.mkdirSync(altDir, { recursive: true });
      }
      const altPath = path.join(altDir, 'test-invoice-123.pdf');
      fs.writeFileSync(altPath, 'test content');

      const resolvedPath = notificationService.resolvePdfPath('test-invoice-123.pdf');
      
      expect(resolvedPath).toBe(altPath);
      
      // Cleanup
      fs.unlinkSync(altPath);
    });
  });

  describe('sendInvoiceEmail', () => {
    it('should throw error when customer email is missing', async () => {
      await expect(notificationService.sendInvoiceEmail({
        bookingId: 123,
        documentType: 'invoice',
        customerName: 'Test Customer',
        customerEmail: '',
        pdfPath: '/test/path.pdf'
      })).rejects.toThrow('Customer email address is required');
    });

    // Note: Actual email sending tests would require mocking nodemailer
    // which is beyond the scope of this unit test
  });
});
