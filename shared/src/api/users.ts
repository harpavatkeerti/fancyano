import { AxiosInstance } from 'axios';
import { User } from '../types';

export function createUsersApi(api: AxiosInstance) {
  return {
    getAll: () => api.get<User[]>('/users'),
    getById: (id: number) => api.get<User>(`/users/${id}`),
    create: (data: Omit<User, 'id' | 'created_at' | 'updated_at'>) => 
      api.post<User>('/users', data),
    update: (id: number, data: Partial<User>) => 
      api.put<User>(`/users/${id}`, data),
    delete: (id: number) => api.delete(`/users/${id}`),
  };
}

