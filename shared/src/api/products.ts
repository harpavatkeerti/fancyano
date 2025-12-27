import { AxiosInstance } from 'axios';
import { Product } from '../types';

export function createProductsApi(api: AxiosInstance) {
  return {
    getAll: () => api.get<Product[]>('/products'),
    getById: (id: number) => api.get<Product>(`/products/${id}`),
    create: (data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => 
      api.post<Product>('/products', data),
    update: (id: number, data: Partial<Product>) => 
      api.put<Product>(`/products/${id}`, data),
    delete: (id: number) => api.delete(`/products/${id}`),
  };
}

