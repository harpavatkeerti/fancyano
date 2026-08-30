/**
 * reports.js — Route handlers for all report endpoints.
 *
 * All business logic lives in reportService.js.
 * This file only handles HTTP request/response and delegates to the service.
 */

const express = require('express');
const router = express.Router();
const reportService = require('../services/reportService');
const reportExportService = require('../services/reportExportService');
const settingsService = require('../services/settingsService');
const notificationService = require('../services/notificationService');
const requireRole = require('../middleware/requireRole');
const expenseService = require('../services/expenseService');
const purchaseService = require('../services/purchaseService');
const fs = require('fs');

// ── Middleware: check salesman report access ────────────────────────────────
// Salesmen can only access their own performance report if the setting is enabled.
async function checkSalesmanReportAccess(req, res, next) {
  if (req.user.role === 'admin') return next();

  // Check if salesman reports are enabled
  const setting = await settingsService.getByKey('salesman_reports_enabled');
  if (!setting || setting.setting_value !== 'true') {
    return res.status(403).json({ error: 'Reports access is not enabled for your role.' });
  }

  next();
}

// ──────────────────────────────────────────────────────────────────────────
// MODULE 1: Financial Ledger
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/ledger — Ledger entries with filters
router.get('/ledger', requireRole('admin'), async (req, res) => {
  try {
    const { method, type, start_date, end_date, booking_id, page, limit } = req.query;
    const entries = await reportService.getLedger({
      method, type, start_date, end_date, booking_id,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50
    });
    res.json(entries);
  } catch (error) {
    console.error('Error fetching ledger:', error);
    res.status(500).json({ error: 'Failed to fetch ledger' });
  }
});

