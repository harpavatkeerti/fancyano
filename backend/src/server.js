require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { verifyToken } = require('./middleware/auth');
const requireRole = require('./middleware/requireRole');
const routePermissions = require('./middleware/routePermissions');

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

// ── Public routes (no auth required) ──
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));

// ── JWT authentication for all other /api/* routes ──
app.use('/api', verifyToken);

// ── Role-restricted routes (from centralized config) ──
for (const [path, roles] of Object.entries(routePermissions.routes)) {
  app.use(path, requireRole(...roles), require(`./routes/${routePermissions.files[path]}`));
}

// ── Shared routes — any authenticated user (from centralized config) ──
const sharedPaths = Object.keys(routePermissions.files).filter(
  path => !routePermissions.routes[path]
);
for (const path of sharedPaths) {
  app.use(path, require(`./routes/${routePermissions.files[path]}`));
}

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
