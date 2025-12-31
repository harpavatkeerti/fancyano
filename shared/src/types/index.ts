export interface Product {
  id: number;
  name: string;
  code: string;
  purchase_price?: number;
  rent_per_day: number;
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
  created_at: string;
  updated_at: string;
}

