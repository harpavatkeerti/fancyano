import { AxiosInstance } from 'axios';

export interface Feedback {
  id: number;
  booking_id?: number;
  feedback_by: string;
  rating: number;
  description?: string;
  created_at: string;
}

export interface CreateFeedbackData {
  booking_id?: number;
  feedback_by: string;
  rating: number;
  description?: string;
}

export function createFeedbackApi(api: AxiosInstance) {
  return {
    getAll: () => api.get<Feedback[]>('/feedback'),
    getById: (id: number) => api.get<Feedback>(`/feedback/${id}`),
    create: (data: CreateFeedbackData) => api.post<Feedback>('/feedback', data),
    delete: (id: number) => api.delete(`/feedback/${id}`),
  };
}
