const express = require('express');
const pool = require('../database/connection');
const InvoiceGenerator = require('../utils/invoiceGenerator');
const path = require('path');
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

    // Group products by product_id to calculate quantity
    const booking = bookingResult.rows[0];
    if (booking && booking.products) {
      const productMap = new Map();
      booking.products.forEach((product) => {
        if (product.id) {
          const key = product.id;
          if (productMap.has(key)) {
            productMap.get(key).quantity += 1;
          } else {
            productMap.set(key, {
              ...product,
              quantity: 1
            });
          }
        }
      });
      booking.products = Array.from(productMap.values());
    }
    const products = booking.products.filter(p => p.id !== null);

    // Fetch payment transactions
    const transactionsResult = await pool.query(
      `SELECT * FROM payment_transactions 
       WHERE booking_id = $1 
       ORDER BY created_at ASC`,
      [bookingId]
    );
    const transactions = transactionsResult.rows;

    // Fetch payment summary
    const summaryResult = await pool.query(
      `SELECT 
        COUNT(*) as transaction_count,
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_payments,
        SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) as total_refunds,
        SUM(CASE WHEN type = 'adjustment' THEN amount ELSE 0 END) as total_adjustments,
        SUM(CASE 
          WHEN type = 'refund' THEN -amount 
          ELSE amount 
        END) as net_amount
       FROM payment_transactions 
       WHERE booking_id = $1`,
      [bookingId]
    );
    const paymentSummary = summaryResult.rows[0] || {
      transaction_count: 0,
      total_payments: 0,
      total_refunds: 0,
      total_adjustments: 0,
      net_amount: 0
    };

    // Generate PDF
    const fileName = `estimate_${bookingId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../uploads', fileName);
    
    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    await InvoiceGenerator.generateEstimate(booking, products, transactions, paymentSummary, outputPath);

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

    // Group products by product_id to calculate quantity
    const booking = bookingResult.rows[0];
    if (booking && booking.products) {
      const productMap = new Map();
      booking.products.forEach((product) => {
        if (product.id) {
          const key = product.id;
          if (productMap.has(key)) {
            productMap.get(key).quantity += 1;
          } else {
            productMap.set(key, {
              ...product,
              quantity: 1
            });
          }
        }
      });
      booking.products = Array.from(productMap.values());
    }
    const products = booking.products.filter(p => p.id !== null);

    // Fetch payment transactions
    const transactionsResult = await pool.query(
      `SELECT * FROM payment_transactions 
       WHERE booking_id = $1 
       ORDER BY created_at ASC`,
      [bookingId]
    );
    const transactions = transactionsResult.rows;

    // Fetch payment summary
    const summaryResult = await pool.query(
      `SELECT 
        COUNT(*) as transaction_count,
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_payments,
        SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) as total_refunds,
        SUM(CASE WHEN type = 'adjustment' THEN amount ELSE 0 END) as total_adjustments,
        SUM(CASE 
          WHEN type = 'refund' THEN -amount 
          ELSE amount 
        END) as net_amount
       FROM payment_transactions 
       WHERE booking_id = $1`,
      [bookingId]
    );
    const paymentSummary = summaryResult.rows[0] || {
      transaction_count: 0,
      total_payments: 0,
      total_refunds: 0,
      total_adjustments: 0,
      net_amount: 0
    };

    const fileName = `invoice_${bookingId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../uploads', fileName);
    
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    await InvoiceGenerator.generateInvoice(booking, products, transactions, paymentSummary, outputPath);

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

    // Group products by product_id to calculate quantity
    const booking = bookingResult.rows[0];
    if (booking && booking.products) {
      const productMap = new Map();
      booking.products.forEach((product) => {
        if (product.id) {
          const key = product.id;
          if (productMap.has(key)) {
            productMap.get(key).quantity += 1;
          } else {
            productMap.set(key, {
              ...product,
              quantity: 1
            });
          }
        }
      });
      booking.products = Array.from(productMap.values());
    }
    const products = booking.products.filter(p => p.id !== null);

    // Fetch payment transactions
    const transactionsResult = await pool.query(
      `SELECT * FROM payment_transactions 
       WHERE booking_id = $1 
       ORDER BY created_at ASC`,
      [bookingId]
    );
    const transactions = transactionsResult.rows;

    // Fetch payment summary
    const summaryResult = await pool.query(
      `SELECT 
        COUNT(*) as transaction_count,
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_payments,
        SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) as total_refunds,
        SUM(CASE WHEN type = 'adjustment' THEN amount ELSE 0 END) as total_adjustments,
        SUM(CASE 
          WHEN type = 'refund' THEN -amount 
          ELSE amount 
        END) as net_amount
       FROM payment_transactions 
       WHERE booking_id = $1`,
      [bookingId]
    );
    const paymentSummary = summaryResult.rows[0] || {
      transaction_count: 0,
      total_payments: 0,
      total_refunds: 0,
      total_adjustments: 0,
      net_amount: 0
    };

    const fileName = `tax_invoice_${bookingId}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../uploads', fileName);
    
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    await InvoiceGenerator.generateTaxInvoice(booking, products, transactions, paymentSummary, outputPath);

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

// GET endpoint to serve PDFs (for sharing via WhatsApp/Email)
router.get('/:type/:bookingId', async (req, res) => {
  try {
    const { type, bookingId } = req.params;
    
    if (!['estimate', 'invoice', 'tax-invoice'].includes(type)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    // Generate the PDF on-the-fly
    const bookingResult = await pool.query(`
      SELECT b.*, 
        json_agg(json_build_object(
          'id', p.id,
          'name', p.name,
          'code', p.code,
          'rent_per_day', p.rent_per_day,
          'security_deposit', p.security_deposit,
          'image', p.image,
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
    
    // Group products by product_id to calculate quantity
    if (booking && booking.products) {
      const productMap = new Map();
      booking.products.forEach((product) => {
        if (product.id) {
          const key = product.id;
          if (productMap.has(key)) {
            productMap.get(key).quantity += 1;
          } else {
            productMap.set(key, {
              ...product,
              quantity: 1
            });
          }
        }
      });
      booking.products = Array.from(productMap.values());
    }
    const products = booking.products.filter(p => p.id !== null);

    // Fetch payment transactions
    const transactionsResult = await pool.query(
      `SELECT * FROM payment_transactions 
       WHERE booking_id = $1 
       ORDER BY created_at DESC`,
      [bookingId]
    );
    const transactions = transactionsResult.rows;

    // Fetch payment summary
    const summaryResult = await pool.query(
      `SELECT 
        COUNT(*) as transaction_count,
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_payments,
        SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) as total_refunds,
        SUM(CASE WHEN type = 'adjustment' THEN amount ELSE 0 END) as total_adjustments,
        SUM(CASE 
          WHEN type = 'refund' THEN -amount 
          ELSE amount 
        END) as net_amount
       FROM payment_transactions 
       WHERE booking_id = $1`,
      [bookingId]
    );
    const paymentSummary = summaryResult.rows[0] || {
      transaction_count: 0,
      total_payments: 0,
      total_refunds: 0,
      total_adjustments: 0,
      net_amount: 0
    };

    // Generate PDF - save to uploads directory for public access
    const documentName = type === 'estimate' ? 'Estimate' : type === 'invoice' ? 'Invoice' : 'TaxInvoice';
    const timestamp = Date.now();
    const fileName = `${documentName}_${bookingId}_${timestamp}.pdf`;
    const outputPath = path.join(__dirname, '../../storage/uploads', fileName);
    
    const uploadsDir = path.join(__dirname, '../../storage/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    if (type === 'estimate') {
      await InvoiceGenerator.generateEstimate(booking, products, transactions, paymentSummary, outputPath);
    } else if (type === 'invoice') {
      await InvoiceGenerator.generateInvoice(booking, products, transactions, paymentSummary, outputPath);
    } else if (type === 'tax-invoice') {
      await InvoiceGenerator.generateTaxInvoice(booking, products, transactions, paymentSummary, outputPath);
    }

    // Return the public URL to the PDF file (served via /uploads static route)
    // The file will be accessible at: http://YOUR_SERVER_IP:3001/uploads/filename.pdf
    const publicUrl = `/uploads/${fileName}`;
    
    // Construct full URL - use the request host or try to get from environment
    const host = req.get('host') || 'localhost:3001';
    const protocol = req.protocol || 'http';
    const fullUrl = `${protocol}://${host}${publicUrl}`;
    
    // Set headers for proper mobile download and CORS
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Return the public URL
    res.json({ 
      success: true, 
      url: publicUrl,
      fileName: `${documentName}_${bookingId}.pdf`,
      fullUrl: fullUrl
    });
  } catch (error) {
    console.error(`Error generating ${req.params.type}:`, error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: `Failed to generate ${req.params.type}`,
      details: error.message 
    });
  }
});

