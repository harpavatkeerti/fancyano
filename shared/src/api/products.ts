import { AxiosInstance } from 'axios';
import { Product } from '../types';

export function createProductsApi(api: AxiosInstance) {
  return {
    getAll: (params?: { search?: string; category?: string; includeArchived?: boolean }) =>
      api.get<Product[]>('/products', { params }),
    getById: (id: number) => api.get<Product>(`/products/${id}`),
    create: (data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Product>('/products', data),
    update: (id: number, data: Partial<Product>) =>
      api.put<Product>(`/products/${id}`, data),
    archive: (id: number) => api.patch<Product>(`/products/${id}/archive`),
    restore: (id: number) => api.patch<Product>(`/products/${id}/restore`),
  };
}
