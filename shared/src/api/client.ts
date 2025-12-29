import axios, { AxiosInstance } from 'axios';

export interface ApiConfig {
  baseURL: string;
}

export function createApiClient(config: ApiConfig): AxiosInstance {
  const client = axios.create({
    baseURL: config.baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 10000, // 10 second timeout
  });

  // Add request interceptor for debugging
  client.interceptors.request.use(
    (config) => {
      console.log('API Request:', config.method?.toUpperCase(), config.baseURL + config.url);
      return config;
    },
    (error) => {
      console.error('API Request Error:', error);
      return Promise.reject(error);
    }
  );

  // Add response interceptor for debugging
  client.interceptors.response.use(
    (response) => {
      console.log('API Response:', response.status, response.config.url);
      return response;
    },
    (error) => {
      console.error('API Error:', error.message, error.config?.url);
      return Promise.reject(error);
    }
  );

  return client;
}

