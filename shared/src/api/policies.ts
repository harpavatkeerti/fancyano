import { ApiClient } from './client';
import { RentalPolicy } from '../types';

export function createPoliciesApi(api: ApiClient) {
  return {
    // Get all policies (optionally filtered by type)
    getAll: (policyType?: string) => 
      api.get<RentalPolicy[]>('/policies', { params: policyType ? { policy_type: policyType } : {} }),
    
    // Get applicable policy for a booking product
    getApplicable: (data: {
      policy_type: 'exchange_penalty' | 'cancellation_penalty';
      booking_product_id: number;
    }) => api.get('/policies/applicable', { params: data }),
    
    // Create or update policy
    upsert: (data: Partial<RentalPolicy>) => 
      api.post<RentalPolicy>('/policies', data),
    
    // Update existing policy
    update: (id: number, data: Partial<RentalPolicy>) => 
      api.put<RentalPolicy>(`/policies/${id}`, data),
    
    // Batch replace all policies for a given type (deactivates old, creates new)
    batchReplace: (policyType: string, tiers: Array<{
      policy_key: string;
      policy_name: string;
      value_type: string;
      value: number;
      days_from_booking_min: number;
      days_from_booking_max: number | null;
    }>) => api.put<{ success: boolean; policies: RentalPolicy[] }>(`/policies/batch/${policyType}`, { tiers }),
  };
}
