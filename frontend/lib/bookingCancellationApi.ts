import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const bookingCancellationApi = {
  // Cancel a booking
  cancel: async (data: {
    booking_id: number;
    cancellation_reason?: string;
    cancelled_by?: string;
    cancellation_date?: string;
  }) => {
    return axios.post(`${API_URL}/booking-cancellation`, data);
  },

  // Get cancellation preview (calculate penalty without committing)
  preview: async (bookingId: number) => {
    return axios.get(`${API_URL}/booking-cancellation/preview/${bookingId}`);
  },
};

