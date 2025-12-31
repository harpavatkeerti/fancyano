import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const settingsApi = {
  getAll: () => axios.get(`${API_URL}/settings`),
  getByKey: (key: string) => axios.get(`${API_URL}/settings/${key}`),
  getByCategory: (category: string) => axios.get(`${API_URL}/settings/category/${category}`),
  update: (key: string, data: any) => axios.put(`${API_URL}/settings/${key}`, data),
  create: (data: any) => axios.post(`${API_URL}/settings`, data),
  delete: (key: string) => axios.delete(`${API_URL}/settings/${key}`),
};

