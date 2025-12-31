const express = require('express');
const pool = require('../database/connection');
const InvoiceGenerator = require('../utils/invoiceGenerator');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Generate Estimate
router.post('/estimate/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // Fetch booking with products
    const bookingResult = await pool.query(`
      SELECT b.*, 
        json_agg(json_build_object(
          'id', p.id,
          'name', p.name,
          'code', p.code,
          'rent_per_day', p.rent_per_day,
          'booked_from', COALESCE(bp.booked_from, b.booked_from),
          'booked_to', COALESCE(bp.booked_to, b.booked_to)
        )) as products
      FROM bookings b
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      WHERE b.id = $1
      GROUP BY b.id
    `, [bookingId]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    const products = booking.products.filter(p => p.id !== null);

    // Generate PDF
    const fileName = `estimate_${bookingId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../uploads', fileName);
    
    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    await InvoiceGenerator.generateEstimate(booking, products, outputPath);

    // Send file
    res.download(outputPath, `Estimate_${bookingId}.pdf`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Delete file after sending
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    console.error('Error generating estimate:', error);
    res.status(500).json({ error: 'Failed to generate estimate' });
  }
});

// Generate Invoice
router.post('/invoice/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const bookingResult = await pool.query(`
      SELECT b.*, 
        json_agg(json_build_object(
          'id', p.id,
          'name', p.name,
          'code', p.code,
          'rent_per_day', p.rent_per_day
        )) as products
      FROM bookings b
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      WHERE b.id = $1
      GROUP BY b.id
    `, [bookingId]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    const products = booking.products.filter(p => p.id !== null);

    const fileName = `invoice_${bookingId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../uploads', fileName);
    
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    await InvoiceGenerator.generateInvoice(booking, products, outputPath);

    res.download(outputPath, `Invoice_${bookingId}.pdf`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// Generate Tax Invoice
router.post('/tax-invoice/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const bookingResult = await pool.query(`
      SELECT b.*, 
        json_agg(json_build_object(
          'id', p.id,
          'name', p.name,
          'code', p.code,
          'rent_per_day', p.rent_per_day
        )) as products
      FROM bookings b
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      WHERE b.id = $1
      GROUP BY b.id
    `, [bookingId]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    const products = booking.products.filter(p => p.id !== null);

    const fileName = `tax_invoice_${bookingId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../uploads', fileName);
    
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    await InvoiceGenerator.generateTaxInvoice(booking, products, outputPath);

    res.download(outputPath, `TaxInvoice_${bookingId}.pdf`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    console.error('Error generating tax invoice:', error);
    res.status(500).json({ error: 'Failed to generate tax invoice' });
  }
});

// Send Invoice via WhatsApp
router.post('/send-whatsapp', async (req, res) => {
  try {
    const { phoneNumber, bookingId, documentType } = req.body;
    
    // Format: Use WhatsApp API URL
    const message = `Your ${documentType} for booking #${bookingId} is ready. Download: ${process.env.APP_URL}/api/invoices/${documentType}/${bookingId}`;
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    res.json({ success: true, url: whatsappUrl });
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    res.status(500).json({ error: 'Failed to send WhatsApp message' });
  }
});

module.exports = router;

