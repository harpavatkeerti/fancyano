// Product type matching new backend schema
export interface Product {
  id: number;
  name: string;
  code: string;
  purchase_price?: number;
  rent: number;
  security_deposit: number;
  status: 'available' | 'archived';
  category?: string;
  gender?: string;
  size?: string;
  description?: string;
  image?: string;
  created_at: string;
  updated_at: string;
  /** Current tracking status — embedded from product_tracking via lateral subquery. Null means in_house. */
  tracking_status?: 'in_house' | 'picked_by_customer' | 'going_to_dry_clean' | 'alternation_related_work' | 'repair' | 'other_work' | null;
  /** Booking ID associated with the current tracking record (e.g. for picked_by_customer) */
  tracking_booking_id?: number | null;
}

// Booking Product (individual product in a booking)
export interface BookingProduct {
  id: number;
  booking_id: number;
  product_id: number;
  // Fields joined from the products table in API responses
  code?: string;
  name?: string;
  image?: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'exchanged' | 'cancelled';
  booked_from: string;
  booked_to: string;
  rent: number;
  security_deposit: number;
  discount_amount: number;
  discount_type: 'percentage' | 'fixed' | null;
  effective_rent: number;
  picked_up_at?: string;
  picked_up_by?: string;
  returned_at?: string;
  returned_to?: string;
  exchanged_at?: string;
  exchanged_for_product_ids?: number[];
  cancelled_at?: string;
  cancellation_reason?: string;
  measurements?: any;
  special_requirements?: string;
  created_at: string;
  updated_at: string;
}

// Product Charge (financial tracking per product)
export interface ProductCharge {
  id: number;
  booking_product_id: number;
  charge_type: 'rent' | 'exchange_penalty' | 'downgrade_penalty' | 'cancellation_penalty' | 'late_fee' | 'damage_fee' | 'security';
  due_amount: number;
  paid_amount: number;
  notes?: string;
  policy_reference?: string;
  created_at: string;
  updated_at: string;
}

// Booking type matching new backend schema
export interface Booking {
  id: number;
  // Customer — joined from users table
  user: User;

  // Booking lifecycle
  status: 'pending' | 'confirmed' | 'in_progress' | 'partially_completed' | 'completed' | 'cancelled';
  booking_date: string;
  booked_from: string;
  booked_to: string;

  // Transport (booking-level)
  transport_charge: number;
  transport_paid: number;

  // Financial
  final_discount: number;

  // Other
  special_requirements?: string;
  created_by?: string;
  measurements?: {
    chest?: string;
    waist?: string;
    height?: string;
    shoulder?: string;
    sleeve?: string;
    length?: string;
    hip?: string;
    inseam?: string;
    notes?: string;
  };

  // Products (can be array of IDs or full objects)
  products?: BookingProduct[];

  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  name: string;
  phone: string;
  phone_country: string;          // ISO-2, e.g. 'IN'
  alternate_phone: string;
  alternate_phone_country: string;  // ISO-2
  role: 'admin' | 'salesman' | 'customer';
  username?: string;
  password?: string;
  email?: string;
  address?: string;
  is_deleted?: boolean;
  created_at: string;
  updated_at: string;
}

// Payment Transaction matching new backend schema
export interface PaymentTransaction {
  id: number;
  booking_id: number;
  amount: number;
  type: 'payment' | 'refund' | 'adjustment';
  charge_category?: 'rent' | 'exchange_penalty' | 'downgrade_penalty' | 'cancellation_penalty' | 'late_fee' | 'damage_fee' | 'security' | 'transport';
  method?: string;
  recorded_by: string;
  notes?: string;
  transaction_date: string;
}

// Payment Summary matching backend getPaymentSummary response
export interface PaymentSummary {
  booking_id: number;
  products: Array<{
    booking_product_id: number;
    product_id: number;
    product_name: string;
    product_code: string;
    status: string;
    booked_from: string;
    rent: number;
    security_deposit: number;
    charges: ProductCharge[];
  }>;
  charges: {
    rent: { due: number; paid: number };
    transport: { due: number; paid: number };
    penalties: { due: number; paid: number };
    fees: { due: number; paid: number };
    security: { due: number; paid: number };
  };
  totals: {
    total_due: number;
    total_paid: number;
    balance: number;
  };
  final_discount: number;
}

// Rental Policy
export interface RentalPolicy {
  id: number;
  policy_key: string;
  policy_name: string;
  policy_type: 'exchange_penalty' | 'cancellation_penalty' | 'late_fee' | 'transport_fee';
  value_type: 'percentage' | 'fixed';
  value: number;
  days_from_booking_min?: number;
  days_from_booking_max?: number;
  min_value?: number;
  max_value?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// Booking Activity Log
export interface BookingActivityLog {
  id: number;
  booking_id: number;
  event_type: string;
  event_reference_id?: number;
  details?: any;
  performed_by?: string;
  created_at: string;
}

// Exchange History
export interface BookingExchangeHistory {
  id: number;
  booking_id: number;
  old_booking_product_id: number;
  new_booking_product_ids: number[];
  exchange_penalty: number;
  downgrade_penalty: number;
  reason?: string;
  exchanged_at: string;
  exchanged_by?: string;
}

// Cancellation History
export interface BookingCancellationHistory {
  id: number;
  booking_id: number;
  booking_product_id: number;
  cancellation_penalty: number;
  reason?: string;
  cancelled_at: string;
  cancelled_by?: string;
}


