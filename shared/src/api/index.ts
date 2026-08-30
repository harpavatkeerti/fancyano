import { AxiosInstance } from 'axios';
import { createApiClient, ApiConfig } from './client';
import { createProductsApi } from './products';
import { createBookingsApi } from './bookings';
import { createUsersApi } from './users';
import { createVendorsApi } from './vendors';
import { createPaymentTransactionsApi } from './paymentTransactions';
import { createAvailabilityApi } from './availability';
import { createLifecycleApi } from './lifecycle';
import { createPoliciesApi } from './policies';
import { createProductExchangesApi } from './productExchanges';
import { createBookingCancellationApi } from './bookingCancellation';
import { createBookingDiscardApi } from './bookingDiscard';
import { createSettingsApi } from './settings';
import { createComplaintsApi } from './complaints';
import { createFeedbackApi } from './feedback';
import { createCreditNotesApi } from './creditNotes';
import { createProductTrackingApi } from './productTracking';
import { createInvoicesApi } from './invoices';
import { createProductCategoriesApi } from './productCategories';
import { createReportsApi } from './reports';
import { createCashAdjustmentsApi } from './cashAdjustments';
import { createExpensesApi } from './expenses';
import { createBankAccountsApi, createQrCodesApi } from './bankAccountsAndQrCodes';
import { createPurchasesApi } from './purchases';
import { createNotificationsApi } from './notifications';

export interface Api {
  products: ReturnType<typeof createProductsApi>;
  bookings: ReturnType<typeof createBookingsApi>;
  users: ReturnType<typeof createUsersApi>;
  vendors: ReturnType<typeof createVendorsApi>;
  paymentTransactions: ReturnType<typeof createPaymentTransactionsApi>;
  availability: ReturnType<typeof createAvailabilityApi>;
  lifecycle: ReturnType<typeof createLifecycleApi>;
  policies: ReturnType<typeof createPoliciesApi>;
  productExchanges: ReturnType<typeof createProductExchangesApi>;
  bookingCancellation: ReturnType<typeof createBookingCancellationApi>;
  bookingDiscard: ReturnType<typeof createBookingDiscardApi>;
  settings: ReturnType<typeof createSettingsApi>;
  complaints: ReturnType<typeof createComplaintsApi>;
  feedback: ReturnType<typeof createFeedbackApi>;
  creditNotes: ReturnType<typeof createCreditNotesApi>;
  productTracking: ReturnType<typeof createProductTrackingApi>;
  invoices: ReturnType<typeof createInvoicesApi>;
  productCategories: ReturnType<typeof createProductCategoriesApi>;
  reports: ReturnType<typeof createReportsApi>;
  cashAdjustments: ReturnType<typeof createCashAdjustmentsApi>;
  expenses: ReturnType<typeof createExpensesApi>;
  bankAccounts: ReturnType<typeof createBankAccountsApi>;
  qrCodes: ReturnType<typeof createQrCodesApi>;
  purchases: ReturnType<typeof createPurchasesApi>;
  notifications: ReturnType<typeof createNotificationsApi>;
  client: AxiosInstance;
}

export function createApi(config: ApiConfig): Api {
  const apiClient = createApiClient(config);

  return {
    products: createProductsApi(apiClient),
    bookings: createBookingsApi(apiClient),
    users: createUsersApi(apiClient),
    vendors: createVendorsApi(apiClient),
    paymentTransactions: createPaymentTransactionsApi(apiClient),
    availability: createAvailabilityApi(apiClient),
    lifecycle: createLifecycleApi(apiClient),
    policies: createPoliciesApi(apiClient),
    productExchanges: createProductExchangesApi(apiClient),
    bookingCancellation: createBookingCancellationApi(apiClient),
    bookingDiscard: createBookingDiscardApi(apiClient),
    settings: createSettingsApi(apiClient),
    complaints: createComplaintsApi(apiClient),
    feedback: createFeedbackApi(apiClient),
    creditNotes: createCreditNotesApi(apiClient),
    productTracking: createProductTrackingApi(apiClient),
    invoices: createInvoicesApi(apiClient),
    productCategories: createProductCategoriesApi(apiClient),
    reports: createReportsApi(apiClient),
    cashAdjustments: createCashAdjustmentsApi(apiClient),
    expenses: createExpensesApi(apiClient),
    bankAccounts: createBankAccountsApi(apiClient),
    qrCodes: createQrCodesApi(apiClient),
    purchases: createPurchasesApi(apiClient),
    notifications: createNotificationsApi(apiClient),
    client: apiClient,
  };
}

export * from './client';
export * from './products';
export * from './bookings';
export * from './users';
export * from './vendors';
export * from './paymentTransactions';
export * from './availability';
export * from './lifecycle';
export * from './policies';
export * from './productExchanges';
export * from './bookingCancellation';
export * from './bookingDiscard';
export * from './settings';
export * from './complaints';
export * from './feedback';
export * from './creditNotes';
export * from './productTracking';
export * from './invoices';
export * from './productCategories';
export * from './reports';
export * from './cashAdjustments';
export * from './expenses';
export * from './bankAccountsAndQrCodes';
export * from './purchases';
export * from './notifications';
