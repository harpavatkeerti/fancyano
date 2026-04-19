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
    
    updateStatus: (id: number) => 
      api.put(`/bookings/${id}/status`),
    
    // Booking discount (create, update, or remove)
    updateDiscount: (id: number, data: { 
      discount_amount: number; 
      updated_by: string;
    }) => api.put(`/bookings/${id}/discount`, data),
    
    // Finalization
    finalize: (id: number, data: { 
      final_discount?: number; 
      finalized_by: string;
    }) => api.post(`/bookings/${id}/finalize`, data),
    
    // Activity log
    getActivityLog: (id: number) => 
      api.get<BookingActivityLog[]>(`/bookings/${id}/activity-log`),
    
    // Payment summary (uses payment-transactions service)
    getPaymentSummary: (id: number) => 
      api.get<PaymentSummary>(`/payment-transactions/summary/${id}`),
    
    // Get bookings for a product (for calendar/availability display)
    getByProductId: (productId: number) => 
      api.get<Booking[]>(`/bookings/by-product/${productId}`),
    
    // Preview booking calculation (no data persistence)
    getPreview: (data: {
      products: Array<{
        id: number;
        discountType?: 'percentage' | 'fixed' | null;
        discountValue?: number;
      }>;
      transport_charge?: number;
      booking_discount_type?: 'percentage' | 'amount' | null;
      booking_discount_value?: number;
    }) => api.post<{
      products: Array<{
        id: number;
        name: string;
        code: string;
        rent: number;
        effective_rent: number;
        discount_amount: number;
        discount_type: string | null;
        security_deposit: number;
      }>;
      subtotal: number;
      transport_charge: number;
      booking_discount_amount: number;
      total: number;
    }>('/booking-preview/preview', data),
  };
}


