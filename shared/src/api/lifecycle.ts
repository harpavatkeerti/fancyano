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
        booking_product_id: number;
        damage_fee?: number;
      }>;
      returned_by: string;
    }) => api.post(`/lifecycle/${bookingId}/products/return`, data),

    // Calculate security return amounts (read-only).
    // Pass deduction_amount so the backend computes the full split server-side.
    // The frontend MUST NOT compute any amounts itself — just display what this returns.
    calculateSecurityRefund: (bookingId: number, productId: number, deductionAmount = 0) =>
      api.get(`/lifecycle/${bookingId}/products/${productId}/security-refund/calculate`, {
        params: { deduction_amount: deductionAmount }
      }),

    // Process security return — validates and executes atomically.
    // All amounts (deduction_amount + adjust_non_security + adjust_security_amount + refund_amount)
    // must sum to the product's security.paid_amount. Backend raises descriptive errors if not.
    processSecurityRefund: (bookingId: number, productId: number, data: {
      deduction_amount?: number;
      deduction_type?: 'damage_fee' | 'late_fee';
      adjust_non_security?: number;
      adjust_security_amount?: number;
      security_product_ids?: number[];
      refund_amount?: number;
      payment_method?: string;
      recorded_by: string;
    }) => api.post(`/lifecycle/${bookingId}/products/${productId}/security-refund/process`, data),
  };
}
