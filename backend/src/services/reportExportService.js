/**
 * reportExportService.js — Generates PDF and CSV exports for all report modules.
 *
 * Uses pdfkit (already a project dependency) for PDF generation with Fancyano branding.
 * CSV is generated as plain text with proper escaping.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { LOGO_PATH, BRAND_NAME } = require('../config/brand');

// DejaVu Sans supports the ₹ (Rupee) Unicode character; built-in Helvetica does not.
// Fonts are bundled with the project to avoid relying on system-installed fonts.
const FONT_REGULAR = path.join(__dirname, '../assets/fonts/DejaVuSans.ttf');
const FONT_BOLD    = path.join(__dirname, '../assets/fonts/DejaVuSans-Bold.ttf');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const PERSISTENT_DIR = path.join(__dirname, '../../storage/uploads');

// ── Helpers ──────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Format number as Indian rupee string */
function fmt(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

/** Format ISO date string */
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Convert charge_breakdown JSONB to human-readable label */
function breakdownLabel(bd) {
  if (!bd || typeof bd !== 'object') return '—';
  return Object.keys(bd)
    .map(k => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
    .join(', ');
}

/** Convert charge_breakdown JSONB to CSV-friendly detail string */
function breakdownDetail(bd) {
  if (!bd || typeof bd !== 'object') return '';
  return Object.entries(bd)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join('; ');
}

/** Escape CSV value */
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build CSV string from headers and rows */
function buildCsv(headers, rows) {
  const headerLine = headers.map(h => csvEscape(h.label)).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => csvEscape(h.value(row))).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

// ── PDF Builder ─────────────────────────────────────────────────────────

class ReportPdfBuilder {
  constructor(title, dateRange) {
    this.doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    this.title = title;
    this.dateRange = dateRange;
    this.y = 40;
    this.pageWidth = 595 - 80; // A4 width minus margins
    this.leftMargin = 40;
  }

  /** Write branded header */
  _writeHeader() {
    const doc = this.doc;

    // Logo
    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, this.leftMargin, 30, { width: 100, height: 35, fit: [100, 35] });
      }
    } catch { /* logo not found, skip */ }

    // Brand + title
    doc.fontSize(16).font(FONT_BOLD).fillColor('#1a1a1a')
      .text(this.title, this.leftMargin + 120, 35, { width: this.pageWidth - 120 });

    // Date range
    if (this.dateRange) {
      doc.fontSize(8).font(FONT_REGULAR).fillColor('#666666')
        .text(this.dateRange, this.leftMargin + 120, 55);
    }

    // Generated timestamp
    doc.fontSize(7).font(FONT_REGULAR).fillColor('#999999')
      .text(`Generated: ${new Date().toLocaleString('en-IN')}`, 400, 55, { align: 'right', width: 155 });

    // Separator line
    this.y = 75;
    doc.moveTo(this.leftMargin, this.y).lineTo(this.leftMargin + this.pageWidth, this.y)
      .strokeColor('#e0e0e0').lineWidth(1).stroke();
    this.y += 15;
  }

  /** Write summary cards row */
  writeSummaryCards(cards) {
    const doc = this.doc;
    const cardWidth = Math.min(130, (this.pageWidth - 20) / cards.length);

    cards.forEach((card, i) => {
      const x = this.leftMargin + i * (cardWidth + 10);
      // Card background
      doc.roundedRect(x, this.y, cardWidth, 45, 4).fillAndStroke('#f8f9fa', '#e9ecef');
      // Label
      doc.fontSize(7).font(FONT_REGULAR).fillColor('#666666')
        .text(card.label, x + 8, this.y + 6, { width: cardWidth - 16 });
      // Value
      doc.fontSize(11).font(FONT_BOLD).fillColor('#1a1a1a')
        .text(card.value, x + 8, this.y + 20, { width: cardWidth - 16 });
    });
    this.y += 60;
  }

  /** Write a data table */
  writeTable(columns, rows) {
    const doc = this.doc;
    const colWidths = columns.map(c => c.width || Math.floor(this.pageWidth / columns.length));
    const rowHeight = 18;
    const headerHeight = 22;

    // Table header
    let x = this.leftMargin;
    doc.roundedRect(x, this.y, this.pageWidth, headerHeight, 2).fill('#f1f3f5');
    columns.forEach((col, i) => {
      doc.fontSize(7).font(FONT_BOLD).fillColor('#374151')
        .text(col.label, x + 4, this.y + 6, {
          width: colWidths[i] - 8,
          align: col.align || 'left'
        });
      x += colWidths[i];
    });
    this.y += headerHeight;

    // Data rows
    rows.forEach((row, rowIdx) => {
      // Check if we need a new page
      if (this.y + rowHeight > 780) {
        doc.addPage();
        this.y = 40;
      }

      // Alternating row background
      if (rowIdx % 2 === 0) {
        doc.rect(this.leftMargin, this.y, this.pageWidth, rowHeight).fill('#fafafa');
      }

      x = this.leftMargin;
      columns.forEach((col, i) => {
        const val = col.value(row);
        doc.fontSize(7).font(FONT_REGULAR).fillColor('#374151')
          .text(String(val === null || val === undefined ? '—' : val), x + 4, this.y + 4, {
            width: colWidths[i] - 8,
            align: col.align || 'left',
            lineBreak: false
          });
        x += colWidths[i];
      });
      this.y += rowHeight;
    });

    // Bottom border
    doc.moveTo(this.leftMargin, this.y).lineTo(this.leftMargin + this.pageWidth, this.y)
      .strokeColor('#e0e0e0').lineWidth(0.5).stroke();
    this.y += 10;
  }

  /** Write a section title */
  writeSection(title) {
    if (this.y + 30 > 780) {
      this.doc.addPage();
      this.y = 40;
    }
    this.doc.fontSize(10).font(FONT_BOLD).fillColor('#1a1a1a')
      .text(title, this.leftMargin, this.y);
    this.y += 18;
  }

  /** Generate PDF and return file path */
  async generate(moduleName, options = {}) {
    const outputDir = options.persistent ? PERSISTENT_DIR : UPLOADS_DIR;
    ensureDir(outputDir);
    const fileName = `Report_${moduleName}_${Date.now()}.pdf`;
    const outputPath = path.join(outputDir, fileName);

    this._writeHeader();

    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(outputPath);
      stream.on('finish', () => resolve({ outputPath, fileName }));
      stream.on('error', reject);
      this.doc.pipe(stream);
      this.doc.end();
    });
  }
}

