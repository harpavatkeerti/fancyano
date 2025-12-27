import { AxiosInstance } from 'axios';
import { Booking } from '../types';

export function createBookingsApi(api: AxiosInstance) {
  return {
    getAll: () => api.get<Booking[]>('/bookings'),
    getById: (id: number) => api.get<Booking>(`/bookings/${id}`),
    create: (data: Omit<Booking, 'id' | 'created_at' | 'updated_at'>) => 
      api.post<Booking>('/bookings', data),
    update: (id: number, data: Partial<Booking>) => 
      api.put<Booking>(`/bookings/${id}`, data),
    delete: (id: number) => api.delete(`/bookings/${id}`),
  };
}

