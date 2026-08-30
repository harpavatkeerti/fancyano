import { AxiosInstance } from 'axios';

export interface Purchase {
  id: number;
  vendor_name: string;
  item_description: string;
  amount: number;
  purchase_date: string;
  receipt_image: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
}

export interface PurchaseSummary {
  vendor_name: string;
  total_amount: number;
  count: number;
}

export function createPurchasesApi(api: AxiosInstance) {
  return {
    list: (params?: Record<string, any>) => api.get<Purchase[]>('/purchases', { params }),
    getById: (id: number) => api.get<Purchase>(`/purchases/${id}`),
    create: (data: { vendor_name: string; item_description: string; amount: number; purchase_date?: string; notes?: string }) =>
      api.post<Purchase>('/purchases', data),
    update: (id: number, data: Partial<Purchase>) => api.put<Purchase>(`/purchases/${id}`, data),
    delete: (id: number) => api.delete<Purchase>(`/purchases/${id}`),
    getSummary: (params?: Record<string, any>) => api.get<PurchaseSummary[]>('/purchases/summary', { params }),
  };
}
