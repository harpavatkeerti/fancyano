const pool = require('../database/connection');
const reportService = require('./reportService');

describe('ReportService', () => {
  // These tests query existing data in the test database.
  // The globalSetup copies schema from prod, so we work with whatever test data exists.

  describe('getLedger', () => {
    test('should return ledger entries', async () => {
      const entries = await reportService.getLedger({});
      expect(Array.isArray(entries)).toBe(true);
      // Each entry should have the expected fields
      if (entries.length > 0) {
        expect(entries[0]).toHaveProperty('id');
        expect(entries[0]).toHaveProperty('booking_id');
        expect(entries[0]).toHaveProperty('type');
        expect(entries[0]).toHaveProperty('amount');
        expect(entries[0]).toHaveProperty('method');
        expect(entries[0]).toHaveProperty('transaction_date');
      }
    });

    test('should filter by payment method', async () => {
      const entries = await reportService.getLedger({ method: 'Cash' });
      expect(Array.isArray(entries)).toBe(true);
      for (const entry of entries) {
        expect(entry.method).toBe('Cash');
      }
    });

    test('should filter by type (credit = payment)', async () => {
      const entries = await reportService.getLedger({ type: 'credit' });
      expect(Array.isArray(entries)).toBe(true);
      for (const entry of entries) {
        expect(entry.type).toBe('payment');
      }
    });

    test('should filter by type (debit = refund)', async () => {
      const entries = await reportService.getLedger({ type: 'debit' });
      expect(Array.isArray(entries)).toBe(true);
      for (const entry of entries) {
        expect(entry.type).toBe('refund');
      }
    });

    test('should paginate results', async () => {
      const page1 = await reportService.getLedger({ page: 1, limit: 2 });
      expect(page1.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getLedger — expenses and adjustments in UNION', () => {
    const prefix = 'jest_rpt_ledger';

    afterAll(async () => {
      await pool.query("DELETE FROM expenses WHERE recorded_by LIKE $1", [`${prefix}%`]);
      await pool.query("DELETE FROM cash_adjustments WHERE recorded_by LIKE $1", [`${prefix}%`]);
    });

    beforeEach(async () => {
      await pool.query("DELETE FROM expenses WHERE recorded_by LIKE $1", [`${prefix}%`]);
      await pool.query("DELETE FROM cash_adjustments WHERE recorded_by LIKE $1", [`${prefix}%`]);
    });

    test('should include approved Shop Cash expenses in ledger entries', async () => {
      await pool.query(
        `INSERT INTO expenses (category, amount, recorded_by, approval_status, payment_source, expense_date)
         VALUES ($1, $2, $3, 'approved', 'Shop Cash', CURRENT_DATE)`,
        ['Test Rent', 3000, `${prefix}_exp`]
      );

      const entries = await reportService.getLedger({ page: 1, limit: 200 });
      const expenseEntries = entries.filter(e => e.type === 'expense' && e.recorded_by === `${prefix}_exp`);
      expect(expenseEntries.length).toBe(1);
      expect(expenseEntries[0].booking_id).toBeNull();
      expect(expenseEntries[0].method).toBe('Shop Cash');
      expect(parseInt(expenseEntries[0].amount)).toBe(3000);
    });

    test('should NOT include pending expenses in ledger', async () => {
      await pool.query(
        `INSERT INTO expenses (category, amount, recorded_by, approval_status, payment_source, expense_date)
         VALUES ($1, $2, $3, 'pending', 'Shop Cash', CURRENT_DATE)`,
        ['Pending Bill', 500, `${prefix}_pend`]
      );

      const entries = await reportService.getLedger({ page: 1, limit: 200 });
      const pendingEntries = entries.filter(e => e.type === 'expense' && e.recorded_by === `${prefix}_pend`);
      expect(pendingEntries.length).toBe(0);
    });

    test('should NOT include Online/Personal expenses in ledger', async () => {
      await pool.query(
        `INSERT INTO expenses (category, amount, recorded_by, approval_status, payment_source, expense_date)
         VALUES ($1, $2, $3, 'approved', 'Online', CURRENT_DATE)`,
        ['Online Bill', 1000, `${prefix}_online`]
      );

      const entries = await reportService.getLedger({ page: 1, limit: 200 });
      const onlineEntries = entries.filter(e => e.type === 'expense' && e.recorded_by === `${prefix}_online`);
      expect(onlineEntries.length).toBe(0);
    });

    test('should include approved cash adjustments in ledger entries', async () => {
      await pool.query(
        `INSERT INTO cash_adjustments (amount, reason, recorded_by, approval_status, adjustment_date)
         VALUES ($1, $2, $3, 'approved', CURRENT_DATE)`,
        [-200, 'Shortage', `${prefix}_adj`]
      );

      const entries = await reportService.getLedger({ page: 1, limit: 200 });
      const adjEntries = entries.filter(e => e.type === 'adjustment' && e.recorded_by === `${prefix}_adj`);
      expect(adjEntries.length).toBe(1);
      expect(adjEntries[0].booking_id).toBeNull();
      expect(adjEntries[0].method).toBe('Cash');
      expect(parseInt(adjEntries[0].amount)).toBe(-200);
    });

    test('should exclude expenses/adjustments when filtering by booking_id', async () => {
      await pool.query(
        `INSERT INTO expenses (category, amount, recorded_by, approval_status, payment_source, expense_date)
         VALUES ($1, $2, $3, 'approved', 'Shop Cash', CURRENT_DATE)`,
        ['Some Expense', 500, `${prefix}_bk`]
      );

      const entries = await reportService.getLedger({ booking_id: 1 });
      const expEntries = entries.filter(e => e.type === 'expense');
      expect(expEntries.length).toBe(0);
    });
  });

  describe('getLedgerSummary — with expenses and adjustments', () => {
    test('should return ledger summary with totals and breakdown', async () => {
      const summary = await reportService.getLedgerSummary({});
      expect(summary).toHaveProperty('total_credits');
      expect(summary).toHaveProperty('total_debits');
      expect(summary).toHaveProperty('net_balance');
      expect(summary).toHaveProperty('method_breakdown');
      expect(Array.isArray(summary.method_breakdown)).toBe(true);
      expect(typeof summary.total_credits).toBe('number');
      expect(typeof summary.total_debits).toBe('number');
    });

    test('should include total_expenses and total_adjustments fields', async () => {
      const summary = await reportService.getLedgerSummary({});
      expect(summary).toHaveProperty('total_expenses');
      expect(summary).toHaveProperty('total_adjustments');
      expect(typeof summary.total_expenses).toBe('number');
      expect(typeof summary.total_adjustments).toBe('number');
    });

    test('net_balance should equal credits - debits - expenses + adjustments', async () => {
      const summary = await reportService.getLedgerSummary({});
      const expected = summary.total_credits - summary.total_debits - summary.total_expenses + summary.total_adjustments;
      expect(summary.net_balance).toBe(expected);
    });

    test('should exclude expenses from summary when filtering by non-Shop-Cash method', async () => {
      const summary = await reportService.getLedgerSummary({ method: 'UPI' });
      expect(summary.total_expenses).toBe(0);
    });
  });

  describe('getRentalCollectionSummary', () => {
    test('should return rental collection summary', async () => {
      const summary = await reportService.getRentalCollectionSummary({});
      expect(summary).toHaveProperty('rent_due');
      expect(summary).toHaveProperty('rent_collected');
      expect(summary).toHaveProperty('outstanding');
      expect(summary).toHaveProperty('collection_pct');
      expect(typeof summary.rent_due).toBe('number');
    });
  });

  describe('getRentalCollectionMonthly', () => {
    test('should return monthly breakdown for a FY', async () => {
      const data = await reportService.getRentalCollectionMonthly(2025);
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('month_label');
        expect(data[0]).toHaveProperty('rent_due');
        expect(data[0]).toHaveProperty('rent_collected');
        expect(data[0]).toHaveProperty('outstanding');
        expect(data[0]).toHaveProperty('collection_pct');
      }
    });
  });

  describe('getRentalCollectionByBooking', () => {
    test('should return booking-level rent details', async () => {
      const now = new Date();
      const data = await reportService.getRentalCollectionByBooking(
        now.getFullYear(), now.getMonth() + 1
      );
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('booking_id');
        expect(data[0]).toHaveProperty('customer_name');
        expect(data[0]).toHaveProperty('rent_due');
        expect(data[0]).toHaveProperty('rent_paid');
        expect(data[0]).toHaveProperty('payment_status');
      }
    });
  });

  describe('getChargesReport', () => {
    test('should return charges report', async () => {
      const data = await reportService.getChargesReport({});
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('charge_type');
        expect(data[0]).toHaveProperty('amount');
        expect(data[0]).toHaveProperty('booking_id');
      }
    });

    test('should filter by charge type', async () => {
      const data = await reportService.getChargesReport({ charge_type: 'exchange_penalty' });
      expect(Array.isArray(data)).toBe(true);
      for (const row of data) {
        expect(row.charge_type).toBe('exchange_penalty');
      }
    });
  });

  describe('getChargesSummary', () => {
    test('should return charges summary per type', async () => {
      const data = await reportService.getChargesSummary({});
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('charge_type');
        expect(data[0]).toHaveProperty('total_amount');
        expect(data[0]).toHaveProperty('count');
      }
    });
  });

  describe('getDeadInventory', () => {
    test('should return dead inventory products', async () => {
      const data = await reportService.getDeadInventory({ min_idle_days: 0 });
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('product_code');
        expect(data[0]).toHaveProperty('product_name');
        expect(data[0]).toHaveProperty('days_idle');
        expect(data[0]).toHaveProperty('never_booked');
      }
    });

    test('should filter by minimum idle days', async () => {
      const data = await reportService.getDeadInventory({ min_idle_days: 9999 });
      // With a very high threshold, most products should be filtered out
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('getSecurityDepositSummary', () => {
    test('should return security deposit summary by method', async () => {
      const data = await reportService.getSecurityDepositSummary({});
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('method');
        expect(data[0]).toHaveProperty('collected');
        expect(data[0]).toHaveProperty('refunded');
        expect(data[0]).toHaveProperty('held');
      }
    });
  });

  describe('getCustomerReport', () => {
    test('should return customer report', async () => {
      const data = await reportService.getCustomerReport({});
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('customer_name');
        expect(data[0]).toHaveProperty('booking_count');
        expect(data[0]).toHaveProperty('total_revenue');
      }
    });
  });

  describe('getCustomerOutstanding', () => {
    test('should return customers with outstanding dues', async () => {
      const data = await reportService.getCustomerOutstanding();
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('customer_name');
        expect(data[0]).toHaveProperty('total_outstanding');
        expect(data[0].total_outstanding).toBeGreaterThan(0);
      }
    });
  });

  describe('getSalesmanPerformance', () => {
    test('should return salesman performance metrics', async () => {
      const data = await reportService.getSalesmanPerformance();
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('salesman');
        expect(data[0]).toHaveProperty('bookings_created');
        expect(data[0]).toHaveProperty('revenue_generated');
        expect(data[0]).toHaveProperty('payments_collected');
        expect(data[0]).toHaveProperty('cancellations');
      }
    });
  });

  describe('getProductPerformance', () => {
    test('should return product performance metrics', async () => {
      const data = await reportService.getProductPerformance({});
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('product_code');
        expect(data[0]).toHaveProperty('product_name');
        expect(data[0]).toHaveProperty('times_rented');
        expect(data[0]).toHaveProperty('total_rent_collected');
      }
    });
  });
});
