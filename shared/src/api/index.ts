import { AxiosInstance } from 'axios';
import { createApiClient, ApiConfig } from './client';
import { createProductsApi } from './products';
import { createBookingsApi } from './bookings';
import { createUsersApi } from './users';
import { createPaymentTransactionsApi } from './paymentTransactions';

export interface Api {
  products: ReturnType<typeof createProductsApi>;
  bookings: ReturnType<typeof createBookingsApi>;
  users: ReturnType<typeof createUsersApi>;
  paymentTransactions: ReturnType<typeof createPaymentTransactionsApi>;
  client: AxiosInstance;
}

export function createApi(config: ApiConfig): Api {
  const apiClient = createApiClient(config);
  
  return {
    products: createProductsApi(apiClient),
    bookings: createBookingsApi(apiClient),
    users: createUsersApi(apiClient),
    paymentTransactions: createPaymentTransactionsApi(apiClient),
    client: apiClient,
  };
}

export * from './client';
export * from './products';
export * from './bookings';
export * from './users';
export * from './paymentTransactions';

