import { AxiosInstance } from 'axios';
import { Transporter } from '../types';

export function createTransportersApi(api: AxiosInstance) {
  return {
    getAll: (params?: { search?: string }) =>
      api.get<Transporter[]>('/transporters', { params }),
    search: (query: string) =>
      api.get<Transporter[]>(`/transporters/search?q=${encodeURIComponent(query)}`),
    getById: (id: number) =>
      api.get<Transporter>(`/transporters/${id}`),
    create: (data: Omit<Transporter, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Transporter>('/transporters', data),
    update: (id: number, data: Partial<Transporter>) =>
      api.put<Transporter>(`/transporters/${id}`, data),
    delete: (id: number) =>
      api.delete(`/transporters/${id}`),
  };
}