// GET /reports/ledger/summary — Ledger summary (totals + method breakdown)
router.get('/ledger/summary', requireRole('admin'), async (req, res) => {
  try {
    const { method, start_date, end_date } = req.query;
    const summary = await reportService.getLedgerSummary({ method, start_date, end_date });
    res.json(summary);
  } catch (error) {
    console.error('Error fetching ledger summary:', error);
    res.status(500).json({ error: 'Failed to fetch ledger summary' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// MODULE 2: Rental Collection
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/rental-collection — Period summary
router.get('/rental-collection', requireRole('admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const summary = await reportService.getRentalCollectionSummary({ start_date, end_date });
    res.json(summary);
  } catch (error) {
    console.error('Error fetching rental collection:', error);
    res.status(500).json({ error: 'Failed to fetch rental collection' });
  }
});

// GET /reports/rental-collection/monthly — Monthly breakdown for a FY
router.get('/rental-collection/monthly', requireRole('admin'), async (req, res) => {
  try {
    const { fy_start_year } = req.query;
    if (!fy_start_year) {
      return res.status(400).json({ error: 'fy_start_year query parameter is required' });
    }
    const data = await reportService.getRentalCollectionMonthly(parseInt(fy_start_year));
    res.json(data);
  } catch (error) {
    console.error('Error fetching monthly rental collection:', error);
    res.status(500).json({ error: 'Failed to fetch monthly rental collection' });
  }
});

// GET /reports/rental-collection/bookings — Booking-level drill-down for a month
router.get('/rental-collection/bookings', requireRole('admin'), async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: 'year and month query parameters are required' });
    }
    const data = await reportService.getRentalCollectionByBooking(
      parseInt(year), parseInt(month)
    );
    res.json(data);
  } catch (error) {
    console.error('Error fetching booking-level rental collection:', error);
    res.status(500).json({ error: 'Failed to fetch booking-level rental collection' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// MODULE 5: Charges & Penalties
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/charges — All charges/penalties with filters
router.get('/charges', requireRole('admin'), async (req, res) => {
  try {
    const { charge_type, start_date, end_date } = req.query;
    const data = await reportService.getChargesReport({ charge_type, start_date, end_date });
    res.json(data);
  } catch (error) {
    console.error('Error fetching charges report:', error);
    res.status(500).json({ error: 'Failed to fetch charges report' });
  }
});

// GET /reports/charges/summary — Summary per charge type
router.get('/charges/summary', requireRole('admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const data = await reportService.getChargesSummary({ start_date, end_date });
    res.json(data);
  } catch (error) {
    console.error('Error fetching charges summary:', error);
    res.status(500).json({ error: 'Failed to fetch charges summary' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// MODULE 7: Dead Inventory
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/dead-inventory — Products not booked recently
router.get('/dead-inventory', requireRole('admin'), async (req, res) => {
  try {
    const { min_idle_days, never_booked_only } = req.query;
    const data = await reportService.getDeadInventory({
      min_idle_days: parseInt(min_idle_days) || 30,
      never_booked_only: never_booked_only === 'true'
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching dead inventory:', error);
    res.status(500).json({ error: 'Failed to fetch dead inventory' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// MODULE 10: Security Deposit Summary
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/security-deposits — Method-wise security deposit summary
router.get('/security-deposits', requireRole('admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const data = await reportService.getSecurityDepositSummary({ start_date, end_date });
    res.json(data);
  } catch (error) {
    console.error('Error fetching security deposit summary:', error);
    res.status(500).json({ error: 'Failed to fetch security deposit summary' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// MODULE 11: Customer Report
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/customers — Top customers
router.get('/customers', requireRole('admin'), async (req, res) => {
  try {
    const { limit } = req.query;
    const data = await reportService.getCustomerReport({
      limit: parseInt(limit) || 50
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching customer report:', error);
    res.status(500).json({ error: 'Failed to fetch customer report' });
  }
});

// GET /reports/customers/outstanding — Customers with outstanding dues
router.get('/customers/outstanding', requireRole('admin'), async (req, res) => {
  try {
    const data = await reportService.getCustomerOutstanding();
    res.json(data);
  } catch (error) {
    console.error('Error fetching customer outstanding:', error);
    res.status(500).json({ error: 'Failed to fetch customer outstanding' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// MODULE 12: Salesman Performance
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/salesman-performance — Salesman metrics
// Accessible by admin always, by salesman only if setting is enabled
router.get('/salesman-performance', checkSalesmanReportAccess, async (req, res) => {
  try {
    const data = await reportService.getSalesmanPerformance({
      salesman_name: req.user.role === 'salesman' ? req.user.name : undefined
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching salesman performance:', error);
    res.status(500).json({ error: 'Failed to fetch salesman performance' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// MODULE 13: Product Performance
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/product-performance — Product metrics
router.get('/product-performance', requireRole('admin'), async (req, res) => {
  try {
    const { limit } = req.query;
    const data = await reportService.getProductPerformance({
      limit: parseInt(limit) || 50
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching product performance:', error);
    res.status(500).json({ error: 'Failed to fetch product performance' });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// MODULE 9: Profit & Loss Dashboard
// ──────────────────────────────────────────────────────────────────────────

// GET /reports/pnl — P&L summary for a date range
router.get('/pnl', requireRole('admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const data = await reportService.getProfitAndLoss({ start_date, end_date });
    res.json(data);
  } catch (error) {
    console.error('Error fetching P&L:', error);
    res.status(500).json({ error: 'Failed to fetch P&L summary' });
  }
});

// GET /reports/pnl/monthly?fy_start_year=2025 — Monthly P&L for FY
router.get('/pnl/monthly', requireRole('admin'), async (req, res) => {
  try {
    const fy_start_year = parseInt(req.query.fy_start_year) || new Date().getFullYear();
    const data = await reportService.getProfitAndLossMonthly(fy_start_year);
    res.json(data);
  } catch (error) {
    console.error('Error fetching monthly P&L:', error);
    res.status(500).json({ error: 'Failed to fetch monthly P&L' });
  }
});
// ──────────────────────────────────────────────────────────────────────────
// EXPORT & SHARING
// ──────────────────────────────────────────────────────────────────────────

/** Fetch report data by module name */
async function fetchModuleData(moduleName, query) {
  const { start_date, end_date } = query;
  switch (moduleName) {
    case 'ledger':    return { data: await reportService.getLedger({ start_date, end_date, limit: 10000 }), summary: await reportService.getLedgerSummary({ start_date, end_date }) };
    case 'rental':    return { data: await reportService.getRentalCollectionMonthly(query.fy_start_year || new Date().getFullYear()) };
    case 'charges':   return { data: await reportService.getChargesReport({ start_date, end_date }) };
    case 'security':  return { data: await reportService.getSecurityDepositSummary({ start_date, end_date }) };
    case 'expenses':  return { data: await expenseService.list({ start_date, end_date }) };
    case 'purchases': return { data: await purchaseService.list({ start_date, end_date }) };
    case 'dead':      return { data: await reportService.getDeadInventory({}) };
    case 'customers': return { data: await reportService.getCustomerReport({ limit: 10000 }) };
    case 'salesman':  return { data: await reportService.getSalesmanPerformance() };
    case 'products':  return { data: await reportService.getProductPerformance({ limit: 10000 }) };
    case 'pnl':       return { data: await reportService.getProfitAndLoss({ start_date, end_date }), isPnlSummary: true };
    default:          throw Object.assign(new Error(`Unknown module: ${moduleName}`), { status: 400 });
  }
}

// GET /reports/export/:module/pdf — Download report as PDF
router.get('/export/:module/pdf', requireRole('admin'), async (req, res) => {
  try {
    const { module: moduleName } = req.params;
    if (!reportExportService.isSupported(moduleName)) {
      return res.status(400).json({ error: `Unsupported module: ${moduleName}` });
    }

    const result = await fetchModuleData(moduleName, req.query);
    const rawData = result.isPnlSummary ? result.data : result.data;
    const { outputPath, fileName } = await reportExportService.generatePdf(
      moduleName, rawData, {
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        summaryData: result.summary || null
      }
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => { try { fs.unlinkSync(outputPath); } catch {} });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error exporting PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// GET /reports/export/:module/csv — Download report as CSV
router.get('/export/:module/csv', requireRole('admin'), async (req, res) => {
  try {
    const { module: moduleName } = req.params;
    if (!reportExportService.isSupported(moduleName)) {
      return res.status(400).json({ error: `Unsupported module: ${moduleName}` });
    }

    const result = await fetchModuleData(moduleName, req.query);
    const rawData = result.isPnlSummary ? result.data : result.data;
    const csv = reportExportService.generateCsv(moduleName, rawData);
    const title = reportExportService.getModuleTitle(moduleName);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '_')}_Report.csv"`);
    res.send(csv);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to generate CSV' });
  }
});

// POST /reports/share/email — Email a report PDF to a specified address
router.post('/share/email', requireRole('admin'), async (req, res) => {
  try {
    const { module: moduleName, email, start_date, end_date } = req.body;

    if (!moduleName || !email) {
      return res.status(400).json({ error: 'Module name and email are required' });
    }

    // Check email is configured
    const emailCheck = notificationService.isEmailConfigured();
    if (!emailCheck.configured) {
      return res.status(400).json({ error: emailCheck.error });
    }

    if (!reportExportService.isSupported(moduleName)) {
      return res.status(400).json({ error: `Unsupported module: ${moduleName}` });
    }

    // Generate PDF
    const result = await fetchModuleData(moduleName, { start_date, end_date });
    const rawData = result.isPnlSummary ? result.data : result.data;
    const { outputPath, fileName } = await reportExportService.generatePdf(
      moduleName, rawData, { start_date, end_date, summaryData: result.summary || null }
    );

    // Send email via notification service
    const title = reportExportService.getModuleTitle(moduleName);
    const dateRange = start_date && end_date
      ? ` (${new Date(start_date).toLocaleDateString('en-IN')} - ${new Date(end_date).toLocaleDateString('en-IN')})`
      : '';

    const sendResult = await notificationService.sendReportEmail({
      email, title, pdfPath: outputPath, fileName, dateRange
    });

    // Clean up temp file
    try { fs.unlinkSync(outputPath); } catch {}

    res.json(sendResult);
  } catch (error) {
    console.error('Error sharing report via email:', error);
    res.status(500).json({ error: 'Failed to send report email' });
  }
});
// POST /reports/share/whatsapp — Generate persistent PDF and return public URL for WhatsApp
router.post('/share/whatsapp', requireRole('admin'), async (req, res) => {
  try {
    const { module: moduleName, start_date, end_date } = req.body;

    if (!moduleName) {
      return res.status(400).json({ error: 'Module name is required' });
    }

    if (!reportExportService.isSupported(moduleName)) {
      return res.status(400).json({ error: `Unsupported module: ${moduleName}` });
    }

    // Generate persistent PDF (saved to storage/uploads, served via /uploads static route)
    const result = await fetchModuleData(moduleName, { start_date, end_date });
    const rawData = result.isPnlSummary ? result.data : result.data;
    const { fileName } = await reportExportService.generatePdf(
      moduleName, rawData, { start_date, end_date, summaryData: result.summary || null, persistent: true }
    );

    // Build public URL (same pattern as invoices)
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3001';
    const publicUrl = `${protocol}://${host}/uploads/${fileName}`;

    const title = reportExportService.getModuleTitle(moduleName);
    res.json({ success: true, url: publicUrl, fileName, title });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error generating WhatsApp share URL:', error);
    res.status(500).json({ error: 'Failed to generate report for sharing' });
  }
});

module.exports = router;
