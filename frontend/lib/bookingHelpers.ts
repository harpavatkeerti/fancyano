// Helper functions for booking-related operations
import { PENDING_BOOKING_TIMEOUT_MINUTES } from './timerConstants';

/**
 * Calculate time remaining before auto-cancellation (15 minutes from creation)
 * @param createdAt - ISO timestamp of booking creation
 * @returns Object with minutes, seconds, and isExpired flag
 */
export function getAutoCancelTimeRemaining(createdAt: string): {
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
} {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const timeoutMs = PENDING_BOOKING_TIMEOUT_MINUTES * 60 * 1000;
  const elapsed = now - created;
  const remaining = timeoutMs - elapsed;
  
  if (remaining <= 0) {
    return {
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      isExpired: true
    };
  }
  
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return {
    minutes,
    seconds,
    totalSeconds,
    isExpired: false
  };
}

/**
 * Check if booking should be auto-cancelled
 * @param createdAt - ISO timestamp of booking creation
 * @param paidAmount - Amount paid for the booking
 * @param totalDue - Total amount due for the booking
 * @returns true if booking should be auto-cancelled
 */
export function shouldAutoCancelBooking(createdAt: string): boolean {
  if (PENDING_BOOKING_TIMEOUT_MINUTES < 0) return false; // timer disabled
  const { isExpired } = getAutoCancelTimeRemaining(createdAt);
  return isExpired;
}

// ── Urgent booking helpers (data comes from backend API) ────────────────────

/** Map of booking IDs to their urgent status, as returned by availabilityApi.getUrgentBulk */
export type UrgentBookingsMap = Record<number, { is_urgent: boolean; reasons: string[]; conflicts: any[] }>;

/**
 * Check if a booking is marked urgent in the backend-provided map.
 */
export function isBookingUrgent(bookingId: number, urgentMap: UrgentBookingsMap): boolean {
  return urgentMap[bookingId]?.is_urgent ?? false;
}

/**
 * Get a human-readable urgent reason string for a booking.
 */
export function getUrgentReason(bookingId: number, urgentMap: UrgentBookingsMap): string {
  const reasons = urgentMap[bookingId]?.reasons ?? [];
  return reasons.length > 0 ? reasons.join(', ') : 'Tight schedule';
}

/**
 * Check if a booking is in pending status.
 */
export function isPending(status: string): boolean {
  return status === 'pending';
}

