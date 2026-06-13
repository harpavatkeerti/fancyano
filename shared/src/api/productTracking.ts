import { AxiosInstance } from 'axios';

export type TrackingStatus =
  | 'in_house'
  | 'picked_by_customer'
  | 'going_to_dry_clean'
  | 'alternation_related_work'
  | 'repair'
  | 'other_work';

/** Statuses that can only be set by the booking lifecycle (backend) */
export const LIFECYCLE_TRACKING_STATUSES: TrackingStatus[] = ['in_house', 'picked_by_customer'];

/** Statuses that can be manually set via the Track modal */
export const MANUAL_TRACKING_STATUSES: TrackingStatus[] = [
  'going_to_dry_clean',
  'alternation_related_work',
  'repair',
  'other_work',
];

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  in_house: '🏠 In House',
  picked_by_customer: '👤 With Customer',
  going_to_dry_clean: '🧼 Dry Clean',
  alternation_related_work: '✂️ Alteration',
  repair: '🔧 Repair',
  other_work: '📝 Other Work',
};

export interface ProductTracking {
  id: number;
  product_id?: number;
  booking_id?: number;
  product_code: string;
  tracking_status: TrackingStatus;
  notes?: string;
  product_name?: string;
  product_size?: string;
  customer_name?: string;
  booking_ref_id?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTrackingData {
  product_id?: number;
  booking_id?: number;
  product_code: string;
  /** Must be one of the MANUAL_TRACKING_STATUSES */
  tracking_status: TrackingStatus;
  notes?: string;
}

export function createProductTrackingApi(api: AxiosInstance) {
  return {
    getAll: () => api.get<ProductTracking[]>('/product-tracking'),
    getCurrentStatus: (productId: number) =>
      api.get<ProductTracking>(`/product-tracking/current/${productId}`),
    getByProductId: (productId: number) =>
      api.get<ProductTracking[]>(`/product-tracking/product/${productId}`),
    getByCode: (code: string) => api.get<ProductTracking[]>(`/product-tracking/code/${code}`),
    create: (data: CreateTrackingData) => api.post<ProductTracking>('/product-tracking', data),
    markReturned: (id: number, notes?: string) =>
      api.patch(`/product-tracking/${id}/return`, { notes }),
    delete: (id: number) => api.delete(`/product-tracking/${id}`),
  };
}
