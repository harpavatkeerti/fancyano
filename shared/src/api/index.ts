import { AxiosInstance } from 'axios';
import { createApiClient, ApiConfig } from './client';
import { createProductsApi } from './products';
import { createBookingsApi } from './bookings';
import { createUsersApi } from './users';
import { createPaymentTransactionsApi } from './paymentTransactions';
import { createAvailabilityApi } from './availability';
import { createLifecycleApi } from './lifecycle';
import { createPoliciesApi } from './policies';
import { createProductExchangesApi } from './productExchanges';
import { createBookingCancellationApi } from './bookingCancellation';
import { createSettingsApi } from './settings';
import { createComplaintsApi } from './complaints';
import { createFeedbackApi } from './feedback';
import { createCreditNotesApi } from './creditNotes';
import { createProductTrackingApi } from './productTracking';
import { createInvoicesApi } from './invoices';

export interface Api {
  products: ReturnType<typeof createProductsApi>;
  bookings: ReturnType<typeof createBookingsApi>;
  users: ReturnType<typeof createUsersApi>;
  paymentTransactions: ReturnType<typeof createPaymentTransactionsApi>;
  availability: ReturnType<typeof createAvailabilityApi>;
  lifecycle: ReturnType<typeof createLifecycleApi>;
  policies: ReturnType<typeof createPoliciesApi>;
  productExchanges: ReturnType<typeof createProductExchangesApi>;
  bookingCancellation: ReturnType<typeof createBookingCancellationApi>;
  settings: ReturnType<typeof createSettingsApi>;
  complaints: ReturnType<typeof createComplaintsApi>;
  feedback: ReturnType<typeof createFeedbackApi>;
  creditNotes: ReturnType<typeof createCreditNotesApi>;
  productTracking: ReturnType<typeof createProductTrackingApi>;
  invoices: ReturnType<typeof createInvoicesApi>;
  client: AxiosInstance;
}

export function createApi(config: ApiConfig): Api {
  const apiClient = createApiClient(config);

  return {
    products: createProductsApi(apiClient),
    bookings: createBookingsApi(apiClient),
    users: createUsersApi(apiClient),
    paymentTransactions: createPaymentTransactionsApi(apiClient),
    availability: createAvailabilityApi(apiClient),
    lifecycle: createLifecycleApi(apiClient),
    policies: createPoliciesApi(apiClient),
    productExchanges: createProductExchangesApi(apiClient),
    bookingCancellation: createBookingCancellationApi(apiClient),
    settings: createSettingsApi(apiClient),
    complaints: createComplaintsApi(apiClient),
    feedback: createFeedbackApi(apiClient),
    creditNotes: createCreditNotesApi(apiClient),
    productTracking: createProductTrackingApi(apiClient),
    invoices: createInvoicesApi(apiClient),
    client: apiClient,
  };
}

export * from './client';
export * from './products';
export * from './bookings';
export * from './users';
export * from './paymentTransactions';
export * from './availability';
export * from './lifecycle';
export * from './policies';
export * from './productExchanges';
export * from './bookingCancellation';
export * from './settings';
export * from './complaints';
export * from './feedback';
export * from './creditNotes';
export * from './productTracking';
export * from './invoices';