// Send Invoice via Email (with PDF attachment)
// Note: Requires nodemailer package and SMTP configuration
router.post('/send-email', async (req, res) => {
  try {
    const { bookingId, documentType, customerName, customerEmail, pdfUrl } = req.body;
    
    if (!bookingId || !documentType) {
      return res.status(400).json({ error: 'Booking ID and document type are required' });
    }

    // Check if nodemailer is available (optional dependency)
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      // nodemailer not installed, return error to use mailto fallback
      return res.status(501).json({ 
        error: 'Email service not configured. Install nodemailer package and configure SMTP settings.',
        useMailto: true 
      });
    }

    // Email configuration from environment variables
    const smtpUser = (process.env.SMTP_USER || '').trim();
    const smtpPass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, ''); // Remove all spaces from password
    
    const emailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    };

    // Check if email is configured (not placeholder)
    if (!emailConfig.auth.user || !emailConfig.auth.pass || 
        emailConfig.auth.user === 'your-email@gmail.com' || 
        emailConfig.auth.user.includes('your-email')) {
      return res.status(501).json({ 
        error: 'Email service not configured. Please update SMTP_USER in .env file with your actual email address (currently set to placeholder).',
        useMailto: true 
      });
    }

    if (!customerEmail) {
      return res.status(400).json({ 
        error: 'Customer email address is required to send email.',
        useMailto: true 
      });
    }

    // Create transporter
    const transporter = nodemailer.createTransport(emailConfig);

    // Fetch PDF file - extract filename from URL
    // pdfUrl might be a full URL like http://localhost:3001/uploads/Invoice_84_1234567890.pdf
    // or just a path like /uploads/Invoice_84_1234567890.pdf
    let pdfFileName = path.basename(pdfUrl);
    // Remove query parameters if any
    pdfFileName = pdfFileName.split('?')[0];
    
    const pdfPath = path.join(__dirname, '../../storage/uploads', pdfFileName);
    
    console.log('Looking for PDF at:', pdfPath);
    console.log('PDF file exists?', fs.existsSync(pdfPath));
    
    if (!fs.existsSync(pdfPath)) {
      // Try alternative path
      const altPath = path.join(__dirname, '../../uploads', pdfFileName);
      console.log('Trying alternative path:', altPath);
      
      if (fs.existsSync(altPath)) {
        // Use alternative path
        const documentName = documentType === 'estimate' ? 'Estimate' : documentType === 'invoice' ? 'Invoice' : 'Tax Invoice';
        
        const mailOptions = {
          from: `"Fancyano" <${emailConfig.auth.user}>`,
          to: customerEmail,
          subject: `${documentName} for Booking #${bookingId}`,
          text: `Hi ${customerName},\n\nPlease find your ${documentName} for booking #${bookingId} attached.\n\nThank you!`,
          html: `
            <div style="font-family: Arial, sans-serif;">
              <p>Hi ${customerName},</p>
              <p>Please find your ${documentName} for booking #${bookingId} attached.</p>
              <p>Thank you!</p>
            </div>
          `,
          attachments: [
            {
              filename: `${documentName}_${bookingId}.pdf`,
              path: altPath
            }
          ]
        };

        const info = await transporter.sendMail(mailOptions);
        
        return res.json({ 
          success: true, 
          messageId: info.messageId,
          message: 'Email sent successfully with PDF attachment'
        });
      }
      
      return res.status(404).json({ 
        error: `PDF file not found at ${pdfPath}. Please generate the document first.`,
        useMailto: true 
      });
    }

    const documentName = documentType === 'estimate' ? 'Estimate' : documentType === 'invoice' ? 'Invoice' : 'Tax Invoice';
    
    // Email options
    const mailOptions = {
      from: `"Fancyano" <${emailConfig.auth.user}>`,
      to: customerEmail,
      subject: `${documentName} for Booking #${bookingId}`,
      text: `Hi ${customerName},\n\nPlease find your ${documentName} for booking #${bookingId} attached.\n\nThank you!`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <p>Hi ${customerName},</p>
          <p>Please find your ${documentName} for booking #${bookingId} attached.</p>
          <p>Thank you!</p>
        </div>
      `,
      attachments: [
        {
          filename: `${documentName}_${bookingId}.pdf`,
          path: pdfPath
        }
      ]
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      messageId: info.messageId,
      message: 'Email sent successfully with PDF attachment'
    });
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

