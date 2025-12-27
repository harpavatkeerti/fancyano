export interface Product {
  id: number;
  name: string;
  code: string;
  rent_per_day: number;
  availability: boolean;
  category?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: number;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  products: number[] | any[];
  booking_date: string;
  booked_from: string;
  booked_to: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  total_amount?: number;
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

