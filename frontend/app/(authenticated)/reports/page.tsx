'use client';

import { useState, useEffect, useCallback } from 'react';
import { reportsApi, cashAdjustmentsApi, expensesApi, Expense, ExpenseSummary, CashAdjustment } from '@/lib/api';
import { toast } from '@/lib/toast';
import { DateRangePicker, CashAdjustmentFormModal, ExpenseFormModal } from '@/components/common';
import { makeShareableUrl } from '@/lib/urlHelper';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: number;
  booking_id: number;
  type: string;
  amount: number;
  method: string;
  charge_breakdown: Record<string, number> | null;
  notes: string;
  recorded_by: string;
  transaction_date: string;
  transaction_type: string;
  customer_name: string;
  customer_phone: string;
}

interface LedgerSummary {
  total_credits: number;
  total_debits: number;
  net_balance: number;
  method_breakdown: Array<{ method: string; credits: number; debits: number }>;
}



interface RentalSummary {
  rent_due: number;
  rent_collected: number;
  outstanding: number;
  collection_pct: number;
}

interface MonthlyRental {
  month_label: string;
  month_num: number;
  year: number;
  rent_due: number;
  rent_collected: number;
  outstanding: number;
  collection_pct: number;
}

interface ChargesSummaryRow {
  charge_type: string;
  total_amount: number;
  count: number;
}

interface DeadInventoryRow {
  id: number;
  product_code: string;
  product_name: string;
  category: string;
  rent_per_day: number;
  last_booked_date: string | null;
  days_idle: number;
  never_booked: boolean;
}

interface SecurityDepositRow {
  method: string;
  collected: number;
  refunded: number;
  held: number;
}

interface CustomerRow {
  user_id: number;
  customer_name: string;
  customer_phone: string;
  booking_count: number;
  total_revenue: number;
  net_revenue: number;
}

interface SalesmanRow {
  salesman: string;
  bookings_created: number;
  revenue_generated: number;
  payments_collected: number;
  cancellations: number;
}

interface ProductRow {
  id: number;
  product_code: string;
  product_name: string;
  category: string;
  rent_per_day: number;
  purchase_price: number;
  times_rented: number;
  total_rent_collected: number;
  roi_pct: number | null;
}



// ── Report menu items ────────────────────────────────────────────────────

const reportModules = [
  { key: 'ledger',     label: 'Financial Ledger',      icon: '💰', section: 'Financial' },
  { key: 'rental',     label: 'Rental Collection',     icon: '🏠', section: 'Financial' },
  { key: 'charges',    label: 'Charges & Penalties',   icon: '⚡', section: 'Financial' },
  { key: 'security',   label: 'Security Deposits',     icon: '🔒', section: 'Financial' },
  { key: 'expenses',   label: 'Expenses',              icon: '💸', section: 'Financial' },
  { key: 'dead',       label: 'Dead Inventory',        icon: '📦', section: 'Inventory' },
  { key: 'customers',  label: 'Customer Report',       icon: '👥', section: 'Business' },
  { key: 'salesman',   label: 'Salesman Performance',  icon: '📊', section: 'Business' },
  { key: 'products',   label: 'Product Performance',   icon: '🏆', section: 'Business' },
  { key: 'pnl',         label: 'Profit & Loss',          icon: '📈', section: 'Dashboard' },
];

