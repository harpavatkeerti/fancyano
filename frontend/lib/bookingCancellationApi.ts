import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const bookingCancellationApi = {
  // Cancel a booking (full or partial)
  cancel: async (data: {
    booking_id: number;
    product_ids?: number[]; // Optional: specific products to cancel
    per_product_penalties?: Array<{
      product_id: number;
      penalty_amount: number;
      notes?: string;
    }>; // Optional: manually edited penalties
    cancellation_reason?: string;
    cancelled_by?: string;
    cancellation_date?: string;
    extra_refund?: number; // Optional: additional refund amount
    extra_refund_note?: string; // Optional: note for extra refund
  }) => {
    return axios.post(`${API_URL}/booking-cancellation`, data);
  },

  // Get cancellation preview (calculate penalty without committing)
  preview: async (bookingId: number, productIds?: number[]) => {
    const params = productIds && productIds.length > 0 
      ? { product_ids: productIds.join(',') }
      : {};
    return axios.get(`${API_URL}/booking-cancellation/preview/${bookingId}`, { params });
  },
};

