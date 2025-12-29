// Mobile-specific API configuration using shared package
import { createApi } from '@rental/shared';
import Constants from 'expo-constants';

// Get API URL based on platform
// For physical device, replace with your computer's IP address
// Find IP: In WSL run 'hostname -I' or in Windows run 'ipconfig'
const getApiUrl = () => {
  const defaultUrl = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3001/api';
  
  if (__DEV__) {
    // Android emulator uses special IP to access host machine
    if (Constants.platform?.android) {
      // For Android Emulator (if using emulator):
      // return 'http://10.0.2.2:3001/api';
      
      // For Physical Android Device (use Windows IP, not WSL IP):
      // Port forwarding makes Windows:3001 forward to WSL:3001
      // So phone should connect to Windows IP, not WSL IP
      // NOTE: If using tunnel mode, phone won't be on same network - use LAN mode instead
      return 'http://192.168.29.238:3001/api'; // Windows IP (forwards to WSL backend)
    }
    // iOS simulator can use localhost
    if (Constants.platform?.ios) {
      return 'http://localhost:3001/api';
    }
  }
  return defaultUrl;
};

// Create API instance using shared package
const apiUrl = getApiUrl();
console.log('🔗 API Base URL:', apiUrl);
export const api = createApi({ baseURL: apiUrl });

// Export APIs for convenience
export const productsApi = api.products;
export const bookingsApi = api.bookings;
export const usersApi = api.users;

// Re-export types
export type { Product, Booking, User } from '@rental/shared';
