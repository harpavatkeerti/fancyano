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

export interface TightScheduleProduct {
  product_id: number;
  size?: string | null;
  booked_from: string;
  booked_to: string;
}

export interface TightScheduleResponse {
  has_tight_schedule: boolean;
  warnings: string[];
  conflicts: UrgentConflict[];
}

export interface UrgentConflict {
  product_code: string;
  product_name: string;
  size: string | null;
  booked_from: string;
  booked_to: string;
  neighbour_booking_id: number;
  neighbour_from: string;
  neighbour_to: string;
  gap_days: number;
  direction: 'before' | 'after';
}

export interface UrgentResponse {
  is_urgent: boolean;
  reasons: string[];
  conflicts: UrgentConflict[];
}

export interface UrgentBulkResponse {
  [bookingId: number]: UrgentResponse;
}

export function createAvailabilityApi(client: AxiosInstance) {
  return {
    check: (data: AvailabilityCheckRequest) =>
      client.post<AvailabilityResponse>('/availability/check', data),
    
    checkBulk: (data: BulkAvailabilityRequest) =>
      client.post<BulkAvailabilityResponse>('/availability/check-bulk', data),

    checkTightSchedule: (products: TightScheduleProduct[]) =>
      client.post<TightScheduleResponse>('/availability/check-tight-schedule', { products }),

    getUrgent: (bookingId: number) =>
      client.get<UrgentResponse>(`/availability/urgent/${bookingId}`),

    getUrgentBulk: (bookingIds: number[]) =>
      client.post<UrgentBulkResponse>('/availability/urgent-bulk', { booking_ids: bookingIds }),
  };
}
