const express = require('express');
const invoiceService = require('../services/invoiceService');
const notificationService = require('../services/notificationService');
const fs = require('fs');

const router = express.Router();

// Handle OPTIONS request for CORS
router.options('/:type/:bookingId', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// Generate Estimate
router.post('/estimate/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const { outputPath, fileName } = await invoiceService.generatePdf('estimate', bookingId);

    // Send file and delete after
    res.download(outputPath, fileName, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error generating estimate:', error);
    res.status(500).json({ error: 'Failed to generate estimate' });
  }
});

// Generate Invoice
router.post('/invoice/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const { outputPath, fileName } = await invoiceService.generatePdf('invoice', bookingId);

    res.download(outputPath, fileName, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// Generate Tax Invoice
router.post('/tax-invoice/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const { outputPath, fileName } = await invoiceService.generatePdf('tax-invoice', bookingId);

    res.download(outputPath, fileName, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    console.error('Error generating tax invoice:', error);
    res.status(500).json({ error: 'Failed to generate tax invoice' });
  }
});

// GET endpoint to serve PDFs (for sharing via WhatsApp/Email)
router.get('/:type/:bookingId', async (req, res) => {
  try {
    const { type, bookingId } = req.params;
    
    const { fileName, publicUrl, fullUrl } = await invoiceService.generatePdf(
      type,
      bookingId,
      {
        persistent: true,
        protocol: req.protocol || 'http',
        host: req.get('host') || 'localhost:3001'
      }
    );
    
    // Set headers for proper mobile download and CORS
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Return the public URL
    res.json({ 
      success: true, 
      url: publicUrl,
      fileName,
      fullUrl
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message === 'Invalid document type') {
      return res.status(400).json({ error: error.message });
    }
    console.error(`Error generating ${req.params.type}:`, error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: `Failed to generate ${req.params.type}`,
      details: error.message 
    });
  }
});

// Send Invoice via Email (with PDF attachment)
router.post('/send-email', async (req, res) => {
  try {
    const { bookingId, documentType, customerName, customerEmail, pdfUrl } = req.body;
    
    if (!bookingId || !documentType) {
      return res.status(400).json({ error: 'Booking ID and document type are required' });
    }

    // Check if nodemailer is available
    try {
      require('nodemailer');
    } catch (e) {
      return res.status(501).json({ 
        error: 'Email service not configured. Install nodemailer package and configure SMTP settings.',
        useMailto: true 
      });
    }

    // Check if email is configured
    const emailCheck = notificationService.isEmailConfigured();
    if (!emailCheck.configured) {
      return res.status(501).json({ 
        error: emailCheck.error,
        useMailto: true 
      });
    }

    if (!customerEmail) {
      return res.status(400).json({ 
        error: 'Customer email address is required to send email.',
        useMailto: true 
      });
    }

    // Resolve PDF path
    let pdfPath;
    try {
      pdfPath = notificationService.resolvePdfPath(pdfUrl);
    } catch (error) {
      return res.status(404).json({ 
        error: error.message,
        useMailto: true 
      });
    }

    // Send email
    const result = await notificationService.sendInvoiceEmail({
      bookingId,
      documentType,
      customerName,
      customerEmail,
      pdfPath
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message,
      useMailto: true 
    });
  }
});

// Send Invoice via WhatsApp
router.post('/send-whatsapp', async (req, res) => {
  try {
    const { phoneNumber, bookingId, documentType } = req.body;
    
    if (!phoneNumber || !bookingId || !documentType) {
      return res.status(400).json({ error: 'Phone number, booking ID, and document type are required' });
    }
    
    const whatsappUrl = notificationService.generateWhatsAppUrl({
      phoneNumber,
      bookingId,
      documentType
    });
    
    res.json({ success: true, url: whatsappUrl });
  } catch (error) {
    console.error('Error generating WhatsApp URL:', error);
    res.status(500).json({ error: 'Failed to generate WhatsApp message' });
  }
});

// Generate Transaction Receipt PDF (POST returns blob for preview)
router.post('/receipt/:bookingId/:transactionId', async (req, res) => {
  try {
    const { bookingId, transactionId } = req.params;
    
    const { outputPath, fileName } = await invoiceService.generateReceiptPdf(bookingId, transactionId);

    res.download(outputPath, fileName, (err) => {
      if (err) {
        console.error('Error sending receipt file:', err);
      }
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message === 'Transaction not found') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    console.error('Error generating receipt:', error);
    res.status(500).json({ error: 'Failed to generate receipt', details: error.message });
  }
});

// GET Transaction Receipt public URL (for WhatsApp sharing)
router.get('/receipt/:bookingId/:transactionId', async (req, res) => {
  try {
    const { bookingId, transactionId } = req.params;
    
    const { fileName, publicUrl, fullUrl } = await invoiceService.generateReceiptPdf(
      bookingId,
      transactionId,
      {
        persistent: true,
        protocol: req.protocol || 'http',
        host: req.get('host') || 'localhost:3001'
      }
    );
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    res.json({ 
      success: true, 
      url: publicUrl,
      fileName,
      fullUrl
    });
  } catch (error) {
    if (error.message === 'Booking not found') {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (error.message === 'Transaction not found') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    console.error('Error generating receipt URL:', error);
    res.status(500).json({ error: 'Failed to generate receipt', details: error.message });
  }
});

module.exports = router;

