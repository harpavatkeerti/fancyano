/**
 * Timer constants for auto-cancel behaviour.
 *
 * CART_TIMEOUT_MINUTES
 *   Minutes a salesman has after adding the first item to cart before the
 *   cart is automatically cleared.  Set to -1 to disable.
 *
 * PENDING_BOOKING_TIMEOUT_MINUTES
 *   Minutes a booking can stay in "pending" status (no payment) before it
 *   is automatically deleted by the backend scheduler.  Set to -1 to disable.
 */

const CART_TIMEOUT_MINUTES = 5;
const PENDING_BOOKING_TIMEOUT_MINUTES = 15;

module.exports = { CART_TIMEOUT_MINUTES, PENDING_BOOKING_TIMEOUT_MINUTES };
