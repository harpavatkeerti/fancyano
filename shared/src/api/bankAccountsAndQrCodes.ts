import { AxiosInstance } from 'axios';

export interface BankAccount {
  id: number;
  account_name: string;
  is_active: boolean;
  qr_code_count: number;
  created_at: string;
}

export interface QrCode {
  id: number;
  qr_type: 'rent' | 'security';
  name: string;
  bank_account_id: number;
  bank_account_name: string;
  qr_image: string;
  is_active: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  created_at: string;
}

export function createBankAccountsApi(api: AxiosInstance) {
  return {
    list: (params?: Record<string, any>) => api.get<BankAccount[]>('/bank-accounts', { params }),
    getById: (id: number) => api.get<BankAccount>(`/bank-accounts/${id}`),
    create: (data: { account_name: string }) => api.post<BankAccount>('/bank-accounts', data),
    update: (id: number, data: Partial<BankAccount>) => api.put<BankAccount>(`/bank-accounts/${id}`, data),
    delete: (id: number) => api.delete<BankAccount>(`/bank-accounts/${id}`),
  };
}

export function createQrCodesApi(api: AxiosInstance) {
  return {
    list: (params?: Record<string, any>) => api.get<QrCode[]>('/qr-codes', { params }),
    getById: (id: number) => api.get<QrCode>(`/qr-codes/${id}`),
    getActive: (type: string) => api.get<QrCode | null>(`/qr-codes/active/${type}`),
    create: (data: { qr_type: string; name: string; bank_account_id: number; qr_image: string }) =>
      api.post<QrCode>('/qr-codes', data),
    activate: (id: number) => api.put<QrCode>(`/qr-codes/${id}/activate`),
    deactivate: (id: number) => api.put<QrCode>(`/qr-codes/${id}/deactivate`),
    delete: (id: number) => api.delete<QrCode>(`/qr-codes/${id}`),
  };
}
