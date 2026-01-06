import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface CreditNote {
  id: number;
  booking_id?: number;
  customer_name: string;
  customer_phone?: string;
  amount: number;
  valid_until: string;
  used_amount: number;
  status: 'active' | 'partially_used' | 'fully_used' | 'expired';
  issued_by?: string;
  issued_at: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCreditNoteData {
  booking_id?: number;
  customer_name: string;
  customer_phone?: string;
  amount: number;
  valid_until: string;
  issued_by?: string;
  notes?: string;
}

export interface UseCreditNoteData {
  amount_used: number;
}

export const creditNotesApi = {
  // Get all credit notes
  getAll: async () => {
    const response = await axios.get<CreditNote[]>(`${API_URL}/credit-notes`);
    return response;
  },

  // Get credit notes by customer
  getByCustomer: async (customer_name?: string, customer_phone?: string) => {
    const response = await axios.get<CreditNote[]>(`${API_URL}/credit-notes/customer`, {
      params: { customer_name, customer_phone }
    });
    return response;
  },

  // Get credit note by ID
  getById: async (id: number) => {
    const response = await axios.get<CreditNote>(`${API_URL}/credit-notes/${id}`);
    return response;
  },

  // Get credit notes by booking ID
  getByBookingId: async (bookingId: number) => {
    const response = await axios.get<CreditNote[]>(`${API_URL}/credit-notes/booking/${bookingId}`);
    return response;
  },

  // Create credit note
  create: async (data: CreateCreditNoteData) => {
    const response = await axios.post<CreditNote>(`${API_URL}/credit-notes`, data);
    return response;
  },

  // Use credit note
  use: async (id: number, data: UseCreditNoteData) => {
    const response = await axios.put<CreditNote>(`${API_URL}/credit-notes/${id}/use`, data);
    return response;
  },

  // Delete credit note
  delete: async (id: number) => {
    const response = await axios.delete(`${API_URL}/credit-notes/${id}`);
    return response;
  },
};

