import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

export const feedbackApi = {
  getAll: () => axios.get<Feedback[]>(`${API_URL}/feedback`),
  getById: (id: number) => axios.get<Feedback>(`${API_URL}/feedback/${id}`),
  create: (data: CreateFeedbackData) => axios.post<Feedback>(`${API_URL}/feedback`, data),
  delete: (id: number) => axios.delete(`${API_URL}/feedback/${id}`),
};

