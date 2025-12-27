# Using Expo Go (No Android SDK Needed!)

## Why Expo Go?

- ✅ **No Android SDK setup required**
- ✅ **Works on physical device immediately**
- ✅ **Better than emulator** (real device testing)
- ✅ **Faster development**

## Setup Steps

### 1. Install Expo Go on Your Phone

**Android:**
- Google Play Store: https://play.google.com/store/apps/details?id=host.exp.exponent
- Search: "Expo Go"

**iOS:**
- App Store: https://apps.apple.com/app/expo-go/id982107779
- Search: "Expo Go"

### 2. Start Mobile App

```bash
cd mobile
npm start
```

You'll see a QR code in the terminal.

### 3. Connect Your Phone

**Option A: Scan QR Code**
- Open Expo Go app
- Tap "Scan QR code"
- Point camera at terminal QR code

**Option B: Enter URL Manually**
- In Expo Go, tap "Enter URL manually"
- Enter the URL shown in terminal (e.g., `exp://192.168.1.100:8081`)

### 4. Update API URL for Physical Device

**Find your computer's IP:**

**In WSL:**
```bash
hostname -I
# Example output: 192.168.1.100
```

**In Windows PowerShell:**
```powershell
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
```

**Update `mobile/src/lib/api.ts`:**

Replace this line:
```typescript
return 'http://10.0.2.2:3001/api'; // Emulator only
```

With your IP:
```typescript
return 'http://192.168.1.100:3001/api'; // Your computer's IP
```

### 5. Make Sure Backend is Running

```bash
cd backend
npm run dev
```

Backend should be accessible from your network.

### 6. Test!

- App should load on your phone
- Try browsing products
- Try creating a booking
- Check if API calls work

## Troubleshooting

### "Unable to connect to Expo"
- Make sure phone and computer are on **same WiFi network**
- Check firewall settings
- Try tunnel mode: `expo start --tunnel`

### "Network Error" in App
- Update API URL with your computer's IP (not localhost)
- Make sure backend is running
- Check backend allows connections from your network

### QR Code Not Scanning
- Make sure terminal window is large enough
- Try entering URL manually in Expo Go
- Check phone camera permissions

## Benefits Over Emulator

- ✅ Real device testing
- ✅ Better performance
- ✅ No Android SDK needed
- ✅ Works immediately
- ✅ Test on actual hardware

## Next Steps

Once Expo Go is working:
1. Test all features on your phone
2. Share with others (they can scan QR code too!)
3. No need for Android SDK setup

