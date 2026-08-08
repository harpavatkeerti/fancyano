import { ApiClient } from './client';

export function createLifecycleApi(api: ApiClient) {
  return {
    // Pickup products
    pickupProducts: (bookingId: number, data: {
      booking_product_ids: number[];
      picked_up_by: string;
    }) => api.post(`/lifecycle/${bookingId}/products/pickup`, data),
    
    // Return products (marks as completed — no fees created here)
    returnProducts: (bookingId: number, data: {
      returns: Array<{
        booking_product_id: number;
      }>;
      returned_by: string;
    }) => api.post(`/lifecycle/${bookingId}/products/return`, data),

    // Calculate security return amounts (read-only).
    // Omit late_fee to auto-apply the suggested late fee from policy.
    // Pass late_fee=0 explicitly to override the suggestion to zero.
    calculateSecurityRefund: (bookingId: number, productId: number, lateFee: number | null = null, damageFee = 0) =>
      api.get(`/lifecycle/${bookingId}/products/${productId}/security-refund/calculate`, {
        params: { ...(lateFee !== null ? { late_fee: lateFee } : {}), damage_fee: damageFee }
      }),

    // Process security return — validates and executes atomically.
    // All amounts (late_fee + damage_fee + adjust_non_security + adjust_security_amount + refund_amount)
    // must sum to the product's security.paid_amount. Backend raises descriptive errors if not.
    processSecurityRefund: (bookingId: number, productId: number, data: {
      late_fee?: number;
      damage_fee?: number;
      adjust_non_security?: number;
      adjust_security_amount?: number;
      security_product_ids?: number[];
      refund_amount?: number;
      payment_method?: string;
      recorded_by: string;
      notes?: string;
    }) => api.post(`/lifecycle/${bookingId}/products/${productId}/security-refund/process`, data),
  };
}

