import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface Complaint {
  id: number;
  booking_id?: number;
  raised_by: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  assigned_to?: number;
  assigned_to_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateComplaintData {
  booking_id?: number;
  raised_by: string;
  title: string;
  description?: string;
}

export interface ComplaintNote {
  id: number;
  complaint_id: number;
  user_name: string;
  user_role: string;
  note_type: 'comment' | 'status_change' | 'assignment' | 'reopened';
  content: string;
  old_status?: string;
  new_status?: string;
  created_at: string;
}

export interface AddNoteData {
  user_name: string;
  user_role: string;
  note_type?: string;
  content: string;
  old_status?: string;
  new_status?: string;
}

export const complaintsApi = {
  getAll: () => axios.get<Complaint[]>(`${API_URL}/complaints`),
  getById: (id: number) => axios.get<Complaint>(`${API_URL}/complaints/${id}`),
  create: (data: CreateComplaintData) => axios.post<Complaint>(`${API_URL}/complaints`, data),
  update: (id: number, data: Partial<Complaint> & { note?: string; user_name?: string; user_role?: string }) => axios.put<Complaint>(`${API_URL}/complaints/${id}`, data),
  delete: (id: number) => axios.delete(`${API_URL}/complaints/${id}`),
  getNotes: (id: number) => axios.get<ComplaintNote[]>(`${API_URL}/complaints/${id}/notes`),
  addNote: (id: number, data: AddNoteData) => axios.post<ComplaintNote>(`${API_URL}/complaints/${id}/notes`, data),
};

