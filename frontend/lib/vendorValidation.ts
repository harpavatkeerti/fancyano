/**
 * Vendor field validation constants.
 *
 * Single source of truth for GST / PAN format rules on the frontend.
 * Backend keeps its own copy in vendorService.js (different runtime).
 */

// Indian GSTIN: 2-digit state code, 5 alpha, 4 digits, 1 alpha, 1 alphanumeric, 'Z', 1 alphanumeric
export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Indian PAN: 5 alpha, 4 digits, 1 alpha
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
