import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface LoginData {
  username?: string;
  name?: string;
  password: string;
  role: 'admin' | 'salesman' | 'customer';
}

export interface LoginResponse {
  success: boolean;
  user: {
    id: number;
    name: string;
    username?: string;
    phone?: string;
    role: string;
    email?: string;
    address?: string;
  };
}

export const authApi = {
  login: (data: LoginData) => axios.post<LoginResponse>(`${API_URL}/auth/login`, data),
};

