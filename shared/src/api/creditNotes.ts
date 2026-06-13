import { AxiosInstance } from 'axios';

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

export function createCreditNotesApi(api: AxiosInstance) {
  return {
    getAll: () => api.get<CreditNote[]>('/credit-notes'),
    getByCustomer: (customer_name?: string, customer_phone?: string) =>
      api.get<CreditNote[]>('/credit-notes/customer', { params: { customer_name, customer_phone } }),
    getById: (id: number) => api.get<CreditNote>(`/credit-notes/${id}`),
    getByBookingId: (bookingId: number) => api.get<CreditNote[]>(`/credit-notes/booking/${bookingId}`),
    create: (data: CreateCreditNoteData) => api.post<CreditNote>('/credit-notes', data),
    use: (id: number, data: UseCreditNoteData) => api.put<CreditNote>(`/credit-notes/${id}/use`, data),
    delete: (id: number) => api.delete(`/credit-notes/${id}`),
  };
}
