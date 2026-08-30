import { AxiosInstance } from 'axios';

export function createReportsApi(api: AxiosInstance) {
  return {
    // Ledger
    getLedger: (params?: Record<string, any>) => api.get('/reports/ledger', { params }),
    getLedgerSummary: (params?: Record<string, any>) => api.get('/reports/ledger/summary', { params }),

    // Rental Collection
    getRentalCollection: (params?: Record<string, any>) => api.get('/reports/rental-collection', { params }),
    getRentalCollectionMonthly: (fy_start_year: number) =>
      api.get('/reports/rental-collection/monthly', { params: { fy_start_year } }),
    getRentalCollectionBookings: (year: number, month: number) =>
      api.get('/reports/rental-collection/bookings', { params: { year, month } }),

    // Charges & Penalties
    getCharges: (params?: Record<string, any>) => api.get('/reports/charges', { params }),
    getChargesSummary: (params?: Record<string, any>) => api.get('/reports/charges/summary', { params }),

    // Dead Inventory
    getDeadInventory: (params?: Record<string, any>) => api.get('/reports/dead-inventory', { params }),

    // Security Deposits
    getSecurityDeposits: (params?: Record<string, any>) => api.get('/reports/security-deposits', { params }),

    // Customer Reports
    getCustomers: (params?: Record<string, any>) => api.get('/reports/customers', { params }),
    getCustomerOutstanding: () => api.get('/reports/customers/outstanding'),

    // Salesman Performance
    getSalesmanPerformance: () => api.get('/reports/salesman-performance'),

    // Product Performance
    getProductPerformance: (params?: Record<string, any>) => api.get('/reports/product-performance', { params }),

    // P&L Dashboard
    getPnl: (params?: Record<string, any>) => api.get('/reports/pnl', { params }),
    getPnlMonthly: (fy_start_year: number) => api.get('/reports/pnl/monthly', { params: { fy_start_year } }),

    // Export & Sharing
    exportPdf: (moduleName: string, params?: Record<string, any>) =>
      api.get(`/reports/export/${moduleName}/pdf`, { params, responseType: 'blob' }),
    exportCsv: (moduleName: string, params?: Record<string, any>) =>
      api.get(`/reports/export/${moduleName}/csv`, { params, responseType: 'blob' }),
    shareEmail: (data: { module: string; email: string; start_date?: string; end_date?: string }) =>
      api.post('/reports/share/email', data),
    shareWhatsApp: (data: { module: string; start_date?: string; end_date?: string }) =>
      api.post('/reports/share/whatsapp', data),
  };
}
