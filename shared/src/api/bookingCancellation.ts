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
    
    // Calculate cancellation summary for selected products (live preview)
    calculateSummary: (data: {
      booking_id: number;
      selected_product_ids: number[];
      penalty_overrides?: { [bookingProductId: number]: number };
      extra_refund?: number;
    }) => api.post<any>('/booking-cancellation/calculate-summary', data),

    // Cancel product(s) with optional settlement action
    cancel: (data: {
      booking_product_ids: number[];
      cancellation_penalties?: Array<{
        booking_product_id: number;
        penalty_amount: number;
      }>;
      cancellation_reason?: string;
      cancelled_by: string;
      settlement_action?: 'refund' | 'adjust' | 'none';
      refund_method?: string;
      settlement_notes?: string;
    }) => api.post<any>('/booking-cancellation', data),
  };
}
