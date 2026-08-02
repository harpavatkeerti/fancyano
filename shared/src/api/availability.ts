import { AxiosInstance } from 'axios';

export interface AvailabilityCheckRequest {
  product_id: number;
  date_from: string;
  date_to: string;
  size?: string;
}

export interface AvailabilityConflict {
  booking_id: number;
  customer: string;
  status: string;
  from: string;
  to: string;
}

export interface AvailabilityResponse {
  available: boolean;
  conflicts: AvailabilityConflict[];
  message: string;
}

export interface BulkAvailabilityRequest {
  products: AvailabilityCheckRequest[];
}

export interface BulkAvailabilityResponse {
  results: Array<{
    product_id: number;
    available: boolean;
    conflicts?: AvailabilityConflict[];
    message: string;
    error?: string;
  }>;
  all_available: boolean;
}

export function createAvailabilityApi(client: AxiosInstance) {
  return {
    check: (data: AvailabilityCheckRequest) =>
      client.post<AvailabilityResponse>('/availability/check', data),
    
    checkBulk: (data: BulkAvailabilityRequest) =>
      client.post<BulkAvailabilityResponse>('/availability/check-bulk', data),
  };
}

