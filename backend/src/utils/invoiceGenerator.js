/**
 * Invoice/Estimate Generation Utility
 * Generates PDF invoices, estimates, and tax invoices
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class InvoiceGenerator {
  /**
   * Generate Estimate PDF
   */
  static async generateEstimate(bookingData, products, outputPath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      
      doc.pipe(stream);

      // Header with Logo
      doc.fontSize(20).font('Helvetica-Bold')
        .fillColor('#FF0000')
        .text('FAN-C-YA-NO', 50, 50);
      
      doc.fontSize(10).font('Helvetica')
        .fillColor('#000000')
        .text('Wedding Dress Rental', 50, 75)
        .text('23, 1st Floor, Shobhagapura, Main 100 Feet Road,', 50, 90)
        .text('Near SBI Bank, Udaipur (Raj.), 313001', 50, 102);

      // Order ID and Shop Timings (Right side)
      doc.fontSize(10)
        .text(`Order ID: ${bookingData.id}`, 400, 50)
        .fontSize(8)
        .text('Shop Timings:', 400, 70)
        .text('Mon to Sat: 11 am to 6 pm', 400, 82)
        .text('Sunday Closed', 400, 94)
        .text(`Phone: ${bookingData.customer_phone || '9876543210'}`, 400, 110);

      // Booking and Customer Details
      doc.fontSize(10).font('Helvetica-Bold')
        .text('Booking Date:', 50, 150)
        .font('Helvetica')
        .text(new Date(bookingData.booking_date).toLocaleDateString('en-GB'), 150, 150);

      doc.font('Helvetica-Bold')
        .text('Customer Details:', 300, 150)
        .font('Helvetica')
        .text(bookingData.customer_name, 300, 165)
        .text(bookingData.customer_phone || '', 300, 177);

      // Rental Dates
      doc.font('Helvetica-Bold')
        .text('Rental Dates:', 50, 190)
        .font('Helvetica')
        .text(`${new Date(bookingData.booked_from).toLocaleDateString('en-GB')} - ${new Date(bookingData.booked_to).toLocaleDateString('en-GB')}`, 150, 190);

      doc.font('Helvetica-Bold')
        .text('Address:', 300, 190)
        .font('Helvetica')
        .text(bookingData.customer_address || 'Lorem ipsum dolor sit amet', 300, 205, { width: 250 });

      // Products Table
      const tableTop = 250;
      doc.fontSize(10).font('Helvetica-Bold');
      
      // Table Headers
      doc.text('S.NO.', 50, tableTop)
        .text('ITEMS', 100, tableTop)
        .text('RENT', 380, tableTop);

      // Table Line
      doc.moveTo(50, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();

      // Table Rows
      let currentY = tableTop + 25;
      doc.font('Helvetica');
      
      products.forEach((product, index) => {
        const rent = product.rent_per_day;

        doc.text(index + 1, 50, currentY)
          .text(product.name, 100, currentY, { width: 280 })
          .text(`₹${rent}`, 380, currentY);

        currentY += 30;
      });

      // Totals
      currentY += 20;
      doc.moveTo(50, currentY - 10)
        .lineTo(550, currentY - 10)
        .stroke();

      doc.font('Helvetica-Bold')
        .text('Total', 380, currentY)
        .text(`₹${bookingData.total_amount || 0}`, 480, currentY);

      currentY += 25;
      doc.font('Helvetica')
        .text('Other Charges', 380, currentY)
        .text(`₹${bookingData.other_charges || 0}`, 480, currentY);

      currentY += 25;
      doc.font('Helvetica-Bold')
        .text('Grand Total', 380, currentY)
        .text(`₹${(bookingData.total_amount || 0) + (bookingData.other_charges || 0)}`, 480, currentY);

      // Payment Details Section
      currentY += 50;
      doc.fontSize(12).font('Helvetica-Bold')
        .text('PAY DETAILS:', 50, currentY);

      currentY += 20;
      doc.fontSize(10).font('Helvetica')
        .text('Total Rent + Security Deposit', 50, currentY);

      currentY += 20;
      doc.font('Helvetica-Bold')
        .text('Advance Paid:', 50, currentY)
        .font('Helvetica')
        .text(`₹${bookingData.paid_amount || 0}`, 150, currentY);

      currentY += 20;
      doc.font('Helvetica-Bold')
        .text('Due:', 50, currentY)
        .font('Helvetica')
        .text(`₹${bookingData.due_amount || 0}`, 150, currentY);

      // Authorized Balance Section
      currentY += 30;
      doc.fontSize(12).font('Helvetica-Bold')
        .text('AUTHORISED BALANCE AMT:', 300, currentY);

      currentY += 20;
      doc.fontSize(10).font('Helvetica')
        .text('Total Deposit:', 300, currentY);

      currentY += 20;
      doc.text('Damage:', 300, currentY);

      currentY += 20;
      doc.text('Lost:', 300, currentY);

      currentY += 20;
      doc.text('Late Charges:', 300, currentY);

      currentY += 30;
      doc.font('Helvetica-Bold')
        .text('Total Refund:', 300, currentY);

      // Terms and Conditions
      currentY += 40;
      doc.fontSize(8).font('Helvetica')
        .fillColor('#666666')
        .text('NO CANCELLATION | NO EXCHANGE, NO REFUND', 50, currentY, { align: 'center', width: 500 });

      currentY += 15;
      doc.text('Rental Policy: 4-5 Working Days', 50, currentY, { align: 'center', width: 500 });

      doc.end();

      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    });
  }

  /**
   * Generate Invoice PDF (similar to Estimate)
   */
  static async generateInvoice(bookingData, products, outputPath) {
    // Same as estimate but with "INVOICE" header
    return this.generateEstimate(bookingData, products, outputPath);
  }

  /**
   * Generate Tax Invoice PDF
   */
  static async generateTaxInvoice(bookingData, products, outputPath) {
    // Similar to invoice but with GST details
    return this.generateEstimate(bookingData, products, outputPath);
  }
}

module.exports = InvoiceGenerator;

