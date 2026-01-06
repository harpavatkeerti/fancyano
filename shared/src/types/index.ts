export interface Product {
  id: number;
  name: string;
  code: string;
  purchase_price?: number;
  rent_per_day: number;
  security_deposit: number;
  rental_policy?: string; // '3_days' or '24_hours'
  availability: boolean;
  category?: string;
  gender?: string;
  size?: string;
  description?: string;
  image?: string;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: number;
  customer_name: string;
  customer_phone?: string;
  alternate_phone?: string;
  customer_address?: string;
  products: number[] | any[];
  booking_date: string;
  booked_from: string;
  booked_to: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  total_amount?: number;
  paid_amount?: number;
  due_amount?: number;
  payment_method?: string;
  payment_status?: 'unpaid' | 'partial' | 'paid';
  transportation_opted?: boolean;
  special_requirements?: string;
  created_by?: string; // Name of salesman/admin who created the booking
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
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  name: string;
  phone: string;
  role: 'admin' | 'salesman' | 'customer';
  username?: string;
  password?: string;
  email?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: number;
  booking_id: number;
  amount: number;
  type: 'payment' | 'refund' | 'adjustment' | 'date_change_charge';
  method?: string;
  recorded_by: string;
  notes?: string;
  created_at: string;
}

export interface PaymentSummary {
  transaction_count: number;
  total_payments: number;
  total_refunds: number;
  total_adjustments: number;
  total_date_change_charges?: number;
  net_amount: number;
}