// ── Module-specific export configs ──────────────────────────────────────

const moduleConfigs = {
  ledger: {
    title: 'Financial Ledger',
    csvHeaders: [
      { label: 'Date', value: r => fmtDate(r.transaction_date) },
      { label: 'Booking ID', value: r => r.booking_id || '—' },
      { label: 'Customer', value: r => r.customer_name || '—' },
      { label: 'Type', value: r => r.transaction_type },
      { label: 'Method', value: r => r.payment_method },
      { label: 'Amount', value: r => r.amount },
      { label: 'Category', value: r => breakdownLabel(r.charge_breakdown) },
      { label: 'Breakdown', value: r => breakdownDetail(r.charge_breakdown) },
      { label: 'Recorded By', value: r => r.recorded_by || '—' },
    ],
    pdfColumns: [
      { label: 'Date', value: r => fmtDate(r.transaction_date), width: 65 },
      { label: 'Booking', value: r => r.booking_id || '—', width: 45 },
      { label: 'Customer', value: r => r.customer_name || '—', width: 85 },
      { label: 'Type', value: r => r.transaction_type, width: 60 },
      { label: 'Method', value: r => r.payment_method, width: 55 },
      { label: 'Amount', value: r => fmt(r.amount), width: 70, align: 'right' },
      { label: 'Category', value: r => breakdownLabel(r.charge_breakdown), width: 80 },
      { label: 'By', value: r => r.recorded_by || '—', width: 55 },
    ],
    summary: (data, summaryData) => {
      if (!summaryData) return [];
      return [
        { label: 'Total Collections', value: fmt(summaryData.total_collected) },
        { label: 'Cash', value: fmt(summaryData.cash) },
        { label: 'Online', value: fmt(summaryData.online) },
      ];
    }
  },

  rental: {
    title: 'Rental Collection',
    csvHeaders: [
      { label: 'Month', value: r => r.month },
      { label: 'Bookings', value: r => r.bookings },
      { label: 'Revenue', value: r => r.revenue },
      { label: 'Collected', value: r => r.collected },
      { label: 'Outstanding', value: r => r.outstanding },
    ],
    pdfColumns: [
      { label: 'Month', value: r => r.month, width: 110 },
      { label: 'Bookings', value: r => r.bookings, width: 80, align: 'right' },
      { label: 'Revenue', value: r => fmt(r.revenue), width: 110, align: 'right' },
      { label: 'Collected', value: r => fmt(r.collected), width: 110, align: 'right' },
      { label: 'Outstanding', value: r => fmt(r.outstanding), width: 105, align: 'right' },
    ],
    summary: (data) => {
      if (!data || !data.length) return [];
      const totRev = data.reduce((s, r) => s + Number(r.revenue || 0), 0);
      const totCol = data.reduce((s, r) => s + Number(r.collected || 0), 0);
      return [
        { label: 'Total Revenue', value: fmt(totRev) },
        { label: 'Total Collected', value: fmt(totCol) },
        { label: 'Outstanding', value: fmt(totRev - totCol) },
      ];
    }
  },

  charges: {
    title: 'Charges & Penalties',
    csvHeaders: [
      { label: 'Booking ID', value: r => r.booking_id },
      { label: 'Customer', value: r => r.customer_name },
      { label: 'Charge Type', value: r => r.charge_type },
      { label: 'Amount', value: r => r.amount },
      { label: 'Date', value: r => fmtDate(r.charge_date || r.created_at) },
      { label: 'Status', value: r => r.status || 'applied' },
    ],
    pdfColumns: [
      { label: 'Booking', value: r => r.booking_id, width: 60 },
      { label: 'Customer', value: r => r.customer_name, width: 120 },
      { label: 'Charge Type', value: r => r.charge_type?.replace(/_/g, ' '), width: 100 },
      { label: 'Amount', value: r => fmt(r.amount), width: 80, align: 'right' },
      { label: 'Date', value: r => fmtDate(r.charge_date || r.created_at), width: 80 },
      { label: 'Status', value: r => r.status || 'applied', width: 75 },
    ],
    summary: (data) => {
      const total = data.reduce((s, r) => s + Number(r.amount || 0), 0);
      return [
        { label: 'Total Charges', value: fmt(total) },
        { label: 'Entries', value: String(data.length) },
      ];
    }
  },

  security: {
    title: 'Security Deposits',
    csvHeaders: [
      { label: 'Booking ID', value: r => r.booking_id },
      { label: 'Customer', value: r => r.customer_name },
      { label: 'Deposit', value: r => r.deposit_amount },
      { label: 'Returned', value: r => r.returned_amount },
      { label: 'Held', value: r => r.held_amount },
      { label: 'Status', value: r => r.status },
    ],
    pdfColumns: [
      { label: 'Booking', value: r => r.booking_id, width: 60 },
      { label: 'Customer', value: r => r.customer_name, width: 130 },
      { label: 'Deposit', value: r => fmt(r.deposit_amount), width: 90, align: 'right' },
      { label: 'Returned', value: r => fmt(r.returned_amount), width: 90, align: 'right' },
      { label: 'Held', value: r => fmt(r.held_amount), width: 80, align: 'right' },
      { label: 'Status', value: r => r.status, width: 65 },
    ],
    summary: (data) => {
      const totDep = data.reduce((s, r) => s + Number(r.deposit_amount || 0), 0);
      const totRet = data.reduce((s, r) => s + Number(r.returned_amount || 0), 0);
      return [
        { label: 'Total Deposits', value: fmt(totDep) },
        { label: 'Total Returned', value: fmt(totRet) },
        { label: 'Currently Held', value: fmt(totDep - totRet) },
      ];
    }
  },

  expenses: {
    title: 'Expenses',
    csvHeaders: [
      { label: 'Date', value: r => fmtDate(r.expense_date) },
      { label: 'Category', value: r => r.category },
      { label: 'Description', value: r => r.description || '' },
      { label: 'Amount', value: r => r.amount },
      { label: 'Recorded By', value: r => r.recorded_by },
    ],
    pdfColumns: [
      { label: 'Date', value: r => fmtDate(r.expense_date), width: 80 },
      { label: 'Category', value: r => r.category, width: 110 },
      { label: 'Description', value: r => r.description || '—', width: 140 },
      { label: 'Amount', value: r => fmt(r.amount), width: 90, align: 'right' },
      { label: 'By', value: r => r.recorded_by, width: 95 },
    ],
    summary: (data) => {
      const total = data.reduce((s, r) => s + Number(r.amount || 0), 0);
      return [
        { label: 'Total Expenses', value: fmt(total) },
        { label: 'Entries', value: String(data.length) },
        { label: 'Avg/Entry', value: data.length ? fmt(Math.round(total / data.length)) : '₹0' },
      ];
    }
  },

  purchases: {
    title: 'Purchases',
    csvHeaders: [
      { label: 'Date', value: r => fmtDate(r.purchase_date) },
      { label: 'Vendor', value: r => r.vendor_name },
      { label: 'Item', value: r => r.item_description },
      { label: 'Amount', value: r => r.amount },
      { label: 'Recorded By', value: r => r.recorded_by },
    ],
    pdfColumns: [
      { label: 'Date', value: r => fmtDate(r.purchase_date), width: 80 },
      { label: 'Vendor', value: r => r.vendor_name, width: 110 },
      { label: 'Item', value: r => r.item_description, width: 140 },
      { label: 'Amount', value: r => fmt(r.amount), width: 90, align: 'right' },
      { label: 'By', value: r => r.recorded_by, width: 95 },
    ],
    summary: (data) => {
      const total = data.reduce((s, r) => s + Number(r.amount || 0), 0);
      return [
        { label: 'Total Purchases', value: fmt(total) },
        { label: 'Entries', value: String(data.length) },
      ];
    }
  },

  dead: {
    title: 'Dead Inventory',
    csvHeaders: [
      { label: 'Product', value: r => r.name },
      { label: 'Category', value: r => r.category || '' },
      { label: 'Rental Price', value: r => r.rental_price },
      { label: 'Total Bookings', value: r => r.total_bookings },
      { label: 'Last Booked', value: r => fmtDate(r.last_booked_date) },
      { label: 'Idle Days', value: r => r.idle_days },
    ],
    pdfColumns: [
      { label: 'Product', value: r => r.name, width: 130 },
      { label: 'Category', value: r => r.category || '—', width: 80 },
      { label: 'Rental ₹', value: r => fmt(r.rental_price), width: 80, align: 'right' },
      { label: 'Bookings', value: r => r.total_bookings, width: 60, align: 'right' },
      { label: 'Last Booked', value: r => fmtDate(r.last_booked_date), width: 80 },
      { label: 'Idle Days', value: r => r.idle_days, width: 85, align: 'right' },
    ],
    summary: (data) => [
      { label: 'Total Items', value: String(data.length) },
      { label: 'Never Booked', value: String(data.filter(r => !r.total_bookings || r.total_bookings === 0).length) },
    ]
  },

  customers: {
    title: 'Customer Report',
    csvHeaders: [
      { label: 'Customer', value: r => r.customer_name },
      { label: 'Phone', value: r => r.customer_phone },
      { label: 'Total Bookings', value: r => r.total_bookings },
      { label: 'Total Revenue', value: r => r.total_revenue },
      { label: 'Total Paid', value: r => r.total_paid },
      { label: 'Outstanding', value: r => r.outstanding },
    ],
    pdfColumns: [
      { label: 'Customer', value: r => r.customer_name, width: 110 },
      { label: 'Phone', value: r => r.customer_phone, width: 85 },
      { label: 'Bookings', value: r => r.total_bookings, width: 60, align: 'right' },
      { label: 'Revenue', value: r => fmt(r.total_revenue), width: 90, align: 'right' },
      { label: 'Paid', value: r => fmt(r.total_paid), width: 85, align: 'right' },
      { label: 'Outstanding', value: r => fmt(r.outstanding), width: 85, align: 'right' },
    ],
    summary: (data) => {
      const totRev = data.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
      const totPaid = data.reduce((s, r) => s + Number(r.total_paid || 0), 0);
      return [
        { label: 'Total Customers', value: String(data.length) },
        { label: 'Total Revenue', value: fmt(totRev) },
        { label: 'Outstanding', value: fmt(totRev - totPaid) },
      ];
    }
  },

  salesman: {
    title: 'Salesman Performance',
    csvHeaders: [
      { label: 'Salesman', value: r => r.salesman },
      { label: 'Bookings', value: r => r.total_bookings },
      { label: 'Revenue', value: r => r.total_revenue },
      { label: 'Collected', value: r => r.total_collected },
      { label: 'Collection Rate', value: r => r.collection_rate + '%' },
    ],
    pdfColumns: [
      { label: 'Salesman', value: r => r.salesman, width: 130 },
      { label: 'Bookings', value: r => r.total_bookings, width: 80, align: 'right' },
      { label: 'Revenue', value: r => fmt(r.total_revenue), width: 110, align: 'right' },
      { label: 'Collected', value: r => fmt(r.total_collected), width: 110, align: 'right' },
      { label: 'Rate', value: r => r.collection_rate + '%', width: 85, align: 'right' },
    ],
    summary: (data) => {
      const totRev = data.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
      const totCol = data.reduce((s, r) => s + Number(r.total_collected || 0), 0);
      return [
        { label: 'Total Revenue', value: fmt(totRev) },
        { label: 'Total Collected', value: fmt(totCol) },
        { label: 'Salesmen', value: String(data.length) },
      ];
    }
  },

  products: {
    title: 'Product Performance',
    csvHeaders: [
      { label: 'Product', value: r => r.name },
      { label: 'Category', value: r => r.category || '' },
      { label: 'Total Bookings', value: r => r.total_bookings },
      { label: 'Revenue', value: r => r.total_revenue },
      { label: 'Avg Revenue', value: r => r.avg_revenue },
    ],
    pdfColumns: [
      { label: 'Product', value: r => r.name, width: 140 },
      { label: 'Category', value: r => r.category || '—', width: 90 },
      { label: 'Bookings', value: r => r.total_bookings, width: 70, align: 'right' },
      { label: 'Revenue', value: r => fmt(r.total_revenue), width: 110, align: 'right' },
      { label: 'Avg Revenue', value: r => fmt(r.avg_revenue), width: 105, align: 'right' },
    ],
    summary: (data) => {
      const totRev = data.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
      return [
        { label: 'Total Products', value: String(data.length) },
        { label: 'Total Revenue', value: fmt(totRev) },
      ];
    }
  },

  pnl: {
    title: 'Profit & Loss',
    csvHeaders: [
      { label: 'Metric', value: r => r.metric },
      { label: 'Value', value: r => r.value },
    ],
    pdfColumns: [
      { label: 'Metric', value: r => r.metric, width: 300 },
      { label: 'Value', value: r => r.value, width: 215, align: 'right' },
    ],
    // P&L data needs special transformation (it's a summary object, not a table)
    transformData: (summary) => {
      if (!summary) return [];
      return [
        { metric: 'Rental Revenue', value: fmt(summary.rental_revenue) },
        { metric: 'Charges & Penalties', value: fmt(summary.charges_revenue) },
        { metric: 'Security Deposits Held', value: fmt(summary.security_deposits) },
        { metric: 'Total Revenue', value: fmt(summary.total_revenue) },
        { metric: '—', value: '—' },
        { metric: 'Expenses', value: fmt(summary.expenses) },
        { metric: 'Purchases', value: fmt(summary.purchases) },
        { metric: 'Total Costs', value: fmt(summary.total_costs) },
        { metric: '—', value: '—' },
        { metric: 'Net Profit / Loss', value: fmt(summary.net_profit) },
      ];
    },
    summary: (data, summaryData) => {
      if (!summaryData) return [];
      return [
        { label: 'Total Revenue', value: fmt(summaryData.total_revenue) },
        { label: 'Total Costs', value: fmt(summaryData.total_costs) },
        { label: 'Net Profit', value: fmt(summaryData.net_profit) },
      ];
    }
  },
};

