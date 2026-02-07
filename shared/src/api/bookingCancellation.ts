import { ApiClient } from './client';

export function createBookingCancellationApi(api: ApiClient) {
  return {
    // Get cancellation preview (all cancellable products with penalties & financials)
    preview: (bookingId: number) =>
      api.get(`/booking-cancellation/preview/${bookingId}`),

    // Get cancellation info (eligibility + max penalty)
    getInfo: (bookingProductId: number) => 
      api.get(`/booking-cancellation/info/${bookingProductId}`),
    
    // Get penalty suggestion
    getPenaltySuggestion: (bookingProductId: number) => 
      api.get(`/booking-cancellation/penalty-suggestion/${bookingProductId}`),
    
    // Cancel product(s)
    cancel: (data: {
      booking_product_ids: number[];
      cancellation_penalties?: Array<{
        booking_product_id: number;
        penalty_amount: number;
      }>;
      cancellation_reason?: string;
      cancelled_by: string;
    }) => api.post<any>('/booking-cancellation', data),
  };
}
