import { AxiosInstance } from 'axios';

export interface Notification {
  id: number;
  recipient_role: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'action_required';
  reference_type: string | null;
  reference_id: number | null;
  is_read: boolean;
  created_at: string;
}

export function createNotificationsApi(api: AxiosInstance) {
  return {
    list: (params?: Record<string, any>) => api.get<Notification[]>('/notifications', { params }),
    getUnreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
    markAsRead: (id: number) => api.put<Notification>(`/notifications/${id}/read`),
    markAllAsRead: () => api.put<{ updated: number }>('/notifications/read-all'),
  };
}
