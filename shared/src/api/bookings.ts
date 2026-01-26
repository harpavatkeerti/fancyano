import { AxiosInstance } from 'axios';
import { Booking, BookingActivityLog, PaymentSummary } from '../types';

export function createBookingsApi(api: AxiosInstance) {
  return {
    // Basic CRUD
    getAll: () => api.get<Booking[]>('/bookings'),
    getById: (id: number) => api.get<Booking>(`/bookings/${id}`),
    create: (data: any) => api.post<Booking>('/bookings', data),
    update: (id: number, data: Partial<Booking>) => 
      api.put<Booking>(`/bookings/${id}`, data),
    delete: (id: number) => api.delete(`/bookings/${id}`),
    
    // Booking lifecycle
    confirm: (id: number, data: { confirmed_by: string }) => 
      api.put(`/bookings/${id}/confirm`, data),
    
    updateStatus: (id: number, data: { status: string; updated_by: string }) => 
      api.put(`/bookings/${id}/status`, data),
    
    // Final discount
    applyFinalDiscount: (id: number, data: { 
      discount_amount: number; 
      reason?: string;
      recorded_by: string;
    }) => api.post(`/bookings/${id}/final-discount`, data),
    
    // Finalization
    finalize: (id: number, data: { 
      final_discount?: number; 
      finalized_by: string;
    }) => api.post(`/bookings/${id}/finalize`, data),
    
    // Activity log
    getActivityLog: (id: number) => 
      api.get<BookingActivityLog[]>(`/bookings/${id}/activity-log`),
    
    // Payment summary
    getPaymentSummary: (id: number) => 
      api.get<PaymentSummary>(`/bookings/${id}/payment-summary`),
    
    // Get bookings for a product (for calendar/availability display)
    getByProductId: (productId: number) => 
      api.get<Booking[]>(`/bookings/by-product/${productId}`),
  };
}


