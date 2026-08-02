import { AxiosInstance } from 'axios';
import { Vendor } from '../types';

export function createVendorsApi(api: AxiosInstance) {
  return {
    getAll: (params?: { search?: string }) =>
      api.get<Vendor[]>('/vendors', { params }),
    search: (query: string) =>
      api.get<Vendor[]>(`/vendors/search?q=${encodeURIComponent(query)}`),
    getById: (id: number) =>
      api.get<Vendor>(`/vendors/${id}`),
    create: (data: Omit<Vendor, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Vendor>('/vendors', data),
    update: (id: number, data: Partial<Vendor>) =>
      api.put<Vendor>(`/vendors/${id}`, data),
    delete: (id: number) =>
      api.delete(`/vendors/${id}`),
  };
}
