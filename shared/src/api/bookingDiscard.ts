import { ApiClient } from './client';

export function createBookingDiscardApi(api: ApiClient) {
  return {
    // Discard a booking (admin-only override)
    discard: (bookingId: number, discardedBy: string) =>
      api.post<any>(`/booking-discard/${bookingId}`, { discarded_by: discardedBy }),
  };
}
