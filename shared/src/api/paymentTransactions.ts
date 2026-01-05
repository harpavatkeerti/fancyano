import { ApiClient } from './client';
import { PaymentTransaction, PaymentSummary } from '../types';

export function createPaymentTransactionsApi(api: ApiClient) {
  return {
    getByBookingId: (bookingId: number) => 
      api.get<PaymentTransaction[]>(`/payment-transactions/booking/${bookingId}`),
    getSummary: (bookingId: number) => 
      api.get<PaymentSummary>(`/payment-transactions/summary/${bookingId}`),
    create: (data: Omit<PaymentTransaction, 'id' | 'created_at'>) => 
      api.post<PaymentTransaction>('/payment-transactions', data),
  };
}

