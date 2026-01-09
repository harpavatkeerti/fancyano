import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ProductExchange {
  id: number;
  booking_id: number;
  original_product_id: number;
  exchanged_product_id: number;
  exchange_date: string;
  days_from_booking: number;
  penalty_percentage: number;
  exchange_charge: number;
  total_charge: number;
  reason?: string;
  exchanged_by?: string;
  original_product_name?: string;
  original_product_code?: string;
  exchanged_product_name?: string;
  exchanged_product_code?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExchangeData {
  booking_id: number;
  original_product_id: number;
  exchanged_product_id: number;
  exchange_date?: string;
  reason?: string;
  exchanged_by?: string;
  booked_from?: string;
  booked_to?: string;
  additionalProducts?: { product_id: number; booked_from: string; booked_to: string }[];
}

export const productExchangesApi = {
  // Get all exchanges for a booking
  getByBookingId: async (bookingId: number) => {
    const response = await axios.get<ProductExchange[]>(
      `${API_URL}/product-exchanges/booking/${bookingId}`
    );
    return response;
  },

  // Create a new exchange
  create: async (data: CreateExchangeData) => {
    const response = await axios.post<ProductExchange>(
      `${API_URL}/product-exchanges`,
      data
    );
    return response;
  },

  // Delete an exchange
  delete: async (id: number) => {
    const response = await axios.delete(
      `${API_URL}/product-exchanges/${id}`
    );
    return response;
  },

  // Record payment for exchange penalty
  recordPayment: async (data: {
    exchange_id: number;
    amount: number;
    payment_method: string;
    recorded_by: string;
    narration?: string;
  }) => {
    const response = await axios.post(
      `${API_URL}/product-exchanges/${data.exchange_id}/payment`,
      {
        amount: data.amount,
        payment_method: data.payment_method,
        recorded_by: data.recorded_by,
        narration: data.narration
      }
    );
    return response;
  },

  // Record payment for rent difference
  recordRentPayment: async (data: {
    exchange_id: number;
    amount: number;
    payment_method: string;
    recorded_by: string;
    narration?: string;
  }) => {
    const response = await axios.post(
      `${API_URL}/product-exchanges/${data.exchange_id}/rent-payment`,
      {
        amount: data.amount,
        payment_method: data.payment_method,
        recorded_by: data.recorded_by,
        narration: data.narration
      }
    );
    return response;
  },
};

