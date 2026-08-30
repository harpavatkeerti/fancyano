const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const { BRAND_NAME } = require('../config/brand');

/**
 * NotificationService - Manages email and WhatsApp notifications
 */
class NotificationService {
  /**
   * Get email transporter configuration
   * @private
   */
  _getEmailConfig() {
    const smtpUser = (process.env.SMTP_USER || '').trim();
    const smtpPass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '');
    
    return {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    };
  }

  /**
   * Check if email service is configured
   * @returns {Object} - {configured: boolean, error: string}
   */
  isEmailConfigured() {
    const config = this._getEmailConfig();
    
    if (!config.auth.user || !config.auth.pass) {
      return {
        configured: false,
        error: 'Email service not configured. Please set SMTP_USER and SMTP_PASS in .env file.'
      };
    }
    
    if (config.auth.user === 'your-email@gmail.com' || config.auth.user.includes('your-email')) {
      return {
        configured: false,
        error: 'Email service not configured. Please update SMTP_USER in .env file with your actual email address.'
      };
    }
    
    return { configured: true };
  }

  /**
   * Send invoice email with PDF attachment
   * @param {Object} params - {bookingId, documentType, customerName, customerEmail, pdfPath}
   * @returns {Promise<Object>} - Email send result
   */
  async sendInvoiceEmail({ bookingId, documentType, customerName, customerEmail, pdfPath }) {
    if (!customerEmail) {
      throw new Error('Customer email address is required to send email');
    }

    const emailConfig = this._getEmailConfig();
    const transporter = nodemailer.createTransport(emailConfig);

    const documentName = documentType === 'estimate' ? 'Estimate' 
                       : documentType === 'invoice' ? 'Invoice' 
                       : 'Tax Invoice';
    
    const mailOptions = {
      from: `"${BRAND_NAME}" <${emailConfig.auth.user}>`,
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

    const info = await transporter.sendMail(mailOptions);
    
    return {
      success: true,
      messageId: info.messageId,
      message: 'Email sent successfully with PDF attachment'
    };
  }

  /**
   * Generate WhatsApp share URL
   * @param {Object} params - {phoneNumber, bookingId, documentType}
   * @returns {string} - WhatsApp URL
   */
  generateWhatsAppUrl({ phoneNumber, bookingId, documentType }) {
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const message = `Your ${documentType} for booking #${bookingId} is ready. Download: ${appUrl}/api/invoices/${documentType}/${bookingId}`;
    return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
  }

  /**
   * Resolve PDF file path (checks multiple locations)
   * @param {string} pdfUrl - PDF URL or filename
   * @returns {string} - Absolute path to PDF file
   * @throws {Error} - If PDF file not found
   */
  resolvePdfPath(pdfUrl) {
    // Extract filename from URL
    let pdfFileName = path.basename(pdfUrl);
    pdfFileName = pdfFileName.split('?')[0]; // Remove query parameters
    
    // Try primary path
    const primaryPath = path.join(__dirname, '../../storage/uploads', pdfFileName);
    if (fs.existsSync(primaryPath)) {
      return primaryPath;
    }
    
    // Try alternative path
    const altPath = path.join(__dirname, '../../uploads', pdfFileName);
    if (fs.existsSync(altPath)) {
      return altPath;
    }
    
    throw new Error(`PDF file not found: ${pdfFileName}`);
  }
  /**
   * Send a report PDF as an email attachment.
   * @param {Object} params - { email, title, pdfPath, fileName, dateRange }
   * @returns {Promise<Object>} - Email send result
   */
  async sendReportEmail({ email, title, pdfPath, fileName, dateRange = '' }) {
    if (!email) {
      throw new Error('Recipient email address is required');
    }

    const emailConfig = this._getEmailConfig();
    const transporter = nodemailer.createTransport(emailConfig);

    const mailOptions = {
      from: `"${BRAND_NAME} Reports" <${emailConfig.auth.user}>`,
      to: email,
      subject: `${title} Report${dateRange}`,
      text: `Please find the ${title} report attached.${dateRange ? '\nPeriod: ' + dateRange : ''}\n\nGenerated by ${BRAND_NAME}.`,
      html: `<div style="font-family: Arial, sans-serif;"><p>Please find the <strong>${title}</strong> report attached.</p>${dateRange ? '<p>Period: ' + dateRange + '</p>' : ''}<p style="color: #999;">Generated by ${BRAND_NAME}</p></div>`,
      attachments: [{ filename: fileName, path: pdfPath }]
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      message: `Report sent to ${email}`
    };
  }
}

module.exports = new NotificationService();
