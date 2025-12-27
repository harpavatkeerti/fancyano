import axios, { AxiosInstance } from 'axios';

export interface ApiConfig {
  baseURL: string;
}

export function createApiClient(config: ApiConfig): AxiosInstance {
  return axios.create({
    baseURL: config.baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

