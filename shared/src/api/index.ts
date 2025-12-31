import { AxiosInstance } from 'axios';
import { createApiClient, ApiConfig } from './client';
import { createProductsApi } from './products';
import { createBookingsApi } from './bookings';
import { createUsersApi } from './users';

export interface Api {
  products: ReturnType<typeof createProductsApi>;
  bookings: ReturnType<typeof createBookingsApi>;
  users: ReturnType<typeof createUsersApi>;
  client: AxiosInstance;
}

export function createApi(config: ApiConfig): Api {
  const apiClient = createApiClient(config);
  
  return {
    products: createProductsApi(apiClient),
    bookings: createBookingsApi(apiClient),
    users: createUsersApi(apiClient),
    client: apiClient,
  };
}

export * from './client';
export * from './products';
export * from './bookings';
export * from './users';

