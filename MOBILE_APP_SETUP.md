# Mobile App Setup Guide

## Quick Start

### Step 1: Install Expo CLI
```bash
npm install -g expo-cli
```

### Step 2: Install Mobile Dependencies
```bash
cd mobile
npm install
```

### Step 3: Start Backend (if not running)
```bash
cd ../backend
npm run dev
```

### Step 4: Start Mobile App
```bash
cd mobile
npm start
```

### Step 5: Run on Android
- Press `a` in the Expo terminal, or
- Install Expo Go app on your Android device and scan the QR code

## Important: API Configuration

### For Android Emulator
The app automatically uses `http://10.0.2.2:3001/api` - this is correct!

### For Physical Android Device
You need to update the API URL to use your computer's IP address:

1. **Find your computer's IP:**
   ```bash
   # Windows
   ipconfig
   # Look for "IPv4 Address" (e.g., 192.168.1.100)
   
   # Mac/Linux
   ifconfig
   # Look for inet address
   ```

2. **Update `mobile/src/lib/api.ts`:**
   ```typescript
   const getApiUrl = () => {
     if (__DEV__) {
       if (Constants.platform?.android) {
         return 'http://YOUR_IP_ADDRESS:3001/api';  // Replace YOUR_IP_ADDRESS
       }
       // ...
     }
   };
   ```

3. **Make sure your computer and phone are on the same WiFi network**

4. **Make sure backend allows connections from your IP** (it should by default)

## Testing Checklist

- [ ] Backend is running on port 3001
- [ ] Mobile app starts without errors
- [ ] Can navigate between screens
- [ ] Can view products (if backend has data)
- [ ] Can create bookings
- [ ] API calls work (check for network errors)

## Common Issues

### "Network Error" on Physical Device
- Use your computer's IP address, not localhost
- Ensure phone and computer are on same WiFi
- Check backend is accessible from your network

### Expo Go App Not Connecting
- Make sure phone and computer are on same network
- Try using tunnel mode: `expo start --tunnel`

### Build Errors
- Clear cache: `expo start -c`
- Delete node_modules and reinstall

## Features Available

✅ Admin Dashboard
✅ Inventory Management
✅ Bookings Management  
✅ User Management
✅ Customer Product Browsing
✅ Booking Creation
✅ Booking History

All features are fully functional and connected to your backend API!

