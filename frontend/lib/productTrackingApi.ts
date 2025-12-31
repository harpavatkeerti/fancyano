import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ProductTracking {
  id: number;
  product_id?: number;
  booking_id?: number;
  product_code: string;
  tracking_type: 'going_to_dry_clean' | 'alternation_related_work' | 'repair' | 'other_work' | 'picked_by_customer';
  work_description?: string;
  status: 'out' | 'returned';
  out_date: string;
  return_date?: string;
  notes?: string;
  product_name?: string;
  product_size?: string;
  customer_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTrackingData {
  product_id?: number;
  booking_id?: number;
  product_code: string;
  tracking_type: string;
  work_description?: string;
  notes?: string;
}

export const productTrackingApi = {
  // Get all tracking records
  getAll: () => axios.get(`${API_URL}/product-tracking`),

  // Get tracking records by product ID
  getByProductId: (productId: number) => axios.get(`${API_URL}/product-tracking/product/${productId}`),

  // Get tracking records by product code
  getByCode: (code: string) => axios.get(`${API_URL}/product-tracking/code/${code}`),

  // Get active (out) tracking records for a product
  getActiveByProductId: (productId: number) => axios.get(`${API_URL}/product-tracking/product/${productId}/active`),

  // Create new tracking record
  create: (data: CreateTrackingData) => axios.post(`${API_URL}/product-tracking`, data),

  // Mark tracking record as returned
  markReturned: (id: number, notes?: string) => 
    axios.patch(`${API_URL}/product-tracking/${id}/return`, { notes }),

  // Delete tracking record
  delete: (id: number) => axios.delete(`${API_URL}/product-tracking/${id}`),
};

