# Expo Go Troubleshooting Guide

## Issue: Expo Go Not Opening App

### Problem 1: Missing Port in API URL ⚠️

I noticed your API URL is missing the port number!

**Current (WRONG):**
```typescript
return 'http://172.18.12.236/api';  // Missing :3001
```

**Should be:**
```typescript
return 'http://172.18.12.236:3001/api';  // Correct with port
```

### Problem 2: Backend Not Accessible from Network

The backend might only be listening on localhost, not on all network interfaces.

**Check backend/server.js:**
```javascript
app.listen(PORT, '0.0.0.0', () => {  // Should listen on 0.0.0.0, not just localhost
  console.log(`Server is running on http://localhost:${PORT}`);
});
```

### Problem 3: Firewall Blocking

Windows Firewall might be blocking connections.

**Fix:**
1. Open Windows Defender Firewall
2. Allow Node.js through firewall
3. Or temporarily disable firewall to test

### Problem 4: Expo Connection Issues

**Try these solutions:**

1. **Use Tunnel Mode:**
   ```bash
   cd mobile
   expo start --tunnel
   ```

2. **Clear Expo Cache:**
   ```bash
   expo start -c
   ```

3. **Check Network Connection:**
   - Make sure phone and computer are on same WiFi
   - Try disconnecting and reconnecting WiFi on phone

### Problem 5: Wrong IP Address

Verify your IP address is correct:

**In WSL:**
```bash
hostname -I
```

**In Windows PowerShell:**
```powershell
ipconfig
# Look for IPv4 Address under your WiFi adapter
```

Make sure you're using the IP of the WiFi adapter, not WSL's internal IP.

## Step-by-Step Fix

### Step 1: Fix API URL Port
Update `mobile/src/lib/api.ts`:
```typescript
return 'http://172.18.12.236:3001/api';  // Add :3001
```

### Step 2: Verify Backend is Accessible
Test from your phone's browser:
```
http://172.18.12.236:3001/api/health
```

If this doesn't work, backend isn't accessible from network.

### Step 3: Check Backend Configuration
Make sure backend listens on all interfaces:
```javascript
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
```

### Step 4: Test Expo Connection
```bash
cd mobile
expo start --tunnel
```

Tunnel mode works even if devices aren't on same network.

### Step 5: Check Expo Go App
- Make sure Expo Go is latest version
- Try closing and reopening Expo Go
- Try scanning QR code again
- Check if QR code is clear and fully visible

## Quick Diagnostic Commands

**Test backend from phone:**
Open browser on phone and go to: `http://172.18.12.236:3001/api/health`

**Test backend from computer:**
```bash
curl http://172.18.12.236:3001/api/health
```

**Check if port is open:**
```bash
# In WSL
netstat -tlnp | grep 3001
# Should show 0.0.0.0:3001, not 127.0.0.1:3001
```

## Common Solutions

### Solution 1: Use Tunnel Mode (Easiest)
```bash
cd mobile
expo start --tunnel
```
This works even if devices aren't on same network!

### Solution 2: Fix Firewall
Allow Node.js through Windows Firewall, or temporarily disable to test.

### Solution 3: Use Windows IP (Not WSL IP)
If using WSL, you might need Windows IP address instead:
```powershell
# In PowerShell
ipconfig
# Use the IPv4 address shown (not WSL's IP)
```

### Solution 4: Restart Everything
1. Stop backend (Ctrl+C)
2. Stop Expo (Ctrl+C)
3. Restart backend: `cd backend && npm run dev`
4. Restart Expo: `cd mobile && expo start --tunnel`

## Still Not Working?

1. **Check Expo Go Logs:**
   - Shake phone to open Expo menu
   - Check for error messages

2. **Try Web Version:**
   ```bash
   expo start --web
   ```
   If web works, issue is with mobile connection.

3. **Check Network:**
   - Try different WiFi network
   - Try mobile hotspot
   - Check if corporate/school WiFi blocks connections

