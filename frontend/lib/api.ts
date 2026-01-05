// Web-specific API configuration using shared package
import { createApi } from '@rental/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Create API instance using shared package
export const api = createApi({ baseURL: API_URL });

// Export APIs for convenience
export const productsApi = api.products;
export const bookingsApi = api.bookings;
export const usersApi = api.users;
export const paymentTransactionsApi = api.paymentTransactions;

// Re-export types
export type { Product, Booking, User, PaymentTransaction, PaymentSummary } from '@rental/shared';
