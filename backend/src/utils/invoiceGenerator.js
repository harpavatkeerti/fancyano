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
  static async generateEstimate(bookingData, products, transactions = [], paymentSummary = {}, outputPath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      
      doc.pipe(stream);

      // Header with Logo - Compact layout
      doc.fontSize(18).font('Helvetica-Bold')
        .fillColor('#FF0000')
        .text('FAN-C-YA-NO', 50, 40);
      
      doc.fontSize(9).font('Helvetica')
        .fillColor('#000000')
        .text('Wedding Dress Rental', 50, 60)
        .text('23, 1st Floor, Shobhagapura, Main 100 Feet Road,', 50, 72)
        .text('Near SBI Bank, Udaipur (Raj.), 313001', 50, 84);

      // Contact Information - Centered
      const centerX = 297.5; // Center of A4 page (595px width / 2)
      doc.fontSize(8).font('Helvetica-Bold')
        .text('WhatsApp: 8696521097', centerX, 40, { align: 'center', width: 200 })
        .text('Call: 7877538766', centerX, 52, { align: 'center', width: 200 })
        .text('GPay: 9950545800', centerX, 64, { align: 'center', width: 200 });

      // Order ID and Shop Timings (Right side) - Moved right to avoid overlap
      doc.fontSize(9)
        .text(`Order ID: ${bookingData.id}`, 450, 40)
        .fontSize(7)
        .text('Shop Timings:', 450, 55)
        .text('Mon to Sat: 11 AM - 8 PM', 450, 65)
        .text('Sunday Closed', 450, 75);

      // Booking and Customer Details - Compact
      doc.fontSize(9).font('Helvetica-Bold')
        .text('Booking Date:', 50, 115)
        .font('Helvetica')
        .text(new Date(bookingData.booking_date).toLocaleDateString('en-GB'), 150, 115);

      doc.font('Helvetica-Bold')
        .text('Customer Details:', 300, 115)
        .font('Helvetica')
        .text(bookingData.customer_name, 300, 128);
      
      // Show both phone numbers on same line separated by comma
      let phoneNumbers = [];
      if (bookingData.customer_phone) {
        phoneNumbers.push(bookingData.customer_phone);
      }
      if (bookingData.alternate_phone) {
        phoneNumbers.push(bookingData.alternate_phone);
      }
      const phoneY = 140;
      if (phoneNumbers.length > 0) {
        doc.fontSize(8).text(phoneNumbers.join(', '), 300, phoneY);
      }

      // Address section - Compact
      const addressStartY = phoneY + 12;
      doc.fontSize(8).font('Helvetica-Bold')
        .text('Address:', 300, addressStartY)
        .font('Helvetica')
        .text(bookingData.customer_address || 'Lorem ipsum dolor sit amet', 300, addressStartY + 10, { width: 250 });

      // Products Table - Adjust position dynamically based on content above
      // Removed Rental Dates section since each product shows pickup/drop dates
      const tableTop = addressStartY + 25;
      doc.fontSize(10).font('Helvetica-Bold');
      
      // Table Headers - Compact
      doc.fontSize(9).text('S.NO.', 50, tableTop)
        .text('ITEMS', 100, tableTop)
        .text('QTY', 270, tableTop)
        .text('RENT', 340, tableTop)
        .text('TOTAL', 450, tableTop);

      // Table Line
      doc.moveTo(50, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();

      // Table Rows - Compact spacing
      let currentY = tableTop + 18;
      doc.fontSize(8).font('Helvetica');
      
      let calculatedSubtotal = 0;
      
      products.forEach((product, index) => {
        const quantity = product.quantity || 1;
        const rentPerDay = parseFloat(product.rent || 0);
        const total = rentPerDay * quantity;
        calculatedSubtotal += total;
        
        // Format: "Product Name - Product Code"
        const itemName = `${product.name} - ${product.code || ''}`;

        // Get pickup and drop dates for this product
        const pickupDate = product.booked_from ? new Date(product.booked_from).toLocaleDateString('en-GB') : 
                          bookingData.booked_from ? new Date(bookingData.booked_from).toLocaleDateString('en-GB') : '';
        const dropDate = product.booked_to ? new Date(product.booked_to).toLocaleDateString('en-GB') : 
                        bookingData.booked_to ? new Date(bookingData.booked_to).toLocaleDateString('en-GB') : '';
        const dateRange = pickupDate && dropDate ? `${pickupDate} - ${dropDate}` : '';

        doc.text(index + 1, 50, currentY)
          .text(itemName, 100, currentY, { width: 160 })
          .text(quantity.toString(), 270, currentY)
          .text(`₹${rentPerDay.toFixed(2)}`, 340, currentY)
          .text(`₹${total.toFixed(2)}`, 450, currentY);

        // Add pickup and drop dates below the item - Increased font size for importance
        currentY += 12;
        if (dateRange) {
          doc.fontSize(9).font('Helvetica-Bold')
            .fillColor('#000000')
            .text(`Pickup: ${pickupDate} | Drop: ${dropDate}`, 100, currentY)
            .fillColor('#000000');
        }

        currentY += 16; // Slightly increased spacing for better readability
      });

      // Totals
      currentY += 20;
      doc.moveTo(50, currentY - 10)
        .lineTo(550, currentY - 10)
        .stroke();

      doc.font('Helvetica-Bold')
        .text('Subtotal', 300, currentY)
        .text(`₹${calculatedSubtotal.toFixed(2)}`, 450, currentY);

      // Show Transportation Charges only if transportation was opted AND charge > 0
      // Check both transportation_opted flag and ensure other_charges is actually set
      const isTransportationOpted = bookingData.transportation_opted === true || 
                                    bookingData.transportation_opted === 'true' || 
                                    bookingData.transportation_opted === 1;
      const transportationCharge = isTransportationOpted ? parseFloat(bookingData.other_charges || 0) : 0;
      
      if (isTransportationOpted && transportationCharge > 0) {
        currentY += 25;
        doc.font('Helvetica')
          .text('Local Transportation Charges', 300, currentY, { width: 140 })
          .text(`₹${transportationCharge.toFixed(2)}`, 450, currentY);
      }

      currentY += 25;
      doc.font('Helvetica-Bold')
        .text('Total Rent', 300, currentY)
        .text(`₹${(calculatedSubtotal + transportationCharge).toFixed(2)}`, 450, currentY);

      // Payment Details Section
      currentY += 50;
      doc.fontSize(12).font('Helvetica-Bold')
        .text('PAYMENT DETAILS:', 50, currentY);

      currentY += 20;
      const totalRent = parseFloat(bookingData.total_amount || 0);
      const securityDeposit = parseFloat(bookingData.security_deposit || 0);
      const totalRequired = totalRent + securityDeposit;
      
      // Calculate Advance Paid (sum of all payment transactions only, excluding refunds and adjustments)
      const advancePaid = transactions && transactions.length > 0
        ? transactions
            .filter(t => t.type === 'payment')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
        : parseFloat(bookingData.paid_amount || 0);
      
      doc.fontSize(10).font('Helvetica-Bold')
        .text('Subtotal (Rent):', 50, currentY)
        .font('Helvetica')
        .text(`₹${totalRent.toFixed(2)}`, 200, currentY);

      currentY += 20;
      doc.font('Helvetica-Bold')
        .text('Security Deposit:', 50, currentY)
        .font('Helvetica')
        .text(`₹${securityDeposit.toFixed(2)}`, 200, currentY);

      currentY += 20;
      doc.moveTo(50, currentY - 5)
        .lineTo(250, currentY - 5)
        .stroke();
      
      currentY += 15;
      doc.font('Helvetica-Bold')
        .text('Total Required:', 50, currentY)
        .font('Helvetica')
        .text(`₹${totalRequired.toFixed(2)}`, 200, currentY);

      currentY += 25;
      doc.font('Helvetica-Bold')
        .text('Advance Paid:', 50, currentY)
        .font('Helvetica')
        .text(`₹${advancePaid.toFixed(2)}`, 200, currentY);

      currentY += 20;
      doc.moveTo(50, currentY - 5)
        .lineTo(250, currentY - 5)
        .stroke();
      
      currentY += 15;
      const balanceDue = totalRequired - advancePaid;
      doc.font('Helvetica-Bold')
        .text('Balance Due:', 50, currentY)
        .font('Helvetica')
        .text(`₹${Math.max(0, balanceDue).toFixed(2)}`, 200, currentY);

      // Payment Transactions History
      if (transactions && transactions.length > 0) {
        currentY += 30;
        doc.fontSize(11).font('Helvetica-Bold')
          .text('Payment History:', 50, currentY);

        currentY += 20;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Date', 50, currentY)
          .text('Type', 120, currentY)
          .text('Method', 220, currentY)
          .text('Amount', 290, currentY)
          .text('Notes', 360, currentY);

        currentY += 15;
        doc.moveTo(50, currentY - 5)
          .lineTo(550, currentY - 5)
          .stroke();

        doc.fontSize(9).font('Helvetica');
        transactions.forEach((transaction) => {
          const transDate = new Date(transaction.created_at).toLocaleDateString('en-GB');
          
          // Determine transaction type display
          let transType = 'Payment';
          if (transaction.type === 'refund') {
            transType = 'Refund';
          } else if (transaction.type === 'adjustment') {
            transType = 'Adjustment';
          } else if (transaction.transaction_type === 'exchange_upgrade') {
            transType = 'Exchange Upgrade';
          } else if (transaction.transaction_type === 'exchange_penalty') {
            transType = 'Exchange Penalty';
          } else if (transaction.transaction_type === 'downgrade_penalty') {
            transType = 'Downgrade Penalty';
          } else if (transaction.transaction_type === 'cancellation_penalty') {
            transType = 'Cancellation';
          }
          
          const transMethod = transaction.method || 'N/A';
          const transAmount = parseFloat(transaction.amount || 0);
          const transNotes = transaction.notes || '-';
          
          // Wrap long notes
          const maxNotesWidth = 180;
          const notesLines = doc.heightOfString(transNotes, { width: maxNotesWidth });
          
          doc.text(transDate, 50, currentY)
            .text(transType, 120, currentY)
            .text(transMethod, 220, currentY)
            .text(`₹${transAmount.toFixed(2)}`, 290, currentY)
            .text(transNotes.substring(0, 30) + (transNotes.length > 30 ? '...' : ''), 360, currentY, { width: maxNotesWidth });

          currentY += Math.max(20, notesLines * 15);
          
          // Check if we need a new page
          if (currentY > 700) {
            doc.addPage();
            currentY = 50;
          }
        });

        currentY += 10;
        doc.moveTo(50, currentY - 5)
          .lineTo(550, currentY - 5)
          .stroke();
      }

      // Payment Summary (if there are refunds or adjustments, show them)
      const totalRefunded = parseFloat(paymentSummary.total_refunds || 0);
      const totalAdjustments = parseFloat(paymentSummary.total_adjustments || 0);
      
      if (totalRefunded > 0 || totalAdjustments > 0) {
        currentY += 30;
        doc.fontSize(10).font('Helvetica-Bold')
          .text('Payment Summary:', 50, currentY);

        if (totalRefunded > 0) {
          currentY += 20;
          doc.font('Helvetica-Bold')
            .text('Total Refunded:', 50, currentY)
            .font('Helvetica')
            .text(`₹${totalRefunded.toFixed(2)}`, 200, currentY);
        }

        if (totalAdjustments > 0) {
          currentY += 20;
          doc.font('Helvetica-Bold')
            .text('Total Adjustments:', 50, currentY)
            .font('Helvetica')
            .text(`₹${totalAdjustments.toFixed(2)}`, 200, currentY);
        }
      }

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
  static async generateInvoice(bookingData, products, transactions = [], paymentSummary = {}, outputPath) {
    // Same as estimate but with "INVOICE" header
    return this.generateEstimate(bookingData, products, transactions, paymentSummary, outputPath);
  }

  /**
   * Generate Tax Invoice PDF
   */
  static async generateTaxInvoice(bookingData, products, transactions = [], paymentSummary = {}, outputPath) {
    // Similar to invoice but with GST details
    return this.generateEstimate(bookingData, products, transactions, paymentSummary, outputPath);
  }
}

module.exports = InvoiceGenerator;

