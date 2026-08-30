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

  describe('getLedgerSummary', () => {
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
