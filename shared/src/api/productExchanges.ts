import { ApiClient } from './client';
import { BookingExchangeHistory } from '../types';

export function createProductExchangesApi(api: ApiClient) {
  return {
    // Check exchange eligibility
    checkEligibility: (bookingProductId: number) => 
      api.get(`/product-exchanges/eligibility/${bookingProductId}`),
    
    // Get exchange preview with all calculations
    getPreview: (oldBookingProductId: number, newProductId: number, additionalProductIds?: number[]) => 
      api.get(`/product-exchanges/preview/${oldBookingProductId}`, {
        params: {
          new_product_id: newProductId,
          additional_product_ids: additionalProductIds?.join(',')
        }
      }),
    
    // Get penalty suggestion
    getPenaltySuggestion: (bookingProductId: number) => 
      api.get(`/product-exchanges/penalty-suggestion/${bookingProductId}`),
    
    // Exchange product (one-to-many)
    exchange: (data: {
      old_booking_product_id: number;
      new_product_ids: Array<{
        product_id: number;
        booked_from: string;
        booked_to: string;
        rent: number;
        security_deposit: number;
      }>;
      exchange_penalty?: number;
      downgrade_penalty?: number;
      exchange_reason?: string;
      exchanged_by: string;
    }) => api.post<any>('/product-exchanges', data),
  };
}
