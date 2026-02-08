import { ApiClient } from './client';

export function createLifecycleApi(api: ApiClient) {
  return {
    // Pickup products
    pickupProducts: (bookingId: number, data: {
      booking_product_ids: number[];
      picked_up_by: string;
    }) => api.post(`/lifecycle/${bookingId}/products/pickup`, data),
    
    // Return products
    returnProducts: (bookingId: number, data: {
      returns: Array<{
        bookingProductId: number;
        damageFee?: number;
      }>;
      returned_by: string;
    }) => api.post(`/lifecycle/${bookingId}/products/return`, data),
    
    // Calculate security refund (read-only, no transaction)
    calculateSecurityRefund: (bookingId: number, productId: number) => 
      api.get(`/lifecycle/${bookingId}/products/${productId}/security-refund/calculate`),

    // Process security refund or adjustment (executes the transaction)
    processSecurityRefund: (bookingId: number, productId: number, data: {
      action: 'refund' | 'adjust';
      recorded_by: string;
    }) => api.post(`/lifecycle/${bookingId}/products/${productId}/security-refund/process`, data),
  };
}
