import { api } from './api';

export interface LoginData {
  username?: string;
  name?: string;
  password: string;
}

export interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'salesman' | 'customer';
  phone?: string;
  email?: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: AuthUser;
  expiresAt: number; // Unix ms timestamp
}

export interface VerifyResponse {
  valid: boolean;
  user?: AuthUser;
  error?: string;
}

export const authApi = {
  login: (data: LoginData) =>
    api.client.post<LoginResponse>('/auth/login', data),

  verify: (token: string) =>
    api.client.post<VerifyResponse>(
      '/auth/verify',
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    ),
};
