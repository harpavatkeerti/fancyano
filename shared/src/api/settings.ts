import { AxiosInstance } from 'axios';

export function createSettingsApi(api: AxiosInstance) {
  return {
    getAll: () => api.get('/settings'),
    getByKey: (key: string) => api.get(`/settings/${key}`),
    getByCategory: (category: string) => api.get(`/settings/category/${category}`),
    update: (key: string, data: any) => api.put(`/settings/${key}`, data),
    create: (data: any) => api.post('/settings', data),
    delete: (key: string) => api.delete(`/settings/${key}`),
  };
}