// ── Main export class ───────────────────────────────────────────────────

class ReportExportService {
  /**
   * Generate a PDF for a report module.
   * @param {string} moduleName - One of the module keys (ledger, rental, etc.)
   * @param {Array|Object} data - The report data (array of rows, or object for P&L)
   * @param {Object} options - { start_date, end_date, summaryData }
   * @returns {Promise<{outputPath, fileName}>}
   */
  async generatePdf(moduleName, data, options = {}) {
    const config = moduleConfigs[moduleName];
    if (!config) throw new Error(`Unknown report module: ${moduleName}`);

    const dateRange = options.start_date && options.end_date
      ? `${fmtDate(options.start_date)} — ${fmtDate(options.end_date)}`
      : '';

    const pdf = new ReportPdfBuilder(config.title, dateRange);

    // Transform data if needed (e.g., P&L)
    let rows = config.transformData ? config.transformData(data) : data;
    if (!Array.isArray(rows)) rows = [];

    // Summary cards
    const summaryCards = config.summary(rows, options.summaryData || data);
    if (summaryCards.length > 0) {
      pdf.writeSummaryCards(summaryCards);
    }

    // Data table
    if (rows.length > 0) {
      pdf.writeTable(config.pdfColumns, rows);
    }

    return pdf.generate(moduleName, { persistent: options.persistent });
  }

  /**
   * Generate CSV for a report module.
   * @param {string} moduleName
   * @param {Array|Object} data
   * @returns {string} CSV content
   */
  generateCsv(moduleName, data) {
    const config = moduleConfigs[moduleName];
    if (!config) throw new Error(`Unknown report module: ${moduleName}`);

    let rows = config.transformData ? config.transformData(data) : data;
    if (!Array.isArray(rows)) rows = [];

    return buildCsv(config.csvHeaders, rows);
  }

  /**
   * Get the human-readable title for a module.
   */
  getModuleTitle(moduleName) {
    return moduleConfigs[moduleName]?.title || moduleName;
  }

  /**
   * Check if a module is supported.
   */
  isSupported(moduleName) {
    return !!moduleConfigs[moduleName];
  }
}

module.exports = new ReportExportService();
