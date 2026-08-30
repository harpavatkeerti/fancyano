import { AxiosInstance } from 'axios';

export interface CashAdjustment {
  id: number;
  amount: number;
  reason: string;
  adjustment_date: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  recorded_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface CashAdjustmentSummary {
  total_surplus: number;
  total_shortage: number;
  net: number;
  count: number;
}

export function createCashAdjustmentsApi(api: AxiosInstance) {
  return {
    list: (params?: Record<string, any>) => api.get<CashAdjustment[]>('/cash-adjustments', { params }),
    getById: (id: number) => api.get<CashAdjustment>(`/cash-adjustments/${id}`),
    create: (data: { amount: number; reason: string; adjustment_date?: string }) =>
      api.post<CashAdjustment>('/cash-adjustments', data),
    approve: (id: number) => api.put<CashAdjustment>(`/cash-adjustments/${id}/approve`),
    reject: (id: number) => api.put<CashAdjustment>(`/cash-adjustments/${id}/reject`),
    getPendingCount: () => api.get<{ count: number }>('/cash-adjustments/pending-count'),
    getSummary: (params?: Record<string, any>) => api.get<CashAdjustmentSummary>('/cash-adjustments/summary', { params }),
  };
}
