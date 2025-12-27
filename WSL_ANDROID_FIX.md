# Fixing Android SDK Error in WSL

## The Problem
WSL doesn't have Android SDK installed, which is needed to run Android apps directly.

## Solution Options

### Option 1: Use Expo Go on Physical Device (Easiest - Recommended) ✅

**This doesn't require Android SDK setup!**

1. **Install Expo Go on your Android phone:**
   - Download from Google Play Store: https://play.google.com/store/apps/details?id=host.exp.exponent

2. **Start Expo:**
   ```bash
   cd mobile
   npm start
   ```

3. **Scan QR Code:**
   - Open Expo Go app on your phone
   - Scan the QR code shown in terminal
   - App will load on your phone!

4. **Update API URL for Physical Device:**
   
   Find your computer's IP address:
   ```bash
   # In WSL
   hostname -I
   # Or in Windows PowerShell
   ipconfig
   # Look for IPv4 Address (e.g., 192.168.1.100)
   ```
   
   Update `mobile/src/lib/api.ts`:
   ```typescript
   if (Constants.platform?.android) {
     return 'http://YOUR_IP_ADDRESS:3001/api';  // Replace with your IP
   }
   ```

5. **Make sure phone and computer are on same WiFi network**

### Option 2: Install Android SDK in WSL (More Complex)

If you want to use Android emulator in WSL:

1. **Install Android SDK:**
   ```bash
   # Download Android SDK Command Line Tools
   cd ~
   wget https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip
   unzip commandlinetools-linux-9477386_latest.zip
   mkdir -p ~/Android/Sdk/cmdline-tools
   mv cmdline-tools ~/Android/Sdk/cmdline-tools/latest
   ```

2. **Set Environment Variables:**
   ```bash
   # Add to ~/.bashrc or ~/.zshrc
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
   
   # Reload
   source ~/.bashrc
   ```

3. **Install SDK Components:**
   ```bash
   sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.0"
   sdkmanager "emulator"
   sdkmanager "system-images;android-33;google_apis;x86_64"
   ```

4. **Create AVD:**
   ```bash
   avdmanager create avd -n test -k "system-images;android-33;google_apis;x86_64"
   ```

**Note:** This is complex and requires significant disk space. Option 1 is much easier!

### Option 3: Use Windows Android Studio (Alternative)

If you have Android Studio installed on Windows:

1. **Use Windows terminal (PowerShell/CMD) instead of WSL:**
   ```powershell
   cd mobile
   npm start
   ```

2. **Press 'a' to open Android emulator** (if Android Studio is installed)

## Recommended: Use Expo Go (Option 1)

**Why Expo Go is better:**
- ✅ No Android SDK setup needed
- ✅ Works immediately
- ✅ Test on real device (better than emulator)
- ✅ Faster development cycle
- ✅ No WSL/Windows compatibility issues

## Quick Start with Expo Go

1. **Install Expo Go on phone** (from Play Store)

2. **Start mobile app:**
   ```bash
   cd mobile
   npm start
   ```

3. **Update API URL** in `mobile/src/lib/api.ts` with your computer's IP

4. **Scan QR code** with Expo Go app

5. **Done!** Your app runs on your phone

## Finding Your IP Address

**In WSL:**
```bash
hostname -I
```

**In Windows PowerShell:**
```powershell
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
```

Use this IP in `mobile/src/lib/api.ts` for the `baseURL`.

## Troubleshooting Expo Go

### "Unable to connect to server"
- Make sure phone and computer are on same WiFi
- Check firewall isn't blocking port 19000 (Expo)
- Try tunnel mode: `expo start --tunnel`

### "Network Error" in app
- Update API URL with your computer's IP
- Make sure backend is running
- Check backend allows connections from your network

