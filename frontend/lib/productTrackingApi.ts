import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

export const productTrackingApi = {
  // Get all tracking records
  getAll: () => axios.get(`${API_URL}/product-tracking`),

  // Get current (latest) tracking record for a product
  getCurrentStatus: (productId: number) =>
    axios.get(`${API_URL}/product-tracking/current/${productId}`),

  // Get full tracking history for a product
  getByProductId: (productId: number) =>
    axios.get(`${API_URL}/product-tracking/product/${productId}`),

  // Get tracking records by product code
  getByCode: (code: string) => axios.get(`${API_URL}/product-tracking/code/${code}`),

  // Create new tracking record (manual Track modal only)
  create: (data: CreateTrackingData) => axios.post(`${API_URL}/product-tracking`, data),

  // Mark a product as returned — inserts a new in_house row
  markReturned: (id: number, notes?: string) =>
    axios.patch(`${API_URL}/product-tracking/${id}/return`, { notes }),

  // Delete tracking record
  delete: (id: number) => axios.delete(`${API_URL}/product-tracking/${id}`),
};
