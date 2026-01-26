import { ApiClient } from './client';
import { PaymentTransaction, PaymentSummary } from '../types';

export function createPaymentTransactionsApi(api: ApiClient) {
  return {
    // Get payment summary with full breakdown
    getSummary: (bookingId: number) => 
      api.get<PaymentSummary>(`/payment-transactions/summary/${bookingId}`),
    
    // Apply payment (auto-distributes according to priority)
    applyPayment: (data: {
      booking_id: number;
      amount: number;
      payment_method: string;
      recorded_by: string;
      notes?: string;
    }) => api.post<any>('/payment-transactions', data),
    
    // Apply adjustment (e.g., security refund adjusted against dues)
    applyAdjustment: (data: {
      booking_id: number;
      adjustment_amount: number;
      payment_method: string;
      adjusted_by: string;
      reason?: string;
    }) => api.post<any>('/payment-transactions/adjustment', data),
  };
}


