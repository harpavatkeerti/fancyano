const pool = require('../database/connection');
const InvoiceGenerator = require('../utils/invoiceGenerator');
const path = require('path');
const fs = require('fs');

/**
 * InvoiceService - Manages invoice data fetching and PDF generation
 */
class InvoiceService {
  /**
   * Get booking data with products for invoice generation
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Object>} - Booking with products
   */
  async getBookingForInvoice(bookingId) {
    const bookingResult = await pool.query(`
      SELECT b.*, 
        u.name AS customer_name,
        u.phone AS customer_phone,
        u.alternate_phone AS alternate_phone,
        u.address AS customer_address,
        json_agg(json_build_object(
          'id', p.id,
          'booking_product_id', bp.id,
          'name', p.name,
          'code', p.code,
          'rent', p.rent,
          'security_deposit', p.security_deposit,
          'image', p.image,
          'booked_from', bp.booked_from,
          'booked_to', bp.booked_to,
          'status', bp.status,
          'rent', bp.rent,
          'security_deposit', bp.security_deposit,
          'size', bp.size
        )) as products
      FROM bookings b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN booking_products bp ON b.id = bp.booking_id
      LEFT JOIN products p ON bp.product_id = p.id
      WHERE b.id = $1
      GROUP BY b.id, u.id
    `, [bookingId]);

    if (bookingResult.rows.length === 0) {
      throw new Error('Booking not found');
    }

    const booking = bookingResult.rows[0];
    
    // Filter out null products (in case booking has no products)
    const products = booking.products.filter(p => p.id !== null);

    return {
      booking,
      products
    };
  }

  /**
   * Get all payment transactions
   * @returns {Promise<Array>} - All payment transactions
   */
  async getAllTransactions() {
    const result = await pool.query(
      `SELECT *, transaction_date as created_at FROM payment_transactions ORDER BY transaction_date DESC`
    );
    return result.rows;
  }

  /**
   * Get payment transactions for a booking
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Array>} - Payment transactions
   */
  async getPaymentTransactions(bookingId) {
    const transactionsResult = await pool.query(
      `SELECT *, transaction_date as created_at FROM payment_transactions 
       WHERE booking_id = $1 
       ORDER BY transaction_date ASC`,
      [bookingId]
    );

    return transactionsResult.rows;
  }

  /**
   * Get payment summary for a booking
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Object>} - Payment summary
   */
  async getPaymentSummary(bookingId) {
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

    return summaryResult.rows[0] || {
      transaction_count: 0,
      total_payments: 0,
      total_refunds: 0,
      total_adjustments: 0,
      net_amount: 0
    };
  }

  /**
   * Get all invoice data for a booking
   * @param {number} bookingId - Booking ID
   * @returns {Promise<Object>} - Complete invoice data
   */
  async getInvoiceData(bookingId) {
    const { booking, products } = await this.getBookingForInvoice(bookingId);
    const transactions = await this.getPaymentTransactions(bookingId);
    const paymentSummary = await this.getPaymentSummary(bookingId);

    return {
      booking,
      products,
      transactions,
      paymentSummary
    };
  }

  /**
   * Ensure uploads directory exists
   * @private
   */
  _ensureUploadsDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Generate PDF invoice
   * @param {string} type - Document type: 'estimate', 'invoice', or 'tax-invoice'
   * @param {number} bookingId - Booking ID
   * @param {Object} options - {persistent: boolean, protocol: string, host: string}
   * @returns {Promise<Object>} - {outputPath, fileName, publicUrl, fullUrl}
   */
  async generatePdf(type, bookingId, options = {}) {
    if (!['estimate', 'invoice', 'tax-invoice'].includes(type)) {
      throw new Error('Invalid document type');
    }

    // Get invoice data
    const { booking, products, transactions, paymentSummary } = await this.getInvoiceData(bookingId);

    // Prepare file paths
    const documentName = type === 'estimate' ? 'Estimate' 
                       : type === 'invoice' ? 'Invoice' 
                       : 'TaxInvoice';
    const timestamp = Date.now();
    const fileName = `${documentName}_${bookingId}_${timestamp}.pdf`;
    
    // Determine output directory based on persistence requirement
    const outputDir = options.persistent 
      ? path.join(__dirname, '../../storage/uploads')
      : path.join(__dirname, '../../uploads');
    
    this._ensureUploadsDir(outputDir);
    const outputPath = path.join(outputDir, fileName);

    // Generate appropriate PDF type
    if (type === 'estimate') {
      await InvoiceGenerator.generateEstimate(booking, products, transactions, paymentSummary, outputPath);
    } else if (type === 'invoice') {
      await InvoiceGenerator.generateInvoice(booking, products, transactions, paymentSummary, outputPath);
    } else if (type === 'tax-invoice') {
      await InvoiceGenerator.generateTaxInvoice(booking, products, transactions, paymentSummary, outputPath);
    }

    // Construct response
    const result = {
      outputPath,
      fileName: `${documentName}_${bookingId}.pdf`
    };

    // Add URLs if persistent (for sharing)
    if (options.persistent && options.protocol && options.host) {
      result.publicUrl = `/uploads/${fileName}`;
      result.fullUrl = `${options.protocol}://${options.host}${result.publicUrl}`;
    }

    return result;
  }

  /**
   * Generate a receipt PDF for a single transaction
   * @param {number} bookingId - Booking ID
   * @param {number} transactionId - Transaction ID
   * @param {Object} options - {persistent: boolean, protocol: string, host: string}
   * @returns {Promise<Object>} - {outputPath, fileName, publicUrl, fullUrl}
   */
  async generateReceiptPdf(bookingId, transactionId, options = {}) {
    // Fetch booking data (includes customer info via JOIN)
    const { booking } = await this.getBookingForInvoice(bookingId);

    // Fetch the specific transaction
    const txResult = await pool.query(
      `SELECT *, transaction_date as created_at FROM payment_transactions WHERE id = $1 AND booking_id = $2`,
      [transactionId, bookingId]
    );
    if (txResult.rows.length === 0) {
      throw new Error('Transaction not found');
    }
    const transaction = txResult.rows[0];

    // Prepare file paths
    const timestamp = Date.now();
    const fileName = `Receipt_${bookingId}_${transactionId}_${timestamp}.pdf`;

    const outputDir = options.persistent
      ? path.join(__dirname, '../../storage/uploads')
      : path.join(__dirname, '../../uploads');

    this._ensureUploadsDir(outputDir);
    const outputPath = path.join(outputDir, fileName);

    // Generate receipt PDF
    await InvoiceGenerator.generateTransactionReceipt(booking, transaction, outputPath);

    const result = {
      outputPath,
      fileName: `Receipt_${bookingId}_${transactionId}.pdf`
    };

    if (options.persistent && options.protocol && options.host) {
      result.publicUrl = `/uploads/${fileName}`;
      result.fullUrl = `${options.protocol}://${options.host}${result.publicUrl}`;
    }

    return result;
  }
}

module.exports = new InvoiceService();
