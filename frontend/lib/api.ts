// Web-specific API configuration using shared package
import { createApi } from '@rental/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is not set. Add it to your .env.local file.');
}

// Create single API instance — all frontend API calls go through this one axios instance
export const api = createApi({ baseURL: API_URL });

/** Server origin without /api — use for constructing public file URLs (e.g. PDF links). */
export const SERVER_BASE_URL = API_URL.replace('/api', '');

// ── API namespaces ──
export const productsApi = api.products;
export const bookingsApi = api.bookings;
export const usersApi = api.users;
export const paymentTransactionsApi = api.paymentTransactions;
export const availabilityApi = api.availability;
export const lifecycleApi = api.lifecycle;
export const policiesApi = api.policies;
export const productExchangesApi = api.productExchanges;
export const bookingCancellationApi = api.bookingCancellation;
export const settingsApi = api.settings;
export const complaintsApi = api.complaints;
export const feedbackApi = api.feedback;
export const creditNotesApi = api.creditNotes;
export const productTrackingApi = api.productTracking;
export const invoicesApi = api.invoices;

// ── Re-export types from shared ──
export type {
  Product,
  Booking,
  BookingProduct,
  User,
  PaymentTransaction,
  PaymentSummary,
  ProductCharge,
  RentalPolicy,
  BookingActivityLog,
  BookingExchangeHistory,
  BookingCancellationHistory,
} from '@rental/shared';

export type { AvailabilityCheckRequest, AvailabilityResponse, AvailabilityConflict } from '@rental/shared';

export type {
  Complaint,
  CreateComplaintData,
  ComplaintNote,
  AddNoteData,
} from '@rental/shared';

export type {
  Feedback,
  CreateFeedbackData,
} from '@rental/shared';

export type {
  CreditNote,
  CreateCreditNoteData,
  UseCreditNoteData,
} from '@rental/shared';

export type {
  ProductTracking,
  CreateTrackingData,
  TrackingStatus,
} from '@rental/shared';

export {
  LIFECYCLE_TRACKING_STATUSES,
  MANUAL_TRACKING_STATUSES,
  TRACKING_STATUS_LABELS,
} from '@rental/shared';
