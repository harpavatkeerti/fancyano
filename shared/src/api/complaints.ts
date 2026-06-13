import { AxiosInstance } from 'axios';

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

export function createComplaintsApi(api: AxiosInstance) {
  return {
    getAll: () => api.get<Complaint[]>('/complaints'),
    getById: (id: number) => api.get<Complaint>(`/complaints/${id}`),
    create: (data: CreateComplaintData) => api.post<Complaint>('/complaints', data),
    update: (id: number, data: Partial<Complaint> & { note?: string; user_name?: string; user_role?: string }) =>
      api.put<Complaint>(`/complaints/${id}`, data),
    delete: (id: number) => api.delete(`/complaints/${id}`),
    getNotes: (id: number) => api.get<ComplaintNote[]>(`/complaints/${id}/notes`),
    addNote: (id: number, data: AddNoteData) => api.post<ComplaintNote>(`/complaints/${id}/notes`, data),
  };
}
