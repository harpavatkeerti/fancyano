import { AxiosInstance } from 'axios';

export interface Expense {
  id: number;
  category: string;
  amount: number;
  description: string | null;
  expense_date: string;
  recorded_by: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface ExpenseSummary {
  category: string;
  total_amount: number;
  count: number;
}

export function createExpensesApi(api: AxiosInstance) {
  return {
    list: (params?: Record<string, any>) => api.get<Expense[]>('/expenses', { params }),
    getById: (id: number) => api.get<Expense>(`/expenses/${id}`),
    create: (data: { category: string; amount: number; description?: string; expense_date?: string }) =>
      api.post<Expense>('/expenses', data),
    update: (id: number, data: Partial<Expense>) => api.put<Expense>(`/expenses/${id}`, data),
    delete: (id: number) => api.delete<Expense>(`/expenses/${id}`),
    getSummary: (params?: Record<string, any>) => api.get<ExpenseSummary[]>('/expenses/summary', { params }),
    getDailyTotals: (params?: Record<string, any>) => api.get('/expenses/daily', { params }),
    approve: (id: number) => api.put<Expense>(`/expenses/${id}/approve`),
    reject: (id: number) => api.put<Expense>(`/expenses/${id}/reject`),
    getPendingCount: () => api.get<{ count: number }>('/expenses/pending-count'),

    // Recurring expenses
    listRecurring: () => api.get('/expenses/recurring'),
    createRecurring: (data: { category: string; amount: number; description?: string; next_due_date?: string }) =>
      api.post('/expenses/recurring', data),
    deleteRecurring: (id: number) => api.delete(`/expenses/recurring/${id}`),
    activateRecurring: (id: number) => api.put(`/expenses/recurring/${id}/activate`),
    deactivateRecurring: (id: number) => api.put(`/expenses/recurring/${id}/deactivate`),
    approveRecurring: (id: number) => api.put(`/expenses/recurring/${id}/approve`),
    rejectRecurring: (id: number) => api.put(`/expenses/recurring/${id}/reject`),
    processRecurring: () => api.post('/expenses/recurring/process'),
  };
}
