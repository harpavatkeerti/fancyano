# Rental Booking System - Mobile App

React Native mobile app built with Expo for Android and iOS.

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

### Installation

1. **Install dependencies:**
   ```bash
   cd mobile
   npm install
   ```

2. **Configure API URL:**
   
   For Android Emulator, the API URL is automatically set to `http://10.0.2.2:3001/api` (this is the special IP that Android emulator uses to access localhost on your computer).
   
   For physical device, you need to:
   - Find your computer's IP address
   - Update `mobile/src/lib/api.ts` to use your IP: `http://YOUR_IP:3001/api`

3. **Start the backend server:**
   ```bash
   cd ../backend
   npm run dev
   ```

4. **Start Expo:**
   ```bash
   cd mobile
   npm start
   ```

5. **Run on Android:**
   - Press `a` in the Expo terminal, or
   - Scan QR code with Expo Go app on your Android device

## API Configuration

The app automatically detects the platform:
- **Android Emulator**: Uses `http://10.0.2.2:3001/api`
- **iOS Simulator**: Uses `http://localhost:3001/api`
- **Physical Device**: Update `mobile/src/lib/api.ts` with your computer's IP

To find your computer's IP:
- Windows: `ipconfig` (look for IPv4 Address)
- Mac/Linux: `ifconfig` or `ip addr`

## Features

### Admin Portal
- ✅ Dashboard with statistics
- ✅ Inventory management (view, add, edit, delete products)
- ✅ Bookings management (view, cancel bookings)
- ✅ User management (view, add, edit, delete users)

### Customer Portal
- ✅ Browse products
- ✅ View product details
- ✅ Create bookings
- ✅ View booking history

## Project Structure

```
mobile/
├── src/
│   ├── screens/          # Screen components
│   │   ├── admin/       # Admin screens
│   │   └── customer/    # Customer screens
│   ├── components/       # Reusable components
│   ├── lib/             # API client
│   └── types/           # TypeScript types
├── App.tsx              # Main app component
└── package.json
```

## Development

### Start Development Server
```bash
npm start
```

### Run on Android
```bash
npm run android
```

### Run on iOS (macOS only)
```bash
npm run ios
```

## Troubleshooting

### Network Error
- Make sure backend is running on port 3001
- For physical device, use your computer's IP address, not localhost
- Check firewall settings

### Android Emulator Connection
- Android emulator uses `10.0.2.2` to access your computer's localhost
- This is already configured in the API client

### Build Errors
- Clear cache: `expo start -c`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Next Steps

- Add authentication
- Add image upload for products
- Add push notifications
- Add offline support
- Improve UI/UX