// ── Helpers ──────────────────────────────────────────────────────────────

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric'
});
const chargeLabel = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ── Component ────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState('ledger');
  const [loading, setLoading] = useState(false);

  // --- Ledger state ---
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummary | null>(null);
  const [ledgerFilters, setLedgerFilters] = useState({ method: '', type: '', start_date: '', end_date: '', booking_id: '' });

  // --- Cash adjustments state ---
  const [adjustments, setAdjustments] = useState<CashAdjustment[]>([]);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [ledgerView, setLedgerView] = useState<'transactions' | 'adjustments'>('transactions');

  // --- Rental collection state ---
  const [rentalSummary, setRentalSummary] = useState<RentalSummary | null>(null);
  const [monthlyRental, setMonthlyRental] = useState<MonthlyRental[]>([]);
  const [selectedFY, setSelectedFY] = useState(() => {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  });

  // --- Charges state ---
  const [chargesSummary, setChargesSummary] = useState<ChargesSummaryRow[]>([]);

  // --- Dead inventory state ---
  const [deadInventory, setDeadInventory] = useState<DeadInventoryRow[]>([]);
  const [idleDays, setIdleDays] = useState(30);

  // --- Security deposits state ---
  const [securityDeposits, setSecurityDeposits] = useState<SecurityDepositRow[]>([]);

  // --- Customer state ---
  const [customers, setCustomers] = useState<CustomerRow[]>([]);

  // --- Salesman state ---
  const [salesmen, setSalesmen] = useState<SalesmanRow[]>([]);

  // --- Product state ---
  const [products, setProducts] = useState<ProductRow[]>([]);

  // --- Expenses state ---
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseFilters, setExpenseFilters] = useState({ start_date: '', end_date: '' });

  // --- Recurring expenses state ---
  const [recurringExpenses, setRecurringExpenses] = useState<any[]>([]);

  // Default expense categories
  const defaultCategories = ['Shop Rent', 'Dry Clean', 'Electricity', 'Salary', 'Maintenance', 'Transport', 'Packaging', 'Miscellaneous'];

  // --- Rental drill-down state ---
  const [rentalDrillDown, setRentalDrillDown] = useState<any[]>([]);
  const [drillDownMonth, setDrillDownMonth] = useState<{ year: number; month: number; label: string } | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  // --- P&L state ---
  const [pnlSummary, setPnlSummary] = useState<any>(null);
  const [pnlMonthly, setPnlMonthly] = useState<any[]>([]);
  const [pnlFyYear, setPnlFyYear] = useState(() => {
    const now = new Date();
    return now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  });
  const [pnlMode, setPnlMode] = useState<'fy' | 'custom'>('fy');
  const [pnlCustomStart, setPnlCustomStart] = useState('');
  const [pnlCustomEnd, setPnlCustomEnd] = useState('');

  // --- Export & Share state ---
  const [exporting, setExporting] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [whatsAppSending, setWhatsAppSending] = useState(false);

  // --- Export helpers ---
  const getExportParams = () => {
    const params: Record<string, any> = {};
    // Use the active module's date filters
    switch (activeReport) {
      case 'ledger':
        if (ledgerFilters.start_date) params.start_date = ledgerFilters.start_date;
        if (ledgerFilters.end_date) params.end_date = ledgerFilters.end_date;
        break;
      case 'expenses':
        if (expenseFilters.start_date) params.start_date = expenseFilters.start_date;
        if (expenseFilters.end_date) params.end_date = expenseFilters.end_date;
        break;
      case 'pnl':
        if (pnlMode === 'custom') {
          if (pnlCustomStart) params.start_date = pnlCustomStart;
          if (pnlCustomEnd) params.end_date = pnlCustomEnd;
        } else {
          params.start_date = `${pnlFyYear}-04-01`;
          params.end_date = `${pnlFyYear + 1}-03-31`;
        }
        break;
    }
    return params;
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const params = getExportParams();
      const response = await reportsApi.exportPdf(activeReport, params);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportModules.find(m => m.key === activeReport)?.label || 'Report'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch { toast.error('Failed to download PDF'); }
    finally { setExporting(false); }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params = getExportParams();
      const response = await reportsApi.exportCsv(activeReport, params);
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportModules.find(m => m.key === activeReport)?.label || 'Report'}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch { toast.error('Failed to download CSV'); }
    finally { setExporting(false); }
  };

  const handleEmailShare = async () => {
    if (!emailTo) { toast.error('Please enter an email address'); return; }
    setEmailSending(true);
    try {
      const params = getExportParams();
      await reportsApi.shareEmail({
        module: activeReport,
        email: emailTo,
        start_date: params.start_date,
        end_date: params.end_date
      });
      toast.success(`Report sent to ${emailTo}`);
      setShowEmailModal(false);
      setEmailTo('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send email');
    }
    finally { setEmailSending(false); }
  };

  const handleWhatsAppShare = async () => {
    if (!whatsAppPhone) { toast.error('Please enter a phone number'); return; }
    // Strip non-digits, ensure country code
    let phone = whatsAppPhone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '91' + phone.slice(1);
    if (phone.length === 10) phone = '91' + phone;
    if (phone.length < 10 || phone.length > 15) { toast.error('Invalid phone number'); return; }

    setWhatsAppSending(true);
    try {
      const params = getExportParams();
      const response = await reportsApi.shareWhatsApp({
        module: activeReport,
        start_date: params.start_date,
        end_date: params.end_date
      });
      const { url, title } = response.data;
      const publicUrl = makeShareableUrl(url);
      const message = `${title} Report from Fancyano\n\nDownload PDF: ${publicUrl}`;
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
      setShowWhatsAppModal(false);
      setWhatsAppPhone('');
      toast.success('Opening WhatsApp...');
    } catch { toast.error('Failed to generate report for sharing'); }
    finally { setWhatsAppSending(false); }
  };

  // ── Data loaders ───────────────────────────────────────────────────────

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (ledgerFilters.method) params.method = ledgerFilters.method;
      if (ledgerFilters.type) params.type = ledgerFilters.type;
      if (ledgerFilters.start_date) params.start_date = ledgerFilters.start_date;
      if (ledgerFilters.end_date) params.end_date = ledgerFilters.end_date;
      if (ledgerFilters.booking_id) params.booking_id = ledgerFilters.booking_id;

      const [entriesRes, summaryRes, adjRes] = await Promise.all([
        reportsApi.getLedger(params),
        reportsApi.getLedgerSummary(params),
        cashAdjustmentsApi.list()
      ]);
      setLedgerEntries(entriesRes.data);
      setLedgerSummary(summaryRes.data);
      setAdjustments(adjRes.data);
    } catch (err) {
      toast.error('Failed to load ledger data');
    } finally {
      setLoading(false);
    }
  }, [ledgerFilters]);

  const loadRental = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, monthlyRes] = await Promise.all([
        reportsApi.getRentalCollection(),
        reportsApi.getRentalCollectionMonthly(selectedFY)
      ]);
      setRentalSummary(summaryRes.data);
      setMonthlyRental(monthlyRes.data);
    } catch (err) {
      toast.error('Failed to load rental collection data');
    } finally {
      setLoading(false);
    }
  }, [selectedFY]);

  const loadCharges = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getChargesSummary();
      setChargesSummary(res.data);
    } catch (err) {
      toast.error('Failed to load charges data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getDeadInventory({ min_idle_days: idleDays });
      setDeadInventory(res.data);
    } catch (err) {
      toast.error('Failed to load dead inventory');
    } finally {
      setLoading(false);
    }
  }, [idleDays]);

  const loadSecurityDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getSecurityDeposits();
      setSecurityDeposits(res.data);
    } catch (err) {
      toast.error('Failed to load security deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getCustomers();
      setCustomers(res.data);
    } catch (err) {
      toast.error('Failed to load customer report');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSalesmen = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getSalesmanPerformance();
      setSalesmen(res.data);
    } catch (err) {
      toast.error('Failed to load salesman performance');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.getProductPerformance();
      setProducts(res.data);
    } catch (err) {
      toast.error('Failed to load product performance');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExpenses = useCallback(async (filters?: { start_date?: string; end_date?: string }) => {
    setLoading(true);
    try {
      // Process any due recurring expenses first
      await expensesApi.processRecurring().catch(() => {});
      const params = filters || {};
      const [listRes, summaryRes, recurringRes] = await Promise.all([
        expensesApi.list(params),
        expensesApi.getSummary(params),
        expensesApi.listRecurring()
      ]);
      setExpenses(listRes.data);
      setExpenseSummary(summaryRes.data);
      setRecurringExpenses(recurringRes.data);
    } catch (err) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);


  const loadPnl = useCallback(async () => {
    setLoading(true);
    try {
      if (pnlMode === 'custom') {
        if (!pnlCustomStart || !pnlCustomEnd) { setLoading(false); return; }
        const summaryRes = await reportsApi.getPnl({ start_date: pnlCustomStart, end_date: pnlCustomEnd });
        setPnlSummary(summaryRes.data);
        setPnlMonthly([]);
      } else {
        const fyStart = `${pnlFyYear}-04-01`;
        const fyEnd = `${pnlFyYear + 1}-03-31`;
        const [summaryRes, monthlyRes] = await Promise.all([
          reportsApi.getPnl({ start_date: fyStart, end_date: fyEnd }),
          reportsApi.getPnlMonthly(pnlFyYear)
        ]);
        setPnlSummary(summaryRes.data);
        setPnlMonthly(monthlyRes.data);
      }
    } catch (error) { console.error('Error loading P&L:', error); }
    finally { setLoading(false); }
  }, [pnlFyYear, pnlMode, pnlCustomStart, pnlCustomEnd]);

  // Reload P&L when FY year or mode changes
  useEffect(() => {
    if (activeReport === 'pnl') loadPnl();
  }, [pnlFyYear, pnlMode]);

  // ── Load data when report changes ─────────────────────────────────────

  useEffect(() => {
    switch (activeReport) {
      case 'ledger':    loadLedger(); break;
      case 'rental':    loadRental(); break;
      case 'charges':   loadCharges(); break;
      case 'dead':      loadDeadInventory(); break;
      case 'security':  loadSecurityDeposits(); break;
      case 'customers': loadCustomers(); break;
      case 'salesman':  loadSalesmen(); break;
      case 'products':  loadProducts(); break;
      case 'expenses':  loadExpenses(); break;
      case 'pnl':       loadPnl(); break;
    }
  }, [activeReport, loadLedger, loadRental, loadCharges, loadDeadInventory, loadSecurityDeposits, loadCustomers, loadSalesmen, loadProducts, loadExpenses, loadPnl]);

  // ── Cash adjustment actions ───────────────────────────────────────────

  const handleApproveAdjustment = async (id: number) => {
    try {
      await cashAdjustmentsApi.approve(id);
      toast.success('Adjustment approved');
      loadLedger();
    } catch (err) {
      toast.error('Failed to approve adjustment');
    }
  };

  const handleRejectAdjustment = async (id: number) => {
    try {
      await cashAdjustmentsApi.reject(id);
      toast.success('Adjustment rejected');
      loadLedger();
    } catch (err) {
      toast.error('Failed to reject adjustment');
    }
  };

  // ── Expense actions ───────────────────────────────────────────────────

  const handleDeleteExpense = async (id: number) => {
    try {
      await expensesApi.delete(id);
      toast.success('Expense deleted');
      loadExpenses();
    } catch (err) {
      toast.error('Failed to delete expense');
    }
  };

  const handleApproveExpense = async (id: number) => {
    try {
      await expensesApi.approve(id);
      toast.success('Expense approved');
      loadExpenses();
    } catch (err) {
      toast.error('Failed to approve expense');
    }
  };

  const handleRejectExpense = async (id: number) => {
    try {
      await expensesApi.reject(id);
      toast.success('Expense rejected');
      loadExpenses();
    } catch (err) {
      toast.error('Failed to reject expense');
    }
  };

  // ── Rental drill-down ─────────────────────────────────────────────────

  const loadRentalDrillDown = async (year: number, month: number, label: string) => {
    setDrillDownMonth({ year, month, label });
    setDrillDownLoading(true);
    try {
      const res = await reportsApi.getRentalCollectionBookings(year, month);
      setRentalDrillDown(res.data);
    } catch (err) {
      toast.error('Failed to load booking details');
    } finally {
      setDrillDownLoading(false);
    }
  };

  // ── Expense date filter ───────────────────────────────────────────────

  const handleExpenseDateFilter = () => {
    const filters: Record<string, string> = {};
    if (expenseFilters.start_date) filters.start_date = expenseFilters.start_date;
    if (expenseFilters.end_date) filters.end_date = expenseFilters.end_date;
    loadExpenses(filters);
  };

  const clearExpenseFilters = () => {
    setExpenseFilters({ start_date: '', end_date: '' });
    loadExpenses();
  };

  // ── Render helpers ────────────────────────────────────────────────────

  const renderSummaryCard = (title: string, value: string, subtitle?: string, color = 'text-gray-900') => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );

  // ── Financial Ledger Panel ────────────────────────────────────────────

  const renderLedger = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      {ledgerSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {renderSummaryCard('Total Credits', fmt(ledgerSummary.total_credits), 'Money In', 'text-green-600')}
          {renderSummaryCard('Total Debits', fmt(ledgerSummary.total_debits), 'Refunds', 'text-red-600')}
          {renderSummaryCard('Net Balance', fmt(ledgerSummary.net_balance), 'Credits - Debits', 'text-blue-600')}
        </div>
      )}

      {/* Method Breakdown */}
      {ledgerSummary && ledgerSummary.method_breakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Method Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ledgerSummary.method_breakdown.map(m => (
              <div key={m.method} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{m.method}</p>
                <p className="text-sm font-bold text-green-600">{fmt(m.credits)}</p>
                {m.debits > 0 && <p className="text-xs text-red-500">-{fmt(m.debits)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLedgerView('transactions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            ledgerView === 'transactions' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Transactions
        </button>
        <button
          onClick={() => setLedgerView('adjustments')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            ledgerView === 'adjustments' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Cash Adjustments
          {adjustments.filter(a => a.approval_status === 'pending').length > 0 && (
            <span className="ml-2 bg-yellow-400 text-yellow-900 text-xs px-2 py-0.5 rounded-full">
              {adjustments.filter(a => a.approval_status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* Filters (for transactions view) */}
      {ledgerView === 'transactions' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <select
              value={ledgerFilters.method}
              onChange={e => setLedgerFilters(f => ({ ...f, method: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Methods</option>
              <option value="Cash">Cash</option>
              <option value="Online">Online</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
            </select>
            <select
              value={ledgerFilters.type}
              onChange={e => setLedgerFilters(f => ({ ...f, type: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All Types</option>
              <option value="credit">Credit (Payment)</option>
              <option value="debit">Debit (Refund)</option>
            </select>
            <div className="sm:col-span-2">
              <DateRangePicker
                label="📅 Date Range"
                startDate={ledgerFilters.start_date}
                endDate={ledgerFilters.end_date}
                onStartDateChange={(date) => setLedgerFilters(f => ({ ...f, start_date: date }))}
                onEndDateChange={(date) => setLedgerFilters(f => ({ ...f, end_date: date }))}
                minDate="2000-01-01"
                maxDate={new Date().toISOString().split('T')[0]}
                compact
                startLabel="Start Date"
                endLabel="End Date"
              />
            </div>
            <input
              type="text"
              value={ledgerFilters.booking_id}
              onChange={e => setLedgerFilters(f => ({ ...f, booking_id: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Booking ID"
            />
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={() => { setLedgerFilters({ method: '', type: '', start_date: '', end_date: '', booking_id: '' }); loadLedger(); }}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-red-600 font-medium transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Cash Adjustment Button */}
      {ledgerView === 'adjustments' && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowAdjustmentModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            + New Adjustment
          </button>
        </div>
      )}

      {/* Cash Adjustment Modal */}
      {showAdjustmentModal && (
        <CashAdjustmentFormModal
          onClose={() => setShowAdjustmentModal(false)}
          onSuccess={loadLedger}
          userName=""
        />
      )}

      {/* Transactions Table */}
      {ledgerView === 'transactions' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Booking</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Method</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledgerEntries.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No transactions found</td></tr>
                ) : ledgerEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(entry.transaction_date)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">#{entry.booking_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.customer_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        entry.type === 'payment' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {entry.type === 'payment' ? 'Credit' : 'Debit'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.method}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${
                      entry.type === 'payment' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {entry.type === 'payment' ? '+' : '-'}{fmt(entry.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500" title={
                      entry.charge_breakdown
                        ? Object.entries(entry.charge_breakdown).map(([k, v]) => `${chargeLabel(k)}: ${fmt(v)}`).join(', ')
                        : ''
                    }>
                      {entry.charge_breakdown
                        ? Object.keys(entry.charge_breakdown).map(k => chargeLabel(k)).join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{entry.recorded_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustments Table */}
      {ledgerView === 'adjustments' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Reason</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Recorded By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adjustments.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No adjustments found</td></tr>
                ) : adjustments.map(adj => (
                  <tr key={adj.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(adj.adjustment_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{adj.reason}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${
                      adj.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {adj.amount > 0 ? '+' : ''}{fmt(adj.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        adj.approval_status === 'approved' ? 'bg-green-100 text-green-700' :
                        adj.approval_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {adj.approval_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{adj.recorded_by}</td>
                    <td className="px-4 py-3">
                      {adj.approval_status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveAdjustment(adj.id)}
                            className="px-3 py-1 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectAdjustment(adj.id)}
                            className="px-3 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ── Rental Collection Panel ───────────────────────────────────────────

  const renderRental = () => (
    <div className="space-y-6">
      {rentalSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {renderSummaryCard('Rent Due', fmt(rentalSummary.rent_due), 'Total expected', 'text-gray-900')}
          {renderSummaryCard('Rent Collected', fmt(rentalSummary.rent_collected), 'Actually received', 'text-green-600')}
          {renderSummaryCard('Outstanding', fmt(rentalSummary.outstanding), 'Pending payment', 'text-red-600')}
          {renderSummaryCard('Collection %', `${rentalSummary.collection_pct}%`, 'Collection rate', 'text-blue-600')}
        </div>
      )}

      {/* FY selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">Monthly Breakdown</h3>
        <select
          value={selectedFY}
          onChange={e => setSelectedFY(parseInt(e.target.value))}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          {Array.from({ length: 5 }, (_, i) => {
            const year = new Date().getFullYear() - i;
            return (
              <option key={year} value={year}>
                FY {year}-{(year + 1).toString().slice(-2)}
              </option>
            );
          })}
        </select>
      </div>

      {/* Monthly table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Month</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rent Due</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Collected</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Outstanding</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Collection %</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthlyRental.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No data for this FY</td></tr>
              ) : monthlyRental.map(m => (
                <tr
                  key={m.month_label}
                  className="hover:bg-red-50 transition-colors cursor-pointer"
                  onClick={() => loadRentalDrillDown(m.year, m.month_num, m.month_label)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-red-600 underline">{m.month_label}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(m.rent_due)}</td>
                  <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">{fmt(m.rent_collected)}</td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">{fmt(m.outstanding)}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={`font-medium ${m.collection_pct >= 90 ? 'text-green-600' : m.collection_pct >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {m.collection_pct}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span className="text-gray-400 text-xs">▶ View</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking-level drill-down */}
      {drillDownMonth && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-800">
              📋 Booking Details — {drillDownMonth.label}
            </h3>
            <button onClick={() => { setDrillDownMonth(null); setRentalDrillDown([]); }} className="text-xs text-gray-500 hover:text-red-600 font-medium">
              ✕ Close
            </button>
          </div>
          {drillDownLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Booking ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Products</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rent Due</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Pending</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rentalDrillDown.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No bookings for this month</td></tr>
                  ) : rentalDrillDown.map((b: any) => (
                    <tr key={b.booking_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm">
                        <Link
                          href={`/bookings/${b.booking_id}`}
                          className="text-red-600 hover:text-red-800 font-semibold underline"
                        >
                          #{b.booking_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{b.customer_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {Array.isArray(b.products) ? b.products.map((p: any) => p.code || p.name).join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(b.rent_due)}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">{fmt(b.rent_paid)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{fmt(b.rent_due - b.rent_paid)}</td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          b.payment_status === 'Fully Paid' ? 'bg-green-100 text-green-700' :
                          b.payment_status === 'Partial' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {b.payment_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Charges & Penalties Panel ─────────────────────────────────────────

  const renderCharges = () => {
    const totalCharges = chargesSummary.reduce((s, r) => s + r.total_amount, 0);
    const totalCount = chargesSummary.reduce((s, r) => s + r.count, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {renderSummaryCard('Total Charges', fmt(totalCharges), `${totalCount} charges total`, 'text-red-600')}
          {renderSummaryCard('Charge Types', `${chargesSummary.length}`, 'Active penalty categories', 'text-gray-900')}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Charge Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Count</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Total Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Avg Per Charge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {chargesSummary.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No charges found</td></tr>
                ) : chargesSummary.map(row => (
                  <tr key={row.charge_type} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-700">{chargeLabel(row.charge_type)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.count}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{fmt(row.total_amount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">
                      {row.count > 0 ? fmt(Math.round(row.total_amount / row.count)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── Dead Inventory Panel ──────────────────────────────────────────────

  const renderDeadInventory = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {renderSummaryCard('Dead Products', `${deadInventory.length}`, `Idle ≥ ${idleDays} days`, 'text-red-600')}
        {renderSummaryCard('Never Booked', `${deadInventory.filter(p => p.never_booked).length}`, 'Products never rented', 'text-orange-600')}
        {renderSummaryCard('Revenue Loss', fmt(deadInventory.reduce((s, p) => s + p.rent_per_day * p.days_idle, 0)), 'Potential rent lost (est.)', 'text-gray-900')}
      </div>

      {/* Idle days filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">Min idle days:</span>
        {[30, 60, 90, 180].map(d => (
          <button
            key={d}
            onClick={() => setIdleDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              idleDays === d ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {d}+
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Category</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rent/Day</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Days Idle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Last Booked</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deadInventory.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No dead inventory found</td></tr>
              ) : deadInventory.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">{p.product_code}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.product_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.category || '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(p.rent_per_day)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{p.days_idle}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {p.last_booked_date ? fmtDate(p.last_booked_date) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.never_booked ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {p.never_booked ? 'Never Booked' : 'Slow Moving'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Security Deposits Panel ───────────────────────────────────────────

  const renderSecurityDeposits = () => {
    const totalCollected = securityDeposits.reduce((s, r) => s + r.collected, 0);
    const totalRefunded = securityDeposits.reduce((s, r) => s + r.refunded, 0);
    const totalHeld = securityDeposits.reduce((s, r) => s + r.held, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {renderSummaryCard('Total Collected', fmt(totalCollected), 'Security deposits received', 'text-green-600')}
          {renderSummaryCard('Total Refunded', fmt(totalRefunded), 'Security deposits returned', 'text-red-600')}
          {renderSummaryCard('Currently Held', fmt(totalHeld), 'Net deposit balance', 'text-blue-600')}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Payment Method</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Refunded</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Held</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {securityDeposits.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No security deposit data</td></tr>
                ) : securityDeposits.map(row => (
                  <tr key={row.method} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-700">{row.method}</td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">{fmt(row.collected)}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">{fmt(row.refunded)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{fmt(row.held)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── Customer Report Panel ─────────────────────────────────────────────

  const renderCustomers = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {renderSummaryCard('Total Customers', `${customers.length}`, 'With bookings', 'text-gray-900')}
        {renderSummaryCard('Total Revenue', fmt(customers.reduce((s, c) => s + c.total_revenue, 0)), 'All customer payments', 'text-green-600')}
        {renderSummaryCard('Net Revenue', fmt(customers.reduce((s, c) => s + c.net_revenue, 0)), 'After refunds', 'text-blue-600')}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Phone</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Bookings</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Total Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Net Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No customer data</td></tr>
              ) : customers.map(c => (
                <tr key={c.user_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.customer_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.customer_phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{c.booking_count}</td>
                  <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">{fmt(c.total_revenue)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{fmt(c.net_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Salesman Performance Panel ────────────────────────────────────────

  const renderSalesman = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {renderSummaryCard('Salesmen', `${salesmen.length}`, 'Active salesmen', 'text-gray-900')}
        {renderSummaryCard('Total Bookings', `${salesmen.reduce((s, r) => s + r.bookings_created, 0)}`, 'All bookings created', 'text-blue-600')}
        {renderSummaryCard('Total Revenue', fmt(salesmen.reduce((s, r) => s + r.revenue_generated, 0)), 'Revenue from all salesmen', 'text-green-600')}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Salesman</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Bookings</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Payments Collected</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Cancellations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {salesmen.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No salesman data</td></tr>
              ) : salesmen.map(s => (
                <tr key={s.salesman} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.salesman}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{s.bookings_created}</td>
                  <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">{fmt(s.revenue_generated)}</td>
                  <td className="px-4 py-3 text-sm text-right text-blue-600">{fmt(s.payments_collected)}</td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">{s.cancellations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Product Performance Panel ─────────────────────────────────────────

  const renderProducts = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {renderSummaryCard('Products', `${products.length}`, 'Available products', 'text-gray-900')}
        {renderSummaryCard('Total Rent', fmt(products.reduce((s, p) => s + p.total_rent_collected, 0)), 'All rent collected', 'text-green-600')}
        {renderSummaryCard('Total Rentals', `${products.reduce((s, p) => s + p.times_rented, 0)}`, 'Times rented', 'text-blue-600')}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Category</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rent/Day</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Times Rented</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Total Rent</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">ROI %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No product data</td></tr>
              ) : products.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">{p.product_code}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.product_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.category || '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(p.rent_per_day)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">{p.times_rented}</td>
                  <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">{fmt(p.total_rent_collected)}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {p.roi_pct != null ? (
                      <span className={`font-medium ${p.roi_pct >= 100 ? 'text-green-600' : p.roi_pct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {p.roi_pct}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Expenses Panel ────────────────────────────────────────────────────

  const renderExpenses = () => {
    const totalExpenses = expenseSummary.reduce((s, r) => s + r.total_amount, 0);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {renderSummaryCard('Total Expenses', fmt(totalExpenses), `${expenses.length} entries`, 'text-red-600')}
          {renderSummaryCard('Categories', `${expenseSummary.length}`, 'Active categories', 'text-gray-900')}
          {renderSummaryCard('Avg/Entry', expenses.length > 0 ? fmt(Math.round(totalExpenses / expenses.length)) : '₹0', 'Average expense', 'text-blue-600')}
        </div>

        {/* Summary by category */}
        {expenseSummary.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">By Category</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {expenseSummary.map(s => (
                <div key={s.category} className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{s.category}</p>
                  <p className="text-sm font-bold text-red-600">{fmt(s.total_amount)}</p>
                  <p className="text-xs text-gray-400">{s.count} entries</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Date filter */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="sm:col-span-2">
              <DateRangePicker
                label="📅 Date Range"
                startDate={expenseFilters.start_date}
                endDate={expenseFilters.end_date}
                onStartDateChange={(date) => { setExpenseFilters(f => ({ ...f, start_date: date })); }}
                onEndDateChange={(date) => { setExpenseFilters(f => ({ ...f, end_date: date })); }}
                minDate="2000-01-01"
                compact
                startLabel="Start Date"
                endLabel="End Date"
              />
            </div>
            <button onClick={handleExpenseDateFilter} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
              Apply
            </button>
            {(expenseFilters.start_date || expenseFilters.end_date) && (
              <button onClick={clearExpenseFilters} className="px-3 py-2 text-sm text-gray-600 hover:text-red-600 font-medium transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Add expense button (opens modal) */}
        <div className="flex justify-end">
          <button onClick={() => setShowExpenseModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            + Add Expense
          </button>
        </div>

        {/* Expense Modal */}
        {showExpenseModal && (
          <ExpenseFormModal
            onClose={() => setShowExpenseModal(false)}
            onSuccess={loadExpenses}
            userName=""
            categories={defaultCategories}
            allowRecurring={true}
          />
        )}

        {/* Expenses table — with approval status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Paid From</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Recorded By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No expenses found</td></tr>
                ) : expenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(e.expense_date)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{e.category}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{e.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{fmt(e.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.payment_source === 'Shop Cash' ? 'bg-blue-100 text-blue-700' :
                        e.payment_source === 'Online' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {e.payment_source || 'Shop Cash'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.approval_status === 'approved' ? 'bg-green-100 text-green-700' :
                        e.approval_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {e.approval_status || 'approved'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{e.recorded_by}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {e.approval_status === 'pending' && (
                          <>
                            <button onClick={() => handleApproveExpense(e.id)} className="px-3 py-1 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600 transition-colors">Approve</button>
                            <button onClick={() => handleRejectExpense(e.id)} className="px-3 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors">Reject</button>
                          </>
                        )}
                        <button onClick={() => handleDeleteExpense(e.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Recurring Expenses Section ───────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">🔄 Recurring Monthly Expenses</h3>
          </div>

          {recurringExpenses.length === 0 ? (
            <div className="px-5 py-6 text-center text-gray-400 text-sm">No recurring expenses configured. Add one to auto-create monthly entries.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recurringExpenses.map((rec: any) => (
                <div key={rec.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      rec.approval_status === 'pending' ? 'bg-yellow-400' :
                      rec.approval_status === 'rejected' ? 'bg-red-400' :
                      rec.is_active ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {rec.category}
                        {rec.approval_status && rec.approval_status !== 'approved' && (
                          <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            rec.approval_status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {rec.approval_status}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {rec.description || 'Monthly'} • Next: {rec.next_due_date ? fmtDate(rec.next_due_date) : '—'}
                        {rec.last_created_date && <span> • Last: {fmtDate(rec.last_created_date)}</span>}
                        {rec.created_by && <span> • by {rec.created_by}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-red-600">{fmt(rec.amount)}/mo</span>
                    {rec.approval_status === 'pending' ? (
                      <>
                        <button
                          onClick={async () => { await expensesApi.approveRecurring(rec.id); loadExpenses(); }}
                          className="px-2 py-1 text-xs bg-green-500 text-white rounded font-medium hover:bg-green-600 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={async () => { await expensesApi.rejectRecurring(rec.id); loadExpenses(); }}
                          className="px-2 py-1 text-xs bg-red-500 text-white rounded font-medium hover:bg-red-600 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    ) : rec.approval_status !== 'rejected' && (
                      rec.is_active ? (
                        <button
                          onClick={async () => { await expensesApi.deactivateRecurring(rec.id); loadExpenses(); }}
                          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded font-medium hover:bg-yellow-200"
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={async () => { await expensesApi.activateRecurring(rec.id); loadExpenses(); }}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded font-medium hover:bg-green-200"
                        >
                          Activate
                        </button>
                      )
                    )}
                    <button
                      onClick={async () => { if (confirm('Delete this recurring expense?')) { await expensesApi.deleteRecurring(rec.id); loadExpenses(); } }}
                      className="px-2 py-1 text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── P&L Dashboard ────────────────────────────────────────────────────

  const renderPnl = () => (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button
              onClick={() => { setPnlMode('fy'); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                pnlMode === 'fy' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Fiscal Year
            </button>
            <button
              onClick={() => { setPnlMode('custom'); setPnlSummary(null); setPnlMonthly([]); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                pnlMode === 'custom' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Custom Dates
            </button>
          </div>

          {/* FY Selector */}
          {pnlMode === 'fy' && (
            <select
              value={pnlFyYear}
              onChange={e => { setPnlFyYear(parseInt(e.target.value)); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>FY {y}-{(y + 1).toString().slice(2)}</option>;
              })}
            </select>
          )}

          {/* Custom Date Range */}
          {pnlMode === 'custom' && (
            <DateRangePicker
              label="📅 Date Range"
              startDate={pnlCustomStart}
              endDate={pnlCustomEnd}
              onStartDateChange={(date) => setPnlCustomStart(date)}
              onEndDateChange={(date) => setPnlCustomEnd(date)}
              minDate="2000-01-01"
              maxDate={new Date().toISOString().split('T')[0]}
              compact
              startLabel="Start Date"
              endLabel="End Date"
            />
          )}

          <button onClick={loadPnl} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
            Refresh
          </button>
        </div>

        {/* Custom date range label */}
        {pnlMode === 'custom' && pnlCustomStart && pnlCustomEnd && (
          <p className="text-xs text-gray-500 mt-2">
            Showing data from <strong>{new Date(pnlCustomStart + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong> to <strong>{new Date(pnlCustomEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          </p>
        )}
      </div>

      {/* Prompt for custom mode */}
      {pnlMode === 'custom' && (!pnlCustomStart || !pnlCustomEnd) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <p className="text-blue-600 text-sm font-medium">📅 Select both start and end dates above to view P&L data for that period</p>
        </div>
      )}

      {/* Summary Cards */}
      {pnlSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {renderSummaryCard('Gross Revenue', fmt(pnlSummary.revenue), 'Total payments received', 'text-green-600')}
          {renderSummaryCard('Refunds', fmt(pnlSummary.refunds), 'Money returned', 'text-orange-600')}
          {renderSummaryCard('Net Revenue', fmt(pnlSummary.net_revenue), 'Revenue after refunds', 'text-blue-600')}
          {renderSummaryCard('Expenses', fmt(pnlSummary.expenses), 'Operating expenses', 'text-red-600')}
          {renderSummaryCard('Purchases', fmt(pnlSummary.purchases), 'Inventory cost', 'text-purple-600')}
          {renderSummaryCard(
            pnlSummary.profit >= 0 ? 'Net Profit' : 'Net Loss',
            fmt(Math.abs(pnlSummary.profit)),
            `${pnlSummary.profit_margin}% margin`,
            pnlSummary.profit >= 0 ? 'text-green-700' : 'text-red-700'
          )}
        </div>
      )}

      {/* Profit/Loss Bar Visual */}
      {pnlSummary && pnlSummary.net_revenue > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenue Breakdown</h3>
          <div className="flex h-8 rounded-full overflow-hidden bg-gray-100">
            {pnlSummary.profit > 0 && (
              <div className="bg-green-500 flex items-center justify-center text-white text-xs font-bold" style={{ width: `${Math.round((pnlSummary.profit / pnlSummary.net_revenue) * 100)}%` }}>
                Profit {Math.round((pnlSummary.profit / pnlSummary.net_revenue) * 100)}%
              </div>
            )}
            {pnlSummary.expenses > 0 && (
              <div className="bg-red-400 flex items-center justify-center text-white text-xs font-bold" style={{ width: `${Math.round((pnlSummary.expenses / pnlSummary.net_revenue) * 100)}%` }}>
                Expenses {Math.round((pnlSummary.expenses / pnlSummary.net_revenue) * 100)}%
              </div>
            )}
            {pnlSummary.purchases > 0 && (
              <div className="bg-purple-400 flex items-center justify-center text-white text-xs font-bold" style={{ width: `${Math.round((pnlSummary.purchases / pnlSummary.net_revenue) * 100)}%` }}>
                Purchases {Math.round((pnlSummary.purchases / pnlSummary.net_revenue) * 100)}%
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monthly Breakdown Table (FY mode only) */}
      {pnlMode === 'fy' && (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Monthly P&L — FY {pnlFyYear}-{(pnlFyYear + 1).toString().slice(2)}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Month</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Refunds</th>
                <th className="px-4 py-3 text-right">Net Revenue</th>
                <th className="px-4 py-3 text-right">Expenses</th>
                <th className="px-4 py-3 text-right">Purchases</th>
                <th className="px-4 py-3 text-right">Profit/Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pnlMonthly.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No data for this fiscal year</td></tr>
              ) : pnlMonthly.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.month_label}</td>
                  <td className="px-4 py-3 text-right text-green-600">{fmt(row.revenue)}</td>
                  <td className="px-4 py-3 text-right text-orange-500">{fmt(row.refunds)}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-medium">{fmt(row.net_revenue)}</td>
                  <td className="px-4 py-3 text-right text-red-500">{fmt(row.expenses)}</td>
                  <td className="px-4 py-3 text-right text-purple-500">{fmt(row.purchases)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${row.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {row.profit >= 0 ? '+' : '-'}{fmt(Math.abs(row.profit))}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              {pnlMonthly.length > 0 && (
                <tr className="bg-gray-100 font-bold">
                  <td className="px-4 py-3 text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-right text-green-700">{fmt(pnlMonthly.reduce((s: number, r: any) => s + r.revenue, 0))}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{fmt(pnlMonthly.reduce((s: number, r: any) => s + r.refunds, 0))}</td>
                  <td className="px-4 py-3 text-right text-blue-700">{fmt(pnlMonthly.reduce((s: number, r: any) => s + r.net_revenue, 0))}</td>
                  <td className="px-4 py-3 text-right text-red-600">{fmt(pnlMonthly.reduce((s: number, r: any) => s + r.expenses, 0))}</td>
                  <td className="px-4 py-3 text-right text-purple-600">{fmt(pnlMonthly.reduce((s: number, r: any) => s + r.purchases, 0))}</td>
                  <td className={`px-4 py-3 text-right ${pnlMonthly.reduce((s: number, r: any) => s + r.profit, 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {(() => { const t = pnlMonthly.reduce((s: number, r: any) => s + r.profit, 0); return `${t >= 0 ? '+' : '-'}${fmt(Math.abs(t))}`; })()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>)}
    </div>
  );

  // ── Active panel renderer ─────────────────────────────────────────────

  const renderActiveReport = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600"></div>
        </div>
      );
    }

    switch (activeReport) {
      case 'ledger':    return renderLedger();
      case 'rental':    return renderRental();
      case 'charges':   return renderCharges();
      case 'dead':      return renderDeadInventory();
      case 'security':  return renderSecurityDeposits();
      case 'customers': return renderCustomers();
      case 'salesman':  return renderSalesman();
      case 'products':  return renderProducts();
      case 'expenses':  return renderExpenses();
      case 'pnl':       return renderPnl();
      default:          return null;
    }
  };

  // ── Main layout ───────────────────────────────────────────────────────

  const sections = [...new Set(reportModules.map(m => m.section))];

  return (
    <div className="space-y-0">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-black">Reports</h1>
      </div>

      <div className="flex gap-6">
        {/* Report Navigation Sidebar */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden sticky top-24">
            {sections.map(section => (
              <div key={section}>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{section}</p>
                </div>
                {reportModules.filter(m => m.section === section).map(mod => (
                  <button
                    key={mod.key}
                    onClick={() => setActiveReport(mod.key)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                      activeReport === mod.key
                        ? 'bg-red-50 text-red-700 font-semibold border-r-2 border-red-600'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-base">{mod.icon}</span>
                    <span>{mod.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {reportModules.find(m => m.key === activeReport)?.icon}{' '}
              {reportModules.find(m => m.key === activeReport)?.label}
            </h2>
            {/* Export & Share Toolbar */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                📄 PDF
              </button>
              <button
                onClick={handleExportCsv}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                📊 CSV
              </button>
              <button
                onClick={() => setShowEmailModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                ✉️ Email
              </button>
              <button
                onClick={() => setShowWhatsAppModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                💬 WhatsApp
              </button>
            </div>
          </div>

          {/* Email Share Modal */}
          {showEmailModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowEmailModal(false)}>
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-900 mb-4">✉️ Email Report</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Send <strong>{reportModules.find(m => m.key === activeReport)?.label}</strong> as PDF to:
                </p>
                <input
                  type="email"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleEmailShare(); }}
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEmailShare}
                    disabled={emailSending}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {emailSending ? 'Sending...' : 'Send Report'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp Share Modal */}
          {showWhatsAppModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowWhatsAppModal(false)}>
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-900 mb-4">💬 Share via WhatsApp</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Send <strong>{reportModules.find(m => m.key === activeReport)?.label}</strong> PDF link to:
                </p>
                <input
                  type="tel"
                  value={whatsAppPhone}
                  onChange={e => setWhatsAppPhone(e.target.value)}
                  placeholder="Phone number (e.g. 9876543210)"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleWhatsAppShare(); }}
                />
                <p className="text-xs text-gray-400 mb-4">Indian numbers auto-prefixed with +91. Include country code for international.</p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowWhatsAppModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleWhatsAppShare}
                    disabled={whatsAppSending}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {whatsAppSending ? 'Generating...' : 'Send via WhatsApp'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {renderActiveReport()}
        </div>
      </div>
    </div>
  );
}
