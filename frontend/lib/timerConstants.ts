/**
 * Timer constants for auto-cancel behaviour.
 * Keep in sync with backend/src/constants/timerConstants.js
 *
 * CART_TIMEOUT_MINUTES
 *   Minutes a salesman has after adding the first item to cart before the
 *   cart is automatically cleared.  Set to -1 to disable.
 *
 * PENDING_BOOKING_TIMEOUT_MINUTES
 *   Minutes a booking can stay in "pending" status (no payment) before it
 *   is automatically deleted by the backend scheduler.  Set to -1 to disable.
 */

export const CART_TIMEOUT_MINUTES = 5;
export const PENDING_BOOKING_TIMEOUT_MINUTES = 15;
