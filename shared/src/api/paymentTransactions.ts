import { ApiClient } from './client';
import { PaymentTransaction, PaymentSummary } from '../types';

export function createPaymentTransactionsApi(api: ApiClient) {
  return {
    // Get payment summary with full breakdown
    getSummary: (bookingId: number) => 
      api.get<PaymentSummary>(`/payment-transactions/summary/${bookingId}`),
    
    // Get all transactions
    getAll: () =>
      api.get<PaymentTransaction[]>(`/payment-transactions`),
    
    // Get all transactions for a booking
    getByBookingId: (bookingId: number) =>
      api.get<PaymentTransaction[]>(`/payment-transactions/booking/${bookingId}`),
    
    // Create a payment transaction (payment, refund, etc.)
    create: (data: {
      booking_id: number;
      amount: number;
      type: string;
      method: string;
      recorded_by: string;
      notes?: string;
      transaction_type?: string;
      // Deduction fields for refunds with security deposit deductions
      booking_product_id?: number;
      deduction_amount?: number;
      deduction_type?: string;
    }) => api.post<any>('/payment-transactions', data),
    
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


