require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for image uploads
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files (including PDFs)
const uploadDir = path.join(__dirname, '../../storage/uploads');
app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res, filePath) => {
    // Set proper headers for PDF files to enable mobile download
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
  }
}));

// Routes
app.use('/api/health', require('./routes/health'));
app.use('/api/products', require('./routes/products'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/product-tracking', require('./routes/productTracking'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/payment-transactions', require('./routes/paymentTransactions'));
app.use('/api/auto-cancel', require('./routes/autoCancelBookings'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/credit-notes', require('./routes/creditNotes'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/product-exchanges', require('./routes/productExchanges'));
app.use('/api/booking-cancellation', require('./routes/bookingCancellation'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start auto-cancel scheduler
const { startScheduler } = require('./utils/autoCancelScheduler');
startScheduler();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

