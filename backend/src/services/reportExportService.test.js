const reportExportService = require('./reportExportService');

describe('ReportExportService', () => {
  describe('isSupported', () => {
    test('should return true for known modules', () => {
      expect(reportExportService.isSupported('ledger')).toBe(true);
      expect(reportExportService.isSupported('rental')).toBe(true);
      expect(reportExportService.isSupported('charges')).toBe(true);
      expect(reportExportService.isSupported('expenses')).toBe(true);
      expect(reportExportService.isSupported('purchases')).toBe(true);
      expect(reportExportService.isSupported('pnl')).toBe(true);
    });

    test('should return false for unknown modules', () => {
      expect(reportExportService.isSupported('nonexistent')).toBe(false);
      expect(reportExportService.isSupported('')).toBe(false);
    });
  });

  describe('getModuleTitle', () => {
    test('should return human-readable title for known modules', () => {
      expect(reportExportService.getModuleTitle('ledger')).toBeTruthy();
      expect(typeof reportExportService.getModuleTitle('ledger')).toBe('string');
      expect(reportExportService.getModuleTitle('ledger').length).toBeGreaterThan(0);
    });

    test('should return module name for unknown modules', () => {
      expect(reportExportService.getModuleTitle('unknown_mod')).toBe('unknown_mod');
    });
  });

  describe('generateCsv', () => {
    test('should generate CSV for ledger data', () => {
      const data = [{
        id: 1, booking_id: 10, type: 'payment', amount: 5000,
        method: 'cash', recorded_by: 'admin', created_at: '2025-01-15T10:00:00Z',
        customer_name: 'Test User'
      }];

      const csv = reportExportService.generateCsv('ledger', data);
      expect(typeof csv).toBe('string');
      expect(csv.length).toBeGreaterThan(0);
      // CSV should contain header row and data row
      const lines = csv.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle empty data gracefully', () => {
      const csv = reportExportService.generateCsv('ledger', []);
      expect(typeof csv).toBe('string');
      // Should at least have a header row
      const lines = csv.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    test('should throw for unknown module', () => {
      expect(() => reportExportService.generateCsv('nonexistent', []))
        .toThrow('Unknown report module');
    });

    test('should generate CSV for expenses data', () => {
      const data = [{
        id: 1, category: 'Electricity', amount: 3000,
        description: 'Monthly bill', recorded_by: 'admin',
        expense_date: '2025-01-15', created_at: '2025-01-15T10:00:00Z'
      }];

      const csv = reportExportService.generateCsv('expenses', data);
      expect(csv).toContain('Electricity');
    });

    test('should generate CSV for purchases data', () => {
      const data = [{
        id: 1, vendor_name: 'Test Vendor', amount: 15000,
        description: 'Fabric', recorded_by: 'admin',
        purchase_date: '2025-01-15', created_at: '2025-01-15T10:00:00Z'
      }];

      const csv = reportExportService.generateCsv('purchases', data);
      expect(csv).toContain('Test Vendor');
    });
  });
});
