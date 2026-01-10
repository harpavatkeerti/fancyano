// Helper functions for booking-related operations

/**
 * Calculate time remaining before auto-cancellation (5 minutes from creation)
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
  const fiveMinutesMs = 5 * 60 * 1000;
  const elapsed = now - created;
  const remaining = fiveMinutesMs - elapsed;
  
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
 * @returns true if booking should be auto-cancelled
 */
export function shouldAutoCancelBooking(createdAt: string, paidAmount: number): boolean {
  if (paidAmount > 0) return false; // Has payment, don't cancel
  const { isExpired } = getAutoCancelTimeRemaining(createdAt);
  return isExpired;
}

